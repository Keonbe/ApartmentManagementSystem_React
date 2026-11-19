// Money and concurrency audit (2026-11-18): one test per fix.
//  1 settle_invoice reports ok for a saved payment      5 a group payment is all months or none (webhook + desk)
//  2 approval cannot take a room another application    6 a proof is refused while a checkout is open
//    holds, or someone else's hold                      7 clearance / termination answer success once saved
//  3 reject / cancel waits for a proof under review     8 clearance refuses when the room is not the tenant's
//  4 a repeated cash part is refused                    9 cancellation fee applies to a part-paid move-in bill
// 10 webhook re-checks the collected amount under the row lock
// Failures after a commit are forced with triggers (dropped in finally).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';
import { addInvoice } from './lib/fixtures.js';
import { sendWebhook, paidEvent } from './lib/paymongo.js';

let admin, maria;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

const setStatus = (id, body) => api('update_tenant_status.php', { token: admin, json: { id, ...body } });
const desk = (invoiceId, amount, extra = {}) => api('record_payment_admin.php', { token: admin, json: { invoiceId, payments: [{ method: 'cash', amount }], ...extra } });
const bill = (id) => one('SELECT status, total_amount, amount_paid FROM invoices WHERE id = ?', [id]);

// Runs `body` with a trigger in place and always drops it.
async function withTrigger(name, table, timing, body, fn) {
  await q(`DROP TRIGGER IF EXISTS ${name}`);
  await q(`CREATE TRIGGER ${name} ${timing} ON ${table} FOR EACH ROW BEGIN ${body} END`);
  try { return await fn(); } finally { await q(`DROP TRIGGER IF EXISTS ${name}`); }
}

// A Pending Review application with every required document, ready to approve.
async function pendingApp({ userId, first, last, room }) {
  const res = await q(
    `INSERT INTO rent_applications (user_id, first_name, last_name, contact_no, email, gender, occupants, months_of_rent, room_name, monthly_rent, status, terms_agreed_at, documents_verified_at, created_at)
     VALUES (?, ?, ?, '+63 9171234500', ?, 'Female', 1, 6, ?, 3500, 'Pending Review', NOW(), NOW(), NOW())`,
    [userId, first, last, `${first.toLowerCase()}.ma@demo.example`, room]);
  await q(`INSERT INTO application_documents (rent_application_id, requirement_id, label_snapshot, file_path)
           SELECT ?, id, label, 'uploads/applications/ma.png' FROM application_requirements WHERE is_active = 1 AND is_required = 1`, [res.insertId]);
  return res.insertId;
}
async function approvedApp({ userId, first, last, room }) {
  const id = await pendingApp({ userId, first, last, room });
  await q("UPDATE rent_applications SET status = 'Approved' WHERE id = ?", [id]);
  return id;
}
const moveInInvoice = (id, appId, { userId, status, total = 1000, paid = 0, deposit = 500 }) => q(
  `INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, security_deposit, billing_period, status, due_date)
   VALUES (?, ?, ?, ?, ?, ?, ?, 'Move-in', ?, CURDATE() + INTERVAL 5 DAY)`, [id, userId, appId, total, total, paid, deposit, status]);

describe('1. a payment saved before a notice fails is still a success', () => {
  it('record_payment_admin answers 200 and the invoice is paid when the tenant notice cannot be written', async () => {
    await addInvoice('INV-MA-1', { status: 'scheduled', amount: 1500 });
    await withTrigger('ma_block_notice', 'notifications', 'BEFORE INSERT',
      "IF NEW.title = 'Payment Received' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'blocked'; END IF;", async () => {
        const res = await desk('INV-MA-1', 1500);
        expect(res.body.success).toBe(true);
        expect((await bill('INV-MA-1')).status).toBe('paid');
        // the trigger really fired: no tenant notice was written
        expect((await one("SELECT COUNT(*) AS c FROM notifications WHERE title = 'Payment Received' AND message LIKE '%INV-MA-1%'")).c).toBe(0);
      });
  });
});

describe('2 + 11. approving a room another application or hold already has', () => {
  it('a second approval for the same room is refused, the first applicant keeps it', async () => {
    const a = await pendingApp({ userId: 15, first: 'Paola', last: 'First', room: 'J' });
    const b = await pendingApp({ userId: 16, first: 'Ramona', last: 'Second', room: 'J' });
    expect((await setStatus(a, { status: 'Approved' })).body.success).toBe(true);
    const res = await setStatus(b, { status: 'Approved' });
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already held by another approved application/);
    expect((await one('SELECT status FROM rent_applications WHERE id = ?', [b])).status).toBe('Pending Review');
    expect((await one("SELECT tenant_name FROM rooms WHERE id = 'J'")).tenant_name).toBe('Paola First');
  });

  it("someone else's hold blocks the approval; the applicant's own hold is converted", async () => {
    const id = await pendingApp({ userId: 17, first: 'Liza', last: 'Holder', room: 'P' });
    await q("UPDATE rooms SET status = 'reserved' WHERE id = 'P'");
    await q("INSERT INTO unit_reservations (room_name, reserved_for_name, hold_expires_at, reservation_fee, status) VALUES ('P', 'Somebody Else', CURDATE() + INTERVAL 5 DAY, 0, 'Active')");
    const blocked = await setStatus(id, { status: 'Approved' });
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.message).toMatch(/on hold for someone else/);
    expect((await one("SELECT status FROM unit_reservations WHERE reserved_for_name = 'Somebody Else'")).status).toBe('Active');

    await q("UPDATE unit_reservations SET reserved_for_name = 'Liza Holder' WHERE reserved_for_name = 'Somebody Else'");
    expect((await setStatus(id, { status: 'Approved' })).body.success).toBe(true);
    expect((await one("SELECT status FROM unit_reservations WHERE reserved_for_name = 'Liza Holder'")).status).toBe('Converted');
  });
});

describe('3. rejecting an approved application with a proof under review', () => {
  it('is refused (409) and the proof invoice is left alone', async () => {
    const id = await approvedApp({ userId: 8, first: 'Gina', last: 'Proof', room: 'N' });
    await moveInInvoice('INV-MA-3', id, { userId: 8, status: 'pending-verification' });
    const res = await setStatus(id, { status: 'Rejected', rejection_reason: 'Incomplete papers' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/INV-MA-3.*payment under verification/);
    expect((await one('SELECT status FROM rent_applications WHERE id = ?', [id])).status).toBe('Approved');
    expect((await bill('INV-MA-3')).status).toBe('pending-verification');
  });
});

describe('4. a repeated cash part is one part', () => {
  it('the same cash amount recorded twice in a row is refused the second time', async () => {
    await addInvoice('INV-MA-4', { status: 'scheduled', amount: 5000 });
    const first = await desk('INV-MA-4', 1000, { partial: true });
    expect(first.body.success).toBe(true);
    await q("UPDATE invoices SET status = 'scheduled' WHERE id = 'INV-MA-4'"); // the next desk visit
    const again = await desk('INV-MA-4', 1000, { partial: true });
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already recorded on this bill/);
    expect(Number((await bill('INV-MA-4')).amount_paid)).toBe(1000);
    // a different amount is a different part
    expect((await desk('INV-MA-4', 700, { partial: true })).body.success).toBe(true);
  });
});

describe('5. a group payment is all months or none', () => {
  const failSecond = (id, fn) => withTrigger(`ma_fail_${id.replace(/\W/g, '_')}`, 'invoices', 'BEFORE UPDATE',
    `IF NEW.id = '${id}' AND NEW.status = 'paid' AND OLD.status <> 'paid' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'blocked'; END IF;`, fn);

  it('the webhook: when the second month fails no month is paid and the whole amount is refunded', async () => {
    await addInvoice('INV-MA-5A', { amount: 1500, sessionId: 'cs_ma5', intentId: 'pi_ma5' });
    await addInvoice('INV-MA-5B', { amount: 1500, sessionId: 'cs_ma5', intentId: 'pi_ma5' });
    await q("UPDATE invoices SET payment_group = 'ADV-MA5' WHERE id IN ('INV-MA-5A', 'INV-MA-5B')");
    await failSecond('INV-MA-5B', async () => {
      const res = await sendWebhook(paidEvent({ sessionId: 'cs_ma5', invoiceId: 'ADV-MA5', amountCentavos: 300000, paymentId: 'pay_ma5' }));
      expect(res.status).toBe(200);
    });
    expect((await bill('INV-MA-5A')).status).not.toBe('paid'); // rolled back with the failing month
    expect(Number((await bill('INV-MA-5A')).amount_paid)).toBe(0);
    expect((await bill('INV-MA-5B')).status).not.toBe('paid');
    expect(await q("SELECT id FROM payment_transactions WHERE invoice_id IN ('INV-MA-5A', 'INV-MA-5B')")).toHaveLength(0);
    const refunds = await q("SELECT amount FROM refund_requests WHERE type = 'online_payment' AND paymongo_payment_id = 'pay_ma5'");
    expect(refunds).toHaveLength(1);
    expect(Number(refunds[0].amount)).toBe(3000);
  });

  it('the desk: the same failure answers 409 and leaves every month open', async () => {
    await addInvoice('INV-MA-5DA', { status: 'scheduled', amount: 1500 });
    await addInvoice('INV-MA-5DB', { status: 'scheduled', amount: 1500 });
    await q("UPDATE invoices SET payment_group = 'ADV-MA5D' WHERE id IN ('INV-MA-5DA', 'INV-MA-5DB')");
    await failSecond('INV-MA-5DB', async () => {
      const res = await desk('ADV-MA5D', 3000);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Nothing was settled/);
    });
    for (const id of ['INV-MA-5DA', 'INV-MA-5DB']) expect((await bill(id)).status).toBe('scheduled');
    // without the failure the same payment settles both months
    const ok = await desk('ADV-MA5D', 3000);
    expect(ok.body.success).toBe(true);
    for (const id of ['INV-MA-5DA', 'INV-MA-5DB']) expect((await bill(id)).status).toBe('paid');
  });
});

describe('6. a proof while an online checkout is open', () => {
  it('is refused with 409 and the bill stays processing', async () => {
    await addInvoice('INV-MA-6', { amount: 1500, sessionId: 'cs_ma6', intentId: 'pi_ma6' });
    const form = new FormData();
    form.append('invoice_id', 'INV-MA-6');
    form.append('payment_method', 'GCash');
    form.append('payment_reference', '9876543210123');
    form.append('sender_name', 'Test Sender');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    form.append('proof', new Blob([png], { type: 'image/png' }), 'proof.png');
    const res = await api('upload_payment_proof.php', { token: maria, form });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/online checkout is in progress/);
    const inv = await one('SELECT status, checkout_session_id FROM invoices WHERE id = ?', ['INV-MA-6']);
    expect(inv).toMatchObject({ status: 'processing', checkout_session_id: 'cs_ma6' });
  });
});

describe('7. move-out and termination that are saved answer success', () => {
  const CLEAR_APP = 11; // user 13, pending-move-out in the seed
  const TERM_APP = 3;   // user 5, active contract
  const refundLogs = async () => (await one("SELECT COUNT(*) AS c FROM activity_logs WHERE action = 'Refund Requested'")).c;
  const blockLog = (fn) => withTrigger('ma_block_log', 'activity_logs', 'BEFORE INSERT',
    "IF NEW.action = 'Refund Requested' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'blocked'; END IF;", fn);

  beforeAll(async () => {
    await q("UPDATE lease_contracts SET status = 'active', deposit_status = 'Held', lease_end = CURDATE() + INTERVAL 30 DAY WHERE rent_application_id IN (?, ?)", [CLEAR_APP, TERM_APP]);
  });

  // 8 first: it must leave the application as it was for the clearance below.
  it('8. clearance is refused when the unit is not under the tenant\'s name, and nothing is written', async () => {
    const tenant = (await one("SELECT tenant_name FROM rooms WHERE id = 'L'")).tenant_name;
    await q("UPDATE rooms SET tenant_name = 'Someone Else' WHERE id = 'L'");
    try {
      const res = await setStatus(CLEAR_APP, { status: 'moved-out', deductions: [] });
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/recorded under another name/);
      expect((await one('SELECT status FROM rent_applications WHERE id = ?', [CLEAR_APP])).status).toBe('pending-move-out');
      expect((await one("SELECT status FROM rooms WHERE id = 'L'")).status).toBe('occupied');
      expect((await one('SELECT deposit_status FROM lease_contracts WHERE rent_application_id = ?', [CLEAR_APP])).deposit_status).toBe('Held');
    } finally {
      await q("UPDATE rooms SET tenant_name = ? WHERE id = 'L'", [tenant]);
    }
  });

  it('clearance answers success when the refund log line cannot be written after the commit', async () => {
    await blockLog(async () => {
      const res = await setStatus(CLEAR_APP, { status: 'moved-out', deductions: [] });
      expect(res.body.success).toBe(true);
      expect((await one('SELECT status FROM rent_applications WHERE id = ?', [CLEAR_APP])).status).toBe('moved-out');
      expect(await one('SELECT id FROM refund_requests WHERE rent_application_id = ? AND type = ?', [CLEAR_APP, 'deposit'])).not.toBeNull();
      expect(await refundLogs()).toBe(0); // the trigger fired
    });
  });

  it('termination answers success when the refund log line cannot be written after the commit', async () => {
    const cid = (await one('SELECT id FROM lease_contracts WHERE rent_application_id = ?', [TERM_APP])).id;
    await blockLog(async () => {
      const res = await api('update_contract_status.php', { token: admin, json: { contractId: cid, action: 'terminate', reason: 'Mutual agreement', ground: 'mutual' } });
      expect(res.body.success).toBe(true);
      expect((await one('SELECT status FROM lease_contracts WHERE id = ?', [cid])).status).toBe('terminated');
      expect(await refundLogs()).toBe(0);
    });
  });
});

describe('9. cancellation fee on a part-paid move-in bill', () => {
  it('keeps the fee out of the refund (the bill is no longer cancelled before the refund is worked out)', async () => {
    await setSetting('cancellation_fee', '100');
    const id = await approvedApp({ userId: 8, first: 'Gina', last: 'Fee', room: 'N' });
    await moveInInvoice('INV-MA-9', id, { userId: 8, status: 'pending', total: 1000, paid: 400, deposit: 500 });
    const res = await setStatus(id, { status: 'Cancelled', rejection_reason: 'Tenant asked', at_tenant_request: true });
    expect(res.body.success).toBe(true);
    const refunds = await q('SELECT amount, paid_amount FROM refund_requests WHERE invoice_id = ?', ['INV-MA-9']);
    expect(refunds).toHaveLength(1);
    expect(Number(refunds[0].paid_amount)).toBe(400);
    expect(Number(refunds[0].amount)).toBe(300);
    expect((await bill('INV-MA-9')).status).toBe('cancelled');
  });
});

describe('10. the webhook re-checks the amount under the row lock', () => {
  it('a bill that grew after the amount check is not marked paid for less than it now costs', async () => {
    await addInvoice('INV-MA-10', { amount: 1500, sessionId: 'cs_ma10', intentId: 'pi_ma10' });
    await withTrigger('ma_grow_10', 'invoices', 'BEFORE UPDATE',
      "IF NEW.id = 'INV-MA-10' AND OLD.paymongo_payment_id IS NULL AND NEW.paymongo_payment_id IS NOT NULL THEN SET NEW.total_amount = NEW.total_amount + 50; END IF;", async () => {
        const res = await sendWebhook(paidEvent({ sessionId: 'cs_ma10', invoiceId: 'INV-MA-10', amountCentavos: 150000, paymentId: 'pay_ma10' }));
        expect(res.status).toBe(200);
      });
    const inv = await bill('INV-MA-10');
    expect(Number(inv.total_amount)).toBe(1550); // the trigger fired
    expect(inv.status).not.toBe('paid');
    const refunds = await q("SELECT amount FROM refund_requests WHERE type = 'online_payment' AND paymongo_payment_id = 'pay_ma10'");
    expect(refunds).toHaveLength(1);
    expect(Number(refunds[0].amount)).toBe(1500);
  });
});
