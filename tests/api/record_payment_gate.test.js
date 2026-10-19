// The front desk clears a bill only after the tenant has acted in Pay Bills:
// a proof under review, a scheduled visit, or a failed online attempt.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { addInvoice } from './lib/fixtures.js';
import { one } from './lib/db.js';

let admin;
const record = (id) => api('record_payment_admin.php', { token: admin, json: { invoiceId: id, payments: [{ method: 'cash', amount: 1500 }] } });
const statusOf = async (id) => (await one('SELECT status FROM invoices WHERE id = ?', [id])).status;

beforeAll(async () => { admin = await loginAs('admin'); });

describe('admin cannot clear a bill the tenant has not acted on', () => {
  it.each(['pending', 'overdue'])('a %s bill → 409 and unchanged', async (status) => {
    const id = `INV-TEST-GATE-${status.toUpperCase()}`;
    await addInvoice(id, { status, amount: 1500 });
    const res = await record(id);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/hasn't submitted a payment or scheduled/);
    expect(await statusOf(id)).toBe(status);
  });
});

describe('admin clears a bill the tenant has acted on', () => {
  it.each(['scheduled', 'pending-verification', 'payment-failed'])('a %s bill → paid', async (status) => {
    const id = `INV-TEST-GATE-${status.toUpperCase()}`;
    await addInvoice(id, { status, amount: 1500 });
    const res = await record(id);
    expect(res.status).toBe(200);
    expect(await statusOf(id)).toBe('paid');
  });
});
