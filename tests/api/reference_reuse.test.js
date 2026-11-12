// Reused payment references (manager interview Q22). Settings -> Payments
// "Reused payment reference": 'warn' (default) accepts a GCash/bank reference
// already used on another payment and flags it to the admin; 'block' refuses
// it — for tenant proofs, split parts and desk recording. An identical part
// submitted twice is refused in both modes. References are compared without
// spaces/dashes and case, within the same channel (GCash, or one bank), on the
// stored `reference_norm` columns.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting, setting } from './lib/db.js';
import { ROOT, PHP_BIN } from './lib/env.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
let admin, maria, jose, rosa;

// A bill for user 2 (maria), 3 (jose) or 5 (rosa). 'scheduled' lets the desk record on it.
async function addBill(id, { userId = 2, amount = 1500, status = 'pending', group = null } = {}) {
  await q(
    `INSERT INTO invoices (id, user_id, base_rent, total_amount, billing_period, status, due_date, payment_group)
     VALUES (?, ?, ?, ?, 'Test bill', ?, CURDATE() + INTERVAL 5 DAY, ?)`,
    [id, userId, amount, amount, status, group],
  );
}
function proofForm(invoiceId, ref, { method = 'GCash', bank, amount } = {}) {
  const form = new FormData();
  form.append('invoice_id', invoiceId);
  form.append('payment_method', method);
  form.append('payment_reference', ref);
  form.append('sender_name', 'Test Sender');
  if (bank) form.append('bank_name', bank);
  if (amount !== undefined) form.append('amount', String(amount));
  form.append('proof', new Blob([PNG], { type: 'image/png' }), 'proof.png');
  return form;
}
const upload = (token, invoiceId, ref, opts) => api('upload_payment_proof.php', { token, form: proofForm(invoiceId, ref, opts) });
function split(token, invoiceId, parts) {
  const form = new FormData();
  form.append('invoice_id', invoiceId);
  form.append('parts', JSON.stringify(parts));
  parts.forEach((_, i) => form.append(`proof_${i}`, new Blob([PNG], { type: 'image/png' }), `proof${i}.png`));
  return api('submit_split_payment.php', { token, form });
}
const desk = (invoiceId, payments, partial = false) => api('record_payment_admin.php', { token: admin, json: { invoiceId, partial, payments } });
const bill = (id) => one('SELECT status, payment_reference, proof_of_payment_path FROM invoices WHERE id = ?', [id]);
const adminInvoice = async (id) => (await api('get_invoices.php', { token: admin })).body.invoices.find((i) => i.id === id);
const policy = (value) => setSetting('duplicate_reference_policy', value);

beforeAll(async () => {
  [admin, maria, jose, rosa] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose'), loginAs('rosa')]);
});
afterEach(() => policy('warn'));

describe('the setting (update_system_settings.php / get_system_settings.php)', () => {
  it('ships as warn', async () => {
    expect(await setting('duplicate_reference_policy')).toBe('warn');
    const res = await api('get_system_settings.php', { token: admin });
    expect(res.body.settings.duplicate_reference_policy).toBe('warn');
  });

  it.each([['maybe'], [''], [true], [1], [['block']]])('%j → 422, unchanged', async (value) => {
    const res = await api('update_system_settings.php', { token: admin, json: { duplicate_reference_policy: value } });
    expect(res.status).toBe(422);
    expect(await setting('duplicate_reference_policy')).toBe('warn');
  });

  it('block round-trips', async () => {
    const res = await api('update_system_settings.php', { token: admin, json: { duplicate_reference_policy: 'block' } });
    expect(res.status).toBe(200);
    expect((await api('get_system_settings.php', { token: admin })).body.settings.duplicate_reference_policy).toBe('block');
  });
});

describe('warn (default): accepted and flagged to the admin only', () => {
  const REF = '9000000000001';
  beforeAll(async () => {
    await addBill('INV-TEST-RR-W1', { userId: 2 });
    await addBill('INV-TEST-RR-W2', { userId: 3 });
  });

  it('the second tenant using the same reference is accepted', async () => {
    expect((await upload(maria, 'INV-TEST-RR-W1', REF)).status).toBe(200);
    const res = await upload(jose, 'INV-TEST-RR-W2', REF);
    expect(res.status).toBe(200);
    expect((await bill('INV-TEST-RR-W2')).status).toBe('pending-verification');
    const log = await one("SELECT details FROM activity_logs WHERE action = 'Submitted Payment Proof' AND details LIKE '%INV-TEST-RR-W2%' ORDER BY id DESC LIMIT 1");
    expect(log.details).toMatch(/also used on invoice INV-TEST-RR-W1/);
  });

  it('get_invoices.php flags both payments for the admin, with the other tenant named', async () => {
    const w2 = await adminInvoice('INV-TEST-RR-W2');
    expect(w2.reference_reuse).toMatchObject({ invoice_id: 'INV-TEST-RR-W1', status: 'pending-verification' });
    expect(w2.reference_reuse.tenant_name).toMatch(/Maria/);
    expect((await adminInvoice('INV-TEST-RR-W1')).reference_reuse).toMatchObject({ invoice_id: 'INV-TEST-RR-W2' });
  });

  it('the tenant does not see the flag', async () => {
    const res = await api('get_invoices.php', { token: jose, query: { userId: '3' } });
    const inv = res.body.invoices.find((i) => i.id === 'INV-TEST-RR-W2');
    expect(inv).not.toHaveProperty('reference_reuse');
  });
});

describe('block: refused everywhere', () => {
  const REF = '9000000000002';
  beforeAll(async () => {
    await addBill('INV-TEST-RR-B1', { userId: 2 });
    await addBill('INV-TEST-RR-B2', { userId: 5 });
    await addBill('INV-TEST-RR-B3', { userId: 5 });
    await addBill('INV-TEST-RR-B4', { userId: 3, status: 'scheduled' });
    await policy('warn');
    expect((await upload(maria, 'INV-TEST-RR-B1', REF)).status).toBe(200);
  });

  it('tenant proof → 409, the bill is unchanged, no other tenant is named', async () => {
    await policy('block');
    const res = await upload(rosa, 'INV-TEST-RR-B2', REF);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already used on another payment\./);
    // Neither the other tenant nor the other invoice is revealed.
    expect(res.body.message).not.toMatch(/Maria|Santos|INV-|invoice/i);
    expect(await bill('INV-TEST-RR-B2')).toMatchObject({ status: 'pending', payment_reference: null, proof_of_payment_path: null });
  });

  it('split part → 409, no portions stored', async () => {
    await policy('block');
    const res = await split(rosa, 'INV-TEST-RR-B3', [
      { method: 'gcash', amount: 1000, reference_number: REF },
      { method: 'bank_transfer', bank_name: 'BDO', amount: 500, reference_number: 'BDO-RR-B3' },
    ]);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already used on another payment\./);
    expect(res.body.message).not.toMatch(/Maria|Santos|INV-|invoice/i);
    expect((await one('SELECT COUNT(*) AS c FROM payment_proof_parts WHERE payment_key = ?', ['INV-TEST-RR-B3'])).c).toBe(0);
    expect((await bill('INV-TEST-RR-B3')).status).toBe('pending');
  });

  it('desk recording → 409 naming the invoice and tenant; nothing recorded', async () => {
    await policy('block');
    const res = await desk('INV-TEST-RR-B4', [{ method: 'gcash', amount: 1500, reference_number: REF }]);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/INV-TEST-RR-B1 \(Maria/);
    expect((await bill('INV-TEST-RR-B4')).status).toBe('scheduled');
    expect((await one('SELECT COUNT(*) AS c FROM payment_transactions WHERE invoice_id = ?', ['INV-TEST-RR-B4'])).c).toBe(0);
  });

  it('desk recording under warn proceeds and logs the reuse', async () => {
    const res = await desk('INV-TEST-RR-B4', [{ method: 'gcash', amount: 1500, reference_number: REF }]);
    expect(res.status).toBe(200);
    expect((await bill('INV-TEST-RR-B4')).status).toBe('paid');
    const log = await one("SELECT details FROM activity_logs WHERE action = 'Reused Payment Reference' AND details LIKE '%INV-TEST-RR-B4%' ORDER BY id DESC LIMIT 1");
    expect(log.details).toMatch(/also used on invoice INV-TEST-RR-B1/);
  });

  it('a reference recorded in the ledger blocks a later proof', async () => {
    await policy('block');
    const res = await upload(rosa, 'INV-TEST-RR-B2', REF);
    expect(res.status).toBe(409);
  });
});

describe('not duplicates', () => {
  it('accepts numeric-only bank transfer trace numbers up to 55 characters', async () => {
    const id = 'INV-TEST-RR-NUMERIC-BANK';
    await addBill(id, { userId: 2 });
    const ref = '123456789012';
    const res = await upload(maria, id, ref, { method: 'Bank Transfer', bank: 'BDO' });
    expect(res.status).toBe(200);
    expect(await bill(id)).toMatchObject({ status: 'pending-verification', payment_reference: ref });
  });

  it('the same invoice after a rejected proof', async () => {
    const id = 'INV-TEST-RR-REJ';
    const REF = '9000000000003';
    await addBill(id, { userId: 2 });
    await policy('block');
    expect((await upload(maria, id, REF)).status).toBe(200);
    expect((await api('reject_payment_proof.php', { token: admin, json: { invoiceId: id, reason: 'The receipt is unreadable.' } })).status).toBe(200);
    const res = await upload(maria, id, REF);
    expect(res.status).toBe(200);
    expect((await bill(id)).status).toBe('pending-verification');
  });

  it('the bills of one combined payment share one transfer', async () => {
    const REF = '9000000000004';
    await addBill('INV-TEST-RR-G1', { userId: 3, group: 'BND-TEST-RR' });
    await addBill('INV-TEST-RR-G2', { userId: 3, group: 'BND-TEST-RR' });
    await policy('block');
    const res = await upload(jose, 'BND-TEST-RR', REF);
    expect(res.status).toBe(200);
    expect((await bill('INV-TEST-RR-G1')).payment_reference).toBe(REF);
    expect((await bill('INV-TEST-RR-G2')).payment_reference).toBe(REF);
    expect((await adminInvoice('INV-TEST-RR-G1')).reference_reuse).toBeNull();
    expect((await adminInvoice('INV-TEST-RR-G2')).reference_reuse).toBeNull();
  });

  it('the same digits on a different channel or bank', async () => {
    const REF = '9000000000005';
    await addBill('INV-TEST-RR-C1', { userId: 2 });
    await addBill('INV-TEST-RR-C2', { userId: 5 });
    await addBill('INV-TEST-RR-C3', { userId: 3 });
    await addBill('INV-TEST-RR-C4', { userId: 3 });
    await policy('block');
    expect((await upload(maria, 'INV-TEST-RR-C1', REF)).status).toBe(200); // GCash
    expect((await upload(rosa, 'INV-TEST-RR-C2', REF, { method: 'Bank Transfer', bank: 'BDO' })).status).toBe(200);
    expect((await upload(jose, 'INV-TEST-RR-C3', REF, { method: 'Bank Transfer', bank: 'BPI' })).status).toBe(200);
    // ...but the same bank again is a duplicate.
    expect((await upload(jose, 'INV-TEST-RR-C4', REF, { method: 'Bank Transfer', bank: 'BDO' })).status).toBe(409);
  });

  it('empty references and cash are ignored', async () => {
    await addBill('INV-TEST-RR-E1', { userId: 2 });
    await addBill('INV-TEST-RR-E2', { userId: 5 });
    await policy('block');
    expect((await upload(maria, 'INV-TEST-RR-E1', '')).status).toBe(200);
    expect((await upload(rosa, 'INV-TEST-RR-E2', '')).status).toBe(200);
    expect((await adminInvoice('INV-TEST-RR-E2')).reference_reuse).toBeNull();
  });
});

describe('normalization: spaces, dashes and case', () => {
  it.each([[1, 'ab-12 34x'], [2, ' AB1234X '], [3, 'ab 12-34 x']])('variant %i (%j) matches AB1234X under block', async (n, variant) => {
    const first = `INV-TEST-RR-N1-${n}`;
    const second = `INV-TEST-RR-N2-${n}`;
    await addBill(first, { userId: 2 });
    await addBill(second, { userId: 5 });
    await policy('warn');
    expect((await upload(maria, first, 'AB1234X', { method: 'Bank Transfer', bank: 'BDO' })).status).toBe(200);
    await policy('block');
    const res = await upload(rosa, second, variant, { method: 'Bank Transfer', bank: 'BDO' });
    expect(res.status).toBe(409);
    // Clean up so the next variant is checked against its own first proof only.
    await q("UPDATE invoices SET status = 'cancelled' WHERE id = ?", [first]);
  });
});

describe('double submit: refused in both modes', () => {
  it.each([['warn'], ['block']])('the same proof twice (%s)', async (mode) => {
    const id = `INV-TEST-RR-DUP-${mode}`;
    const REF = mode === 'warn' ? '9000000000006' : '9000000000007';
    await addBill(id, { userId: 2 });
    await policy(mode);
    expect((await upload(maria, id, REF, { amount: 500 })).status).toBe(200);
    const again = await upload(maria, id, REF, { amount: 500 });
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already submitted/);
    // A different amount is a different part.
    expect((await upload(maria, id, REF, { amount: 600 })).status).toBe(200);
  });

  it.each([['warn'], ['block']])('the same split twice (%s)', async (mode) => {
    const id = `INV-TEST-RR-DSPL-${mode}`;
    await addBill(id, { userId: 5 });
    await policy(mode);
    const parts = [
      { method: 'gcash', amount: 1000, reference_number: mode === 'warn' ? '9000000000008' : '9000000000009' },
      { method: 'bank_transfer', bank_name: 'BPI', amount: 500, reference_number: `BPI-DSPL-${mode}` },
    ];
    expect((await split(rosa, id, parts)).status).toBe(200);
    const again = await split(rosa, id, parts);
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already submitted/);
    expect((await one('SELECT COUNT(*) AS c FROM payment_proof_parts WHERE payment_key = ?', [id])).c).toBe(2);
  });

  it.each([['warn'], ['block']])('the same desk part twice (%s)', async (mode) => {
    const id = `INV-TEST-RR-DDSK-${mode}`;
    await addBill(id, { userId: 3, status: 'scheduled' });
    await policy(mode);
    const part = [{ method: 'gcash', amount: 600, reference_number: mode === 'warn' ? '9000000000010' : '9000000000011' }];
    expect((await desk(id, part, true)).status).toBe(200);
    await q("UPDATE invoices SET status = 'scheduled' WHERE id = ?", [id]); // the tenant books the next visit
    const again = await desk(id, part, true);
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already recorded/);
    expect((await q('SELECT id FROM payment_transactions WHERE invoice_id = ?', [id]))).toHaveLength(1);
  });
});

describe('race: one reference sent twice at once under block', () => {
  it('exactly one submission succeeds', async () => {
    const REF = '9000000000012';
    await addBill('INV-TEST-RR-RACE1', { userId: 2 });
    await addBill('INV-TEST-RR-RACE2', { userId: 3 });
    await policy('block');
    const results = await Promise.all([upload(maria, 'INV-TEST-RR-RACE1', REF), upload(jose, 'INV-TEST-RR-RACE2', REF)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const stored = await q("SELECT id FROM invoices WHERE payment_reference = ? AND status = 'pending-verification'", [REF]);
    expect(stored).toHaveLength(1);
  });
});

describe('refusals leave nothing behind', () => {
  const proofDir = path.join(ROOT, 'backend/uploads/payment_proofs');
  const proofCount = () => (fs.existsSync(proofDir) ? fs.readdirSync(proofDir).length : 0);

  it('a reference over 100 characters → 422 before the proof is saved', async () => {
    await addBill('INV-TEST-RR-LONG', { userId: 2 });
    const before = proofCount();
    const res = await upload(maria, 'INV-TEST-RR-LONG', 'X'.repeat(101));
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/100 characters or fewer/);
    expect(proofCount()).toBe(before);
    expect((await bill('INV-TEST-RR-LONG')).status).toBe('pending');
  });

  it('a desk refusal under block releases the reference lock for the next writer', async () => {
    const REF = '9000000000020';
    await addBill('INV-TEST-RR-LOCK1', { userId: 3, status: 'scheduled' });
    await addBill('INV-TEST-RR-LOCK2', { userId: 2 });
    await desk('INV-TEST-RR-LOCK1', [{ method: 'gcash', amount: 600, reference_number: REF }], true);
    await q("UPDATE invoices SET status = 'scheduled' WHERE id = ?", ['INV-TEST-RR-LOCK1']);
    await policy('block');
    const refused = await desk('INV-TEST-RR-LOCK1', [{ method: 'gcash', amount: 600, reference_number: REF }], true);
    expect(refused.status).toBe(409);
    const started = Date.now();
    expect((await upload(maria, 'INV-TEST-RR-LOCK2', '9000000000021')).status).toBe(200);
    expect(Date.now() - started).toBeLessThan(5000); // GET_LOCK waits up to 10 s
  });
});

// ── Same bill: a part already recorded on this bill with the same reference is
// a reuse (one transfer reference given for two installments); the bill's own
// pending proof, a re-proof after a rejection, the desk confirming the
// tenant's own proof, and a combined payment's bills are not.
describe('same bill: a reference already recorded on it', () => {
  const GENERIC = /already used on another payment\./;
  const NAMES = /Maria|Santos|INV-|invoice/i;
  const reusedLog = (id) => one("SELECT details FROM activity_logs WHERE action = 'Reused Payment Reference' AND details LIKE ? ORDER BY id DESC LIMIT 1", [`%${id}%`]);

  it('warn: a second installment with the same reference and a new amount is accepted and flagged', async () => {
    const id = 'INV-TEST-RR-SB-W';
    const REF = '9000000000101';
    await addBill(id, { userId: 2 });
    expect((await upload(maria, id, REF, { amount: 500 })).status).toBe(200);
    // The desk confirming the tenant's own proof is not a reuse.
    expect((await desk(id, [{ method: 'gcash', amount: 500, reference_number: REF }])).status).toBe(200);
    expect(await reusedLog(id)).toBeNull();
    expect(await one('SELECT status, amount_paid FROM invoices WHERE id = ?', [id])).toMatchObject({ status: 'pending', amount_paid: '500.00' });

    expect((await upload(maria, id, REF, { amount: 600 })).status).toBe(200);
    const log = await one("SELECT details FROM activity_logs WHERE action = 'Submitted Payment Proof' AND details LIKE ? ORDER BY id DESC LIMIT 1", [`%${id}%`]);
    expect(log.details).toMatch(new RegExp(`also used on invoice ${id}`));
    expect((await adminInvoice(id)).reference_reuse).toMatchObject({ invoice_id: id, where: 'ledger', amount: 500 });
    // ...and the desk confirming it records the reuse too.
    expect((await desk(id, [{ method: 'gcash', amount: 600, reference_number: REF }])).status).toBe(200);
    expect((await reusedLog(id)).details).toMatch(new RegExp(`also used on invoice ${id}`));
  });

  it('block: the second installment is refused with the generic message (proof and split)', async () => {
    const id = 'INV-TEST-RR-SB-B';
    const REF = '9000000000102';
    await addBill(id, { userId: 2 });
    expect((await upload(maria, id, REF, { amount: 500 })).status).toBe(200);
    expect((await desk(id, [{ method: 'gcash', amount: 500, reference_number: REF }])).status).toBe(200);
    await policy('block');
    const res = await upload(maria, id, ` ${REF.slice(0, 4)}-${REF.slice(4)} `, { amount: 600 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(GENERIC);
    expect(res.body.message).not.toMatch(NAMES);
    expect(await one('SELECT status, proof_amount FROM invoices WHERE id = ?', [id])).toMatchObject({ status: 'pending', proof_amount: null });
    const sp = await split(maria, id, [
      { method: 'gcash', amount: 600, reference_number: REF },
      { method: 'bank_transfer', bank_name: 'BDO', amount: 400, reference_number: 'BDO-SB-B' },
    ]);
    expect(sp.status).toBe(409);
    expect(sp.body.message).toMatch(GENERIC);
    expect(sp.body.message).not.toMatch(NAMES);
    expect((await one('SELECT COUNT(*) AS c FROM payment_proof_parts WHERE payment_key = ?', [id])).c).toBe(0);
  });

  it("block: the desk confirming the tenant's own proof is not flagged", async () => {
    const id = 'INV-TEST-RR-SB-D';
    const REF = '9000000000103';
    await addBill(id, { userId: 2 });
    await policy('block');
    expect((await upload(maria, id, REF)).status).toBe(200);
    expect((await adminInvoice(id)).reference_reuse).toBeNull();
    expect((await desk(id, [{ method: 'gcash', amount: 1500, reference_number: REF }])).status).toBe(200);
    expect((await bill(id)).status).toBe('paid');
    expect(await reusedLog(id)).toBeNull();
  });

  it('block: a re-proof after a rejection is not flagged for the admin either', async () => {
    const id = 'INV-TEST-RR-SB-REJ';
    const REF = '9000000000104';
    await addBill(id, { userId: 2 });
    await policy('block');
    expect((await upload(maria, id, REF)).status).toBe(200);
    expect((await api('reject_payment_proof.php', { token: admin, json: { invoiceId: id, reason: 'The amount is unclear.' } })).status).toBe(200);
    expect((await upload(maria, id, REF)).status).toBe(200);
    expect((await adminInvoice(id)).reference_reuse).toBeNull();
  });

  it('block: a combined payment confirmed at the desk is recorded on each bill without a flag', async () => {
    const REF = '9000000000105';
    await addBill('INV-TEST-RR-SB-G1', { userId: 3, group: 'BND-TEST-RR-SB' });
    await addBill('INV-TEST-RR-SB-G2', { userId: 3, group: 'BND-TEST-RR-SB' });
    await policy('block');
    expect((await upload(jose, 'BND-TEST-RR-SB', REF)).status).toBe(200);
    expect((await desk('BND-TEST-RR-SB', [{ method: 'gcash', amount: 3000, reference_number: REF }])).status).toBe(200);
    expect((await bill('INV-TEST-RR-SB-G1')).status).toBe('paid');
    expect((await bill('INV-TEST-RR-SB-G2')).status).toBe('paid');
    expect(await q('SELECT invoice_id FROM payment_transactions WHERE reference_norm = ?', [REF])).toHaveLength(2);
    expect(await reusedLog('BND-TEST-RR-SB')).toBeNull();
  });

  it('block: the ledger row of a settled bill of the same group is not a reuse', async () => {
    const REF = '9000000000106';
    await addBill('INV-TEST-RR-SB-S1', { userId: 3, group: 'BND-TEST-RR-SS', status: 'paid' });
    await addBill('INV-TEST-RR-SB-S2', { userId: 3, group: 'BND-TEST-RR-SS' });
    await q("INSERT INTO payment_transactions (invoice_id, amount, payment_method, reference_number, created_at) VALUES ('INV-TEST-RR-SB-S1', 1500, 'gcash', ?, NOW() - INTERVAL 1 HOUR)", [REF]);
    await policy('block');
    expect((await upload(jose, 'BND-TEST-RR-SS', REF)).status).toBe(200);
    expect((await adminInvoice('INV-TEST-RR-SB-S2')).reference_reuse).toBeNull();
  });
});

// ── Split resubmission: a new split replaces the tenant's own pending
// portions, so an unchanged portion is not a repeat; a portion already
// recorded on the bill a moment ago still is.
describe('split resubmission', () => {
  const queueRows = (key) => q("SELECT user_id, COUNT(*) AS c FROM notifications WHERE type = 'payment_verification' AND metadata_value = ? AND status = 'Pending' GROUP BY user_id", [`payment_verification:${key}`]);

  it.each([['warn'], ['block']])('one portion unchanged, the other corrected → accepted (%s)', async (mode) => {
    const id = `INV-TEST-RR-RES-${mode}`;
    const REF = mode === 'warn' ? '9000000000111' : '9000000000112';
    await addBill(id, { userId: 5 });
    await policy(mode);
    expect((await split(rosa, id, [
      { method: 'gcash', amount: 1000, reference_number: REF },
      { method: 'bank_transfer', bank_name: 'BPI', amount: 500, reference_number: `BPI-RES-${mode}-1` },
    ])).status).toBe(200);
    const res = await split(rosa, id, [
      { method: 'gcash', amount: 1000, reference_number: REF },
      { method: 'bank_transfer', bank_name: 'BPI', amount: 500, reference_number: `BPI-RES-${mode}-2` },
    ]);
    expect(res.status).toBe(200);
    const parts = await q('SELECT reference_number FROM payment_proof_parts WHERE payment_key = ? ORDER BY position', [id]);
    expect(parts.map((p) => p.reference_number)).toEqual([REF, `BPI-RES-${mode}-2`]);
    for (const row of await queueRows(id)) expect(row.c).toBe(1);
    expect((await adminInvoice(id)).reference_reuse).toBeNull();
  });

  it.each([['warn'], ['block']])('a portion identical to a part recorded on the bill a moment ago → refused (%s)', async (mode) => {
    const id = `INV-TEST-RR-REC-${mode}`;
    const REF = mode === 'warn' ? '9000000000113' : '9000000000114';
    await addBill(id, { userId: 5, status: 'scheduled' });
    await policy(mode);
    expect((await desk(id, [{ method: 'gcash', amount: 600, reference_number: REF }], true)).status).toBe(200);
    const res = await split(rosa, id, [
      { method: 'gcash', amount: 600, reference_number: REF },
      { method: 'bank_transfer', bank_name: 'BPI', amount: 300, reference_number: `BPI-REC-${mode}` },
    ]);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already submitted/);
    expect((await one('SELECT COUNT(*) AS c FROM payment_proof_parts WHERE payment_key = ?', [id])).c).toBe(0);
  });

  it('a double click (two identical splits at once) leaves one pending split and one queue row', async () => {
    const id = 'INV-TEST-RR-DBL';
    await addBill(id, { userId: 5 });
    const parts = [
      { method: 'gcash', amount: 700, reference_number: '9000000000115' },
      { method: 'bank_transfer', bank_name: 'BDO', amount: 800, reference_number: 'BDO-DBL-1' },
    ];
    const results = await Promise.all([split(rosa, id, parts), split(rosa, id, parts)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await one('SELECT COUNT(*) AS c FROM payment_proof_parts WHERE payment_key = ?', [id])).c).toBe(2);
    const queue = await queueRows(id);
    expect(queue.length).toBeGreaterThan(0);
    for (const row of queue) expect(row.c).toBe(1);
  });
});

// ── reference_norm: the stored generated column the lookups seek on must
// equal config.php normalize_payment_reference() exactly.
describe('reference_norm: PHP and the generated column agree', () => {
  const SPELLINGS = ['ab-12 34x', ' AB1234X ', 'ab\t12-34\nx', 'ab 12-34 x\r', 'Ab-1234-X', '--', '   ', '\t', '', 'é-ñ 9', 'ÿſ-ǆ', 'ｇ12', '12–34', 'ab 12', 'GCash 0917-123-4567'];

  function phpNormalize(values) {
    const src = fs.readFileSync(path.join(ROOT, 'backend/config.php'), 'utf8');
    const fn = src.match(/function normalize_payment_reference\([\s\S]*?\r?\n}\r?\n/)[0];
    const code = `${fn} echo json_encode(array_map('normalize_payment_reference', json_decode(stream_get_contents(STDIN), true)));`;
    return JSON.parse(execFileSync(PHP_BIN, ['-r', code], { input: JSON.stringify(values) }).toString());
  }

  it('for spaces, tabs, line breaks, dashes, case and unicode (NULL when nothing is left)', async () => {
    const php = phpNormalize(SPELLINGS);
    for (const [i, ref] of SPELLINGS.entries()) {
      await q("INSERT INTO payment_proof_parts (payment_key, position, method, amount, reference_number) VALUES ('NORM-TEST', ?, 'gcash', 1, ?)", [i, ref]);
    }
    const rows = await q("SELECT reference_norm FROM payment_proof_parts WHERE payment_key = 'NORM-TEST' ORDER BY position");
    expect(rows.map((r) => r.reference_norm)).toEqual(php.map((v) => (v === '' ? null : v)));
    expect(php.slice(0, 5)).toEqual(['AB1234X', 'AB1234X', 'AB1234X', 'AB1234X', 'AB1234X']);
    expect(php[9]).toBe('ÉÑ9');
  });

  it('is filled on insert and follows updates (invoices, payment_transactions)', async () => {
    await addBill('INV-TEST-RR-NORM', { userId: 2 });
    const norm = async () => (await one('SELECT reference_norm FROM invoices WHERE id = ?', ['INV-TEST-RR-NORM'])).reference_norm;
    expect(await norm()).toBeNull();
    await q("UPDATE invoices SET payment_reference = 'bdo-77 88' WHERE id = 'INV-TEST-RR-NORM'");
    expect(await norm()).toBe('BDO7788');
    await q("UPDATE invoices SET payment_reference = ' - ' WHERE id = 'INV-TEST-RR-NORM'");
    expect(await norm()).toBeNull();
    await q("INSERT INTO payment_transactions (invoice_id, amount, payment_method, reference_number) VALUES ('INV-TEST-RR-NORM', 1, 'gcash', 'x-1 2')");
    expect((await one("SELECT reference_norm FROM payment_transactions WHERE invoice_id = 'INV-TEST-RR-NORM'")).reference_norm).toBe('X12');
  });
});
