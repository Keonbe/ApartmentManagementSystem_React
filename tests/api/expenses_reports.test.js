// manage_expenses.php, get_activity_logs.php, delete_utility_reading.php, get_utilities_report_data.php,
// get_sms_balance.php. QA guide rows Q8-03, Q8-04.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

const ymd = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let admin, maria;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

describe('manage_expenses.php', () => {
  const ex = (token, body) => api('manage_expenses.php', { token, json: body });
  const good = (over = {}) => ({ action: 'create', category: 'supplies', amount: 250.5, expenseDate: ymd(-2), description: 'Light bulbs', ...over });
  const count = async () => (await one('SELECT COUNT(*) AS n FROM expenses')).n;

  it('is admin only for reading and writing', async () => {
    expect((await api('manage_expenses.php')).status).toBe(401);
    expect((await api('manage_expenses.php', { token: maria })).status).toBe(403);
    expect((await ex(maria, good())).status).toBe(403);
    expect(await count()).toBe(0);
  });

  it.each([
    ['unknown category', { category: 'party' }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -5 }],
    ['text amount', { amount: 'abc' }],
    ['amount over 10,000,000', { amount: 10000000.01 }],
    ['bad date format', { expenseDate: '01/02/2026' }],
    ['impossible date', { expenseDate: '2026-02-30' }],
    ['date two days ahead', { expenseDate: ymd(2) }],
    ['description over 255 characters', { description: 'x'.repeat(256) }],
  ])('rejects %s with 422', async (_n, over) => {
    expect((await ex(admin, good(over))).status).toBe(422);
    expect(await count()).toBe(0);
  });

  it('accepts the edges: 0.01, 10,000,000, tomorrow, and a 255 character description', async () => {
    for (const over of [{ amount: 0.01 }, { amount: 10000000 }, { expenseDate: ymd(1) }, { description: 'y'.repeat(255) }])
      expect((await ex(admin, good(over))).body.success, JSON.stringify(over).slice(0, 40)).toBe(true);
  });

  it('rounds to cents, keeps unicode and markup as text, and logs the creation', async () => {
    const text = "Zoë 李 😀 O'Brien <b>x</b>";
    const res = await ex(admin, good({ amount: 10.005, description: text }));
    const row = await one('SELECT amount, description, created_by FROM expenses WHERE id = ?', [res.body.id]);
    expect(Math.abs(Number(row.amount) - 10.005)).toBeLessThanOrEqual(0.005 + 1e-9);
    expect(row.description).toBe(text);
    expect(row.created_by).not.toBeNull();
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Added Expense'")).n).toBeGreaterThanOrEqual(1);
  });

  it('updates and deletes, and answers 404 for a missing expense or a repeated delete', async () => {
    const id = (await ex(admin, good({ description: 'to change' }))).body.id;
    expect((await ex(admin, { ...good({ description: 'changed' }), action: 'update', id })).body.success).toBe(true);
    expect((await one('SELECT description FROM expenses WHERE id = ?', [id])).description).toBe('changed');
    // an unchanged update is still a success (affected_rows is 0 there)
    expect((await ex(admin, { ...good({ description: 'changed' }), action: 'update', id })).body.success).toBe(true);
    expect((await ex(admin, { ...good(), action: 'update', id: 99999 })).status).toBe(404);
    expect((await ex(admin, { ...good(), action: 'update', id: 0 })).status).toBe(422);

    expect((await ex(admin, { action: 'delete', id })).body.success).toBe(true);
    expect((await ex(admin, { action: 'delete', id })).status).toBe(404);
    expect((await ex(admin, { action: 'delete' })).status).toBe(422);
    expect((await ex(admin, { action: 'shred' })).status).toBe(422);
  });

  it('lists newest first, filters by month, and rejects a bad month', async () => {
    await q('DELETE FROM expenses');
    await ex(admin, good({ expenseDate: '2026-03-10', description: 'march' }));
    await ex(admin, good({ expenseDate: '2026-04-10', description: 'april' }));
    const all = await api('manage_expenses.php', { token: admin });
    expect(all.body.expenses.map((e) => e.description)).toEqual(['april', 'march']);
    const march = await api('manage_expenses.php', { token: admin, query: { month: '2026-03' } });
    expect(march.body.expenses.map((e) => e.description)).toEqual(['march']);
    for (const month of ['2026-13', '2026-3', 'march', "2026-03' OR '1'='1"])
      expect((await api('manage_expenses.php', { token: admin, query: { month } })).status, month).toBe(422);
  });
});

describe('get_activity_logs.php', () => {
  const logs = (token, query = {}) => api('get_activity_logs.php', { token, query });

  it('is admin only', async () => {
    expect((await logs(undefined)).status).toBe(401);
    expect((await logs(maria)).status).toBe(403);
  });

  it('records the writes made above with who did them', async () => {
    const res = await logs(admin, { search: 'Added Expense' });
    expect(res.body.success).toBe(true);
    expect(res.body.logs.length).toBeGreaterThan(0);
    expect(res.body.logs[0]).toMatchObject({ action: 'Added Expense', performerRole: 'admin' });
  });

  it('filters by category, performer and date, and rejects an unknown category', async () => {
    expect((await logs(admin, { category: 'nonsense' })).status).toBe(422);
    const billing = await logs(admin, { category: 'billing' });
    expect(billing.body.logs.every((l) => l.category === 'billing')).toBe(true);
    const tenants = await logs(admin, { performer: 'tenant' });
    expect(tenants.body.logs.every((l) => l.performerRole === 'tenant')).toBe(true);
    const future = await logs(admin, { from: ymd(30) });
    expect(future.body.total).toBe(0);
    const today = await logs(admin, { from: ymd(0), to: ymd(0) });
    expect(today.body.total).toBeGreaterThan(0); // "to" is inclusive of the whole day
  });

  it('pages, caps the page size at 100, and treats a page past the end as empty', async () => {
    const first = await logs(admin, { limit: 2, page: 1 });
    expect(first.body.logs).toHaveLength(2);
    expect(first.body.pages).toBeGreaterThan(1);
    expect((await logs(admin, { limit: 5000 })).body.limit).toBe(100);
    expect((await logs(admin, { limit: 0 })).body.limit).toBe(1);
    const beyond = await logs(admin, { page: 99999, limit: 25 });
    expect(beyond.status).toBe(200);
    expect(beyond.body.logs).toEqual([]);
    expect((await logs(admin, { page: -3 })).body.page).toBe(1);
  });

  it('search treats SQL wildcards and quotes as plain text', async () => {
    await q("INSERT INTO activity_logs (category, action, details) VALUES ('system', 'Wildcard probe', '100% sure_thing')");
    expect((await logs(admin, { search: '100% sure_' })).body.total).toBe(1);
    expect((await logs(admin, { search: '%' })).body.total).toBeGreaterThanOrEqual(1);
    expect((await logs(admin, { search: "' OR '1'='1" })).body.total).toBe(0);
    expect((await logs(admin, { search: '\\' })).status).toBe(200);
  });

  it('an export is itself logged', async () => {
    const res = await logs(admin, { export: 1 });
    expect(res.body.success).toBe(true);
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Exported Activity Log'")).n).toBe(1);
  });
});

describe('delete_utility_reading.php', () => {
  const del = (token, body) => api('delete_utility_reading.php', { token, json: body });
  const reading = async (room, period, invoiced = 0) =>
    (await q("INSERT INTO utility_readings (room_name, billing_period, reading_date, is_invoiced) VALUES (?, ?, CURDATE(), ?)", [room, period, invoiced])).insertId;
  const exists = async (id) => (await one('SELECT id FROM utility_readings WHERE id = ?', [id])) !== null;

  it('is admin only and needs an id', async () => {
    const id = await reading('A', '2031-01');
    expect((await del(undefined, { id })).status).toBe(401);
    expect((await del(maria, { id })).status).toBe(403);
    expect((await del(admin, {})).status).toBe(422);
    expect((await del(admin, { id: -1 })).status).toBe(422);
    expect((await del(admin, { id: 99999 })).status).toBe(404);
    expect(await exists(id)).toBe(true);
  });

  it('keeps an invoiced reading and any reading that has a later one', async () => {
    const early = await reading('B', '2031-02');
    const late = await reading('B', '2031-03');
    const invoiced = await reading('C', '2031-02', 1);
    expect((await del(admin, { id: early })).status).toBe(409);
    expect((await del(admin, { id: invoiced })).status).toBe(409);
    expect(await exists(early)).toBe(true);
    expect(await exists(invoiced)).toBe(true);

    expect((await del(admin, { id: late })).body.success).toBe(true);
    expect(await exists(late)).toBe(false);
    expect((await del(admin, { id: early })).body.success).toBe(true); // now the latest
    expect((await del(admin, { id: early })).status).toBe(404);
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Deleted Utility Reading'")).n).toBe(2);
  });
});

describe('get_utilities_report_data.php', () => {
  it('is admin only', async () => {
    expect((await api('get_utilities_report_data.php')).status).toBe(401);
    expect((await api('get_utilities_report_data.php', { token: maria })).status).toBe(403);
  });

  it('answers each timeframe and clamps wild month and quarter values', async () => {
    for (const query of [
      { timeframe: 'monthly', month: 1, year: 2026 },
      { timeframe: 'quarterly', quarter: 2, year: 2026 },
      { timeframe: 'yearly', year: 2026 },
      { timeframe: 'weekly', month: 99, quarter: -4, year: 2026 }, // unknown timeframe falls back to monthly
      { month: 'abc', year: 'xyz' },
    ]) {
      const res = await api('get_utilities_report_data.php', { token: admin, query });
      expect(res.status, JSON.stringify(query)).toBe(200);
      expect(res.body.data.period.start).toMatch(/^\d{4}-\d{2}$/);
    }
    const clamped = await api('get_utilities_report_data.php', { token: admin, query: { month: 99, year: 2026 } });
    expect(clamped.body.data.period).toEqual({ start: '2026-12', end: '2026-12' });
  });

  it('counts a reading in the month it covers, not the day it was read', async () => {
    await q("INSERT INTO utility_readings (room_name, billing_period, reading_date, water_consumption, water_amount) VALUES ('A', '2030-08', '2030-09-02', 12, 480)");
    const aug = await api('get_utilities_report_data.php', { token: admin, query: { timeframe: 'monthly', month: 8, year: 2030 } });
    const sep = await api('get_utilities_report_data.php', { token: admin, query: { timeframe: 'monthly', month: 9, year: 2030 } });
    expect(aug.body.data.water.totalM3).toBe(12);
    expect(sep.body.data.water.totalM3).toBe(0);
  });
});

describe('get_sms_balance.php', () => {
  it('is admin only, and says so plainly when the provider is not Semaphore', async () => {
    expect((await api('get_sms_balance.php')).status).toBe(401);
    expect((await api('get_sms_balance.php', { token: maria })).status).toBe(403);
    const res = await api('get_sms_balance.php', { token: admin });
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Semaphore/);
    expect(JSON.stringify(res.body)).not.toMatch(/apikey|api_key/i); // the key never leaves the server
  });
});
