// The desk confirms tenant-submitted online payments and may record cash
// physically received at the office without a prior tenant declaration.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { addInvoice } from './lib/fixtures.js';
import { one } from './lib/db.js';

let admin;
const record = (id) => api('record_payment_admin.php', { token: admin, json: { invoiceId: id, payments: [{ method: 'cash', amount: 1500 }] } });
const statusOf = async (id) => (await one('SELECT status FROM invoices WHERE id = ?', [id])).status;

beforeAll(async () => { admin = await loginAs('admin'); });

describe('admin cannot clear a bill the tenant has not acted on', () => {
  it.each(['pending', 'overdue'])('an online transfer on a %s bill → 409 and unchanged', async (status) => {
    const id = `INV-TEST-GATE-${status.toUpperCase()}`;
    await addInvoice(id, { status, amount: 1500 });
    const res = await api('record_payment_admin.php', { token: admin, json: { invoiceId: id, payments: [{ method: 'gcash', amount: 1500, reference_number: '1234567890123' }] } });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/hasn't submitted a payment or scheduled/);
    expect(await statusOf(id)).toBe(status);
  });

  it.each(['pending', 'overdue'])('cash physically received clears a %s bill without a reference', async (status) => {
    const id = `INV-TEST-GATE-CASH-${status.toUpperCase()}`;
    await addInvoice(id, { status, amount: 1500 });
    const res = await record(id);
    expect(res.status).toBe(200);
    expect(await statusOf(id)).toBe('paid');
    const tx = await one('SELECT payment_method, reference_number FROM payment_transactions WHERE invoice_id = ?', [id]);
    expect(tx.payment_method).toBe('cash');
    expect(tx.reference_number).toBeNull();
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
