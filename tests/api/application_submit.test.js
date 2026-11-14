// rent_application.php submit checks: array form fields, trimmed text, term and
// room bounds, the rent coming from the room, and one open application per
// account (409, also for two submits at once).
// Uploads land in backend/uploads/applications/ (gitignored); anything this
// file adds there is deleted afterwards.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EMERGENCY_FIELDS } from './lib/fixtures.js';
import fs from 'node:fs';
import path from 'node:path';
import { api, login } from './lib/api.js';
import { one } from './lib/db.js';
import { ROOT } from './lib/env.js';

const UPLOADS = path.join(ROOT, 'backend/uploads/applications');
const listUploads = () => (fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS) : []);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let liza, uploadsBefore;
beforeAll(async () => {
  liza = await login('liza.navarro@demo.example', 'tenant123'); // user 17, app 15 Cancelled: may apply again
  uploadsBefore = new Set(listUploads());
});
afterAll(() => {
  for (const f of listUploads()) if (!uploadsBefore.has(f)) fs.unlinkSync(path.join(UPLOADS, f));
});

// A complete application for unit J (requirements 1 and 2 are the seeded Valid ID front/back).
function form(extra = {}, { arrays = {} } = {}) {
  const f = new FormData();
  const fields = {
    firstName: 'Liza', lastName: 'Navarro', contactNo: '+639171234515', email: 'liza.navarro@demo.example',
    gender: 'Female', occupants: '1', monthsOfRent: '6', roomName: 'J', monthlyRent: '1', agreeTerms: 'true',
    previousAddress: 'Blk 4 Lot 2, Brgy. Biga, Silang, Cavite', preferredMoveInDate: '', isAsap: '1', ...EMERGENCY_FIELDS, ...extra,
  };
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  for (const [k, v] of Object.entries(arrays)) f.append(`${k}[]`, v);
  for (const id of [1, 2]) f.append(`doc_${id}`, new Blob([PNG], { type: 'image/png' }), `doc${id}.png`);
  return f;
}
const submit = (extra, opts) => api('rent_application.php', { token: liza, form: form(extra, opts) });
const appCount = async () => (await one('SELECT COUNT(*) AS c FROM rent_applications WHERE user_id = 17')).c;

describe('refused before anything is written', () => {
  it('a form field sent as an array is a 400', async () => {
    const before = await appCount();
    const f = form();
    f.delete('firstName');
    f.append('firstName[]', 'Liza');
    const res = await api('rent_application.php', { token: liza, form: f });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('firstName');
    expect(res.text).not.toMatch(/Warning|Array to string/);
    expect(await appCount()).toBe(before);
  });

  it.each([['2', 'below the minimum term'], ['25', 'above the 24-month cap'], ['abc', 'not a number']])('monthsOfRent %s (%s) is a 422 on that field', async (months) => {
    const before = await appCount();
    const res = await submit({ monthsOfRent: months });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.errors)).toContain('monthsOfRent');
    expect(await appCount()).toBe(before);
  });

  it('an occupied unit is a 409', async () => {
    const before = await appCount();
    const res = await submit({ roomName: 'A' });
    expect(res.status).toBe(409);
    expect(await appCount()).toBe(before);
  });
});

describe('a valid submit', () => {
  it('saves the text trimmed and takes the rent from the unit, not from the form', async () => {
    const res = await submit({ firstName: '  Liza  ', lastName: ' Navarro ', email: ' liza.navarro@demo.example ' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const app = await one('SELECT a.first_name, a.last_name, a.email, a.monthly_rent, r.monthly_rent AS room_rent FROM rent_applications a JOIN rooms r ON r.id = a.room_name WHERE a.user_id = 17 ORDER BY a.id DESC LIMIT 1');
    expect(app.first_name).toBe('Liza');
    expect(app.last_name).toBe('Navarro');
    expect(app.email).toBe('liza.navarro@demo.example');
    expect(Number(app.monthly_rent)).toBe(Number(app.room_rent));
    expect(Number(app.monthly_rent)).not.toBe(1);
  });

  it('a second new application is a 409 and writes nothing', async () => {
    const before = await appCount();
    const res = await submit();
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already have an active or pending/);
    expect(await appCount()).toBe(before);
  });

  it('two at once leave exactly one application (the account is locked while the first is checked)', async () => {
    // Move the account back to a state that may apply again, then race two submits.
    const { q } = await import('./lib/db.js');
    await q("UPDATE rent_applications SET status = 'Cancelled' WHERE user_id = 17");
    const before = await appCount();
    const [a, b] = await Promise.all([submit(), submit()]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(await appCount()).toBe(before + 1);
  });
});
