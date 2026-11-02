// "Still owed" is one rule (invoice_balance_sql / invoice_owed_where_sql in
// backend/config.php): the balance, not the total, on open bills, and never an
// unpaid advance-rent invoice. Reports, the tenants list and the deposit
// decision used to each re-derive it.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin;
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const period = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const today = `${period}-${pad(now.getDate())}`;

async function addBill(id, { amount = 1500, paid = 0, status = 'overdue', dueDays = -10, advance = null } = {}) {
  await q(
    `INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date, advance_months)
     VALUES (?, 2, 1, ?, ?, ?, 'Test bill', ?, CURDATE() + INTERVAL ? DAY, ?)`,
    [id, amount, amount, paid, status, dueDays, advance],
  );
}

beforeAll(async () => {
  admin = await loginAs('admin');
});

describe('Reports → outstanding balances', () => {
  it('lists the remaining balance of a part-paid overdue bill, not its total', async () => {
    await addBill('INV-TEST-BAL-PART', { amount: 1500, paid: 400 });
    const res = await api('get_report_data.php', { token: admin });
    expect(res.status).toBe(200);
    const row = res.body.data.outstandingBalances.find((r) => r.invoiceId === 'INV-TEST-BAL-PART');
    expect(row.balance).toBe(1100);
  });

  it('leaves out an advance-rent invoice', async () => {
    await addBill('INV-TEST-BAL-ADV', { advance: 2, status: 'pending' });
    const res = await api('get_report_data.php', { token: admin });
    expect(res.body.data.outstandingBalances.find((r) => r.invoiceId === 'INV-TEST-BAL-ADV')).toBeUndefined();
  });
});

describe('Tenants list → outstanding balance', () => {
  it('counts the balance of open bills and ignores an unpaid advance invoice', async () => {
    const owedOf = async () => {
      const res = await api('get_tenants.php', { token: admin });
      expect(res.status).toBe(200);
      return res.body.data.find((t) => Number(t.id) === 1).outstandingBalance;
    };
    const before = await owedOf();
    await addBill('INV-TEST-BAL-T1', { amount: 1000, paid: 250, status: 'pending', dueDays: 5 });
    expect(await owedOf()).toBe(before + 750);
    await addBill('INV-TEST-BAL-T2', { amount: 3000, status: 'pending', dueDays: 5, advance: 2 });
    expect(await owedOf()).toBe(before + 750);
  });
});

describe('sync_utility_to_invoice.php paid mode', () => {
  it('stores the invoice as fully paid (amount_paid = total)', async () => {
    const save = await api('save_utility_reading.php', {
      token: admin,
      json: { billing_period: period, reading_date: today, entry_mode: 'bill', room_name: 'K', water_bill_amount: 200, electric_bill_amount: 300 },
    });
    expect(save.status).toBe(200);
    const row = await one('SELECT id FROM utility_readings WHERE room_name = ? AND billing_period = ?', ['K', period]);
    const res = await api('sync_utility_to_invoice.php', { token: admin, json: { id: row.id, sync_mode: 'paid' } });
    expect(res.status).toBe(200);
    const inv = await one('SELECT status, total_amount, amount_paid FROM invoices WHERE id = ?', [res.body.invoice_id]);
    expect(inv.status).toBe('paid');
    expect(Number(inv.amount_paid)).toBe(Number(inv.total_amount));
  });
});
