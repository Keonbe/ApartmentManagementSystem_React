// A GCash reference is exactly 13 digits on a tenant's proof
// (upload_payment_proof.php) and on a refund paid out by hand
// (update_refund_request.php). Spaces and dashes are dropped first.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';
import { addInvoice, payoutForm, PNG_BYTES } from './lib/fixtures.js';
import { ROOT } from './lib/env.js';

const ID = 'INV-TEST-GCASH-REF';
const DIRS = ['backend/uploads/payment_proofs', 'backend/uploads/refunds'].map((d) => path.join(ROOT, d));
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);
let admin, maria, before;

beforeAll(async () => {
  before = DIRS.map((d) => new Set(files(d)));
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
  await addInvoice(ID, { status: 'pending' });
});
afterAll(() => {
  DIRS.forEach((d, i) => files(d).filter((n) => !before[i].has(n)).forEach((n) => fs.rmSync(path.join(d, n), { force: true })));
});

function proof(reference, method = 'GCash') {
  const form = new FormData();
  form.append('invoice_id', ID);
  form.append('payment_method', method);
  form.append('payment_reference', reference);
  form.append('proof', new Blob([PNG_BYTES], { type: 'image/png' }), 'proof.png');
  return api('upload_payment_proof.php', { token: maria, form });
}

describe('tenant payment proof', () => {
  it.each(['123456789012', '12345678901234', '12345678901AB', 'GC-100'])('refuses the GCash reference %s and saves nothing', async (reference) => {
    const count = files(DIRS[0]).length;
    const res = await proof(reference);
    expect(res.status).toBe(422);
    expect(res.body.errors.payment_reference).toMatch(/13 digits/);
    expect((await one('SELECT status FROM invoices WHERE id = ?', [ID])).status).toBe('pending');
    expect(files(DIRS[0]).length).toBe(count);
  });

  it('accepts 13 digits typed with spaces and stores the digits', async () => {
    expect((await proof('9000 111 222333')).status).toBe(200);
    expect((await one('SELECT payment_reference FROM invoices WHERE id = ?', [ID])).payment_reference).toBe('9000111222333');
  });
});

describe("a tenant's own provider receipt", () => {
  const receipt = (invoiceId) => {
    const form = new FormData();
    form.append('invoice_id', invoiceId);
    form.append('payment_method', 'Self-Paid (Online Banking)');
    form.append('bank_name', 'BDO');
    form.append('payment_reference', 'OR-1001');
    form.append('proof', new Blob([PNG_BYTES], { type: 'image/png' }), 'proof.png');
    return api('upload_payment_proof.php', { token: maria, form });
  };

  it('is accepted for a utility bill with the bank channel off, not for a rent bill', async () => {
    await setSetting('payment_ch_bank_manual', '0');
    await addInvoice('INV-TEST-GC-UTIL', { status: 'pending' });
    await addInvoice('INV-TEST-GC-RENT', { status: 'pending' });
    await q("UPDATE invoices SET base_rent = 4000 WHERE id = 'INV-TEST-GC-RENT'");
    for (const [i, id] of ['INV-TEST-GC-UTIL', 'INV-TEST-GC-RENT'].entries()) {
      await q('INSERT INTO utility_readings (room_name, user_id, billing_period, reading_date, invoice_id) VALUES (?, 2, ?, CURDATE(), ?)', ['A', `2031-0${i + 3}`, id]);
    }
    expect((await receipt('INV-TEST-GC-RENT')).status).toBe(403);
    expect((await receipt('INV-TEST-GC-UTIL')).status).toBe(200);
    await setSetting('payment_ch_bank_manual', '1');
  });
});

describe('the desk', () => {
  it('records a spaced GCash reference as its 13 digits', async () => {
    await addInvoice('INV-TEST-GC-DESK', { status: 'pending-verification', amount: 600 });
    // The tenant's proof carried a wrong number; the desk records the right one.
    await q("UPDATE invoices SET payment_method = 'GCash (Manual)', payment_reference = 'GC-OLD' WHERE id = 'INV-TEST-GC-DESK'");
    const res = await api('record_payment_admin.php', { token: admin, json: { invoiceId: 'INV-TEST-GC-DESK', payments: [{ method: 'gcash', amount: 600, reference_number: '9000 222-333444' }] } });
    expect(res.status, res.text).toBe(200);
    // On the payment record and on the bill.
    expect((await one("SELECT reference_number FROM payment_transactions WHERE invoice_id = 'INV-TEST-GC-DESK'")).reference_number).toBe('9000222333444');
    expect(await one("SELECT status, payment_reference FROM invoices WHERE id = 'INV-TEST-GC-DESK'")).toEqual({ status: 'paid', payment_reference: '9000222333444' });
  });
});

describe('refund paid out by GCash', () => {
  it('refuses a short reference and leaves the request approved', async () => {
    const { insertId } = await q("INSERT INTO refund_requests (user_id, type, amount, reason, status, raised_by_role) VALUES (2, 'overpayment', 500, 'test', 'Approved', 'admin')");
    const res = await api('update_refund_request.php', { token: admin, form: payoutForm(insertId, { method: 'GCash', reference: '12345' }) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/13 digits/);
    expect((await one('SELECT status FROM refund_requests WHERE id = ?', [insertId])).status).toBe('Approved');
  });
});
