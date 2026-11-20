// reconcile_gateway_payments.php and reconcile_gateway_payments() (SPRINT 183, panel
// audit F-08): a bill is 'processing' while the tenant is at the PayMongo checkout. If
// the "paid" webhook is lost, AMS asks PayMongo about the session and settles a paid
// one by the webhook's own rules. The test server never reaches the network: the
// session id decides the answer ("paid_<centavos>" is paid for that amount, "gcash" /
// "maya" pick the channel, "expired", "fail" is a failed lookup, anything else unpaid).
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { sendWebhook, paidEvent } from './lib/paymongo.js';
import { addInvoice } from './lib/fixtures.js';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria;
const MARIA = 2;
const check = (invoice_id, token = admin) => api('reconcile_gateway_payments.php', { token, json: invoice_id === undefined ? {} : { invoice_id } });
const bill = (id) => one('SELECT status, amount_paid, payment_method, paymongo_payment_id, checkout_session_id, processing_since FROM invoices WHERE id = ?', [id]);
const stubPaymentId = (session) => 'pay_test_' + createHash('md5').update(session).digest('hex').slice(0, 12);
// A notice about one bill names it in its message or in its metadata (invoice:<id>).
const notice = (title, invoice) => one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND title = ? AND (message LIKE ? OR metadata_value LIKE ?)", [MARIA, title, `%${invoice}%`, `%${invoice}%`]);
// promote_overdue_invoices() runs from get_invoices.php at most once a minute.
const runOverdueSweep = async () => {
  await q("DELETE FROM system_settings WHERE setting_key = 'billing_checks_last_run'");
  return api('get_invoices.php', { token: admin });
};

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

describe('who may ask, and what', () => {
  it('is admin only and needs a valid invoice id', async () => {
    expect((await api('reconcile_gateway_payments.php', { json: {} })).status).toBe(401);
    expect((await check(undefined, maria)).status).toBe(403);
    expect((await check('x'.repeat(51))).status).toBe(422);
    expect((await check('INV-NOT-THERE')).status).toBe(409);
  });

  it('a bill that is not waiting on a checkout is refused (409) and nothing changes', async () => {
    await addInvoice('INV-REC-OPEN', { status: 'pending', amount: 900 });
    expect((await check('INV-REC-OPEN')).status).toBe(409);
    expect((await bill('INV-REC-OPEN')).status).toBe('pending');
  });
});

describe('one bill (the "Check with PayMongo" button)', () => {
  it('paid at PayMongo: recorded as the webhook would, once', async () => {
    const session = 'cs_rec_paid_150000_gcash';
    await addInvoice('INV-REC-PAID', { amount: 1500, sessionId: session, intentId: 'pi_rec_paid' });
    const res = await check('INV-REC-PAID');
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ checked: 1, settled: 1 });
    expect(await bill('INV-REC-PAID')).toMatchObject({ status: 'paid', payment_method: 'GCash (Sandbox)', paymongo_payment_id: stubPaymentId(session) });
    expect(Number((await bill('INV-REC-PAID')).amount_paid)).toBe(1500);
    expect((await notice('Payment Received', 'INV-REC-PAID')).n).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Online Payment Reconciled' AND details LIKE '%INV-REC-PAID%'")).n).toBe(1);

    // A second check changes nothing (the bill no longer waits on a checkout).
    expect((await check('INV-REC-PAID')).status).toBe(409);
    expect((await notice('Payment Received', 'INV-REC-PAID')).n).toBe(1);

    // The webhook that was "lost" turns up late: already recorded, no refund raised.
    const late = await sendWebhook(paidEvent({ sessionId: session, invoiceId: 'INV-REC-PAID', amountCentavos: 150000, paymentId: stubPaymentId(session), sourceType: 'gcash' }));
    expect(late.status).toBe(200);
    expect((await one("SELECT COUNT(*) AS n FROM refund_requests WHERE paymongo_payment_id = ?", [stubPaymentId(session)])).n).toBe(0);
    expect((await bill('INV-REC-PAID')).status).toBe('paid');
  });

  it('paid for a different amount than the bill: held for the admin, not marked paid', async () => {
    await addInvoice('INV-REC-AMT', { amount: 1500, sessionId: 'cs_rec_paid_120000', intentId: 'pi_rec_amt' });
    const res = await check('INV-REC-AMT');
    expect(res.body.result).toMatchObject({ checked: 1, settled: 0, needs_review: 1 });
    expect((await bill('INV-REC-AMT')).status).toBe('pending-verification');
    expect((await bill('INV-REC-AMT')).paymongo_payment_id).toBe(stubPaymentId('cs_rec_paid_120000'));
  });

  it('an expired checkout is released, and the tenant is told', async () => {
    await addInvoice('INV-REC-EXP', { amount: 1500, sessionId: 'cs_rec_expired', intentId: 'pi_rec_exp' });
    const res = await check('INV-REC-EXP');
    expect(res.body.result).toMatchObject({ checked: 1, expired: 1 });
    expect(await bill('INV-REC-EXP')).toMatchObject({ status: 'pending', checkout_session_id: null, processing_since: null });
    expect((await notice('Online Checkout Expired', 'INV-REC-EXP')).n).toBe(1);
  });

  it('a checkout still unpaid is left alone, and a failed lookup changes nothing', async () => {
    await addInvoice('INV-REC-WAIT', { amount: 1500, sessionId: 'cs_rec_still_open', intentId: 'pi_rec_wait' });
    const unpaid = await check('INV-REC-WAIT');
    expect(unpaid.body.result).toMatchObject({ checked: 1, unpaid: 1, settled: 0 });
    expect((await bill('INV-REC-WAIT')).status).toBe('processing');

    await addInvoice('INV-REC-ERR', { amount: 1500, sessionId: 'cs_rec_fail', intentId: 'pi_rec_err' });
    const failed = await check('INV-REC-ERR');
    expect(failed.body.result).toMatchObject({ checked: 1, errors: 1, settled: 0 });
    expect((await bill('INV-REC-ERR')).status).toBe('processing');
  });
});

describe('all waiting checkouts, and the sweeps that would clear them', () => {
  it('without an invoice id: checkouts opened a moment ago are left alone, older ones are checked', async () => {
    await addInvoice('INV-REC-NEW', { amount: 1500, sessionId: 'cs_rec_paid_150000_new', intentId: 'pi_rec_new' });
    await addInvoice('INV-REC-OLD', { amount: 1500, sessionId: 'cs_rec_paid_150000_old', intentId: 'pi_rec_old' });
    await q("UPDATE invoices SET processing_since = NOW() - INTERVAL 1 HOUR WHERE id = 'INV-REC-OLD'");
    const res = await check();
    expect(res.status).toBe(200);
    expect(res.body.result.details.map((d) => d.invoice)).toContain('INV-REC-OLD');
    expect(res.body.result.details.map((d) => d.invoice)).not.toContain('INV-REC-NEW');
    expect((await bill('INV-REC-OLD')).status).toBe('paid');
    expect((await bill('INV-REC-NEW')).status).toBe('processing');
  });

  it('the overdue sweep asks first: a paid checkout past its due date is recorded, not reopened as overdue', async () => {
    await addInvoice('INV-REC-SWEEP', { amount: 1500, sessionId: 'cs_rec_paid_150000_sweep', intentId: 'pi_rec_sweep' });
    await q("UPDATE invoices SET due_date = CURDATE() - INTERVAL 1 DAY WHERE id = 'INV-REC-SWEEP'");
    // Any admin call that runs promote_overdue_invoices() does it.
    expect((await runOverdueSweep()).status).toBe(200);
    expect(await bill('INV-REC-SWEEP')).toMatchObject({ status: 'paid', payment_method: 'Card (Sandbox)' });
  });

  it('the overdue sweep still clears a checkout that PayMongo says is unpaid', async () => {
    await addInvoice('INV-REC-SWEEP2', { amount: 1500, sessionId: 'cs_rec_open_sweep', intentId: 'pi_rec_sweep2' });
    await q("UPDATE invoices SET due_date = CURDATE() - INTERVAL 1 DAY WHERE id = 'INV-REC-SWEEP2'");
    await runOverdueSweep();
    expect(await bill('INV-REC-SWEEP2')).toMatchObject({ status: 'overdue', checkout_session_id: null });
  });
});
