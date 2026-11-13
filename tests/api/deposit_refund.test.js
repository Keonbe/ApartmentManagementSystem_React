// Refundable security deposit: settle_deposit() in config.php, reached from the
// move-out clearance (update_tenant_status.php) and the contract termination
// (update_contract_status.php). RA 9653 Sec. 7: the deposit returns what the
// deductions and unpaid invoices leave, through a 'deposit' refund request; the
// only extra deduction is rent for the notice days when no notice was given.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, mark;
const APP = 11; // user 13, room L, pending-move-out in the seed
const CONTRACT = 'LC-0010';
const DEPOSIT = 3500;

const clear = (json = {}) => api('update_tenant_status.php', { token: admin, json: { id: APP, status: 'moved-out', ...json } });
const contract = () => one('SELECT status, deposit_status, deposit_refundable, refund_amount, damage_deduction FROM lease_contracts WHERE id = ?', [CONTRACT]);
const depositRefund = () => one("SELECT id, type, amount, status, invoice_id, rent_application_id FROM refund_requests WHERE rent_application_id = ? AND type = 'deposit' ORDER BY id DESC LIMIT 1", [APP]);

// A tenant with a notice, a paid deposit, no unpaid invoices, and the rent running
// to `leaseEnd`; the requested move-out date is today unless given.
async function reset({ refundable = 1, leaseEnd = "CURDATE() - INTERVAL 1 DAY", appStatus = 'pending-move-out' } = {}) {
  await q('DELETE FROM deposit_deductions WHERE rent_application_id = ?', [APP]);
  await q("DELETE FROM refund_requests WHERE rent_application_id = ? AND type = 'deposit'", [APP]);
  await q("UPDATE invoices SET status = 'cancelled' WHERE rent_application_id = ? AND status <> 'paid'", [APP]);
  await q("UPDATE rent_applications SET status = ?, requested_move_out_date = CURDATE() WHERE id = ?", [appStatus, APP]);
  // An earlier clearance vacated the unit: put the tenant back so the next one can end the tenancy.
  await q("UPDATE rooms r JOIN rent_applications ra ON ra.room_name = r.id SET r.status = 'occupied', r.tenant_name = TRIM(CONCAT_WS(' ', ra.first_name, ra.last_name, NULLIF(TRIM(ra.suffix), ''))) WHERE ra.id = ?", [APP]);
  await q(`UPDATE lease_contracts SET status = 'active', deposit_amount = ?, deposit_status = 'Held', deposit_refundable = ?,
           damage_deduction = 0, utility_deduction = 0, refund_amount = 0, refund_date = NULL, lease_end = ${leaseEnd} WHERE id = ?`, [DEPOSIT, refundable, CONTRACT]);
}

beforeAll(async () => {
  admin = await loginAs('admin');
  mark = await loginAs('mark');
});

describe('refundable deposit', () => {
  it('returns what the deductions leave through a deposit refund request', async () => {
    await reset();
    const res = await clear({ deductions: [{ category: 'damage', reason: 'Broken window', amount: 500 }] });
    expect(res.status).toBe(200);
    expect(res.body.deposit).toMatchObject({ status: 'Refund Pending', refund_amount: DEPOSIT - 500, notice_deduction: 0 });

    expect(await contract()).toMatchObject({ deposit_status: 'Refund Pending', refund_amount: '3000.00', status: 'expired' });
    const refund = await depositRefund();
    expect(refund).toMatchObject({ type: 'deposit', amount: '3000.00', status: 'Pending Review', invoice_id: null });

    // The tenant sees it, with a due date, and cannot cancel it.
    const mine = await api('get_refund_requests.php', { token: mark });
    const row = (mine.body.requests || mine.body.data || []).find((r) => r.id === refund.id);
    expect(row.type).toBe('deposit');
    expect(row.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const cancel = await api('respond_refund_request.php', { token: mark, json: { id: refund.id, action: 'cancel' } });
    expect(cancel.status).toBe(409);
    expect((await depositRefund()).status).toBe('Pending Review');
  });

  it('marking the refund paid out shows "Refunded" on the contract', async () => {
    const refund = await depositRefund();
    expect((await api('update_refund_request.php', { token: admin, json: { id: refund.id, action: 'approve' } })).status).toBe(200);
    const paid = await api('update_refund_request.php', { token: admin, json: { id: refund.id, action: 'mark_refunded', payout_method: 'GCash', payout_reference: 'T-123' } });
    expect(paid.status).toBe(200);
    expect((await contract()).deposit_status).toBe('Refunded');
  });

  it('deductions that use up the deposit leave nothing to refund', async () => {
    await reset();
    const res = await clear({ deductions: [{ category: 'damage', reason: 'Wall repair', amount: DEPOSIT + 200 }] });
    expect(res.status).toBe(200);
    expect(res.body.balance_due).toBe(200);
    expect(await depositRefund()).toBeNull();
    expect(await contract()).toMatchObject({ refund_amount: '0.00', deposit_status: 'Applied to Bills/Damages' });
  });

  it('still returns the rest when the tenant gave notice but leaves before the rent end date', async () => {
    await reset({ leaseEnd: 'CURDATE() + INTERVAL 60 DAY' });
    const res = await clear({ deductions: [{ category: 'damage', reason: 'Broken window', amount: 500 }] });
    expect(res.status).toBe(200);
    expect(res.body.deposit).toMatchObject({ status: 'Refund Pending', refund_amount: DEPOSIT - 500, notice_deduction: 0 });
    expect((await depositRefund()).amount).toBe('3000.00');
    expect(await one("SELECT COUNT(*) AS n FROM deposit_deductions WHERE rent_application_id = ? AND category = 'forfeiture'", [APP])).toMatchObject({ n: 0 });
  });

  // Rent for the minimum notice days at the daily rate (monthly / 30).
  const noticeRent = async () => {
    const { rent } = await one('SELECT monthly_rent AS rent FROM rent_applications WHERE id = ?', [APP]);
    const row = await one("SELECT setting_value AS v FROM system_settings WHERE setting_key = 'move_out_min_notice_days'");
    const days = row ? Number(row.v) : 15;
    return Math.round(Number(rent) / 30 * days * 100) / 100;
  };

  it('deducts only rent for the notice days when there was no move-out notice', async () => {
    await reset({ appStatus: 'active' });
    const expected = await noticeRent();
    const res = await clear({ damage_deduction: 0, utility_deduction: 0 });
    expect(res.status).toBe(200);
    expect(res.body.deposit.notice_deduction).toBeCloseTo(expected, 2);
    expect(res.body.deposit.refund_amount).toBeCloseTo(Math.max(0, DEPOSIT - expected), 2);
    const row = await one("SELECT amount, reason FROM deposit_deductions WHERE rent_application_id = ? AND category = 'unpaid_rent'", [APP]);
    expect(Number(row.amount)).toBeCloseTo(expected, 2);
    expect(row.reason).toMatch(/notice not given/);
  });

  it('a lower notice deduction needs a reason', async () => {
    await reset({ appStatus: 'active' });
    const refused = await clear({ damage_deduction: 0, utility_deduction: 0, notice_deduction: 0 });
    expect(refused.body.success).toBe(false);
    expect(refused.body.message).toMatch(/reason/);
    expect((await contract()).deposit_status).toBe('Held');

    const res = await clear({ damage_deduction: 0, utility_deduction: 0, notice_deduction: 0, waive_forfeiture_reason: 'Moved for work, owner agreed' });
    expect(res.status).toBe(200);
    expect(res.body.deposit).toMatchObject({ refund_amount: DEPOSIT, notice_deduction: 0 });
  });

  it('returns bank interest with the deposit', async () => {
    await reset();
    const res = await clear({ deductions: [], deposit_interest: 12.5 });
    expect(res.status).toBe(200);
    expect(res.body.deposit).toMatchObject({ refund_amount: DEPOSIT + 12.5, interest: 12.5 });
    expect((await depositRefund()).amount).toBe('3512.50');
  });

  it('a deposit that was never paid refunds nothing', async () => {
    await reset();
    await q("UPDATE lease_contracts SET deposit_status = 'Pending' WHERE id = ?", [CONTRACT]);
    const res = await clear({ deductions: [] });
    expect(res.status).toBe(200);
    expect(await depositRefund()).toBeNull();
    expect((await contract()).deposit_status).toBe('Not Collected');
  });
});

describe('a contract once marked "not refundable"', () => {
  it('still returns the unused deposit (RA 9653 Sec. 7)', async () => {
    await reset({ refundable: 0 });
    const res = await clear({ deductions: [] });
    expect(res.status).toBe(200);
    expect(await contract()).toMatchObject({ deposit_status: 'Refund Pending', refund_amount: '3500.00' });
    expect((await depositRefund()).amount).toBe('3500.00');
  });
});

describe('termination', () => {
  it('needs a legal ground', async () => {
    await reset();
    await q("UPDATE rent_applications SET status = 'active' WHERE id = ?", [APP]);
    const res = await api('update_contract_status.php', { token: admin, json: { contractId: CONTRACT, action: 'terminate', reason: 'Repeated violations' } });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/legal ground/);
  });

  it('returns the deposit when ended by mutual agreement', async () => {
    await reset();
    await q("UPDATE rent_applications SET status = 'active' WHERE id = ?", [APP]);
    const res = await api('update_contract_status.php', { token: admin, json: { contractId: CONTRACT, action: 'terminate', reason: 'Agreed exit', ground: 'mutual' } });
    expect(res.status).toBe(200);
    expect((await depositRefund()).amount).toBe('3500.00');
    expect(await one('SELECT eviction_ground FROM lease_contracts WHERE id = ?', [CONTRACT])).toMatchObject({ eviction_ground: 'mutual' });
  });
});

describe('deposit terms on a contract', () => {
  it('cannot be switched to "not refundable"', async () => {
    await q("UPDATE lease_contracts SET status = 'draft' WHERE id = ?", [CONTRACT]);
    const res = await api('update_contract_status.php', { token: admin, json: { contractId: CONTRACT, action: 'set_deposit_refundable', depositRefundable: false } });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/RA 9653/);
    await q("UPDATE lease_contracts SET status = 'active' WHERE id = ?", [CONTRACT]);
  });

  it('a tenant cannot open a deposit refund themselves', async () => {
    const res = await api('create_refund_request.php', { token: mark, json: { type: 'deposit', amount: 100, reason: 'Give me my deposit' } });
    expect(res.status).toBe(400);
  });

  it('new contracts copy the deposit_refundable_default setting', async () => {
    const row = await one("SELECT setting_value FROM system_settings WHERE setting_key = 'deposit_refundable_default'");
    expect(row.setting_value).toBe('1');
  });
});

describe('restoring a tenancy whose deposit refund was opened', () => {
  const archiveAfterClearance = async () => {
    await q("UPDATE rent_applications SET status = 'archived', pre_archive_status = 'active' WHERE id = ?", [APP]);
  };

  it('cancels the open refund and holds the deposit again', async () => {
    await reset();
    expect((await clear({ deductions: [] })).status).toBe(200);
    expect((await depositRefund()).status).toBe('Pending Review');
    await archiveAfterClearance();
    const res = await api('restore_tenant.php', { token: admin, json: { id: APP } });
    expect(res.body.success).toBe(true);
    expect((await depositRefund()).status).toBe('Cancelled');
    expect(await contract()).toMatchObject({ deposit_status: 'Held', refund_amount: '0.00' });
  });

  it('is refused once the deposit was paid out', async () => {
    await reset();
    expect((await clear({ deductions: [] })).status).toBe(200);
    const refund = await depositRefund();
    await api('update_refund_request.php', { token: admin, json: { id: refund.id, action: 'approve' } });
    await api('update_refund_request.php', { token: admin, json: { id: refund.id, action: 'mark_refunded', payout_method: 'Cash', payout_reference: 'R-1' } });
    await archiveAfterClearance();
    const res = await api('restore_tenant.php', { token: admin, json: { id: APP } });
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already refunded/);
    expect((await contract()).deposit_status).toBe('Refunded');
  });
});
