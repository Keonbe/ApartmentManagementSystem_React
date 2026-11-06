// create_invoice.php, create_refund_request.php, respond_refund_request.php.
// QA guide rows Q3-07, Q3-09, Q3-10.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, login } from './lib/api.js';
import { q, one } from './lib/db.js';
import { addInvoice } from './lib/fixtures.js';

const HASH = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy'; // tenant123
const NO_RENT = 'no.rental@demo.example';
const MARIA = 2;
const JOSE = 3;

let admin, maria, jose, noRent;
const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

beforeAll(async () => {
  admin = await loginAs('admin');
  maria = await loginAs('maria');
  jose = await loginAs('jose');
  await q(`INSERT INTO users (id, first_name, last_name, contact_no, gender, email_address, password, role, email_verified_at)
           VALUES (121, 'Nora', 'Norental', '+63 9171234121', 'Female', ?, ?, 'user', NOW())`, [NO_RENT, HASH]);
  noRent = await login(NO_RENT, 'tenant123');
});

describe('create_invoice.php', () => {
  const create = (token, body) => api('create_invoice.php', { token, json: body });
  const base = (over = {}) => ({ userId: MARIA, baseRent: 5000, water: 100, electricity: 250, parking: 0, lateFee: 0, billingPeriod: 'June 2031', dueDate: day(20), ...over });

  it('needs an admin session', async () => {
    expect((await create(undefined, base())).status).toBe(401);
    expect((await create(maria, base())).status).toBe(403);
    expect(await one("SELECT id FROM invoices WHERE billing_period = 'June 2031'")).toBeNull();
  });

  it('issues a pending invoice, totals the parts, notifies the tenant and logs it', async () => {
    const res = await create(admin, base());
    expect(res.status).toBe(200);
    expect(res.body.total_amount).toBe(5350);
    const row = await one('SELECT user_id, status, total_amount, base_rent, rent_application_id FROM invoices WHERE id = ?', [res.body.invoice_id]);
    expect(row.user_id).toBe(MARIA);
    expect(row.status).toBe('pending');
    expect(Number(row.total_amount)).toBe(5350);
    expect(row.rent_application_id).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND title LIKE 'New Invoice Issued%' AND message LIKE '%June 2031%'", [MARIA])).n).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Created Invoice' AND details LIKE ?", [`%${res.body.invoice_id}%`])).n).toBe(1);
  });

  it('refuses a second rent invoice for the same tenant and period, but allows a utility-only one', async () => {
    expect((await create(admin, base())).status).toBe(409);
    const utilityOnly = await create(admin, base({ baseRent: 0, water: 80, electricity: 0 }));
    expect(utilityOnly.status).toBe(200);
  });

  it('refuses a reused invoice number', async () => {
    const first = await create(admin, base({ billingPeriod: 'July 2031', invoiceNumber: 'INV-QA-0001' }));
    expect(first.status).toBe(200);
    const second = await create(admin, base({ billingPeriod: 'August 2031', invoiceNumber: 'INV-QA-0001' }));
    expect(second.status).toBe(409);
    expect((await one("SELECT COUNT(*) AS n FROM invoices WHERE id = 'INV-QA-0001'")).n).toBe(1);
  });

  it.each([
    ['negative amount', { water: -1 }],
    ['non-numeric amount', { electricity: 'abc' }],
    ['past due date', { dueDate: day(-1) }],
    ['impossible due date', { dueDate: '2031-02-30' }],
    ['wrong due date format', { dueDate: '12/31/2031' }],
    ['free-text billing period', { billingPeriod: '2031-9' }],
    ['lowercase billing period', { billingPeriod: 'september 2031' }],
  ])('rejects %s with 422 and saves nothing', async (_name, over) => {
    const before = (await one('SELECT COUNT(*) AS n FROM invoices')).n;
    const res = await create(admin, base({ billingPeriod: 'October 2031', ...over }));
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect((await one('SELECT COUNT(*) AS n FROM invoices')).n).toBe(before);
  });

  it('needs a tenant with an active rental, and an application that matches it', async () => {
    expect((await create(admin, base({ billingPeriod: 'November 2031', userId: undefined, unit: '' }))).status).toBe(422);
    expect((await create(admin, base({ billingPeriod: 'November 2031', userId: 121 }))).status).toBe(422); // no rental
    expect((await create(admin, base({ billingPeriod: 'November 2031', appId: 999 }))).status).toBe(422); // wrong app
  });

  it('keeps cents when the amount has more than two decimals', async () => {
    const res = await create(admin, base({ billingPeriod: 'December 2031', baseRent: 10.005, water: 0, electricity: 0 }));
    expect(res.status).toBe(200);
    const stored = Number((await one('SELECT total_amount FROM invoices WHERE id = ?', [res.body.invoice_id])).total_amount);
    expect(Math.abs(stored - 10.005)).toBeLessThanOrEqual(0.005 + 1e-9); // 10.00 or 10.01, never off by more
  });

  it('treats a zero-value invoice as valid input', async () => {
    const res = await create(admin, base({ billingPeriod: 'January 2032', baseRent: 0, water: 0, electricity: 0 }));
    expect([200, 422]).toContain(res.status); // documented either way; must not be a 500
  });
});

describe('create_refund_request.php', () => {
  const raise = (token, body) => api('create_refund_request.php', { token, json: body });
  const REASON = 'Moving out early, please return the prepaid month.';
  let seq = 0;
  const credit = async (userId, amount, periodStart) => {
    const inv = `ADV-QA-${++seq}`;
    await addInvoice(inv, { userId, appId: userId === MARIA ? 1 : 2, amount, status: 'paid' });
    await q("INSERT INTO advance_credits (advance_invoice_id, user_id, period_start, amount, status) VALUES (?, ?, ?, ?, 'available')", [inv, userId, periodStart, amount]);
  };

  it('needs a session and the POST method', async () => {
    expect((await raise(undefined, { type: 'advance', amount: 1, reason: REASON })).status).toBe(401);
    expect((await api('create_refund_request.php', { token: maria, method: 'GET' })).status).toBe(405);
  });

  it.each([
    ['unknown type', { type: 'cash', amount: 100, reason: REASON }],
    ['blank reason', { type: 'advance', amount: 100, reason: '   ' }],
    ['reason over 1000 characters', { type: 'advance', amount: 100, reason: 'x'.repeat(1001) }],
    ['zero amount', { type: 'advance', amount: 0, reason: REASON }],
    ['negative amount', { type: 'advance', amount: -50, reason: REASON }],
    ['overpayment without a bill', { type: 'overpayment', amount: 100, reason: REASON }],
  ])('rejects %s with 400', async (_n, body) => {
    expect((await raise(maria, body)).status).toBe(400);
  });

  it('says there is nothing to refund when no credit exists (422)', async () => {
    const res = await raise(jose, { type: 'advance', amount: 100, reason: REASON });
    expect(res.status).toBe(422);
    expect((await one('SELECT COUNT(*) AS n FROM refund_requests WHERE user_id = ?', [JOSE])).n).toBe(0);
  });

  it('holds the credit for a whole-month request and stops a second claim on the same money', async () => {
    await credit(MARIA, 4000, day(60));
    const tooMuch = await raise(maria, { type: 'advance', amount: 4000.01, reason: REASON });
    expect(tooMuch.status).toBe(422);
    const partial = await raise(maria, { type: 'advance', amount: 1500, reason: REASON });
    expect(partial.status).toBe(409); // whole months only
    expect((await one("SELECT COUNT(*) AS n FROM refund_requests WHERE user_id = ? AND status = 'Pending Review'", [MARIA])).n).toBe(0);

    const ok = await raise(maria, { type: 'advance', amount: 4000, reason: REASON });
    expect(ok.status).toBe(200);
    const held = await one('SELECT refund_request_id FROM advance_credits WHERE user_id = ? AND period_start = ?', [MARIA, day(60)]);
    expect(held.refund_request_id).toBe(ok.body.id);
    expect((await one('SELECT status, amount, raised_by_role FROM refund_requests WHERE id = ?', [ok.body.id]))).toMatchObject({ status: 'Pending Review', raised_by_role: 'user' });

    const again = await raise(maria, { type: 'advance', amount: 4000, reason: REASON });
    expect(again.status).toBe(422); // already held by the first request
  });

  it('lets an admin raise one for a named tenant, and checks that tenant exists', async () => {
    expect((await raise(admin, { type: 'advance', amount: 100, reason: REASON })).status).toBe(400); // no tenant named
    expect((await raise(admin, { user_id: 9999, type: 'advance', amount: 100, reason: REASON })).status).toBe(404);
    await credit(JOSE, 3000, day(90));
    const res = await raise(admin, { user_id: JOSE, type: 'advance', amount: 3000, reason: REASON });
    expect(res.status).toBe(200);
    expect((await one('SELECT user_id, raised_by_role FROM refund_requests WHERE id = ?', [res.body.id]))).toMatchObject({ user_id: JOSE, raised_by_role: 'admin' });
  });

  it('ignores a user_id sent by a tenant (identity comes from the session)', async () => {
    await credit(MARIA, 2000, day(120));
    const res = await raise(maria, { user_id: JOSE, type: 'advance', amount: 2000, reason: REASON });
    expect(res.status).toBe(200);
    expect((await one('SELECT user_id FROM refund_requests WHERE id = ?', [res.body.id])).user_id).toBe(MARIA);
  });

  it('stores unicode and markup in the reason as plain text', async () => {
    await credit(MARIA, 1000, day(150));
    const reason = "Zoë 李 😀 O'Brien <img src=x onerror=alert(1)>";
    const res = await raise(maria, { type: 'advance', amount: 1000, reason });
    expect(res.status).toBe(200);
    expect((await one('SELECT reason FROM refund_requests WHERE id = ?', [res.body.id])).reason).toBe(reason);
  });
});

describe('respond_refund_request.php', () => {
  const respond = (token, body) => api('respond_refund_request.php', { token, json: body });
  const addRequest = async (userId, status = 'Pending Review', credit = false) => {
    const res = await q("INSERT INTO refund_requests (user_id, type, amount, reason, status) VALUES (?, 'advance', 1200, 'test', ?)", [userId, status]);
    const id = res.insertId;
    if (credit) {
      const inv = `ADV-RESP-${id}`;
      await addInvoice(inv, { userId, appId: userId === MARIA ? 1 : 2, amount: 1200, status: 'paid' });
      await q("INSERT INTO advance_credits (advance_invoice_id, user_id, period_start, amount, status, refund_request_id) VALUES (?, ?, ?, 1200, 'available', ?)", [inv, userId, day(200 + id), id]);
    }
    return id;
  };
  const status = async (id) => (await one('SELECT status FROM refund_requests WHERE id = ?', [id])).status;

  it('needs a session, a known action and the right owner', async () => {
    const id = await addRequest(MARIA);
    expect((await respond(undefined, { id, action: 'cancel' })).status).toBe(401);
    expect((await respond(maria, { id, action: 'approve' })).status).toBe(400);
    expect((await respond(maria, { id: 99999, action: 'cancel' })).status).toBe(404);
    expect((await respond(jose, { id, action: 'cancel' })).status).toBe(404); // someone else's request
    expect(await status(id)).toBe('Pending Review');
  });

  it('cancels, frees the held credit, and cannot cancel twice', async () => {
    const id = await addRequest(MARIA, 'Pending Review', true);
    const res = await respond(maria, { id, action: 'cancel' });
    expect(res.body.status).toBe('Cancelled');
    expect(await status(id)).toBe('Cancelled');
    expect((await one('SELECT refund_request_id FROM advance_credits WHERE advance_invoice_id = ?', [`ADV-RESP-${id}`])).refund_request_id).toBeNull();
    expect((await respond(maria, { id, action: 'cancel' })).status).toBe(409);
    expect((await one('SELECT COUNT(*) AS n FROM refund_request_events WHERE refund_request_id = ?', [id])).n).toBe(1);
  });

  it('only accepts a reply when a question is waiting, and validates the message', async () => {
    const pending = await addRequest(MARIA, 'Pending Review');
    expect((await respond(maria, { id: pending, action: 'reply', message: 'hello' })).status).toBe(409);

    const asked = await addRequest(MARIA, 'Info Requested');
    expect((await respond(maria, { id: asked, action: 'reply', message: '   ' })).status).toBe(400);
    expect((await respond(maria, { id: asked, action: 'reply', message: 'x'.repeat(1001) })).status).toBe(400);
    const ok = await respond(maria, { id: asked, action: 'reply', message: 'Zoë 李 😀 here is my GCash proof' });
    expect(ok.body.status).toBe('Pending Review');
    expect(await status(asked)).toBe('Pending Review');
    expect((await respond(maria, { id: asked, action: 'reply', message: 'again' })).status).toBe(409); // no question left
  });

  it('cannot change a request that is already decided', async () => {
    for (const final of ['Rejected', 'Refunded', 'Approved']) {
      const id = await addRequest(MARIA, final);
      expect((await respond(maria, { id, action: 'cancel' })).status).toBe(409);
      expect(await status(id)).toBe(final);
    }
  });

  it('two simultaneous cancels settle exactly once', async () => {
    const id = await addRequest(MARIA, 'Pending Review', true);
    const [a, b] = await Promise.all([respond(maria, { id, action: 'cancel' }), respond(maria, { id, action: 'cancel' })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await one('SELECT COUNT(*) AS n FROM refund_request_events WHERE refund_request_id = ?', [id])).n).toBe(1);
  });
});

describe('advance_payment.php', () => {
  const adv = (token, body) => api('advance_payment.php', { token, json: body });
  const preview = (token) => api('advance_payment.php', { token });
  let invoiceId;

  beforeAll(async () => {
    // A running tenancy: active contract with both dates, far from its end.
    await q("UPDATE lease_contracts SET status = 'active', lease_start = DATE_SUB(CURDATE(), INTERVAL 60 DAY), lease_end = DATE_ADD(CURDATE(), INTERVAL 400 DAY) WHERE rent_application_id = 1");
  });

  it('is for signed-in tenants only', async () => {
    expect((await preview(undefined)).status).toBe(401);
    expect((await preview(admin)).status).toBe(403);
    expect((await adv(admin, { action: 'create', months: 1 })).status).toBe(403);
  });

  it('refuses a tenant without an active rental', async () => {
    expect((await adv(noRent, { action: 'create', months: 1 })).status).toBe(403);
  });

  it('previews the prepayable months', async () => {
    const res = await preview(maria);
    expect(res.body.success).toBe(true);
    expect(res.body.months.length).toBeGreaterThan(0);
  });

  it.each([[0], [-1], [1.5], ['abc'], [null], [99]])('rejects months=%s with 422', async (months) => {
    expect((await adv(maria, { action: 'create', months })).status).toBe(422);
    expect((await one("SELECT COUNT(*) AS n FROM invoices WHERE user_id = ? AND advance_months IS NOT NULL", [MARIA])).n).toBe(0);
  });

  it('creates one pending advance invoice with a reserved credit per month, and only one at a time', async () => {
    const res = await adv(maria, { action: 'create', months: 2 });
    expect(res.status).toBe(200);
    invoiceId = res.body.invoice_id;
    const inv = await one('SELECT status, advance_months, total_amount FROM invoices WHERE id = ?', [invoiceId]);
    expect(inv).toMatchObject({ status: 'pending', advance_months: 2 });
    const credits = await q("SELECT status, amount FROM advance_credits WHERE advance_invoice_id = ?", [invoiceId]);
    expect(credits).toHaveLength(2);
    expect(credits.every((c) => c.status === 'reserved')).toBe(true);
    expect(credits.reduce((s, c) => s + Number(c.amount), 0)).toBeCloseTo(Number(inv.total_amount), 2);
    expect((await adv(maria, { action: 'create', months: 1 })).status).toBe(409);
  });

  it('lets only the owner cancel, once, and frees the months', async () => {
    expect((await adv(jose, { action: 'cancel', invoice: invoiceId })).status).toBe(404);
    expect((await adv(maria, { action: 'cancel', invoice: 'INV-NOPE' })).status).toBe(404);
    expect((await one('SELECT status FROM invoices WHERE id = ?', [invoiceId])).status).toBe('pending');

    expect((await adv(maria, { action: 'cancel', invoice: invoiceId })).body.success).toBe(true);
    expect((await one('SELECT status FROM invoices WHERE id = ?', [invoiceId])).status).toBe('cancelled');
    const credits = await q('SELECT status FROM advance_credits WHERE advance_invoice_id = ?', [invoiceId]);
    expect(credits.every((c) => c.status === 'cancelled')).toBe(true);
    expect((await adv(maria, { action: 'cancel', invoice: invoiceId })).status).toBe(409);
    expect((await adv(maria, { action: 'create', months: 1 })).status).toBe(200); // months are available again
  });

  it('rejects a malformed legacy group key', async () => {
    expect((await adv(maria, { action: 'cancel', group: "x'; DROP TABLE invoices;--" })).status).toBe(422);
    expect((await one('SELECT COUNT(*) AS n FROM invoices')).n).toBeGreaterThan(0);
  });

  it('two simultaneous creates leave exactly one open advance invoice', async () => {
    await q("UPDATE invoices SET status = 'cancelled' WHERE user_id = ? AND advance_months IS NOT NULL", [MARIA]);
    await q("UPDATE advance_credits SET status = 'cancelled' WHERE user_id = ?", [MARIA]);
    const [a, b] = await Promise.all([adv(maria, { action: 'create', months: 1 }), adv(maria, { action: 'create', months: 1 })]);
    expect([a.status, b.status].filter((s) => s === 200).length).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM invoices WHERE user_id = ? AND advance_months IS NOT NULL AND status = 'pending'", [MARIA])).n).toBe(1);
  });
});
