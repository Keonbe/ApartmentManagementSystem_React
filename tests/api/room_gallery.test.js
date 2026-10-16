// Unit gallery: per-photo description (alt) and display option (fit), with legacy string galleries.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

const ROOM = 'A';
const P1 = 'room_images/test_one.jpg';
const P2 = 'room_images/test_two.jpg';
let admin, maria;

const rooms = (token) => api('get_rooms.php', { token });
const imagesOf = async (token) => (await rooms(token)).body.rooms.find((r) => r.id === ROOM).images;
const update = (token, body) => api('update_room_image.php', { token, json: { room_id: ROOM, ...body } });
const setGallery = (value) => q('UPDATE rooms SET gallery = ? WHERE id = ?', [JSON.stringify(value), ROOM]);

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

describe('room gallery items', () => {
  it('turns a legacy string gallery into items with defaults', async () => {
    await setGallery([P1, P2]);
    expect(await imagesOf()).toEqual([
      { path: P1, alt: '', fit: 'fill' },
      { path: P2, alt: '', fit: 'fill' },
    ]);
  });

  it('admin saves a description and display option; guests see them', async () => {
    await setGallery([P1, P2]);
    const res = await update(admin, { path: P2, alt: 'Studio with a window', fit: 'wide' });
    expect(res.status).toBe(200);
    expect(res.body.gallery[1]).toEqual({ path: P2, alt: 'Studio with a window', fit: 'wide' });
    expect((await imagesOf())[1]).toEqual({ path: P2, alt: 'Studio with a window', fit: 'wide' });
    expect((await imagesOf())[0].fit).toBe('fill');
  });

  it('refuses a tenant and a missing session', async () => {
    expect((await update(maria, { path: P1, alt: 'x', fit: 'fit' })).status).toBe(403);
    expect((await update(undefined, { path: P1, alt: 'x', fit: 'fit' })).status).toBeGreaterThanOrEqual(401);
  });

  it('rejects a bad display option, a too-long description and an unknown photo', async () => {
    await setGallery([P1]);
    expect((await update(admin, { path: P1, alt: 'x', fit: 'stretch' })).status).toBe(422);
    expect((await update(admin, { path: P1, alt: 'x'.repeat(201), fit: 'fit' })).status).toBe(422);
    expect((await update(admin, { path: 'room_images/nope.jpg', alt: 'x', fit: 'fit' })).status).toBe(404);
  });

  it('an empty description clears it', async () => {
    await setGallery([{ path: P1, alt: 'Old', fit: 'fit' }]);
    const res = await update(admin, { path: P1, alt: '   ', fit: 'fit' });
    expect(res.body.gallery[0].alt).toBe('');
  });

  it('delete works on a mixed legacy and new gallery and keeps the other photo\'s details', async () => {
    await setGallery([P1, { path: P2, alt: 'Keep me', fit: 'wide' }]);
    const res = await api('delete_room_image.php', { token: admin, json: { room_id: ROOM, path: P1 } });
    expect(res.body.gallery).toEqual([{ path: P2, alt: 'Keep me', fit: 'wide' }]);
    const stored = await one('SELECT gallery FROM rooms WHERE id = ?', [ROOM]);
    expect(JSON.parse(stored.gallery)).toEqual([{ path: P2, alt: 'Keep me', fit: 'wide' }]);
  });
});
