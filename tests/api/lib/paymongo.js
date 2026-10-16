// Builds PayMongo webhook requests signed the way paymongo_webhook.php checks
// them: HMAC-SHA256 over "<timestamp>.<raw payload>", header
// "Paymongo-Signature: t=<ts>,te=<test sig>,li=".
import crypto from 'node:crypto';
import { api } from './api.js';
import { WEBHOOK_SECRET } from './env.js';

export function signature(payload, { secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},te=${sig},li=`;
}

export function sendWebhook(event, opts = {}) {
  const payload = typeof event === 'string' ? event : JSON.stringify(event);
  const headers = opts.header === null ? {} : { 'Paymongo-Signature': opts.header ?? signature(payload, opts) };
  return api('paymongo_webhook.php', { raw: payload, headers: { 'Content-Type': 'application/json', ...headers } });
}

// payment.failed: carries the payment (pay_...) and its payment intent.
export const failedEvent = ({ intentId, metadata = {} } = {}) => ({
  data: { attributes: { type: 'payment.failed', livemode: false, data: {
    id: 'pay_test_failed',
    attributes: { ...(intentId ? { payment_intent_id: intentId } : {}), metadata },
  } } },
});

// checkout_session.payment.paid: carries the checkout session and the amount collected.
export const paidEvent = ({ sessionId, invoiceId, amountCentavos, sourceType = 'gcash' }) => ({
  data: { attributes: { type: 'checkout_session.payment.paid', livemode: false, data: {
    id: sessionId,
    attributes: {
      metadata: { invoice_id: invoiceId },
      payments: [{ attributes: { amount: amountCentavos, source: { type: sourceType } } }],
    },
  } } },
});
