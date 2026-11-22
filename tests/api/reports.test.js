// Admin → Reports (get_reports.php): one report over a date range cut into
// periods. Fixtures sit in March 2001, where the seed has nothing, so each
// figure is exact: a paid bill with a deposit, a bill paid in two installments
// (different weeks), an advance-rent invoice (left out), an expense entry, and
// two finished repairs (one the building pays, one the tenant does).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q } from './lib/db.js';

let admin, maria;
const get = (query, token = admin) => api('get_reports.php', { token, query });
const MARCH = { from: '2001-03-01', to: '2001-03-31' };
const metric = (res, key) => res.body.summary.find((m) => m.key === key);
const table = (res, key) => res.body.tables.find((t) => t.key === key);

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
  await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, water, electricity, security_deposit, total_amount, amount_paid, billing_period, status, due_date, paid_at, created_at, payment_method)
           VALUES ('INV-RPT-1', 2, 1, 1000, 100, 200, 500, 1800, 1800, 'March 2001', 'paid', '2001-03-10', '2001-03-05 10:00:00', '2001-03-01 08:00:00', 'GCash'),
                  ('INV-RPT-2', 2, 1, 2000, 0, 0, 0, 2000, 1500, 'March 2001 B', 'unpaid', '2001-03-15', NULL, '2001-03-02 08:00:00', NULL),
                  ('INV-RPT-3', 2, 1, 3000, 0, 0, 0, 3000, 3000, 'Advance', 'paid', '2001-03-20', '2001-03-07 10:00:00', '2001-03-03 08:00:00', 'Cash')`);
  await q("UPDATE invoices SET advance_months = 2 WHERE id = 'INV-RPT-3'");
  await q(`INSERT INTO payment_transactions (invoice_id, amount, payment_method, created_at)
           VALUES ('INV-RPT-2', 1000, 'Cash', '2001-03-06 09:00:00'), ('INV-RPT-2', 500, 'Cash', '2001-03-13 09:00:00')`);
  await q("INSERT INTO expenses (category, amount, expense_date, description, created_by) VALUES ('supplies', 300, '2001-03-08', 'Cleaning supplies', 1)");
  await q(`INSERT INTO maintenance_requests (user_id, issue_category, urgency, description, status, room_name, preferred_date, preferred_time, created_at, resolved_at, actual_cost, tenant_responsible)
           VALUES (2, 'Plumbing', 'High', 'Leak', 'Completed', 'A', '2001-03-02', 'Morning', '2001-03-02 08:00:00', '2001-03-09 08:00:00', 250, 0),
                  (2, 'Electrical', 'Low', 'Broken socket', 'Completed', 'A', '2001-03-03', 'Morning', '2001-03-03 08:00:00', '2001-03-04 08:00:00', 999, 1)`);
});

describe('who may ask, and what', () => {
  it('needs an admin', async () => {
    expect((await api('get_reports.php', { query: { report: 'financial', ...MARCH, group: 'week' } })).status).toBe(401);
    expect((await get({ report: 'financial', ...MARCH, group: 'week' }, maria)).status).toBe(403);
  });

  it.each([
    ['an unknown report', { report: 'payroll', ...MARCH, group: 'week' }, 'report'],
    ['a date that does not exist', { report: 'financial', from: '2001-02-30', to: '2001-03-31', group: 'week' }, 'from'],
    ['an end before the start', { report: 'financial', from: '2001-03-31', to: '2001-03-01', group: 'week' }, 'to'],
    ['an unknown grouping', { report: 'financial', ...MARCH, group: 'hour' }, 'group'],
    ['too many periods', { report: 'financial', from: '2000-01-01', to: '2002-12-31', group: 'day' }, 'group'],
  ])('refuses %s with 422', async (_l, query, field) => {
    const res = await get(query);
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty(field);
  });
});

describe('periods', () => {
  it('cuts by week (Monday to Sunday), the ends cut to the range', async () => {
    const res = await get({ report: 'collections', ...MARCH, group: 'week' });
    expect(res.status).toBe(200);
    const rows = res.body.periods.rows;
    expect(rows.map((r) => r._key)).toEqual(['2001-02-26', '2001-03-05', '2001-03-12', '2001-03-19', '2001-03-26']);
    expect(rows[0].period).toBe('Mar 1 – 4, 2001');
    expect(rows.map((r) => r.received)).toEqual([0, 3300 - 500, 500, 0, 0]);
  });

  it('cuts by day and by month, and compares with the month before', async () => {
    const days = await get({ report: 'financial', ...MARCH, group: 'day' });
    expect(days.body.periods.rows).toHaveLength(31);
    const months = await get({ report: 'financial', from: '2001-01-15', to: '2001-03-31', group: 'month' });
    expect(months.body.periods.rows.map((r) => r.period)).toEqual(['Jan 15 – 31, 2001', 'February 2001', 'March 2001']);
    expect(days.body.previous).toEqual({ from: '2001-02-01', to: '2001-02-28' });
    expect(metric(days, 'revenue').previous).toBe(0);
  });
});

describe('the money rules', () => {
  it('income statement: deposits out, installments by the day received, advance rent out', async () => {
    const res = await get({ report: 'financial', ...MARCH, group: 'month' });
    expect(res.status).toBe(200);
    // (1,800 - 500 deposit) + 1,000 + 500 in installments; the 3,000 advance is not counted.
    expect(metric(res, 'revenue').value).toBe(2800);
    expect(metric(res, 'deposits').value).toBe(500);
    // 300 recorded expense + 250 repair; the tenant-responsible repair is not a building cost.
    expect(metric(res, 'expenses').value).toBe(550);
    expect(metric(res, 'net').value).toBe(2250);
    const lines = Object.fromEntries(table(res, 'statement').rows.filter((r) => r.amount !== undefined).map((r) => [r.line, r.amount]));
    expect(lines).toMatchObject({ 'Base rent': 2500, Water: 100, Electricity: 200, 'Total revenue': 2800, 'Maintenance repairs': 250, Supplies: 300, 'Total expenses': 550, 'Net income': 2250 });
    expect(table(res, 'expenses').rows.map((r) => r.amount).sort()).toEqual([250, 300]);
  });

  it('payments received: every receipt, by method', async () => {
    const res = await get({ report: 'collections', ...MARCH, group: 'month' });
    expect(metric(res, 'received').value).toBe(3300);
    expect(metric(res, 'count').value).toBe(3);
    const methods = Object.fromEntries(table(res, 'methods').rows.map((r) => [r.method, r.amount]));
    expect(methods).toEqual({ GCash: 1800, Cash: 1500 });
    expect(table(res, 'payments').rows.map((r) => r.kind).sort()).toEqual(['Full payment', 'Installment', 'Installment']);
  });

  it('payments received: pesos by channel, online and front desk side by side (SPRINT 183)', async () => {
    // May 2001: the same channel written by different code (a desk GCash, a PayMongo GCash)
    // must be one channel with two sources, not two unrelated method names.
    const paid = [
      ['INV-CH-1', 1000, 'GCash (Sandbox)'], ['INV-CH-2', 400, 'gcash'], ['INV-CH-3', 700, 'Maya (Sandbox)'],
      ['INV-CH-4', 300, 'BDO'], ['INV-CH-5', 200, 'Cash'], ['INV-CH-6', 150, 'Online Banking (Sandbox)'], ['INV-CH-7', 120, 'Card (Sandbox)'],
    ];
    for (const [id, amount, method] of paid) {
      await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date, paid_at, created_at, payment_method)
               VALUES (?, 2, 1, ?, ?, ?, 'May 2001', 'paid', '2001-05-10', '2001-05-05 10:00:00', '2001-05-01 08:00:00', ?)`, [id, amount, amount, amount, method]);
    }
    const res = await get({ report: 'collections', from: '2001-05-01', to: '2001-05-31', group: 'month' });
    const channels = table(res, 'channels');
    const rows = Object.fromEntries(channels.rows.map((r) => [`${r.channel}|${r.via}`, r.amount]));
    expect(rows).toEqual({
      'GCash|Online': 1000, 'GCash|Front desk': 400, 'Maya|Online': 700, 'BDO|Front desk': 300,
      'Cash|Front desk': 200, 'Online banking|Online': 150, 'Card|Online': 120,
    });
    expect(channels.rows[0]).toMatchObject({ channel: 'GCash', via: 'Online', share: 34.8 });
    expect(channels.totals.amount).toBe(2870);
    // Pesos, so it adds up to what the report says was received.
    expect(metric(res, 'received').value).toBe(2870);
    // The raw method table is unchanged.
    expect(Object.fromEntries(table(res, 'methods').rows.map((r) => [r.method, r.amount]))['GCash (Sandbox)']).toBe(1000);
  });

  it('billing: bills issued in the range, collected and still owed on them', async () => {
    const res = await get({ report: 'billing', ...MARCH, group: 'month' });
    expect(metric(res, 'billed').value).toBe(3800);
    expect(metric(res, 'collected').value).toBe(3300);
    expect(metric(res, 'owed').value).toBe(500);
    expect(metric(res, 'rate').value).toBe(86.8);
    expect(table(res, 'open').rows.find((r) => r.invoice === 'INV-RPT-2')).toMatchObject({ owed: 500, unit: 'A' });
    expect(table(res, 'issued').rows.map((r) => r.invoice).sort()).toEqual(['INV-RPT-1', 'INV-RPT-2']);
  });

  it('maintenance: received, finished, cost by who pays', async () => {
    const res = await get({ report: 'maintenance', ...MARCH, group: 'month' });
    expect(metric(res, 'opened').value).toBe(2);
    expect(metric(res, 'resolved').value).toBe(2);
    expect(metric(res, 'cost').value).toBe(250);
    expect(metric(res, 'tenantCost').value).toBe(999);
    expect(table(res, 'requests').rows).toHaveLength(2);
  });
});

describe('every report', () => {
  it.each(['financial', 'collections', 'billing', 'occupancy', 'maintenance', 'utilities', 'leasing', 'services'])('%s answers in the shared shape', async (report) => {
    const res = await get({ report, from: '2026-01-01', to: '2026-12-31', group: 'month' });
    expect(res.status).toBe(200);
    expect(res.body.summary.length).toBeGreaterThan(2);
    expect(res.body.periods.rows).toHaveLength(12);
    for (const t of res.body.tables) {
      expect(Array.isArray(t.columns) && Array.isArray(t.rows)).toBe(true);
      // Every row carries every column (a statement's section heading is only its label).
      for (const row of t.rows) {
        if (row._style === 'section') continue;
        for (const c of t.columns) expect(Object.keys(row), `${report} ${t.key} ${c.key}`).toContain(c.key);
      }
    }
  });

  it('groups utilities by month at the least, and says so', async () => {
    const res = await get({ report: 'utilities', ...MARCH, group: 'day' });
    expect(res.status).toBe(200);
    expect(res.body.group).toBe('month');
    expect(res.body.note).toMatch(/monthly/);
  });

  it('lists the current tenants with what the invoice tool needs', async () => {
    const res = await get({ report: 'occupancy', from: '2026-11-01', to: '2026-11-30', group: 'week' });
    const roster = table(res, 'roster').rows;
    expect(roster.length).toBeGreaterThan(0);
    expect(roster[0]).toEqual(expect.objectContaining({ unit: expect.any(String), tenant: expect.any(String), _appId: expect.any(Number) }));
  });
});
