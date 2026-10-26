// Billing disputes (manager interview Q13): every invoice adjustment
// (adjust_invoice.php) needs a reason and keeps a before/after record in
// invoice_adjustments. The tenant's notice quotes the reason; the history is
// returned by get_invoices.php to admins only.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria;

async function addBill(id, { status = 'pending', rent = 1500, water = 0, dueDays = 5 } = {}) {
  await q(
    `INSERT INTO invoices (id, user_id, rent_application_id, base_rent, water, total_amount, billing_period, status, due_date)
     VALUES (?, 2, 1, ?, ?, ?, 'Test bill', ?, CURDATE() + INTERVAL ? DAY)`,
    [id, rent, water, rent + water, status, dueDays],
  );
}
const adjust = (json, token = admin) => api('adjust_invoice.php', { token, json });
const total = async (id) => Number((await one('SELECT total_amount FROM invoices WHERE id = ?', [id])).total_amount);
const history = (id) => q('SELECT admin_id, reason, old_total, new_total, changes FROM invoice_adjustments WHERE invoice_id = ? ORDER BY id', [id]);
const dayFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

describe('the reason is required (5-255 characters)', () => {
  const id = 'INV-TEST-ADJ-REASON';
  beforeAll(() => addBill(id));

  it.each([
    ['missing', undefined],
    ['blank', '    '],
    ['too short', 'abcd'],
    ['too long', 'x'.repeat(256)],
    ['not a string', 12345],
  ])('%s → 422, nothing written', async (_label, reason) => {
    const res = await adjust({ invoiceId: id, baseRent: 1400, ...(reason !== undefined ? { reason } : {}) });
    expect(res.status).toBe(422);
    expect(res.body.errors?.reason).toBeTruthy();
    expect(await total(id)).toBe(1500);
    expect(await history(id)).toHaveLength(0);
  });

  it('exactly 5 characters (after trimming) is accepted', async () => {
    const res = await adjust({ invoiceId: id, baseRent: 1400, reason: '  Typo.  ' });
    expect(res.status).toBe(200);
    const rows = await history(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('Typo.');
  });
});

describe('a successful adjustment', () => {
  const id = 'INV-TEST-ADJ-OK';
  beforeAll(() => addBill(id, { rent: 1500, water: 300 }));

  it('writes one history row with the changed lines and totals', async () => {
    const due = dayFromNow(10);
    const res = await adjust({ invoiceId: id, baseRent: 1500, water: 150, dueDate: due, reason: 'Water was billed twice' });
    expect(res.status).toBe(200);
    expect(await total(id)).toBe(1650);

    const rows = await history(id);
    expect(rows).toHaveLength(1);
    const adminId = (await one("SELECT id FROM users WHERE email_address = 'admin@gmail.com'")).id;
    expect(rows[0]).toMatchObject({ admin_id: adminId, reason: 'Water was billed twice' });
    expect(Number(rows[0].old_total)).toBe(1800);
    expect(Number(rows[0].new_total)).toBe(1650);
    // Only the lines that changed; base rent was sent unchanged.
    const changes = JSON.parse(rows[0].changes);
    expect(changes).toEqual({ water: [300, 150], due_date: [expect.any(String), due] });
  });

  it("the tenant's notice quotes the reason", async () => {
    const n = await one("SELECT message FROM notifications WHERE user_id = 2 AND title = 'Invoice Adjusted' AND message LIKE ? ORDER BY id DESC LIMIT 1", [`%${id}%`]);
    expect(n.message).toBe(`Invoice ${id} was adjusted: Water was billed twice. New total: ₱1,650.00.`);
  });

  it('the activity log carries the reason', async () => {
    const log = await one("SELECT details FROM activity_logs WHERE action = 'Adjusted Invoice' AND details LIKE ? ORDER BY id DESC LIMIT 1", [`%${id}%`]);
    expect(log.details).toMatch(/Reason: Water was billed twice/);
  });

  it('nothing changed → 422, no history row', async () => {
    const res = await adjust({ invoiceId: id, baseRent: 1500, water: 150, reason: 'Saving again' });
    expect(res.status).toBe(422);
    expect(await history(id)).toHaveLength(1);
  });

  it('two identical adjustments sent at once → one history row', async () => {
    const body = { invoiceId: id, water: 100, reason: 'Corrected to the provider bill' };
    const results = await Promise.all([adjust(body), adjust(body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    expect(await total(id)).toBe(1600);
    expect(await history(id)).toHaveLength(2);
  });
});

describe('refused adjustments write no history', () => {
  it('an invoice under verification (stale view) → 409, no row', async () => {
    const id = 'INV-TEST-ADJ-STALE';
    await addBill(id, { status: 'pending-verification' });
    const res = await adjust({ invoiceId: id, baseRent: 1000, reason: 'Discount agreed with tenant' });
    expect(res.status).toBe(409);
    expect(await total(id)).toBe(1500);
    expect(await history(id)).toHaveLength(0);
  });

  it('a tenant cannot adjust → 403, no row', async () => {
    const id = 'INV-TEST-ADJ-TENANT';
    await addBill(id);
    const res = await adjust({ invoiceId: id, baseRent: 1, reason: 'I would like a discount' }, maria);
    expect(res.status).toBe(403);
    expect(await history(id)).toHaveLength(0);
  });
});

describe('get_invoices.php returns the history to admins only', () => {
  const id = 'INV-TEST-ADJ-LIST';
  beforeAll(async () => {
    await addBill(id);
    expect((await adjust({ invoiceId: id, baseRent: 1200, reason: 'Rent promo for October' })).status).toBe(200);
  });

  it('admin list and admin per-tenant view include adjustments[]', async () => {
    for (const query of [undefined, { userId: '2' }]) {
      const res = await api('get_invoices.php', { token: admin, query });
      expect(res.status).toBe(200);
      const inv = res.body.invoices.find((i) => i.id === id);
      expect(inv.adjustments).toHaveLength(1);
      expect(inv.adjustments[0]).toMatchObject({ reason: 'Rent promo for October', old_total: 1500, new_total: 1200, changes: { base_rent: [1500, 1200] } });
      expect(inv.adjustments[0].admin).toBeTruthy();
    }
  });

  it('the tenant never receives adjustments or reference_reuse', async () => {
    const res = await api('get_invoices.php', { token: maria, query: { userId: '2' } });
    expect(res.status).toBe(200);
    const inv = res.body.invoices.find((i) => i.id === id);
    expect(inv).toBeTruthy();
    expect(inv).not.toHaveProperty('adjustments');
    expect(inv).not.toHaveProperty('reference_reuse');
  });
});
