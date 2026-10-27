// profile.php avatar upload: JPG, PNG and WEBP only. Animated GIFs are refused,
// by extension and by content (a GIF renamed to .png).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { api, loginAs } from './lib/api.js';
import { one } from './lib/db.js';

const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url));

// 1x1 images, smallest valid files.
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let maria;
const created = [];
beforeAll(async () => { maria = await loginAs('maria'); });
afterAll(async () => { for (const p of created) await rm(BACKEND + p, { force: true }); });

const upload = (bytes, name, type) => {
  const form = new FormData();
  form.append('avatar', new Blob([bytes], { type }), name);
  return api('profile.php', { token: maria, form });
};
const avatarUrl = async () => (await one('SELECT avatar_url FROM users WHERE id = 2')).avatar_url;

describe('profile.php avatar upload', () => {
  it.each([
    ['a .gif file', GIF, 'photo.gif', 'image/gif', /Invalid extension/],
    ['a GIF renamed to .png', GIF, 'photo.png', 'image/png', /Invalid image file format/],
  ])('%s → 422, avatar unchanged', async (_, bytes, name, type, message) => {
    const before = await avatarUrl();
    const res = await upload(bytes, name, type);
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(message);
    expect(await avatarUrl()).toBe(before);
  });

  it('the error text no longer lists GIF', async () => {
    const res = await upload(GIF, 'photo.gif', 'image/gif');
    expect(res.body.message).not.toMatch(/GIF/i);
  });

  it('a PNG is still accepted', async () => {
    const res = await upload(PNG, 'photo.png', 'image/png');
    expect(res.body).toMatchObject({ success: true });
    created.push(res.body.avatar_url);
    expect(await avatarUrl()).toBe(res.body.avatar_url);
  });

  it('no session → refused', async () => {
    const form = new FormData();
    form.append('avatar', new Blob([PNG], { type: 'image/png' }), 'photo.png');
    const res = await api('profile.php', { form });
    expect(res.status).toBeGreaterThanOrEqual(401);
  });
});
