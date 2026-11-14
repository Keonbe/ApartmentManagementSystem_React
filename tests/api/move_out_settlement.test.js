// Move-out settlement records (SPRINT 73): what settle_deposit() works out is
// written to the ledger by apply_deposit_to_invoices() in config.php.
//   - an invoice the deposit covers is 'paid' from the deposit, not cancelled;
//   - deductions the deposit does not reach become a 'Move-out balance' invoice,
//     and bills still owed stay open, so the open balances equal balance_due;
//   - prepaid months not reached open an 'advance' refund request (end_tenancy());
//   - restoring the tenancy undoes all of it (restore_tenant.php).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin;
const APP = 11; // user 13, room L, pending-move-out in the seed
const USER = 13;
const CONTRACT = 'LC-0010';
const DEPOSIT = 3500;

const clear = (json = {}) => api('update_tenant_status.php', { token: admin, json: { id: APP, status: 'moved-out', ...json } });
const invoice = (id) => one('SELECT status, amount_paid, total_amount, payment_method, cancel_reason, base_rent, electricity, water, maintenance, due_date FROM invoices WHERE id = ?', [id]);
const depositRows = (id) => q("SELECT amount, payment_method, reference_number FROM payment_transactions WHERE invoice_id = ? AND payment_method = 'Security deposit'", [id]);
const balanceInvoice = () => one("SELECT id, status, total_amount, amount_paid, base_rent, electricity, water, maintenance, cancel_reason, DATEDIFF(due_date, CURDATE()) AS due_in FROM invoices WHERE rent_application_id = ? AND billing_period = 'Move-out balance' ORDER BY created_at DESC, id DESC LIMIT 1", [APP]);
const openBalance = async () => Number((await one(`SELECT COALESCE(SUM(total_amount - amount_paid), 0) AS n FROM invoices
  WHERE rent_application_id = ? AND advance_months IS NULL AND status IN ('pending', 'unpaid', 'overdue', 'pending-verification', 'scheduled', 'processing', 'payment-failed')`, [APP])).n);
const advanceRefund = () => one("SELECT id, amount, status, raised_by_role FROM refund_requests WHERE rent_application_id = ? AND type = 'advance' ORDER BY id DESC LIMIT 1", [APP]);

async function bill(id, amount, dueSql, status = 'overdue') {
  await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date)
           VALUES (?, ?, ?, ?, ?, 'Move-out test', ?, ${dueSql})`, [id, USER, APP, amount, amount, status]);
}

// Two prepaid months the tenancy has not reached, paid for (credits 'available').
async function prepaidMonths() {
  await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, advance_months, paid_at)
           VALUES ('INV-MOS-ADV', ?, ?, 8000, 8000, 8000, 'Advance rent', 'paid', 2, NOW())`, [USER, APP]);
  await q(`INSERT INTO advance_credits (advance_invoice_id, user_id, rent_application_id, period_start, amount, status) VALUES
           ('INV-MOS-ADV', ?, ?, DATE_ADD(CURDATE(), INTERVAL 2 MONTH), 4000, 'available'),
           ('INV-MOS-ADV', ?, ?, DATE_ADD(CURDATE(), INTERVAL 3 MONTH), 4000, 'available')`, [USER, APP, USER, APP]);
}

// A tenant with a notice, a paid deposit and no bills.
async function reset({ depositStatus = 'Held', appStatus = 'pending-move-out' } = {}) {
  await q('DELETE FROM deposit_deductions WHERE rent_application_id = ?', [APP]);
  await q('DELETE FROM advance_credits WHERE rent_application_id = ?', [APP]);
  await q('DELETE FROM refund_requests WHERE rent_application_id = ?', [APP]);
  await q("DELETE FROM invoices WHERE id LIKE 'INV-MOS-%' OR (rent_application_id = ? AND billing_period = 'Move-out balance')", [APP]);
  await q("UPDATE invoices SET status = 'cancelled' WHERE rent_application_id = ? AND status <> 'paid'", [APP]);
  await q('UPDATE rent_applications SET status = ?, pre_archive_status = NULL, requested_move_out_date = CURDATE() WHERE id = ?', [appStatus, APP]);
  await q("UPDATE rooms r JOIN rent_applications ra ON ra.room_name = r.id SET r.status = 'occupied', r.tenant_name = TRIM(CONCAT_WS(' ', ra.first_name, ra.last_name, NULLIF(TRIM(ra.suffix), ''))) WHERE ra.id = ?", [APP]);
  await q(`UPDATE lease_contracts SET status = 'active', deposit_amount = ?, deposit_status = ?, damage_deduction = 0, utility_deduction = 0,
           refund_amount = 0, refund_date = NULL, lease_end = CURDATE() - INTERVAL 1 DAY WHERE id = ?`, [DEPOSIT, depositStatus, CONTRACT]);
}

beforeAll(async () => {
  admin = await loginAs('admin');
});

describe('a deposit that covers the unpaid bills', () => {
  it('marks them paid from the deposit and refunds the same amount as before', async () => {
    await reset();
    await bill('INV-MOS-A', 2000, 'CURDATE() - INTERVAL 10 DAY');
    const res = await clear({ deductions: [] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, balance_due: 0, invoices_paid_from_deposit: 1 });
    expect(res.body.balance_invoice).toBeUndefined();
    expect(res.body.deposit).toMatchObject({ status: 'Refund Pending', refund_amount: DEPOSIT - 2000 });

    expect(await invoice('INV-MOS-A')).toMatchObject({ status: 'paid', amount_paid: '2000.00', payment_method: 'Security deposit', cancel_reason: null });
    // No reference on the row: the contract would repeat across invoices as a reused reference.
    expect(await depositRows('INV-MOS-A')).toEqual([{ amount: '2000.00', payment_method: 'Security deposit', reference_number: null }]);
    expect(await balanceInvoice()).toBeNull();
    expect(await openBalance()).toBe(0);
  });

  it('shows the bill as paid from the deposit to the tenant', async () => {
    const mark = await loginAs('mark');
    const res = await api(`get_invoices.php?userId=${USER}`, { token: mark });
    const row = (res.body.invoices || res.body.data || []).find((i) => i.id === 'INV-MOS-A');
    expect(row).toMatchObject({ status: 'paid', paid_from_deposit: true });
  });

  it('writes nothing when there is nothing owed and nothing deducted', async () => {
    await reset();
    const res = await clear({ deductions: [] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ balance_due: 0, invoices_paid_from_deposit: 0 });
    expect(await balanceInvoice()).toBeNull();
    expect((await one("SELECT COUNT(*) AS n FROM payment_transactions pt JOIN invoices i ON i.id = pt.invoice_id WHERE i.rent_application_id = ? AND pt.payment_method = 'Security deposit'", [APP])).n).toBe(0);
  });
});

describe('a deposit that falls short', () => {
  it('pays the oldest bill, leaves the rest owed, and bills the uncovered deductions', async () => {
    await reset();
    await bill('INV-MOS-A', 2000, 'CURDATE() - INTERVAL 10 DAY');
    await bill('INV-MOS-B', 2500, 'CURDATE() + INTERVAL 5 DAY', 'pending');
    const res = await clear({ deductions: [
      { category: 'damage', reason: 'Broken door', amount: 1000 },
      { category: 'electricity', reason: 'Last Meralco bill', amount: 300 },
    ] });
    expect(res.status).toBe(200);
    // 2000 + 2500 + 1300 owed against 3500.
    expect(res.body.balance_due).toBe(2300);
    expect(res.body.deposit).toMatchObject({ status: 'Applied to Bills/Damages', refund_amount: 0 });

    expect(await invoice('INV-MOS-A')).toMatchObject({ status: 'paid', payment_method: 'Security deposit' });
    // Part-covered and not yet due: still owed, not cancelled by the move-out.
    expect(await invoice('INV-MOS-B')).toMatchObject({ status: 'pending', amount_paid: '1500.00', cancel_reason: null });
    expect(await depositRows('INV-MOS-B')).toEqual([{ amount: '1500.00', payment_method: 'Security deposit', reference_number: null }]);

    const balance = await balanceInvoice();
    expect(balance).toMatchObject({ status: 'pending', total_amount: '1300.00', amount_paid: '0.00', maintenance: '1000.00', electricity: '300.00', base_rent: '0.00', water: '0.00' });
    expect(balance.due_in).toBeGreaterThan(0);
    expect(res.body.balance_invoice).toEqual({ id: balance.id, amount: 1300 });
    // The bills the system holds add up to the balance it reported.
    expect(await openBalance()).toBe(2300);
  });

  it('a second clearance is refused and doubles nothing', async () => {
    const again = await clear({ deductions: [{ category: 'damage', reason: 'Broken door', amount: 1000 }] });
    expect(again.status).toBe(409);
    expect(await openBalance()).toBe(2300);
    expect((await one("SELECT COUNT(*) AS n FROM invoices WHERE rent_application_id = ? AND billing_period = 'Move-out balance'", [APP])).n).toBe(1);
  });

  it('the deposit covers deductions in order, billing only what it did not reach', async () => {
    await reset();
    // 3,500 covers the electricity (300) and 3,200 of the 3,400 damage.
    const res = await clear({ deductions: [
      { category: 'damage', reason: 'Wall repair', amount: 3400 },
      { category: 'electricity', reason: 'Last bill', amount: 300 },
    ] });
    expect(res.body.balance_due).toBe(200);
    expect(await balanceInvoice()).toMatchObject({ total_amount: '200.00', maintenance: '200.00', electricity: '0.00' });
  });

  it('with no deposit collected the bills stay owed and the deductions are billed', async () => {
    await reset({ depositStatus: 'Pending' });
    await bill('INV-MOS-A', 2000, 'CURDATE() - INTERVAL 10 DAY');
    const res = await clear({ deductions: [{ category: 'water', reason: 'Last water bill', amount: 500 }] });
    expect(res.status).toBe(200);
    expect(res.body.balance_due).toBe(2500);
    expect(await invoice('INV-MOS-A')).toMatchObject({ status: 'overdue', amount_paid: '0.00' });
    expect(await depositRows('INV-MOS-A')).toEqual([]);
    expect(await balanceInvoice()).toMatchObject({ total_amount: '500.00', water: '500.00' });
    expect(await openBalance()).toBe(2500);
  });
});

describe('contract termination', () => {
  it('writes the same records as a clearance', async () => {
    await reset({ appStatus: 'active' });
    await bill('INV-MOS-A', 4000, 'CURDATE() - INTERVAL 10 DAY');
    const res = await api('update_contract_status.php', { token: admin, json: { contractId: CONTRACT, action: 'terminate', reason: 'Agreed exit', ground: 'mutual', damage_deduction: 500 } });
    expect(res.status).toBe(200);
    expect(await invoice('INV-MOS-A')).toMatchObject({ status: 'overdue', amount_paid: '3500.00', cancel_reason: null });
    const balance = await balanceInvoice();
    expect(balance).toMatchObject({ total_amount: '500.00', maintenance: '500.00' });
    expect(res.body.balance_invoice).toEqual({ id: balance.id, amount: 500 });
    expect(await openBalance()).toBe(1000);
  });
});

describe('prepaid months not reached', () => {
  it('open one refund request that holds the credits', async () => {
    await reset();
    await prepaidMonths();
    const res = await clear({ deductions: [] });
    expect(res.status).toBe(200);
    const refund = await advanceRefund();
    expect(refund).toMatchObject({ amount: '8000.00', status: 'Pending Review', raised_by_role: 'admin' });
    expect(res.body.advance_refund).toEqual({ id: refund.id, amount: 8000 });
    expect(await q('SELECT status, refund_request_id FROM advance_credits WHERE rent_application_id = ? ORDER BY period_start', [APP]))
      .toEqual([{ status: 'refund-due', refund_request_id: refund.id }, { status: 'refund-due', refund_request_id: refund.id }]);
    // The paid advance invoice itself is not touched.
    expect(await invoice('INV-MOS-ADV')).toMatchObject({ status: 'paid' });
    // It reached the admin queue.
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE status = 'Pending' AND message LIKE '%advance rent not used at move-out%'")).n).toBeGreaterThan(0);
  });

  it('rejecting it frees the credits to be asked for again', async () => {
    const refund = await advanceRefund();
    const res = await api('update_refund_request.php', { token: admin, json: { id: refund.id, action: 'reject', message: 'Wrong payout details' } });
    expect(res.status).toBe(200);
    expect(await q('SELECT DISTINCT status, refund_request_id FROM advance_credits WHERE rent_application_id = ?', [APP])).toEqual([{ status: 'refund-due', refund_request_id: null }]);
  });

  it('leaves out a month the tenant already asked back', async () => {
    await reset();
    await prepaidMonths();
    const mine = await q("INSERT INTO refund_requests (user_id, rent_application_id, type, amount, reason, raised_by, raised_by_role) VALUES (?, ?, 'advance', 4000, 'Leaving early', ?, 'user')", [USER, APP, USER]);
    await q('UPDATE advance_credits SET refund_request_id = ? WHERE rent_application_id = ? ORDER BY period_start LIMIT 1', [mine.insertId, APP]);
    expect((await clear({ deductions: [] })).status).toBe(200);
    const refund = await advanceRefund();
    expect(refund.id).not.toBe(mine.insertId);
    expect(refund).toMatchObject({ amount: '4000.00', raised_by_role: 'admin' });
    expect((await one("SELECT COUNT(*) AS n FROM refund_requests WHERE rent_application_id = ? AND type = 'advance'", [APP])).n).toBe(2);
  });
});

describe('restoring the tenancy', () => {
  const archive = () => q("UPDATE rent_applications SET status = 'archived', pre_archive_status = 'active' WHERE id = ?", [APP]);
  const shortClearance = async () => {
    await reset();
    await bill('INV-MOS-A', 2000, 'CURDATE() - INTERVAL 10 DAY');
    await bill('INV-MOS-B', 2500, 'CURDATE() + INTERVAL 5 DAY', 'pending');
    await prepaidMonths();
    expect((await clear({ deductions: [{ category: 'damage', reason: 'Broken door', amount: 1000 }] })).status).toBe(200);
  };

  it('puts the bills, the deposit and the prepaid months back', async () => {
    await shortClearance();
    const autoRefund = await advanceRefund();
    await archive();
    const res = await api('restore_tenant.php', { token: admin, json: { id: APP } });
    expect(res.body.success).toBe(true);

    expect(await invoice('INV-MOS-A')).toMatchObject({ status: 'overdue', amount_paid: '0.00', payment_method: null });
    expect(await invoice('INV-MOS-B')).toMatchObject({ status: 'pending', amount_paid: '0.00' });
    expect(await depositRows('INV-MOS-A')).toEqual([]);
    expect(await depositRows('INV-MOS-B')).toEqual([]);
    expect(await balanceInvoice()).toMatchObject({ status: 'cancelled', cancel_reason: 'Tenancy restored' });
    expect((await one('SELECT deposit_status FROM lease_contracts WHERE id = ?', [CONTRACT])).deposit_status).toBe('Held');

    expect((await one('SELECT status FROM refund_requests WHERE id = ?', [autoRefund.id])).status).toBe('Cancelled');
    expect(await q('SELECT DISTINCT status, refund_request_id FROM advance_credits WHERE rent_application_id = ?', [APP])).toEqual([{ status: 'available', refund_request_id: null }]);
  });

  it('is refused once the move-out balance has a payment', async () => {
    await shortClearance();
    const balance = await balanceInvoice();
    await q('UPDATE invoices SET amount_paid = 100 WHERE id = ?', [balance.id]);
    await archive();
    const res = await api('restore_tenant.php', { token: admin, json: { id: APP } });
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already has a payment/);
    // Nothing was undone.
    expect(await invoice('INV-MOS-A')).toMatchObject({ status: 'paid' });
    expect((await one('SELECT status FROM rent_applications WHERE id = ?', [APP])).status).toBe('archived');
  });
});
