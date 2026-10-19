// Tenant split payment: submit_split_payment.php stores the portions and puts
// the bill under review; the admin confirms it with the same portions
// (record_payment_admin.php) or rejects it (reject_payment_proof.php).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { addInvoice } from './lib/fixtures.js';
import { q, one } from './lib/db.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const GCASH_REF = '1234567890123';
let admin, maria, jose;

// parts: [{method, amount, bank_name?, reference_number?, proof?: bool}]
const dayFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// `visit` sets the cash portion's booked date and slot; defaults to a valid one.
function splitForm(invoiceId, parts, visit = { scheduled_date: dayFromNow(3), scheduled_time_slot: 'morning' }) {
  const form = new FormData();
  for (const [k, v] of Object.entries(visit ?? {})) if (v !== undefined) form.append(k, v);
  form.append('invoice_id', invoiceId);
  form.append('parts', JSON.stringify(parts.map(({ proof, ...p }) => p)));
  parts.forEach((p, i) => { if (p.proof) form.append(`proof_${i}`, new Blob([PNG], { type: 'image/png' }), `proof${i}.png`); });
  return form;
}
const submit = (token, invoiceId, parts, visit) => api('submit_split_payment.php', { token, form: splitForm(invoiceId, parts, visit) });
const cashPart = (amount) => ({ method: 'cash', amount });
const gcashPart = (amount, extra = {}) => ({ method: 'gcash', amount, reference_number: GCASH_REF, proof: true, ...extra });
const status = async (id) => (await one('SELECT status, payment_method, proof_of_payment_path FROM invoices WHERE id = ?', [id]));
const partCount = async (key) => (await one('SELECT COUNT(*) AS c FROM payment_proof_parts WHERE payment_key = ?', [key])).c;

beforeAll(async () => {
  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
});

describe('submit_split_payment.php validation', () => {
  beforeAll(() => addInvoice('INV-TEST-SPLIT-V', { status: 'pending', amount: 1500 }));

  it('refuses a split whose portions do not add up to the amount due', async () => {
    const res = await submit(maria, 'INV-TEST-SPLIT-V', [cashPart(500), gcashPart(999.99)]);
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/add up/);
    expect((await status('INV-TEST-SPLIT-V')).status).toBe('pending');
  });

  it('needs at least two portions', async () => {
    const res = await submit(maria, 'INV-TEST-SPLIT-V', [gcashPart(1500)]);
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/two portions/);
  });

  it('needs a GCash or bank portion, not only cash', async () => {
    const res = await submit(maria, 'INV-TEST-SPLIT-V', [cashPart(500), cashPart(1000)]);
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/GCash or bank/);
  });

  it('needs a proof file for each online portion', async () => {
    const res = await submit(maria, 'INV-TEST-SPLIT-V', [cashPart(500), gcashPart(1000, { proof: false })]);
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/payment proof/);
    expect(await partCount('INV-TEST-SPLIT-V')).toBe(0);
  });

  it('needs a reference, and a GCash reference of 13 digits', async () => {
    const none = await submit(maria, 'INV-TEST-SPLIT-V', [cashPart(500), gcashPart(1000, { reference_number: '' })]);
    expect(none.body.message).toMatch(/reference/);
    const short = await submit(maria, 'INV-TEST-SPLIT-V', [cashPart(500), gcashPart(1000, { reference_number: '123' })]);
    expect(short.body.message).toMatch(/13 digits/);
  });

  it('a cash portion needs a real visit date and a time slot', async () => {
    const parts = [cashPart(500), gcashPart(1000)];
    expect((await submit(maria, 'INV-TEST-SPLIT-V', parts, null)).body.message).toMatch(/date you will pay the cash/);
    expect((await submit(maria, 'INV-TEST-SPLIT-V', parts, { scheduled_date: dayFromNow(-1), scheduled_time_slot: 'morning' })).body.message).toMatch(/in the past/);
    expect((await submit(maria, 'INV-TEST-SPLIT-V', parts, { scheduled_date: dayFromNow(61), scheduled_time_slot: 'morning' })).body.message).toMatch(/60 days/);
    expect((await submit(maria, 'INV-TEST-SPLIT-V', parts, { scheduled_date: dayFromNow(3), scheduled_time_slot: 'midnight' })).body.message).toMatch(/time slot/);
    expect((await status('INV-TEST-SPLIT-V')).status).toBe('pending');
  });

  it('no visit date is needed when no portion is cash', async () => {
    await addInvoice('INV-TEST-SPLIT-NOCASH', { status: 'pending', amount: 1500 });
    const res = await submit(maria, 'INV-TEST-SPLIT-NOCASH', [gcashPart(500), gcashPart(1000)], null);
    expect(res.status).toBe(200);
    expect((await one('SELECT scheduled_date FROM invoices WHERE id = ?', ['INV-TEST-SPLIT-NOCASH'])).scheduled_date).toBeNull();
  });

  it("refuses another tenant's bill and an admin", async () => {
    const other = await submit(jose, 'INV-TEST-SPLIT-V', [cashPart(500), gcashPart(1000)]);
    expect(other.status).toBe(409);
    const asAdmin = await submit(admin, 'INV-TEST-SPLIT-V', [cashPart(500), gcashPart(1000)]);
    expect(asAdmin.status).toBe(403);
    expect((await status('INV-TEST-SPLIT-V')).status).toBe('pending');
  });
});

describe('split payment, confirmed by the admin', () => {
  beforeAll(async () => {
    await addInvoice('INV-TEST-SPLIT-OK', { status: 'pending', amount: 1500 });
    await q("DELETE FROM payment_transactions WHERE invoice_id = 'INV-TEST-SPLIT-OK'");
  });

  it('tenant submits cash + GCash → pending-verification with both portions stored', async () => {
    const res = await submit(maria, 'INV-TEST-SPLIT-OK', [cashPart(500), gcashPart(1000)]);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const inv = await status('INV-TEST-SPLIT-OK');
    expect(inv.status).toBe('pending-verification');
    expect(inv.payment_method).toBe('Split payment');
    expect(inv.proof_of_payment_path).toMatch(/^uploads\/payment_proofs\//);
    expect(await partCount('INV-TEST-SPLIT-OK')).toBe(2);
    const booked = await one('SELECT scheduled_date, scheduled_time_slot FROM invoices WHERE id = ?', ['INV-TEST-SPLIT-OK']);
    expect(String(booked.scheduled_date).slice(0, 10)).toBe(dayFromNow(3));
    expect(booked.scheduled_time_slot).toBe('morning');
  });

  it('the admin list returns the portions for the pending bill', async () => {
    const res = await api('get_invoices.php', { token: admin });
    const inv = res.body.invoices.find((i) => i.id === 'INV-TEST-SPLIT-OK');
    expect(inv.split_parts.map((p) => [p.method, p.amount])).toEqual([['cash', 500], ['gcash', 1000]]);
  });

  it('a confirmation with different amounts is refused', async () => {
    const res = await api('record_payment_admin.php', {
      token: admin,
      json: { invoiceId: 'INV-TEST-SPLIT-OK', payments: [{ method: 'cash', amount: 700 }, { method: 'gcash', amount: 800, reference_number: GCASH_REF }] },
    });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/split payment/);
    expect((await status('INV-TEST-SPLIT-OK')).status).toBe('pending-verification');
  });

  it('confirming the submitted portions settles the bill and clears them', async () => {
    const res = await api('record_payment_admin.php', {
      token: admin,
      json: { invoiceId: 'INV-TEST-SPLIT-OK', payments: [{ method: 'gcash', amount: 1000, reference_number: GCASH_REF }, { method: 'cash', amount: 500 }] },
    });
    expect(res.status).toBe(200);
    expect((await status('INV-TEST-SPLIT-OK')).status).toBe('paid');
    expect((await one("SELECT COUNT(*) AS c FROM payment_transactions WHERE invoice_id = 'INV-TEST-SPLIT-OK'")).c).toBe(2);
    expect(await partCount('INV-TEST-SPLIT-OK')).toBe(0);
  });

  it('a second submission on the settled bill is refused', async () => {
    const res = await submit(maria, 'INV-TEST-SPLIT-OK', [cashPart(500), gcashPart(1000)]);
    expect(res.status).toBe(409);
  });
});

describe('split payment, rejected by the admin', () => {
  beforeAll(() => addInvoice('INV-TEST-SPLIT-REJ', { status: 'pending', amount: 1500 }));

  it('rejecting returns the bill to pending and drops the portions', async () => {
    expect((await submit(maria, 'INV-TEST-SPLIT-REJ', [cashPart(500), gcashPart(1000)])).status).toBe(200);
    const res = await api('reject_payment_proof.php', { token: admin, json: { invoiceId: 'INV-TEST-SPLIT-REJ', reason: 'Reference does not match' } });
    expect(res.status).toBe(200);
    expect((await status('INV-TEST-SPLIT-REJ')).status).toBe('pending');
    expect(await partCount('INV-TEST-SPLIT-REJ')).toBe(0);
    expect((await one('SELECT scheduled_date FROM invoices WHERE id = ?', ['INV-TEST-SPLIT-REJ'])).scheduled_date).toBeNull();
  });

  it('a single-method proof replaces an earlier split submission', async () => {
    expect((await submit(maria, 'INV-TEST-SPLIT-REJ', [cashPart(500), gcashPart(1000)])).status).toBe(200);
    const form = new FormData();
    form.append('invoice_id', 'INV-TEST-SPLIT-REJ');
    form.append('payment_reference', GCASH_REF);
    form.append('payment_method', 'GCash');
    form.append('proof', new Blob([PNG], { type: 'image/png' }), 'proof.png');
    expect((await api('upload_payment_proof.php', { token: maria, form })).status).toBe(200);
    expect(await partCount('INV-TEST-SPLIT-REJ')).toBe(0);
    expect((await status('INV-TEST-SPLIT-REJ')).payment_method).toBe('GCash');
  });
});
