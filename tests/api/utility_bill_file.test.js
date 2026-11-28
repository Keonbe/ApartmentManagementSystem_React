// Opening a provider bill (upload_utility_bill.php + download_file.php). Two or
// more files are stored as a JSON array, which used to hide the path from the
// ownership lookup: "File not found" for the tenant and the admin.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';
import { PNG_BYTES } from './lib/fixtures.js';
import { ROOT } from './lib/env.js';

const DIR = path.join(ROOT, 'backend/uploads/utility_bills');
const files = () => (fs.existsSync(DIR) ? fs.readdirSync(DIR) : []);
let admin, maria, jose, before, readingId, paths;

const open = (token, p) => api('download_file.php', { token, query: { path: p } });

beforeAll(async () => {
  before = new Set(files());
  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
  readingId = (await q("INSERT INTO utility_readings (room_name, user_id, billing_period, reading_date) VALUES ('A', 2, '2031-01', CURDATE())")).insertId;
  const form = new FormData();
  form.append('reading_id', String(readingId));
  for (const name of ['water.png', 'electric.png']) form.append('bills[]', new Blob([PNG_BYTES], { type: 'image/png' }), name);
  const res = await api('upload_utility_bill.php', { token: admin, form });
  expect(res.status, res.text).toBe(200);
  paths = res.body.bill_file_paths;
});
afterAll(() => {
  files().filter((n) => !before.has(n)).forEach((n) => fs.rmSync(path.join(DIR, n), { force: true }));
});

describe('a reading with two bill files', () => {
  it('opens each file for the tenant and the admin, not for another tenant', async () => {
    expect(paths).toHaveLength(2);
    for (const p of paths) {
      expect((await open(maria, p)).status).toBe(200);
      expect((await open(admin, p)).status).toBe(200);
      expect((await open(jose, p)).status).toBe(403);
    }
  });

  it('opens rows saved earlier with escaped slashes', async () => {
    await q('UPDATE utility_readings SET bill_file_path = ? WHERE id = ?', [JSON.stringify(paths).replaceAll('/', '\\/'), readingId]);
    expect((await one('SELECT bill_file_path FROM utility_readings WHERE id = ?', [readingId])).bill_file_path).toContain('uploads\\/');
    expect((await open(maria, paths[1])).status).toBe(200);
    expect((await open(jose, paths[1])).status).toBe(403);
  });

  it('names the files from the electricity and water slots after their kind', async () => {
    const id = (await q("INSERT INTO utility_readings (room_name, user_id, billing_period, reading_date) VALUES ('A', 2, '2031-02', CURDATE())")).insertId;
    const form = new FormData();
    form.append('reading_id', String(id));
    for (const field of ['water_bill', 'electric_bill', 'bills[]']) form.append(field, new Blob([PNG_BYTES], { type: 'image/png' }), 'scan.png');
    const res = await api('upload_utility_bill.php', { token: admin, form });
    expect(res.status, res.text).toBe(200);
    expect(res.body.bill_file_paths.map((p) => /\/bill_(electric_|water_)?[0-9a-f]{32}\.png$/.exec(p)?.[1] ?? '')).toEqual(['electric_', 'water_', '']);
    expect((await open(maria, res.body.bill_file_paths[0])).status).toBe(200);
  });

  it('on a reading with no tenant, opens for the admin only', async () => {
    await q('UPDATE utility_readings SET user_id = NULL WHERE id = ?', [readingId]);
    expect((await open(admin, paths[0])).status).toBe(200);
    expect((await open(maria, paths[0])).status).toBe(403);
  });
});
