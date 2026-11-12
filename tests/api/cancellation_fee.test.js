// Cancellation fee: when a tenant asks to cancel an approved application they
// already paid for (request_application_cancellation.php), or Management cancels
// it at their request (update_tenant_status.php, at_tenant_request), the fee
// (Settings → Rental, default 0) is kept out of the amount asked back; paid_amount
// still records everything paid, so the admin can approve up to it. Both paths use
// open_cancellation_refund(). A rejection by Management is always refunded in full.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

let admin, tenant;
const APP = 12; // Grace Mendoza, Approved with a paid move-in invoice (INV-202601-14), as in application_lifecycle
const INV = 'INV-202601-14';

const ask = (json = {}) => api('request_application_cancellation.php', { token: tenant, json: { id: APP, reason: 'Change of plans', payout_destination: 'GCash 09171234567 · Grace Mendoza', ...json } });
const originOf = async (id) => (await api('get_refund_requests.php', { token: admin })).body.requests.find((r) => r.id === id)?.origin;
const requests = () => q("SELECT id, invoice_id, amount, paid_amount, reason, status, raised_by_role FROM refund_requests WHERE rent_application_id = ? AND type = 'rejected_application' ORDER BY id", [APP]);

beforeAll(async () => {
  admin = await loginAs('admin');
  tenant = await loginAs('grace');
});

// ₱4,000 paid on the move-in invoice (₱3,500 of it deposit), application approved, no refunds yet, fee 0.
beforeEach(async () => {
  await q('DELETE FROM refund_requests WHERE rent_application_id = ?', [APP]);
  await q("UPDATE rent_applications SET status = 'Approved', move_in_date = NULL, move_in_notified_at = NULL WHERE id = ?", [APP]);
  await q('DELETE FROM payment_transactions WHERE invoice_id = ?', [INV]);
  await q("UPDATE invoices SET status = 'paid', amount_paid = 4000, total_amount = 4000, security_deposit = 3500, cancel_reason = NULL WHERE id = ?", [INV]);
  // The seed also gives this application later rent invoices; an approved application before
  // move-in has only its move-in payment, so set those aside.
  await q("UPDATE invoices SET status = 'cancelled', amount_paid = 0 WHERE rent_application_id = ? AND id <> ?", [APP, INV]);
  await q("DELETE FROM invoices WHERE id = 'INV-CXL-OTHER'");
  await setSetting('cancellation_fee', '0');
});

describe('tenant asks to cancel after paying', () => {
  it('fee 0: the whole payment is asked back', async () => {
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ refund_amount: 4000, cancellation_fee: 0 });
    const [row] = await requests();
    expect(Number(row.amount)).toBe(4000);
    expect(Number(row.paid_amount)).toBe(4000);
    expect(row.reason).not.toMatch(/cancellation fee/);
  });

  it('a fee is kept out of the amount, named in the reason and the answer, and paid_amount keeps the full payment', async () => {
    await setSetting('cancellation_fee', '500');
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ refund_amount: 3500, cancellation_fee: 500 });
    expect(res.body.message).toMatch(/cancellation fee of ₱500\.00/);
    const [row] = await requests();
    expect(Number(row.amount)).toBe(3500);
    expect(Number(row.paid_amount)).toBe(4000);
    expect(row.reason).toMatch(/cancellation fee of ₱500\.00 kept from the ₱4,000\.00 paid/);
    expect(row.status).toBe('Pending Review');
  });

  it('the admin can approve the fee-reduced amount, or up to what was paid, but not more', async () => {
    await setSetting('cancellation_fee', '500');
    const { body } = await ask();
    const tooMuch = await api('update_refund_request.php', { token: admin, json: { id: body.id, action: 'approve', amount: 4000.01 } });
    expect(tooMuch.status).toBe(422);
    const waived = await api('update_refund_request.php', { token: admin, json: { id: body.id, action: 'approve', amount: 4000 } });
    expect(waived.body.success).toBe(true);
    expect(Number((await one('SELECT amount FROM refund_requests WHERE id = ?', [body.id])).amount)).toBe(4000);
  });

  it.each([['4000'], ['9000']])('a fee of ₱%s (as much as was paid) is refused and no request is opened', async (fee) => {
    await setSetting('cancellation_fee', fee);
    const res = await ask();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/nothing would be refunded/);
    expect(await requests()).toEqual([]);
  });

  it('a fee just under what was paid leaves the difference', async () => {
    await setSetting('cancellation_fee', '3999.50');
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.body.refund_amount).toBe(0.5);
  });

  it('the application itself is not cancelled by the request', async () => {
    await setSetting('cancellation_fee', '500');
    await ask();
    expect((await one('SELECT status FROM rent_applications WHERE id = ?', [APP])).status).toBe('Approved');
  });
});

describe('Management rejects', () => {
  it('a rejection is refunded in full whatever the fee, and reads as rejected by admin', async () => {
    await setSetting('cancellation_fee', '1000');
    const res = await api('update_tenant_status.php', { token: admin, json: { id: APP, status: 'Rejected', rejection_reason: 'Unit no longer available' } });
    expect(res.status).toBe(200);
    const [row] = await requests();
    expect(Number(row.amount)).toBe(4000);
    expect(row.reason).not.toMatch(/cancellation fee/);
    expect(await originOf(row.id)).toBe('rejected_by_admin');
  });
});

// An admin cancelling at the tenant's request opens the same cancellation refund request as the
// tenant's own (open_cancellation_refund()), so the fee is worked out in one place.
describe('Management cancels at the tenant\'s request', () => {
  const cancel = (json = {}, token = admin) => api('update_tenant_status.php', { token, json: { id: APP, status: 'Cancelled', rejection_reason: 'Tenant asked at the desk', at_tenant_request: true, ...json } });
  const appStatus = async () => (await one('SELECT status FROM rent_applications WHERE id = ?', [APP])).status;
  const feeLogs = async () => (await one("SELECT COUNT(*) AS c FROM activity_logs WHERE action = 'Cancellation Fee Kept'")).c;
  // A second paid invoice on the application that is not the move-in payment (no deposit).
  const addOtherPaidInvoice = () => q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, rent_period_start, status, due_date)
      SELECT 'INV-CXL-OTHER', user_id, id, 1000, 1000, 1000, 'Other bill', DATE_SUB(CURDATE(), INTERVAL 800 DAY), 'paid', DATE_SUB(CURDATE(), INTERVAL 800 DAY) FROM rent_applications WHERE id = ?`, [APP]);

  it('fee 0: the whole payment is asked back, as a cancellation by management', async () => {
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(res.body.refunds_raised).toBe(1);
    expect(res.body.cancellation_fee_kept).toBeUndefined();
    expect(await appStatus()).toBe('Cancelled');
    const [row] = await requests();
    expect(Number(row.amount)).toBe(4000);
    expect(Number(row.paid_amount)).toBe(4000);
    expect(row.status).toBe('Pending Review');
    expect(row.raised_by_role).toBe('admin');
    expect(row.reason).toMatch(/^Application cancelled by management at the tenant's request: Tenant asked at the desk/);
    expect(await originOf(row.id)).toBe('cancelled_by_admin');
  });

  it('a fee is kept out of the amount, named in the reason, the answer and the tenant\'s notice', async () => {
    await setSetting('cancellation_fee', '500');
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ refunds_raised: 1, cancellation_fee_kept: 500 });
    const [row] = await requests();
    expect(Number(row.amount)).toBe(3500);
    expect(Number(row.paid_amount)).toBe(4000);
    expect(row.reason).toMatch(/cancellation fee of ₱500\.00 kept from the ₱4,000\.00 paid/);
    const note = await one("SELECT message FROM notifications WHERE user_id = (SELECT user_id FROM rent_applications WHERE id = ?) AND type = 'application_update' ORDER BY id DESC LIMIT 1", [APP]);
    expect(note.message).toMatch(/cancellation fee of ₱500\.00 was kept/);
  });

  it('the same amount as the tenant\'s own request would ask back', async () => {
    await setSetting('cancellation_fee', '750');
    const own = await ask();
    const ownAmount = own.body.refund_amount;
    await q('DELETE FROM refund_requests WHERE rent_application_id = ?', [APP]);
    await cancel();
    expect(Number((await requests())[0].amount)).toBe(ownAmount);
  });

  it.each([['4000'], ['9000']])('a fee of ₱%s (as much as was paid) opens no request, keeps what was paid and is logged', async (fee) => {
    await setSetting('cancellation_fee', fee);
    const before = await feeLogs();
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(res.body.cancellation_fee_kept).toBe(4000);
    expect(res.body.refunds_raised).toBeUndefined();
    expect(await requests()).toEqual([]);
    expect(await appStatus()).toBe('Cancelled');
    expect(await feeLogs()).toBe(before + 1);
  });

  it('a request the tenant already sent is left alone, not duplicated', async () => {
    await setSetting('cancellation_fee', '500');
    await ask();
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(res.body.refunds_raised).toBeUndefined();
    const rows = await requests();
    expect(rows).toHaveLength(1);
    expect(rows[0].raised_by_role).toBe('user');
    expect(await appStatus()).toBe('Cancelled');
  });

  it('without the flag it is a full refund whatever the fee (no money is left without a refund trail)', async () => {
    await setSetting('cancellation_fee', '1000');
    const res = await cancel({ at_tenant_request: undefined });
    expect(res.status).toBe(200);
    expect(res.body.cancellation_fee_kept).toBeUndefined();
    const [row] = await requests();
    expect(Number(row.amount)).toBe(4000);
    expect(row.reason).not.toMatch(/cancellation fee/);
    expect(await originOf(row.id)).toBe('cancelled_by_admin');
  });

  it('an approved application with nothing paid opens no refund', async () => {
    await q("UPDATE invoices SET status = 'pending', amount_paid = 0 WHERE id = ?", [INV]);
    await setSetting('cancellation_fee', '500');
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(res.body.cancellation_fee_kept).toBeUndefined();
    expect(await requests()).toEqual([]);
    expect(await appStatus()).toBe('Cancelled');
  });

  it('another paid invoice on the application is refunded in full; the fee comes off the move-in payment only', async () => {
    await setSetting('cancellation_fee', '500');
    await addOtherPaidInvoice();
    const res = await cancel();
    expect(res.status).toBe(200);
    const rows = await requests();
    expect(rows.map((r) => Number(r.amount))).toEqual([3500, 1000]);
    expect(rows[1].reason).toMatch(/^Application cancelled by management at the tenant's request: /);
    expect(rows[1].reason).not.toMatch(/cancellation fee/);
  });

  it('when the fee uses up the move-in payment, the other paid invoice is still refunded', async () => {
    await setSetting('cancellation_fee', '9000');
    await addOtherPaidInvoice();
    const res = await cancel();
    expect(res.status).toBe(200);
    const rows = await requests();
    expect(rows).toHaveLength(1);
    expect(rows[0].invoice_id).toBe('INV-CXL-OTHER');
    expect(Number(rows[0].amount)).toBe(1000);
  });

  it('a reason is required to cancel an approved application', async () => {
    const res = await cancel({ rejection_reason: '   ' });
    expect(res.status).toBe(422);
    expect(await appStatus()).toBe('Approved');
    expect(await requests()).toEqual([]);
  });

  it('the flag only works for an approved application being cancelled: 422 and nothing changes', async () => {
    const withRejection = await cancel({ status: 'Rejected' });
    expect(withRejection.status).toBe(422);
    expect(withRejection.body.message).toMatch(/only applies when an approved application is cancelled/);
    await q("UPDATE rent_applications SET status = 'Pending Review' WHERE id = ?", [APP]);
    const notApproved = await cancel();
    expect(notApproved.status).toBe(422);
    expect(await requests()).toEqual([]);
  });

  it('a tenant cannot cancel through it (admin only)', async () => {
    const res = await cancel({}, tenant);
    expect([401, 403]).toContain(res.status);
    expect(await appStatus()).toBe('Approved');
    expect(await requests()).toEqual([]);
  });
});

describe('cancellation_fee setting', () => {
  it.each([['-1'], ['abc'], ['100000.01']])('%s is refused', async (value) => {
    const res = await api('update_system_settings.php', { token: admin, json: { cancellation_fee: value } });
    expect(res.status).toBe(422);
  });

  it('a valid amount is saved', async () => {
    const res = await api('update_system_settings.php', { token: admin, json: { cancellation_fee: '250.50' } });
    expect(res.status).toBe(200);
    expect((await one("SELECT setting_value FROM system_settings WHERE setting_key = 'cancellation_fee'")).setting_value).toBe('250.50');
  });
});
