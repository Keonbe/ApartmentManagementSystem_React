// Tenant Glass theme backdrop: the glass_* settings (update/get_system_settings.php),
// upload_glass_background.php and the recent-photos list (get_glass_backgrounds.php,
// delete_glass_background.php); and the Home page text (home_content).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { api, loginAs } from './lib/api.js';
import { setting, setSetting } from './lib/db.js';
import { ROOT } from './lib/env.js';

const PATTERN = /^site_assets\/glass_bg_[0-9]+_[a-f0-9]{8}\.(jpg|jpeg|png|webp)$/;
const assetPath = (rel) => path.join(ROOT, 'backend', rel);

// A real PNG of the given size (solid grey), so getimagesize() reads it.
function png(width, height) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0; // 8-bit greyscale
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, 128)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

let admin, tenant;
const uploaded = [];
const save = (json, token = admin) => api('update_system_settings.php', { token, json });
const upload = (data, name = 'photo.png', type = 'image/png', token = admin) => {
  const form = new FormData();
  if (data) form.append('background', new Blob([data], { type }), name);
  return api('upload_glass_background.php', { token, form });
};
const uploadOk = async () => {
  const res = await upload(png(800, 20));
  expect(res.status).toBe(200);
  uploaded.push(res.body.image_path);
  return res.body.image_path;
};
const recent = (token = admin) => api('get_glass_backgrounds.php', { token });
const remove = (p, token = admin) => api('delete_glass_background.php', { token, json: { path: p } });

beforeAll(async () => {
  admin = await loginAs('admin');
  tenant = await loginAs('maria');
});

// The test server writes into the real backend/site_assets/ folder.
afterAll(() => {
  for (const rel of uploaded) fs.rmSync(assetPath(rel), { force: true });
});

describe('glass settings', () => {
  it('ships with defaults, readable by anyone, numbers as numbers', async () => {
    const res = await api('get_system_settings.php');
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({ glass_bg_image: '', glass_overlay_opacity: 78, glass_blur: 0, glass_tint: '#0f172a' });
  });

  it('saves overlay, blur and tint; the tint is stored lower-case', async () => {
    const res = await save({ glass_overlay_opacity: '0', glass_blur: '20', glass_tint: '#1E1B4B' });
    expect(res.status).toBe(200);
    expect(await setting('glass_overlay_opacity')).toBe('0');
    expect(await setting('glass_blur')).toBe('20');
    expect(await setting('glass_tint')).toBe('#1e1b4b');
  });

  it.each(['96', '-1', '50.5', 'abc', ''])('overlay %s → 422', async (value) => {
    const res = await save({ glass_overlay_opacity: value });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty('glassOverlayOpacity');
  });

  it.each(['21', '-2', '1e1', 'x'])('blur %s → 422', async (value) => {
    expect((await save({ glass_blur: value })).status).toBe(422);
  });

  it.each(['red', '#fff', '#12345g', '#0f172a; background:url(x)', 'url(javascript:alert(1))'])('tint %s → 422', async (value) => {
    const res = await save({ glass_tint: value });
    expect(res.status).toBe(422);
    expect(await setting('glass_tint')).not.toBe(value);
  });

  it.each([
    '../config.php',
    'uploads/applications/id.png',
    'https://evil.example/x.png',
    'site_assets/glass_bg_1_deadbeef.png', // right shape, no such file
    'site_assets/glass_bg_1_deadbeef.php',
    '" onerror="alert(1)',
  ])('image path %s → 422, nothing saved', async (value) => {
    const res = await save({ glass_bg_image: value, glass_blur: '3' });
    expect(res.status).toBe(422);
    expect(await setting('glass_bg_image')).toBe('');
    expect(await setting('glass_blur')).not.toBe('3');
  });

  it('a stored image that went missing does not block saving other settings', async () => {
    await setSetting('glass_bg_image', 'site_assets/glass_bg_1_deadbeef.png');
    const res = await save({ glass_bg_image: 'site_assets/glass_bg_1_deadbeef.png', payment_window_days: '4' });
    expect(res.status).toBe(200);
    expect(await setting('payment_window_days')).toBe('4');
    await setSetting('glass_bg_image', '');
  });

  it('a tenant cannot change them', async () => {
    const res = await save({ glass_tint: '#000000' }, tenant);
    expect(res.status).toBe(403);
    expect(await setting('glass_tint')).not.toBe('#000000');
  });
});

describe('upload_glass_background.php', () => {
  it('needs an admin', async () => {
    expect((await upload(png(800, 20), 'p.png', 'image/png', tenant)).status).toBe(403);
    expect((await upload(png(800, 20), 'p.png', 'image/png', null)).status).toBe(401);
  });

  it('refuses a missing file, a non-image named .png, and a tiny image', async () => {
    expect((await upload(null)).status).toBe(422);
    const fake = await upload(Buffer.from('<?php echo 1; ?>'), 'shell.png');
    expect(fake.status).toBe(422);
    const tiny = await upload(png(40, 40));
    expect(tiny.status).toBe(422);
    expect(tiny.body.message).toMatch(/too small/);
  });

  it('stores a real image under a generated name, whatever it was called', async () => {
    const res = await upload(png(800, 20), '../../evil.php.png');
    expect(res.status).toBe(200);
    uploaded.push(res.body.image_path);
    expect(res.body.image_path).toMatch(PATTERN);
    expect(res.body.image_path.endsWith('.png')).toBe(true);
    expect(fs.existsSync(assetPath(res.body.image_path))).toBe(true);
    // Not live until saved.
    expect(await setting('glass_bg_image')).toBe('');
  });

  it('saving another photo keeps the previous one in the recent list, newest first', async () => {
    const first = await uploadOk();
    expect((await save({ glass_bg_image: first })).status).toBe(200);
    expect((await api('get_system_settings.php')).body.settings.glass_bg_image).toBe(first);

    const second = await uploadOk();
    expect((await save({ glass_bg_image: second })).status).toBe(200);
    expect(fs.existsSync(assetPath(first))).toBe(true);

    const list = await recent();
    expect(list.status).toBe(200);
    expect(list.body.limit).toBe(6);
    const paths = list.body.backgrounds.map((b) => b.path);
    expect(paths.indexOf(second)).toBeLessThan(paths.indexOf(first));
    expect(list.body.backgrounds.find((b) => b.path === second).live).toBe(true);
    expect(list.body.backgrounds.find((b) => b.path === first).live).toBe(false);

    // Back to the built-in photo: the uploads stay to switch back to.
    expect((await save({ glass_bg_image: '' })).status).toBe(200);
    expect(fs.existsSync(assetPath(second))).toBe(true);
  });

  it('keeps only the last 6 photos, and never prunes the live one', async () => {
    const live = await uploadOk();
    expect((await save({ glass_bg_image: live })).status).toBe(200);
    const later = [];
    for (let i = 0; i < 7; i++) later.push(await uploadOk());

    const paths = (await recent()).body.backgrounds.map((b) => b.path);
    expect(paths).toEqual([...later.slice(-5).reverse(), live]);
    expect(fs.existsSync(assetPath(later[0]))).toBe(false);
    expect(fs.existsSync(assetPath(live))).toBe(true);
  });

  it('the list and removal need an admin', async () => {
    expect((await recent(tenant)).status).toBe(403);
    expect((await recent(null)).status).toBe(401);
    const live = await setting('glass_bg_image');
    expect((await remove(live, tenant)).status).toBe(403);
    expect((await remove(live, null)).status).toBe(401);
  });

  it('removal refuses the live photo and anything that is not an upload', async () => {
    const live = await setting('glass_bg_image');
    const res = await remove(live);
    expect(res.status).toBe(409);
    expect(fs.existsSync(assetPath(live))).toBe(true);

    for (const bad of ['../config.php', 'site_assets/.htaccess', 'site_assets/glass_bg_1_deadbeef.php', '', null]) {
      expect((await remove(bad)).status).toBe(422);
    }
    expect((await remove('site_assets/glass_bg_1_deadbeef.png')).status).toBe(404);
    expect(fs.existsSync(path.join(ROOT, 'backend', 'site_assets', '.htaccess'))).toBe(true);
  });

  it('removes another photo and returns the updated list', async () => {
    const extra = await uploadOk();
    const res = await remove(extra);
    expect(res.status).toBe(200);
    expect(fs.existsSync(assetPath(extra))).toBe(false);
    expect(res.body.backgrounds.map((b) => b.path)).not.toContain(extra);
  });
});

const EMPTY = { show: true, en: '', fil: '' };
const HOME_DEFAULT = { badge: EMPTY, heading: EMPTY, location: EMPTY, description: EMPTY };

describe('home_content', () => {
  it('ships with every line shown and no custom text, readable by anyone', async () => {
    const res = await api('get_system_settings.php');
    expect(res.body.settings.home_content).toEqual(HOME_DEFAULT);
  });

  it('saves show switches and text, tidied to one line; unknown items are dropped', async () => {
    const res = await save({
      home_content: {
        badge: { show: false, en: '  Pet\nfriendly\t ', fil: '' },
        location: { show: true, en: 'Brgy. Biga, Silang', fil: '<b>Biga</b>' },
        evil: { show: true, en: 'x', fil: 'y' },
      },
    });
    expect(res.status).toBe(200);
    const stored = JSON.parse(await setting('home_content'));
    expect(Object.keys(stored)).toEqual(['badge', 'heading', 'location', 'description']);
    expect(stored.badge).toEqual({ show: false, en: 'Pet friendly', fil: '' });
    // Kept as plain text: the page prints it as text, never as markup.
    expect(stored.location).toEqual({ show: true, en: 'Brgy. Biga, Silang', fil: '<b>Biga</b>' });
    expect(stored.heading).toEqual(EMPTY);

    const read = (await api('get_system_settings.php')).body.settings.home_content;
    expect(read.badge.show).toBe(false);
  });

  it('an unchanged form counts as no change', async () => {
    const current = (await api('get_system_settings.php')).body.settings.home_content;
    const res = await save({ home_content: current });
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(0);
  });

  it.each([
    ['text over the limit', { badge: { show: true, en: 'x'.repeat(61), fil: '' } }],
    ['a description over 400', { description: { show: true, en: '', fil: 'y'.repeat(401) } }],
    ['a show that is not true/false', { heading: { show: 'yes', en: '', fil: '' } }],
    ['a missing show', { heading: { en: 'Hi', fil: '' } }],
    ['text that is not a string', { location: { show: true, en: 123, fil: '' } }],
    ['an item that is not an object', { badge: 'hidden' }],
    ['not an object at all', 'hello'],
  ])('%s → 422, nothing saved', async (_, value) => {
    const before = await setting('home_content');
    const res = await save({ home_content: value });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty('homeContent');
    expect(await setting('home_content')).toBe(before);
  });

  it('accepts text exactly at the limit, in any script', async () => {
    const res = await save({ home_content: { badge: { show: true, en: 'x'.repeat(60), fil: 'ñ'.repeat(60) } } });
    expect(res.status).toBe(200);
    expect(JSON.parse(await setting('home_content')).badge.fil).toBe('ñ'.repeat(60));
  });

  it('a garbled stored value reads as the defaults', async () => {
    await setSetting('home_content', '{not json');
    expect((await api('get_system_settings.php')).body.settings.home_content).toEqual(HOME_DEFAULT);
  });

  it('a tenant cannot change it', async () => {
    const before = await setting('home_content');
    const res = await save({ home_content: { badge: { show: false, en: '', fil: '' } } }, tenant);
    expect(res.status).toBe(403);
    expect(await setting('home_content')).toBe(before);
  });
});
