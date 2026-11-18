// void_payment.php (SPRINT 182, panel audit F-04): an admin voids a paid desk
// payment with a reason. The bill reopens (pending, or overdue once past its due
// date), its payment rows go, the tenant is told, and the reason / admin / amount
// stay in the bill's adjustment history and the activity log. Online, combined,
// advance and deposit payments, a bill with a refund request, and a move-in bill
// of a tenant who has moved in are refused.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria, adminId;
const MARIA = 2;

// A bill the desk marked paid: the invoice, plus its ledger row.
async function paidBill(id, { total = 1500, dueDays = 5, method = 'Cash', extra = '', params = [] } = {}) {
  await q(
    `INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date, paid_at, payment_method, payment_reference ${extra ? ', ' + extra.split('=')[0] : ''})
     VALUES (?, ?, 1, ?, ?, ?, 'Void test', 'paid', CURDATE() + INTERVAL ? DAY, NOW(), ?, 'REF-${id}' ${extra ? ', ?' : ''})`,
    [id, MARIA, total, total, total, dueDays, method, ...params],
  );
  await q("INSERT INTO payment_transactions (invoice_id, amount, payment_method, reference_number, recorded_by) VALUES (?, ?, ?, ?, ?)", [id, total, method.toLowerCase(), `REF-${id}`, adminId]);
}
const bill = (id) => one('SELECT status, amount_paid, payment_method, payment_reference, bank_name, paid_at FROM invoices WHERE id = ?', [id]);
const txCount = async (id) => (await one('SELECT COUNT(*) AS n FROM payment_transactions WHERE invoice_id = ?', [id])).n;
const voidIt = (invoiceId, reason = 'Recorded against the wrong bill', token = admin) => api('void_payment.php', { token, json: { invoiceId, reason } });

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
  adminId = (await one("SELECT id FROM users WHERE email_address = 'admin@gmail.com'")).id;
});

describe('who and what', () => {
  it('is admin only, needs a known paid bill and a reason of 5 to 220 characters', async () => {
    await paidBill('INV-VOID-AUTH');
    expect((await api('void_payment.php', { json: { invoiceId: 'INV-VOID-AUTH', reason: 'a fair reason' } })).status).toBe(401);
    expect((await voidIt('INV-VOID-AUTH', 'a fair reason', maria)).status).toBe(403);
    expect((await voidIt('INV-VOID-NOPE')).status).toBe(404);
    for (const reason of [undefined, '   ', 'abcd', 'x'.repeat(221), 12345]) {
      const res = await api('void_payment.php', { token: admin, json: { invoiceId: 'INV-VOID-AUTH', ...(reason !== undefined ? { reason } : {}) } });
      expect(res.status).toBe(422);
      expect(res.body.errors.reason).toBeTruthy();
    }
    expect((await api('void_payment.php', { token: admin, json: { reason: 'a fair reason' } })).status).toBe(400);
    expect((await bill('INV-VOID-AUTH')).status).toBe('paid');
    expect(await txCount('INV-VOID-AUTH')).toBe(1);
  });

  it('refuses a bill that is not paid', async () => {
    await q("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date) VALUES ('INV-VOID-OPEN', ?, 1, 900, 900, 'Void test', 'pending', CURDATE() + INTERVAL 5 DAY)", [MARIA]);
    const res = await voidIt('INV-VOID-OPEN');
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not paid/);
  });
});

describe('voiding a desk payment', () => {
  it('reopens the bill, removes the payment rows, tells the tenant and keeps the record', async () => {
    await paidBill('INV-VOID-OK');
    const res = await voidIt('INV-VOID-OK', 'The transfer never arrived');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(await bill('INV-VOID-OK')).toMatchObject({ status: 'pending', payment_method: null, payment_reference: null, bank_name: null, paid_at: null });
    expect(Number((await bill('INV-VOID-OK')).amount_paid)).toBe(0);
    expect(await txCount('INV-VOID-OK')).toBe(0);

    const hist = await q("SELECT admin_id, reason, old_total, new_total, changes FROM invoice_adjustments WHERE invoice_id = 'INV-VOID-OK'");
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ admin_id: adminId, reason: 'Payment voided: The transfer never arrived' });
    expect(Number(hist[0].old_total)).toBe(Number(hist[0].new_total));
    expect(JSON.parse(hist[0].changes)).toEqual({ amount_paid: [1500, 0] });

    const log = await one("SELECT performed_by, details FROM activity_logs WHERE action = 'Voided Payment' ORDER BY id DESC LIMIT 1");
    expect(log.performed_by).toBe(adminId);
    expect(log.details).toContain('INV-VOID-OK');
    expect(log.details).toContain('REF-INV-VOID-OK');
    expect(log.details).toContain('The transfer never arrived');

    const note = await one("SELECT message FROM notifications WHERE user_id = ? AND title = 'Payment Voided' ORDER BY id DESC LIMIT 1", [MARIA]);
    expect(note.message).toContain('INV-VOID-OK');
    expect(note.message).toContain('The transfer never arrived');
  });

  it('a bill past its due date comes back overdue', async () => {
    await paidBill('INV-VOID-LATE', { dueDays: -3 });
    expect((await voidIt('INV-VOID-LATE')).status).toBe(200);
    expect((await bill('INV-VOID-LATE')).status).toBe('overdue');
  });

  it('a second void changes nothing (409), and the bill can be paid again at the desk', async () => {
    await paidBill('INV-VOID-TWICE');
    expect((await voidIt('INV-VOID-TWICE')).status).toBe(200);
    const again = await voidIt('INV-VOID-TWICE');
    expect(again.status).toBe(409);
    expect(await one("SELECT COUNT(*) AS n FROM invoice_adjustments WHERE invoice_id = 'INV-VOID-TWICE'")).toEqual({ n: 1 });

    const pay = await api('record_payment_admin.php', { token: admin, json: { invoiceId: 'INV-VOID-TWICE', payments: [{ method: 'cash', amount: 1500 }] } });
    expect(pay.body.success).toBe(true);
    expect((await bill('INV-VOID-TWICE')).status).toBe('paid');
    expect(await txCount('INV-VOID-TWICE')).toBe(1);
  });

  it('two voids at once settle once', async () => {
    await paidBill('INV-VOID-RACE');
    const [a, b] = await Promise.all([voidIt('INV-VOID-RACE'), voidIt('INV-VOID-RACE')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await one("SELECT COUNT(*) AS n FROM invoice_adjustments WHERE invoice_id = 'INV-VOID-RACE'")).toEqual({ n: 1 });
  });

  it('the voided payment drops out of the paid-invoice totals', async () => {
    await paidBill('INV-VOID-TOTAL', { total: 2222 });
    const paidTotal = async () => Number((await one("SELECT COALESCE(SUM(total_amount), 0) AS t FROM invoices WHERE status = 'paid' AND billing_period = 'Void test'")).t);
    const before = await paidTotal();
    await voidIt('INV-VOID-TOTAL');
    expect(await paidTotal()).toBe(before - 2222);
  });
});

describe('what cannot be voided', () => {
  const refused = async (id, pattern) => {
    const res = await voidIt(id);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(pattern);
    expect((await bill(id)).status).toBe('paid');
  };

  it('an online (PayMongo) payment: refund it instead', async () => {
    await paidBill('INV-VOID-ONLINE', { extra: 'payment_gateway = ?', params: ['paymongo'] });
    await refused('INV-VOID-ONLINE', /paid online/);
  });

  it('part of a combined payment', async () => {
    await paidBill('INV-VOID-GROUP', { extra: 'payment_group = ?', params: ['BND-TEST1'] });
    await refused('INV-VOID-GROUP', /together with other bills/);
  });

  it('an advance payment', async () => {
    await paidBill('INV-VOID-ADV', { extra: 'advance_months = ?', params: [2] });
    await refused('INV-VOID-ADV', /advance payment/);
  });

  it('a bill paid from advance rent or from the security deposit', async () => {
    await paidBill('INV-VOID-CREDIT', { method: 'Advance credit' });
    await refused('INV-VOID-CREDIT', /advance rent/);
    await paidBill('INV-VOID-DEPOSIT', { method: 'Security deposit' });
    await refused('INV-VOID-DEPOSIT', /security deposit/);
  });

  it('a bill that already has a refund request', async () => {
    await paidBill('INV-VOID-REFUND');
    await q("INSERT INTO refund_requests (user_id, type, invoice_id, amount, reason, status, raised_by_role) VALUES (?, 'overpayment', 'INV-VOID-REFUND', 100, 'test', 'Pending Review', 'admin')", [MARIA]);
    await refused('INV-VOID-REFUND', /refund request/);
  });

  it('the move-in bill of a tenant who has moved in', async () => {
    await paidBill('INV-VOID-MOVEIN', { extra: 'security_deposit = ?', params: [1500] });
    await refused('INV-VOID-MOVEIN', /already moved in/);
  });
});
