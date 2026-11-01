// public_file.php: the public images (room photos, QR codes, Glass photos)
// served through the API folder, because the deployed server exposes only
// /api/. No session; only image files in those three folders.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { BASE, ROOT } from './lib/env.js';

// The test server reads the real backend folders.
const created = [];
const place = (rel, data) => {
  const abs = path.join(ROOT, 'backend', rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data);
  created.push(abs);
  return rel;
};

function png() {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.from([0, 128, 128, 0, 128, 128]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const get = (p, init = {}) => fetch(`${BASE}/public_file.php?path=${encodeURIComponent(p)}`, init);

const stamp = Date.now();
let room, qr, glass, fake;
beforeAll(() => {
  room = place(`room_images/${stamp}_test_unit.png`, png());
  qr = place(`qr_codes/qr_slot_9_${stamp}_abcd1234.png`, png());
  glass = place(`site_assets/glass_bg_${stamp}_abcd1234.png`, png());
  fake = place(`room_images/${stamp}_shell.png`, '<?php echo "x"; ?>');
});
afterAll(() => {
  for (const abs of created) fs.rmSync(abs, { force: true });
});

describe('public_file.php', () => {
  it('serves an image from each public folder without a session, cacheable', async () => {
    for (const p of [room, qr, glass]) {
      const res = await get(p);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('cache-control')).toMatch(/public/);
      expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString('hex')).toBe('89504e47');
    }
  });

  it('accepts the stored "../" prefix', async () => {
    expect((await get(`../${room}`)).status).toBe(200);
  });

  it('answers 304 to a matching ETag', async () => {
    const first = await get(glass);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    const again = await get(glass, { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
  });

  it.each([
    '../config.php',
    'config.php',
    'uploads/applications/id.png', // private uploads stay behind download_file.php
    'logs/app.png',
    'site_assets/.htaccess',
    'room_images/../config.php',
    'room_images/sub/x.png',
    'room_images/x.php',
    'room_images/x.svg',
    'ROOM_IMAGES/x.png',
    '',
  ])('refuses %j → 400', async (p) => {
    expect((await get(p)).status).toBe(400);
  });

  it('a missing file, or a non-image named .png, is 404', async () => {
    expect((await get('room_images/1_missing.png')).status).toBe(404);
    const res = await get(fake);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('<?php');
  });

  it('only GET', async () => {
    const res = await fetch(`${BASE}/public_file.php?path=${encodeURIComponent(room)}`, { method: 'POST' });
    expect(res.status).toBe(400);
  });
});
