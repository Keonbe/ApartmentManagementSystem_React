// Preferred move-in date rule (config.php move_in_date_error): today up to
// 365 days ahead, a real YYYY-MM-DD. Enforced by resubmit_date.php and
// rent_application.php; the date input's `min` alone let 2023-02-01 through.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, login } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

// Dates relative to the database's today, as YYYY-MM-DD.
const day = async (offset) => (await one(`SELECT DATE_FORMAT(CURDATE() + INTERVAL ${Number(offset)} DAY, '%Y-%m-%d') AS d`)).d;

let gloria, liza;
beforeAll(async () => {
  [gloria, liza] = await Promise.all([
    login('gloria.tan@demo.example', 'tenant123'),   // user 8, app 6
    login('liza.navarro@demo.example', 'tenant123'), // user 17, app 15 Cancelled: may apply again
  ]);
  await q("UPDATE rent_applications SET status = 'Action Required', rejection_reason = 'Pick another date' WHERE id = 6");
});

const resubmit = (date) => api('resubmit_date.php', { token: gloria, json: { id: 6, preferred_move_in_date: date } });
const gloriaApp = () => one('SELECT status, preferred_move_in_date AS d FROM rent_applications WHERE id = 6');

describe('resubmit_date.php', () => {
  it('refuses a past date (422) and leaves the application as it was', async () => {
    const before = await gloriaApp();
    const res = await resubmit('2023-02-01');
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/cannot be in the past/);
    expect(await gloriaApp()).toEqual(before);
  });

  it('refuses yesterday (boundary)', async () => {
    expect((await resubmit(await day(-1))).status).toBe(422);
  });

  it.each(['2026-02-31', '01/02/2027', 'tomorrow'])('refuses a malformed date %s', async (date) => {
    const res = await resubmit(date);
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/valid date/);
  });

  it('refuses a date more than 365 days ahead, naming the last allowed day', async () => {
    const res = await resubmit(await day(366));
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/at most 365 days from today: the latest is \w+ \d{1,2}, \d{4}\./);
  });

  // Accepted edges; each accepted submit moves the application to Pending Review,
  // so it is put back into Action Required first.
  it.each([364, 365])('accepts %s days ahead (inside the window)', async (offset) => {
    await q("UPDATE rent_applications SET status = 'Action Required' WHERE id = 6");
    const date = await day(offset);
    const res = await resubmit(date);
    expect(res.body).toMatchObject({ success: true });
    expect(String((await gloriaApp()).d).slice(0, 10)).toBe(date);
    await q("UPDATE rent_applications SET status = 'Action Required' WHERE id = 6");
  });

  it('accepts today and sends the application back to review', async () => {
    const today = await day(0);
    const res = await resubmit(today);
    expect(res.body).toMatchObject({ success: true });
    const app = await gloriaApp();
    expect(app.status).toBe('Pending Review');
    expect(String(app.d).slice(0, 10)).toBe(today);
  });

  it('a second submit after it left Action Required is refused (stale tab)', async () => {
    const res = await resubmit(await day(5));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Status may have changed/);
  });
});

describe('the window follows Settings → Rental (move_in_min_days / move_in_max_days)', () => {
  beforeAll(async () => {
    await setSetting('move_in_min_days', 3);
    await setSetting('move_in_max_days', 30);
  });
  afterAll(async () => {
    await setSetting('move_in_min_days', 0);
    await setSetting('move_in_max_days', 365);
  });
  const reopen = () => q("UPDATE rent_applications SET status = 'Action Required' WHERE id = 6");

  it('today is refused once the earliest is 3 days, naming the first allowed day', async () => {
    await reopen();
    const res = await resubmit(await day(0));
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/at least 3 day\(s\) from today: the earliest is \w+ \d{1,2}, \d{4}\./);
  });

  it('+31 days is refused with a 30-day latest', async () => {
    const res = await resubmit(await day(31));
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/at most 30 days from today/);
  });

  it.each([3, 30])('+%s days is accepted (edges of the window)', async (offset) => {
    await reopen();
    expect((await resubmit(await day(offset))).body).toMatchObject({ success: true });
  });

  it('a garbled stored value falls back to the shipped 0 / 365', async () => {
    await setSetting('move_in_min_days', 'abc');
    await setSetting('move_in_max_days', '-5');
    await reopen();
    expect((await resubmit(await day(365))).body).toMatchObject({ success: true });
    await setSetting('move_in_min_days', 3);
    await setSetting('move_in_max_days', 30);
  });
});

describe('rent_application.php preferred move-in date', () => {
  const apply = (extra) => {
    const form = new FormData();
    const fields = {
      firstName: 'Liza', lastName: 'Navarro', contactNo: '+639171234515', email: 'liza.navarro@demo.example',
      gender: 'Female', occupants: '1', monthsOfRent: '6', roomName: 'J', monthlyRent: '3500', agreeTerms: 'true',
      previousAddress: 'Blk 4 Lot 2, Brgy. Biga, Silang, Cavite', ...extra,
    };
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return api('rent_application.php', { token: liza, form });
  };
  const lizaApps = async () => (await one('SELECT COUNT(*) AS c FROM rent_applications WHERE user_id = 17')).c;

  it('refuses a past preferred date on the prefMoveInDate field; nothing is saved', async () => {
    const before = await lizaApps();
    const res = await apply({ isAsap: '0', preferredMoveInDate: '2023-02-01' });
    expect(res.status).toBe(422);
    expect(res.body.errors.prefMoveInDate).toMatch(/cannot be in the past/);
    expect(await lizaApps()).toBe(before);
  });

  it('ASAP sends no date and is not checked (gets past the date rule)', async () => {
    const res = await apply({ isAsap: '1', preferredMoveInDate: '' });
    // Fails later on the missing documents, not on the date.
    expect(res.body.errors?.prefMoveInDate).toBeUndefined();
  });
});
