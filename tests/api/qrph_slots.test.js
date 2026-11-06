// QR Ph slots in Settings -> Payment Options: 3 slots (QRPH_SLOT_COUNT, was 5).
// upload_qr_image.php, the qrph_slots / qrph_active_slot settings and the
// active QR that get_payment_channels.php shows at checkout.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, loginAs } from './lib/api.js';
import { setting, setSetting } from './lib/db.js';
import { ROOT } from './lib/env.js';

// The smallest valid PNG (1x1), enough for the MIME check.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const slot = (n, extra = {}) => ({ slot: n, label: `Slot ${n}`, image_path: '', account_name: '', account_number: '', ...extra });

let admin, tenant;
const uploaded = [];
const save = (json, token = admin) => api('update_system_settings.php', { token, json });
const upload = (n, token = admin) => {
  const form = new FormData();
  form.append('qr_image', new Blob([PNG], { type: 'image/png' }), 'qr.png');
  form.append('slot', String(n));
  return api('upload_qr_image.php', { token, form });
};

beforeAll(async () => {
  admin = await loginAs('admin');
  tenant = await loginAs('maria');
});

// The test server writes into the real backend/qr_codes/ folder.
afterAll(() => {
  for (const rel of uploaded) fs.rmSync(path.join(ROOT, 'backend', rel), { force: true });
});

describe('QR Ph slots', () => {
  it('uploads to slot 3, refuses slot 4 and 0, and refuses a tenant', async () => {
    const ok = await upload(3);
    expect(ok.status).toBe(200);
    expect(ok.body.image_path).toMatch(/^qr_codes\/qr_slot_3_/);
    uploaded.push(ok.body.image_path);
    expect((await upload(4)).status).toBe(422);
    expect((await upload(0)).status).toBe(422);
    expect((await upload(1, tenant)).status).toBe(403);
  });

  it('the active slot can be 1 to 3', async () => {
    expect((await save({ qrph_active_slot: '3' })).status).toBe(200);
    expect(await setting('qrph_active_slot')).toBe('3');
    const res = await save({ qrph_active_slot: '4' });
    expect(res.status).toBe(422);
    expect(await setting('qrph_active_slot')).toBe('3');
  });

  it('an old 5-slot list is saved as its first 3 slots', async () => {
    const res = await save({ qrph_slots: [1, 2, 3, 4, 5].map((n) => slot(n)) });
    expect(res.status).toBe(200);
    expect(JSON.parse(await setting('qrph_slots')).map((s) => s.slot)).toEqual([1, 2, 3]);
  });

  it('refuses a slot number outside 1 to 5 and a list longer than 5', async () => {
    const before = await setting('qrph_slots');
    expect((await save({ qrph_slots: [slot(9)] })).status).toBe(422);
    expect((await save({ qrph_slots: [1, 2, 3, 4, 5, 1].map((n) => slot(n)) })).status).toBe(422);
    expect(await setting('qrph_slots')).toBe(before);
  });

  it('checkout shows slot 1 when the stored active slot is above 3', async () => {
    await setSetting('qrph_slots', JSON.stringify([slot(1, { label: 'Main GCash', image_path: 'qr_codes/x.png' }), slot(2), slot(3)]));
    await setSetting('qrph_active_slot', '5');
    const res = await api('get_payment_channels.php', { token: tenant });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('Main GCash');
  });
});
