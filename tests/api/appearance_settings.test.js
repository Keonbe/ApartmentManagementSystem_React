// Tenant Glass theme backdrop: the glass_* settings (update/get_system_settings.php)
// and upload_glass_background.php.
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

  it('saving a new image deletes the one it replaced; resetting deletes the last', async () => {
    const first = await uploadOk();
    expect((await save({ glass_bg_image: first })).status).toBe(200);
    expect((await api('get_system_settings.php')).body.settings.glass_bg_image).toBe(first);

    const second = await uploadOk();
    expect((await save({ glass_bg_image: second })).status).toBe(200);
    expect(fs.existsSync(assetPath(first))).toBe(false);
    expect(fs.existsSync(assetPath(second))).toBe(true);

    expect((await save({ glass_bg_image: '' })).status).toBe(200);
    expect(await setting('glass_bg_image')).toBe('');
    expect(fs.existsSync(assetPath(second))).toBe(false);
  });
});
