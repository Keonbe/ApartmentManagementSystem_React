// Online payment status flow: an invoice in checkout (processing) settled by
// a signed checkout_session.payment.paid event. create_checkout_session.php
// calls PayMongo, so the fixture puts the invoice in processing directly.
import { describe, it, expect, beforeAll } from 'vitest';
import { sendWebhook, paidEvent, failedEvent } from './lib/paymongo.js';
import { addInvoice, invoice, notificationCount } from './lib/fixtures.js';
import { one } from './lib/db.js';

// Gateway payments are recorded on the invoice itself (status, paid_at,
// payment_method) plus an "Online Payment Received" activity entry;
// payment_transactions rows are only written for itemised desk payments.
const paidLogs = async (id) => (await one("SELECT COUNT(*) AS c FROM activity_logs WHERE action = 'Online Payment Received' AND details LIKE ?", [`%${id}%`])).c;

describe('paid event settles the invoice', () => {
  beforeAll(() => addInvoice('INV-TEST-PAY', { amount: 1500, sessionId: 'cs_test_pay', intentId: 'pi_test_pay' }));

  it('an event from another checkout session → superseded, still processing', async () => {
    const res = await sendWebhook(paidEvent({ sessionId: 'cs_stale', invoiceId: 'INV-TEST-PAY', amountCentavos: 150000 }));
    expect(res.body.message).toMatch(/superseded/);
    expect((await invoice('INV-TEST-PAY')).status).toBe('processing');
    expect(await paidLogs('INV-TEST-PAY')).toBe(0);
  });

  it('the matching session and amount → paid and recorded once', async () => {
    const res = await sendWebhook(paidEvent({ sessionId: 'cs_test_pay', invoiceId: 'INV-TEST-PAY', amountCentavos: 150000 }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const inv = await invoice('INV-TEST-PAY');
    expect(inv.status).toBe('paid');
    expect(inv.paid_at).not.toBeNull();
    expect(inv.payment_method).toBe('GCash (Sandbox)');
    expect(await paidLogs('INV-TEST-PAY')).toBe(1);
  });

  it('a replay of the paid event → "Already recorded", no second payment', async () => {
    const before = await invoice('INV-TEST-PAY');
    const res = await sendWebhook(paidEvent({ sessionId: 'cs_test_pay', invoiceId: 'INV-TEST-PAY', amountCentavos: 150000 }));
    expect(res.body.message).toBe('Already recorded');
    expect(await invoice('INV-TEST-PAY')).toEqual(before);
    expect(await paidLogs('INV-TEST-PAY')).toBe(1);
  });

  it('KB-D05 a failed event after payment changes nothing', async () => {
    const before = await notificationCount(2, 'Payment Failed', 'INV-TEST-PAY');
    await sendWebhook(failedEvent({ intentId: 'pi_test_pay', metadata: { invoice_id: 'INV-TEST-PAY' } }));
    expect((await invoice('INV-TEST-PAY')).status).toBe('paid');
    expect(await notificationCount(2, 'Payment Failed', 'INV-TEST-PAY')).toBe(before);
  });
});

describe('amount mismatch', () => {
  it('collected amount differs from the invoice → pending-verification, not paid', async () => {
    await addInvoice('INV-TEST-MISMATCH', { amount: 1500, sessionId: 'cs_mismatch' });
    const res = await sendWebhook(paidEvent({ sessionId: 'cs_mismatch', invoiceId: 'INV-TEST-MISMATCH', amountCentavos: 100000 }));
    expect(res.body.message).toMatch(/Amount mismatch/);
    expect((await invoice('INV-TEST-MISMATCH')).status).toBe('pending-verification');
    expect(await paidLogs('INV-TEST-MISMATCH')).toBe(0);
  });
});
