// paymongo_webhook.php: signature checks and payment.failed matched by the
// checkout's payment intent (audit N-10a). Events are signed locally with the
// test server's PAYMONGO_WEBHOOK_SECRET; real PayMongo payload field names
// still need a sandbox event to confirm.
import { describe, it, expect, beforeAll } from 'vitest';
import { sendWebhook, signature, failedEvent } from './lib/paymongo.js';
import { addInvoice, invoice, notificationCount } from './lib/fixtures.js';

const OPEN = { status: 'processing', checkout_session_id: 'cs_test_abc', checkout_payment_intent_id: 'pi_test_good' };

describe('signature (KB-E01, KB-E02, KB-C06)', () => {
  const body = JSON.stringify(failedEvent({ intentId: 'pi_sig' }));
  beforeAll(() => addInvoice('INV-TEST-SIG', { sessionId: 'cs_sig', intentId: 'pi_sig' }));

  it('no signature header → 400, no write', async () => {
    const res = await sendWebhook(body, { header: null });
    expect(res.status).toBe(400);
    expect((await invoice('INV-TEST-SIG')).status).toBe('processing');
  });

  it('wrong secret → 401, no write', async () => {
    const res = await sendWebhook(body, { secret: 'whsk_wrong' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Signature verification failed');
    expect((await invoice('INV-TEST-SIG')).status).toBe('processing');
  });

  it('signature over a different payload → 401', async () => {
    const res = await sendWebhook(body, { header: signature(body.replace('pi_sig', 'pi_other')) });
    expect(res.status).toBe(401);
  });

  it('malformed header → 401', async () => {
    const res = await sendWebhook(body, { header: 'garbage' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid signature format');
  });

  it('timestamp 301 s old → 401 (replay window)', async () => {
    const res = await sendWebhook(body, { timestamp: Math.floor(Date.now() / 1000) - 301 });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/outside the accepted window/);
    expect((await invoice('INV-TEST-SIG')).status).toBe('processing');
  });

  it('timestamp 299 s old is accepted', async () => {
    const res = await sendWebhook(body, { timestamp: Math.floor(Date.now() / 1000) - 299 });
    expect(res.status).toBe(200);
    expect((await invoice('INV-TEST-SIG')).status).toBe('payment-failed');
  });

  it('KB-B26 broken JSON, correctly signed → 400 Invalid JSON', async () => {
    const res = await sendWebhook('{"data":');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid JSON');
  });
});

describe('payment.failed is matched by payment intent', () => {
  beforeAll(() => addInvoice('INV-TEST-1', { sessionId: 'cs_test_abc', intentId: 'pi_test_good' }));

  it('KB-B11 a different intent → superseded, no write', async () => {
    const res = await sendWebhook(failedEvent({ intentId: 'pi_test_other' }));
    expect(res.status).toBe(200);
    // No metadata and an unknown intent: no invoice is found at all.
    expect(await invoice('INV-TEST-1')).toMatchObject(OPEN);
  });

  it('KB-B12 a different intent with metadata naming the invoice → superseded', async () => {
    const res = await sendWebhook(failedEvent({ intentId: 'pi_test_other', metadata: { invoice_id: 'INV-TEST-1' } }));
    expect(res.body.message).toMatch(/superseded/);
    expect(await invoice('INV-TEST-1')).toMatchObject(OPEN);
  });

  it('KB-B28 no intent id while one is stored → superseded', async () => {
    const res = await sendWebhook(failedEvent({ metadata: { invoice_id: 'INV-TEST-1' } }));
    expect(res.body.message).toMatch(/superseded/);
    expect(await invoice('INV-TEST-1')).toMatchObject(OPEN);
  });

  it('KB-B14 an unknown invoice in metadata → ignored', async () => {
    const res = await sendWebhook(failedEvent({ intentId: 'pi_nope', metadata: { invoice_id: 'INV-NOPE' } }));
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Unknown invoice; ignored');
  });

  it('KB-A01 the stored intent fails the invoice, releases the checkout and tells the tenant', async () => {
    expect(await notificationCount(2, 'Payment Failed', 'INV-TEST-1')).toBe(0);
    const res = await sendWebhook(failedEvent({ intentId: 'pi_test_good' }));
    expect(res.status).toBe(200);
    expect(await invoice('INV-TEST-1')).toMatchObject({
      status: 'payment-failed', checkout_session_id: null, checkout_payment_intent_id: null, processing_since: null,
    });
    expect(await notificationCount(2, 'Payment Failed', 'INV-TEST-1')).toBe(1);
  });

  it('KB-D04 the same event again changes nothing and does not notify twice', async () => {
    await sendWebhook(failedEvent({ intentId: 'pi_test_good', metadata: { invoice_id: 'INV-TEST-1' } }));
    expect((await invoice('INV-TEST-1')).status).toBe('payment-failed');
    expect(await notificationCount(2, 'Payment Failed', 'INV-TEST-1')).toBe(1);
  });
});

describe('payment.failed edge cases', () => {
  it('KB-B13 a failed event for a paid invoice leaves it paid', async () => {
    await addInvoice('INV-TEST-PAID', { status: 'paid', sessionId: 'cs_paid', intentId: 'pi_paid' });
    const res = await sendWebhook(failedEvent({ intentId: 'pi_paid' }));
    expect(res.status).toBe(200);
    expect((await invoice('INV-TEST-PAID')).status).toBe('paid');
  });

  it('KB-B15 an invoice opened before intents were stored matches on metadata', async () => {
    await addInvoice('INV-TEST-OLD', { sessionId: 'cs_old', intentId: null });
    const res = await sendWebhook(failedEvent({ intentId: 'pi_whatever', metadata: { invoice_id: 'INV-TEST-OLD' } }));
    expect(res.status).toBe(200);
    expect((await invoice('INV-TEST-OLD')).status).toBe('payment-failed');
  });
});
