// Installments (Phase 5): any single invoice can be paid in parts. Each part is
// appended to payment_transactions and added to invoices.amount_paid; the part
// that clears the balance settles the bill through settle_invoice(), so its
// side effects (receipt, deposit Held, move-in cue) happen once.
import { describe, it, expect, beforeAll } from 'vitest';
import mysql from 'mysql2/promise';
import { api, login, loginAs } from './lib/api.js';
import { notificationCount } from './lib/fixtures.js';
import { q, one, setSetting } from './lib/db.js';
import { DB } from './lib/env.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const GCASH_REF = '1234567890123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dayFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let admin, maria, jose;

// An invoice with a base rent (adjustable) and optional parts already paid.
// 'scheduled' = the tenant booked a desk visit, so the desk may record on it.
async function addBill(id, { userId = 2, appId = 1, amount = 1500, paid = 0, status = 'scheduled', dueDays = 5, group = null, advance = null } = {}) {
  await q(
    `INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date, payment_group, advance_months)
     VALUES (?, ?, ?, ?, ?, ?, 'Test bill', ?, CURDATE() + INTERVAL ? DAY, ?, ?)`,
    [id, userId, appId, amount, amount, paid, status, dueDays, group, advance],
  );
  if (paid > 0) await q("INSERT INTO payment_transactions (invoice_id, amount, payment_method) VALUES (?, ?, 'cash')", [id, paid]);
}
const bill = async (id) => {
  const r = await one('SELECT status, total_amount, amount_paid, proof_amount FROM invoices WHERE id = ?', [id]);
  return { status: r.status, total: Number(r.total_amount), paid: Number(r.amount_paid), proof: r.proof_amount === null ? null : Number(r.proof_amount) };
};
const ledger = async (id) => (await q('SELECT amount FROM payment_transactions WHERE invoice_id = ? ORDER BY id', [id])).map((r) => Number(r.amount));
// The tenant booking the next desk visit for the rest of the bill.
const bookVisit = (id) => q("UPDATE invoices SET status = 'scheduled' WHERE id = ?", [id]);

const desk = (invoiceId, amount, { partial = true, method = 'cash', ref, payments } = {}) => api('record_payment_admin.php', {
  token: admin,
  json: { invoiceId, partial, payments: payments ?? [{ method, amount, ...(ref ? { reference_number: ref } : {}) }] },
});
function proofForm(invoiceId, amount, extra = {}) {
  const form = new FormData();
  form.append('invoice_id', invoiceId);
  form.append('payment_method', 'GCash');
  form.append('payment_reference', GCASH_REF);
  form.append('sender_name', 'Test Sender');
  if (amount !== undefined) form.append('amount', String(amount));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  form.append('proof', new Blob([PNG], { type: 'image/png' }), 'proof.png');
  return form;
}
const uploadProof = (token, invoiceId, amount) => api('upload_payment_proof.php', { token, form: proofForm(invoiceId, amount) });

beforeAll(async () => {
  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
});

describe('desk part-payments (record_payment_admin.php, partial: true)', () => {
  it('two parts settle the invoice; the ledger keeps both and the receipt is sent once', async () => {
    const id = 'INV-TEST-PP-TWO';
    await addBill(id);

    let res = await desk(id, 600);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, partial: true, amount_paid: 600, balance: 900 });
    expect(await bill(id)).toMatchObject({ status: 'pending', paid: 600 });
    expect(await ledger(id)).toEqual([600]);
    expect(await notificationCount(2, 'Part Payment Received', id)).toBe(1);
    expect(await notificationCount(2, 'Payment Received', id)).toBe(0);

    await bookVisit(id);
    res = await desk(id, 900);
    expect(res.status).toBe(200);
    expect(await bill(id)).toMatchObject({ status: 'paid', paid: 1500, total: 1500 });
    expect(await ledger(id)).toEqual([600, 900]);
    expect(await notificationCount(2, 'Payment Received', id)).toBe(1);
    expect(await notificationCount(2, 'Part Payment Received', id)).toBe(1);
  });

  describe('refused amounts leave the bill unchanged', () => {
    const id = 'INV-TEST-PP-NEG';
    beforeAll(() => addBill(id, { paid: 600 })); // balance 900

    it.each([
      ['zero', 0],
      ['negative', -5],
      ['non-numeric', 'abc'],
      ['three decimals', 100.005],
      ['one cent above the balance', 900.01],
    ])('%s → 422', async (_label, amount) => {
      const res = await desk(id, amount);
      expect(res.status).toBe(422);
      expect(await bill(id)).toMatchObject({ status: 'scheduled', paid: 600 });
      expect(await ledger(id)).toEqual([600]);
    });

    it('a short amount without the partial flag is still refused', async () => {
      for (const partial of [false, 'true']) {
        const res = await desk(id, 500, { partial });
        expect(res.status).toBe(422);
      }
      expect(await bill(id)).toMatchObject({ status: 'scheduled', paid: 600 });
    });
  });

  it('a combined or advance payment is paid in full only', async () => {
    await addBill('INV-TEST-PP-GRP', { group: 'BND-TESTPP000001' });
    await addBill('INV-TEST-PP-ADV', { advance: 2 });
    for (const key of ['BND-TESTPP000001', 'INV-TEST-PP-GRP', 'INV-TEST-PP-ADV']) {
      const res = await desk(key, 500);
      expect(res.status, key).toBe(422);
      expect(res.body.message).toMatch(/paid in full/);
    }
    expect((await bill('INV-TEST-PP-GRP')).paid).toBe(0);
    expect((await bill('INV-TEST-PP-ADV')).paid).toBe(0);
  });

  it('stale: a part after the bill was settled elsewhere is refused', async () => {
    const id = 'INV-TEST-PP-STALE';
    await addBill(id);
    expect((await desk(id, 1500, { partial: false })).status).toBe(200);
    const res = await desk(id, 500);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
    expect(await bill(id)).toMatchObject({ status: 'paid', paid: 1500 });
    expect(await ledger(id)).toEqual([1500]);
  });

  it('a part waiting on the row lock re-reads the balance and is refused', async () => {
    // Another request holds the invoice (FOR UPDATE) and records 1000; the
    // desk's 1000 arrives meanwhile and must see the new balance (500).
    const id = 'INV-TEST-PP-LOCK';
    await addBill(id);
    const other = await mysql.createConnection(DB);
    try {
      await other.beginTransaction();
      await other.query('SELECT id FROM invoices WHERE id = ? FOR UPDATE', [id]);
      await other.query('UPDATE invoices SET amount_paid = 1000 WHERE id = ?', [id]);
      await other.query("INSERT INTO payment_transactions (invoice_id, amount, payment_method) VALUES (?, 1000, 'cash')", [id]);
      const waiting = desk(id, 1000);
      await sleep(700);
      await other.commit();
      const res = await waiting;
      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/more than the balance/);
    } finally {
      await other.end();
    }
    expect((await bill(id)).paid).toBe(1000);
    expect(await ledger(id)).toEqual([1000]);
  });

  it('double submit: two parts whose sum exceeds the balance → exactly one is recorded', async () => {
    const id = 'INV-TEST-PP-DOUBLE';
    await addBill(id);
    // The first part puts the bill back to 'pending', so the second meets the
    // desk gate (409); the lock test above covers the 422 balance re-check.
    const results = await Promise.all([desk(id, 1000), desk(id, 1000)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const after = await bill(id);
    expect(after.paid).toBe(1000);
    expect(after.paid).toBeLessThanOrEqual(after.total);
    expect(await ledger(id)).toEqual([1000]);
  });
});

describe('tenant-declared parts (upload_payment_proof.php / submit_split_payment.php)', () => {
  const id = 'INV-TEST-PP-PROOF';
  beforeAll(() => addBill(id, { status: 'pending' }));

  it.each([
    ['zero', 0, 422],
    ['non-numeric', 'abc', 422],
    ['above the balance', 1500.01, 422],
  ])('refuses an amount that is %s', async (_label, amount, code) => {
    const res = await uploadProof(maria, id, amount);
    expect(res.status).toBe(code);
    expect(await bill(id)).toMatchObject({ status: 'pending', proof: null });
  });

  it("refuses a part on another tenant's invoice", async () => {
    const res = await uploadProof(jose, id, 500);
    expect(res.status).toBe(409);
    expect(await bill(id)).toMatchObject({ status: 'pending', proof: null });
  });

  it('the admin confirms the declared part as a part, and only that amount', async () => {
    let res = await uploadProof(maria, id, 500);
    expect(res.status).toBe(200);
    expect(await bill(id)).toMatchObject({ status: 'pending-verification', proof: 500 });

    res = await desk(id, 700, { method: 'gcash', ref: GCASH_REF, partial: false });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/declared a part/);

    res = await desk(id, 500, { method: 'gcash', ref: GCASH_REF, partial: false });
    expect(res.status).toBe(200);
    expect(res.body.partial).toBe(true);
    expect(await bill(id)).toMatchObject({ status: 'pending', paid: 500, proof: null });
    expect(await ledger(id)).toEqual([500]);
  });

  it('rejecting a later proof keeps the part already recorded', async () => {
    expect((await uploadProof(maria, id, 300)).status).toBe(200);
    expect((await bill(id)).proof).toBe(300);
    const res = await api('reject_payment_proof.php', { token: admin, json: { invoiceId: id, reason: 'The receipt is unreadable.' } });
    expect(res.status).toBe(200);
    expect(await bill(id)).toMatchObject({ status: 'pending', paid: 500, proof: null });
    expect(await ledger(id)).toEqual([500]);
  });

  it('a split submission can pay a part, confirmed with the same portions', async () => {
    const form = new FormData();
    form.append('invoice_id', id);
    form.append('amount', '400');
    form.append('scheduled_date', dayFromNow(3));
    form.append('scheduled_time_slot', 'morning');
    form.append('parts', JSON.stringify([{ method: 'cash', amount: 100 }, { method: 'gcash', amount: 300, reference_number: GCASH_REF }]));
    form.append('proof_1', new Blob([PNG], { type: 'image/png' }), 'proof1.png');
    let res = await api('submit_split_payment.php', { token: maria, form });
    expect(res.status).toBe(200);
    expect(await bill(id)).toMatchObject({ status: 'pending-verification', proof: 400 });

    res = await desk(id, null, { partial: false, payments: [{ method: 'cash', amount: 100 }, { method: 'gcash', amount: 300, reference_number: GCASH_REF }] });
    expect(res.status).toBe(200);
    expect(await bill(id)).toMatchObject({ status: 'pending', paid: 900, proof: null });
    expect(await ledger(id)).toEqual([500, 100, 300]);
  });

  it('split portions must add up to the stated amount', async () => {
    const form = new FormData();
    form.append('invoice_id', id);
    form.append('amount', '200');
    form.append('scheduled_date', dayFromNow(3));
    form.append('scheduled_time_slot', 'morning');
    form.append('parts', JSON.stringify([{ method: 'cash', amount: 100 }, { method: 'gcash', amount: 300, reference_number: GCASH_REF }]));
    form.append('proof_1', new Blob([PNG], { type: 'image/png' }), 'proof1.png');
    const res = await api('submit_split_payment.php', { token: maria, form });
    expect(res.status).toBe(422);
    expect(await bill(id)).toMatchObject({ status: 'pending', paid: 900 });
  });
});

describe('move-in invoice paid in parts (Lita, app 5)', () => {
  const id = 'INV-202609-7'; // total 8000 (4000 rent + 4000 deposit)
  let lita;
  const schedule = () => {
    const form = new FormData();
    form.append('id', '5');
    form.append('move_in_date', dayFromNow(7));
    return api('schedule_move_in.php', { token: admin, form });
  };
  const moveInCues = async () => (await one("SELECT COUNT(*) AS c FROM notifications WHERE title = 'Move-In Payment Received' AND message LIKE ?", [`%${id}%`])).c;

  beforeAll(async () => {
    // Back to "approved, move-in bill not paid yet": the seed has it paid.
    await q("UPDATE invoices SET status = 'scheduled', amount_paid = 0, paid_at = NULL, due_date = CURDATE() + INTERVAL 3 DAY WHERE id = ?", [id]);
    await q('DELETE FROM payment_transactions WHERE invoice_id = ?', [id]);
    await q("UPDATE lease_contracts SET deposit_status = 'Pending' WHERE rent_application_id = 5");
    await q('UPDATE rent_applications SET move_in_date = NULL, move_in_notified_at = NULL WHERE id = 5');
    lita = await login('lita.ramos@demo.example', 'tenant123');
  });

  it('a part does not pass the move-in gate', async () => {
    const res = await desk(id, 3000);
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(5000);
    expect((await one('SELECT deposit_status FROM lease_contracts WHERE rent_application_id = 5')).deposit_status).toBe('Pending');
    expect(await moveInCues()).toBe(0);
    expect((await schedule()).status).toBe(409);
  });

  it('the payment-window sweep keeps a part-paid application', async () => {
    await q("UPDATE invoices SET status = 'overdue', due_date = CURDATE() - INTERVAL 5 DAY WHERE id = ?", [id]);
    // A stale checkout the same sweep releases: proof that it ran.
    await q(`INSERT INTO invoices (id, user_id, rent_application_id, services, total_amount, billing_period, status, due_date, processing_since)
             VALUES ('INV-TEST-PP-SWEEP', 2, 1, 100, 100, 'Test bill', 'processing', CURDATE() + INTERVAL 5 DAY, NOW() - INTERVAL 30 DAY)`);
    await setSetting('poll_checks_last_run', 0);
    expect((await api('get_notifications.php', { token: admin })).status).toBe(200);
    for (let i = 0; i < 40 && (await bill('INV-TEST-PP-SWEEP')).status === 'processing'; i++) await sleep(250);
    expect((await bill('INV-TEST-PP-SWEEP')).status).toBe('pending');
    await api('get_rooms.php', { token: admin }); // php -S is single-threaded: the sweep has finished once this returns

    expect((await one('SELECT status FROM rent_applications WHERE id = 5')).status).toBe('Approved');
    expect(await bill(id)).toMatchObject({ status: 'overdue', paid: 3000 });
  });

  it('the applicant sees the balance, and cannot cancel while a part is paid', async () => {
    const room = await api('my_room.php', { token: lita });
    expect(room.status).toBe(200);
    const data = room.body.data ?? room.body;
    expect(data).toMatchObject({ has_pending_first_payment: true, pending_invoice_id: id, pending_amount_paid: 3000, pending_balance: 5000 });

    const res = await api('cancel_application.php', { token: lita, json: { id: 5, reason: 'Changed plans' } });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already paid ₱3,000\.00/);
    expect((await one('SELECT status FROM rent_applications WHERE id = 5')).status).toBe('Approved');
    expect((await bill(id)).status).toBe('overdue');
  });

  it('the final part settles it: deposit Held, one move-in cue, move-in can be scheduled', async () => {
    await bookVisit(id);
    const res = await desk(id, 5000);
    expect(res.status).toBe(200);
    expect(await bill(id)).toMatchObject({ status: 'paid', paid: 8000 });
    expect(await ledger(id)).toEqual([3000, 5000]);
    expect((await one('SELECT deposit_status FROM lease_contracts WHERE rent_application_id = 5')).deposit_status).toBe('Held');
    expect(await moveInCues()).toBe(1);
    expect(await notificationCount(7, 'Payment Received', id)).toBe(1);
    expect((await schedule()).status).toBe(200);
  });
});

describe('adjust_invoice.php keeps the total above what was paid', () => {
  const id = 'INV-TEST-PP-ADJ';
  beforeAll(() => addBill(id, { status: 'pending', paid: 600 }));

  it.each([500, 600])('a new total of %d (≤ ₱600 paid) → 422', async (baseRent) => {
    const res = await api('adjust_invoice.php', { token: admin, json: { invoiceId: id, baseRent, reason: 'Corrected the rent' } });
    expect(res.status).toBe(422);
    expect((await bill(id)).total).toBe(1500);
  });

  it('a new total just above it is accepted', async () => {
    const res = await api('adjust_invoice.php', { token: admin, json: { invoiceId: id, baseRent: 600.01, reason: 'Corrected the rent' } });
    expect(res.status).toBe(200);
    expect(await bill(id)).toMatchObject({ total: 600.01, paid: 600 });
  });
});

describe('get_invoices.php', () => {
  beforeAll(async () => {
    await addBill('INV-TEST-PP-GI', { status: 'pending', paid: 400 });
    await addBill('INV-TEST-PP-GIPAID', { status: 'paid', paid: 1500 });
  });

  it('returns amount_paid, balance, proof_amount and the parts', async () => {
    const res = await api('get_invoices.php', { token: maria, query: { userId: 2 } });
    expect(res.status).toBe(200);
    const open = res.body.invoices.find((i) => i.id === 'INV-TEST-PP-GI');
    expect(open).toMatchObject({ amount_paid: 400, balance: 1100, proof_amount: null });
    expect(open.payment_transactions.map((t) => Number(t.amount))).toEqual([400]);
    const paid = res.body.invoices.find((i) => i.id === 'INV-TEST-PP-GIPAID');
    expect(paid).toMatchObject({ amount_paid: 1500, balance: 0 });
  });

  it('the admin list costs the same number of queries with more part-paid bills', async () => {
    const questions = async () => Number((await one("SHOW GLOBAL STATUS LIKE 'Questions'")).Value);
    const cost = async () => {
      const before = await questions();
      expect((await api('get_invoices.php', { token: admin })).status).toBe(200);
      return (await questions()) - before;
    };
    await cost(); // warm-up: the once-a-minute billing checks run here
    const base = await cost();
    for (let n = 0; n < 3; n++) await addBill(`INV-TEST-PP-QC${n}`, { status: 'pending', paid: 100 });
    expect(await cost()).toBe(base);
  });
});

describe('combined payment with a part-paid bill (bundle_payment.php)', () => {
  const id = 'INV-TEST-PP-BND';

  it('totals and settles balances, not full totals', async () => {
    const joseApp = (await one('SELECT id FROM rent_applications WHERE user_id = 3 ORDER BY id DESC LIMIT 1')).id;
    await addBill(id, { userId: 3, appId: joseApp, status: 'overdue', dueDays: -10, paid: 500 });

    const res = await api('bundle_payment.php', { token: jose, json: { action: 'create' } });
    expect(res.status).toBe(200);
    const key = res.body.key;
    const rows = await q('SELECT id, total_amount, amount_paid FROM invoices WHERE payment_group = ?', [key]);
    expect(rows.map((r) => r.id)).toContain(id);
    const owed = Math.round(rows.reduce((s, r) => s + (Number(r.total_amount) - Number(r.amount_paid)) * 100, 0)) / 100;
    expect(res.body.total).toBe(owed);
    expect(res.body.invoices.find((i) => i.id === id).amount).toBe(1000);

    await q("UPDATE invoices SET status = 'scheduled' WHERE payment_group = ?", [key]); // the tenant booked a visit
    const paid = await desk(key, owed, { partial: false });
    expect(paid.status).toBe(200);
    for (const r of await q('SELECT status, total_amount, amount_paid FROM invoices WHERE payment_group = ?', [key])) {
      expect(r.status).toBe('paid');
      expect(Number(r.amount_paid)).toBe(Number(r.total_amount));
    }
    expect(await ledger(id)).toEqual([500, 1000]);
  });
});

describe('dashboard monthly revenue counts each part when received', () => {
  const revenue = async () => {
    const res = await api('dashboard_stats.php', { token: admin });
    expect(res.status).toBe(200);
    return { cur: Number(res.body.stats.total_revenue), last: Number(res.body.stats.last_month_revenue) };
  };
  const lastMonth = "NOW() - INTERVAL 1 MONTH";

  it('a part on an open bill counts now; the deposit share is left out', async () => {
    const before = await revenue();
    // 8000 bill with 4000 deposit: a 2000 part is 1000 rent, 1000 deposit.
    await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, security_deposit, total_amount, amount_paid, billing_period, status, due_date)
             VALUES ('INV-TEST-PP-REV1', 2, 1, 4000, 4000, 8000, 2000, 'Test bill', 'pending', CURDATE() + INTERVAL 5 DAY)`);
    await q("INSERT INTO payment_transactions (invoice_id, amount, payment_method) VALUES ('INV-TEST-PP-REV1', 2000, 'cash')");
    const after = await revenue();
    expect(after.cur - before.cur).toBe(1000);
    expect(after.last).toBe(before.last);
  });

  it('a bill paid in two months splits across them and adds up to total minus deposit', async () => {
    const before = await revenue();
    await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date, paid_at)
             VALUES ('INV-TEST-PP-REV2', 2, 1, 1500, 1500, 1500, 'Test bill', 'paid', CURDATE() + INTERVAL 5 DAY, NOW())`);
    await q(`INSERT INTO payment_transactions (invoice_id, amount, payment_method, created_at) VALUES ('INV-TEST-PP-REV2', 600, 'cash', ${lastMonth}), ('INV-TEST-PP-REV2', 900, 'cash', NOW())`);
    const after = await revenue();
    expect(after.last - before.last).toBe(600);
    expect(after.cur - before.cur).toBe(900);
  });

  it('a paid bill without part rows still counts whole in the month it was paid', async () => {
    const before = await revenue();
    await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date, paid_at)
             VALUES ('INV-TEST-PP-REV3', 2, 1, 700, 700, 700, 'Test bill', 'paid', CURDATE() + INTERVAL 5 DAY, NOW())`);
    const after = await revenue();
    expect(after.cur - before.cur).toBe(700);
  });
});
