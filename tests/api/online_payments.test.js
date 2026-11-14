// Online (PayMongo) payments end to end on the AMS side, and refunds through
// PayMongo. Events are signed locally and the refund call is stubbed in
// AMS_TEST_MODE (a payment id containing "fail" is declined), so nothing here
// reaches the network.
import { describe, it, expect, beforeAll } from 'vitest';
import { sendWebhook, paidEvent, refundEvent } from './lib/paymongo.js';
import { addInvoice } from './lib/fixtures.js';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin;
beforeAll(async () => { admin = await loginAs('admin'); });

const row = (id) => one('SELECT status, amount_paid, total_amount, payment_method, paymongo_payment_id FROM invoices WHERE id = ?', [id]);
const unapplied = (paymentId) => q("SELECT * FROM refund_requests WHERE type = 'online_payment' AND paymongo_payment_id = ?", [paymentId]);

describe('a paid event settles the bill and keeps the payment id', () => {
  it('M3-60 rent invoice → paid, balance collected, payment id stored', async () => {
    await addInvoice('INV-OP-RENT', { amount: 1500, sessionId: 'cs_op_rent', intentId: 'pi_op_rent' });
    const res = await sendWebhook(paidEvent({ sessionId: 'cs_op_rent', invoiceId: 'INV-OP-RENT', amountCentavos: 150000, paymentId: 'pay_op_rent', sourceType: 'card' }));
    expect(res.status).toBe(200);
    const inv = await row('INV-OP-RENT');
    expect(inv.status).toBe('paid');
    expect(Number(inv.amount_paid)).toBe(1500);
    expect(inv.payment_method).toBe('Card (Sandbox)');
    expect(inv.paymongo_payment_id).toBe('pay_op_rent');
  });

  it('M3-61 a part-paid bill is settled for the balance only', async () => {
    await addInvoice('INV-OP-PART', { amount: 1500, sessionId: 'cs_op_part', intentId: 'pi_op_part' });
    await q("UPDATE invoices SET amount_paid = 500 WHERE id = 'INV-OP-PART'");
    await q("INSERT INTO payment_transactions (invoice_id, amount, payment_method) VALUES ('INV-OP-PART', 500, 'cash')");
    const wrong = await sendWebhook(paidEvent({ sessionId: 'cs_op_part', invoiceId: 'INV-OP-PART', amountCentavos: 150000, paymentId: 'pay_op_part_full' }));
    expect(wrong.body.message).toMatch(/Amount mismatch/);
    await q("UPDATE invoices SET status = 'processing' WHERE id = 'INV-OP-PART'");
    const ok = await sendWebhook(paidEvent({ sessionId: 'cs_op_part', invoiceId: 'INV-OP-PART', amountCentavos: 100000, paymentId: 'pay_op_part' }));
    expect(ok.status).toBe(200);
    const inv = await row('INV-OP-PART');
    expect(inv.status).toBe('paid');
    expect(Number(inv.amount_paid)).toBe(1500);
  });

  it('M3-62 a grouped payment settles every month and stores the id on each', async () => {
    await addInvoice('INV-OP-G1', { amount: 1000, sessionId: 'cs_op_grp', intentId: 'pi_op_grp' });
    await addInvoice('INV-OP-G2', { amount: 1000, sessionId: 'cs_op_grp', intentId: 'pi_op_grp' });
    await q("UPDATE invoices SET payment_group = 'ADV-OPTEST' WHERE id IN ('INV-OP-G1','INV-OP-G2')");
    const res = await sendWebhook(paidEvent({ sessionId: 'cs_op_grp', invoiceId: 'ADV-OPTEST', amountCentavos: 200000, paymentId: 'pay_op_grp' }));
    expect(res.status).toBe(200);
    for (const id of ['INV-OP-G1', 'INV-OP-G2']) {
      const inv = await row(id);
      expect(inv.status).toBe('paid');
      expect(inv.paymongo_payment_id).toBe('pay_op_grp');
    }
  });
});

describe('a collected payment AMS cannot apply becomes a refund request', () => {
  it('M3-63 the bill was cancelled at the checkout → one online_payment request, once', async () => {
    await addInvoice('INV-OP-CXL', { amount: 1500, sessionId: 'cs_op_cxl' });
    await q("UPDATE invoices SET status = 'cancelled' WHERE id = 'INV-OP-CXL'");
    const evt = paidEvent({ sessionId: 'cs_op_cxl', invoiceId: 'INV-OP-CXL', amountCentavos: 150000, paymentId: 'pay_op_cxl' });
    await sendWebhook(evt);
    await sendWebhook(evt); // PayMongo retry
    const rows = await unapplied('pay_op_cxl');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(1500);
    expect(rows[0].status).toBe('Pending Review');
    expect((await row('INV-OP-CXL')).status).toBe('cancelled');
  });

  it('M3-64 an older checkout paid after a new one opened → refund request, bill untouched', async () => {
    await addInvoice('INV-OP-OLD', { amount: 1500, sessionId: 'cs_op_new', intentId: 'pi_op_new' });
    const res = await sendWebhook(paidEvent({ sessionId: 'cs_op_old', invoiceId: 'INV-OP-OLD', amountCentavos: 150000, paymentId: 'pay_op_old' }));
    expect(res.body.message).toMatch(/superseded/);
    expect(await unapplied('pay_op_old')).toHaveLength(1);
    expect((await row('INV-OP-OLD')).status).toBe('processing');
  });

  it('M3-65 a second, different payment on a paid bill → refund request; a retry of the first is not', async () => {
    await addInvoice('INV-OP-TWICE', { amount: 1500, sessionId: 'cs_op_twice', intentId: 'pi_op_twice' });
    const first = paidEvent({ sessionId: 'cs_op_twice', invoiceId: 'INV-OP-TWICE', amountCentavos: 150000, paymentId: 'pay_op_first' });
    await sendWebhook(first);
    await sendWebhook(first);
    expect(await unapplied('pay_op_first')).toHaveLength(0);
    await sendWebhook(paidEvent({ sessionId: 'cs_op_twice', invoiceId: 'INV-OP-TWICE', amountCentavos: 150000, paymentId: 'pay_op_second' }));
    expect(await unapplied('pay_op_second')).toHaveLength(1);
    expect((await row('INV-OP-TWICE')).paymongo_payment_id).toBe('pay_op_first');
  });

  it('M3-74 a late online payment on a bill paid at the desk → one refund request, bill untouched', async () => {
    await addInvoice('INV-OP-LATE', { amount: 1500, status: 'paid', sessionId: 'cs_op_late', intentId: 'pi_op_late' });
    await q("UPDATE invoices SET payment_method = 'cash', paid_at = NOW() WHERE id = 'INV-OP-LATE'");
    const late = paidEvent({ sessionId: 'cs_op_late', invoiceId: 'INV-OP-LATE', amountCentavos: 150000, paymentId: 'pay_op_late' });
    expect((await sendWebhook(late)).body).toMatchObject({ message: 'Already recorded' });
    await sendWebhook(late); // PayMongo retries: still one request
    const rows = await unapplied('pay_op_late');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(1500);
    const inv = await row('INV-OP-LATE');
    expect(inv.status).toBe('paid');
    expect(inv.payment_method).toBe('cash');
    expect(inv.paymongo_payment_id).toBeNull();
  });

  it('M3-66 an event for an invoice AMS never had is ignored', async () => {
    await sendWebhook(paidEvent({ sessionId: 'cs_x', invoiceId: 'INV-NOPE', amountCentavos: 150000, paymentId: 'pay_op_nope' }));
    expect(await unapplied('pay_op_nope')).toHaveLength(0);
  });
});

// An Approved refund request taken from an online or a desk payment.
async function approvedRefund({ invoiceId, paymentId = null, type = 'rejected_charge', amount = 500, ownPayment = null }) {
  if (invoiceId && paymentId) await q('UPDATE invoices SET paymongo_payment_id = ? WHERE id = ?', [paymentId, invoiceId]);
  const r = await q(
    "INSERT INTO refund_requests (user_id, type, invoice_id, amount, reason, status, paymongo_payment_id, raised_by_role) VALUES (2, ?, ?, ?, 'test', 'Approved', ?, 'admin')",
    [type, invoiceId, amount, ownPayment],
  );
  return r.insertId;
}
const payout = (id, extra = {}) => api('update_refund_request.php', { token: admin, json: { id, action: 'mark_refunded', ...extra } });
const request = (id) => one('SELECT status, payout_method, payout_reference, gateway_refund_id, gateway_status FROM refund_requests WHERE id = ?', [id]);

describe('refund payout through PayMongo', () => {
  it('M3-67 pays back via PayMongo, records the refund id, and refuses a second payout', async () => {
    await addInvoice('INV-OP-R1', { amount: 1500, status: 'paid' });
    const id = await approvedRefund({ invoiceId: 'INV-OP-R1', paymentId: 'pay_r1' });
    const res = await payout(id, { gateway: true });
    expect(res.status).toBe(200);
    const r = await request(id);
    expect(r.status).toBe('Refunded');
    expect(r.payout_method).toBe('PayMongo');
    expect(r.gateway_refund_id).toMatch(/^re_test_/);
    expect(r.payout_reference).toBe(r.gateway_refund_id);
    expect(r.gateway_status).toBe('pending');
    expect((await payout(id, { gateway: true })).status).toBe(409);
  });

  it('M3-68 a payment that was not made online cannot be refunded through PayMongo', async () => {
    await addInvoice('INV-OP-DESK', { amount: 1500, status: 'paid' });
    const id = await approvedRefund({ invoiceId: 'INV-OP-DESK' });
    expect((await payout(id, { gateway: true })).status).toBe(422);
    expect((await request(id)).status).toBe('Approved');
    expect((await payout(id, { payout_method: 'Cash', payout_reference: 'OR-1' })).status).toBe(200);
    expect((await request(id)).gateway_refund_id).toBeNull();
  });

  it('M3-69 PayMongo declines → stays Approved, nothing recorded, can be retried', async () => {
    await addInvoice('INV-OP-R2', { amount: 1500, status: 'paid' });
    const id = await approvedRefund({ invoiceId: 'INV-OP-R2', paymentId: 'pay_fail_r2' });
    const res = await payout(id, { gateway: true });
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/declined/);
    const r = await request(id);
    expect(r.status).toBe('Approved');
    expect(r.gateway_status).toBeNull();
  });

  it('M3-70 a refund below ₱1 is refused before PayMongo is called', async () => {
    await addInvoice('INV-OP-R3', { amount: 1500, status: 'paid' });
    const id = await approvedRefund({ invoiceId: 'INV-OP-R3', paymentId: 'pay_r3', amount: 0.5 });
    expect((await payout(id, { gateway: true })).status).toBe(422);
  });

  it('M3-71 an unapplied online payment is refunded from its own payment id', async () => {
    const id = await approvedRefund({ invoiceId: null, type: 'online_payment', ownPayment: 'pay_own_1', amount: 1500 });
    expect((await payout(id, { gateway: true })).status).toBe(200);
    expect((await request(id)).payout_method).toBe('PayMongo');
  });

  it('M3-72 the admin list says which requests can be refunded online', async () => {
    const list = await api('get_refund_requests.php', { token: admin });
    const rows = list.body.requests ?? list.body.data ?? list.body;
    expect(rows.find((r) => r.invoiceId === 'INV-OP-DESK').canRefundOnline).toBe(false);
    expect(rows.find((r) => r.invoiceId === 'INV-OP-R2').canRefundOnline).toBe(true);
  });

  it('M3-73 refund events update the gateway status; a failed one alerts the admin', async () => {
    await addInvoice('INV-OP-R4', { amount: 1500, status: 'paid' });
    const id = await approvedRefund({ invoiceId: 'INV-OP-R4', paymentId: 'pay_r4' });
    await payout(id, { gateway: true });
    const refundId = (await request(id)).gateway_refund_id;
    await sendWebhook(refundEvent({ refundId, status: 'succeeded' }));
    expect((await request(id)).gateway_status).toBe('succeeded');
    await sendWebhook(refundEvent({ refundId, status: 'succeeded' })); // retry: no change
    await sendWebhook(refundEvent({ refundId, status: 'failed' }));
    expect((await request(id)).gateway_status).toBe('failed');
    const alert = await one("SELECT COUNT(*) AS c FROM notifications WHERE title = 'Refund Failed at PayMongo' AND message LIKE ?", [`%${refundId}%`]);
    expect(alert.c).toBe(1);
  });
});
