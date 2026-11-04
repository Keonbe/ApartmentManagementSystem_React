// Dashboard income chart period (dashboard_stats.php ?from=&to=, ?section=income).
// Up to 62 days is bucketed per day, longer per month; the totals cover exactly
// the invoices issued in the period. Dates are relative to today.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { q } from './lib/db.js';

let admin;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const income = (query) => api('dashboard_stats.php', { token: admin, query: { section: 'income', ...query } });

// A bill issued on `issued` (2001 dates: far from any seed bill).
async function addBill(id, issued, { total = 1000, paid = 0, status = 'pending' } = {}) {
  await q(
    `INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date, created_at)
     VALUES (?, 2, 1, ?, ?, ?, 'Range test', ?, ?, ?)`,
    [id, total, total, paid, status, issued, `${issued} 10:00:00`],
  );
}

beforeAll(async () => {
  admin = await login('admin@gmail.com', 'admin123');
  // Two weeks in 2001, untouched by the seed: one paid, one half paid, one cancelled.
  await addBill('RANGE-1', '2001-03-05', { total: 1000, paid: 1000, status: 'paid' });
  await addBill('RANGE-2', '2001-03-12', { total: 600, paid: 200, status: 'pending' });
  await addBill('RANGE-3', '2001-03-12', { total: 999, status: 'cancelled' });
  await addBill('RANGE-4', '2001-05-20', { total: 400, paid: 400, status: 'paid' });
});

describe('dashboard income period', () => {
  it('defaults to six calendar months, per month, ending today', async () => {
    const res = await api('dashboard_stats.php', { token: admin });
    expect(res.status).toBe(200);
    expect(res.body.range).toMatchObject({ to: daysAgo(0), granularity: 'month', months: 6 });
    expect(res.body.income_data).toHaveLength(6);
    expect(res.body.range.from.endsWith('-01')).toBe(true);
  });

  it('a short period is per day and sums only its own bills (cancelled left out)', async () => {
    const res = await income({ from: '2001-03-01', to: '2001-03-31' });
    expect(res.status).toBe(200);
    expect(res.body.range).toMatchObject({ granularity: 'day', collected: 1200, pending: 400, billed: 1600, count: 2, months: 1, collection_rate: 75 });
    expect(res.body.income_data).toHaveLength(31);
    const day12 = res.body.income_data.find((b) => b.key === '2001-03-12');
    expect(day12).toMatchObject({ label: '12', collected: 200, pending: 400, billed: 600, count: 1 });
    // The chart alone: none of the dashboard's other blocks.
    expect(res.body.attention).toBeUndefined();
    expect(res.body.stats).toBeUndefined();
  });

  it('a long period is per month, with every month present', async () => {
    const res = await income({ from: '2001-01-15', to: '2001-06-10' });
    expect(res.body.range).toMatchObject({ granularity: 'month', months: 6, collected: 1600, billed: 2000 });
    expect(res.body.income_data.map((b) => b.key)).toEqual(['2001-01', '2001-02', '2001-03', '2001-04', '2001-05', '2001-06']);
    expect(res.body.income_data[4]).toMatchObject({ label: 'May', full_label: 'May 2001', collected: 400 });
    expect(res.body.range.avg_per_month).toBeCloseTo(1600 / 6, 2);
  });

  it('a period with nothing billed has no collection rate (not 0%)', async () => {
    const res = await income({ from: '2001-08-01', to: '2001-08-05' });
    expect(res.body.range).toMatchObject({ billed: 0, collection_rate: null });
    expect(res.body.income_data).toHaveLength(5);
  });

  it('one day is a valid period', async () => {
    const res = await income({ from: '2001-03-05', to: '2001-03-05' });
    expect(res.body.income_data).toHaveLength(1);
    expect(res.body.range.collected).toBe(1000);
  });

  it('refuses a bad, reversed, half-given or too-long period', async () => {
    for (const query of [
      { from: '2001-03-31', to: '2001-03-01' },
      { from: '2001-02-30', to: '2001-03-01' },
      { from: '03/01/2001', to: '2001-03-31' },
      { from: '2001-03-01' },
      { from: '2000-01-01', to: '2003-06-01' },
    ]) {
      const res = await income(query);
      expect(res.status, JSON.stringify(query)).toBe(422);
      expect(res.body.success).toBe(false);
    }
  });

  it('is admin only', async () => {
    const tenant = await loginAs('maria');
    const res = await api('dashboard_stats.php', { token: tenant, query: { section: 'income' } });
    expect([401, 403]).toContain(res.status);
  });
});
