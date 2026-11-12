// Refundable security deposit: settle_deposit() in config.php, reached from the
// move-out clearance (update_tenant_status.php) and the contract termination
// (update_contract_status.php). A refundable deposit returns what the
// deductions and unpaid invoices leave, through a 'deposit' refund request,
// unless it is forfeited (no notice, leaving before the rent end, termination).
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
    expect(res.body.deposit).toMatchObject({ status: 'Refund Pending', refund_amount: DEPOSIT - 500, forfeited: 0 });

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

  it('forfeits the rest when the tenant leaves before the rent end date', async () => {
    await reset({ leaseEnd: 'CURDATE() + INTERVAL 60 DAY' });
    const res = await clear({ deductions: [{ category: 'damage', reason: 'Broken window', amount: 500 }] });
    expect(res.status).toBe(200);
    expect(res.body.deposit).toMatchObject({ status: 'Forfeited', refund_amount: 0, forfeited: DEPOSIT - 500 });
    expect(await depositRefund()).toBeNull();
    const forfeit = await one("SELECT amount, reason FROM deposit_deductions WHERE rent_application_id = ? AND category = 'forfeiture'", [APP]);
    expect(forfeit.amount).toBe('3000.00');
    expect(forfeit.reason).toMatch(/before the contract end date/);
  });

  it('forfeits the rest when there was no move-out notice', async () => {
    await reset({ appStatus: 'active' });
    const res = await clear({ damage_deduction: 0, utility_deduction: 0 });
    expect(res.status).toBe(200);
    expect(res.body.deposit).toMatchObject({ status: 'Forfeited', forfeited: DEPOSIT });
    expect(await depositRefund()).toBeNull();
  });

  it('an admin can waive the forfeiture with a reason', async () => {
    await reset({ leaseEnd: 'CURDATE() + INTERVAL 60 DAY' });
    const res = await clear({ deductions: [], waive_forfeiture_reason: 'Moved for work, approved by the owner' });
    expect(res.status).toBe(200);
    expect(res.body.deposit).toMatchObject({ status: 'Refund Pending', refund_amount: DEPOSIT });
    expect((await depositRefund()).amount).toBe('3500.00');
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

describe('deposit not refundable (existing contracts)', () => {
  it('is applied as before: no refund, no forfeiture row', async () => {
    await reset({ refundable: 0 });
    const res = await clear({ deductions: [] });
    expect(res.status).toBe(200);
    expect(await contract()).toMatchObject({ deposit_status: 'Applied to Rent', refund_amount: '0.00' });
    expect(await depositRefund()).toBeNull();
    expect(await one('SELECT COUNT(*) AS n FROM deposit_deductions WHERE rent_application_id = ?', [APP])).toMatchObject({ n: 0 });
  });
});

describe('termination for cause', () => {
  it('forfeits a refundable deposit', async () => {
    await reset();
    await q("UPDATE rent_applications SET status = 'active' WHERE id = ?", [APP]);
    const res = await api('update_contract_status.php', { token: admin, json: { contractId: CONTRACT, action: 'terminate', reason: 'Repeated violations' } });
    expect(res.status).toBe(200);
    expect(await depositRefund()).toBeNull();
    expect((await contract()).deposit_status).toBe('Forfeited');
  });

  it('can be waived with a reason, which opens the refund', async () => {
    await reset();
    await q("UPDATE rent_applications SET status = 'active' WHERE id = ?", [APP]);
    const res = await api('update_contract_status.php', { token: admin, json: { contractId: CONTRACT, action: 'terminate', reason: 'Agreed exit', waive_forfeiture_reason: 'Owner agreed to return it' } });
    expect(res.status).toBe(200);
    expect((await depositRefund()).amount).toBe('3500.00');
  });
});

describe('deposit terms on a contract', () => {
  it('can be changed on a draft only', async () => {
    await q("UPDATE lease_contracts SET status = 'draft', deposit_refundable = 0 WHERE id = ?", [CONTRACT]);
    const on = await api('update_contract_status.php', { token: admin, json: { contractId: CONTRACT, action: 'set_deposit_refundable', depositRefundable: true } });
    expect(on.status).toBe(200);
    expect((await contract()).deposit_refundable).toBe(1);

    await q("UPDATE lease_contracts SET status = 'active' WHERE id = ?", [CONTRACT]);
    const late = await api('update_contract_status.php', { token: admin, json: { contractId: CONTRACT, action: 'set_deposit_refundable', depositRefundable: false } });
    expect(late.status).toBe(422);
    expect((await contract()).deposit_refundable).toBe(1);
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
