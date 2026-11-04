// Add-on services workflow: booking validation, the confirmed visit, tenant-visible
// progress, free cancel vs cancel request, and the final-quantity adjustment at completion.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin;
let maria;
let kgService; // 100/kg, 1-10 kg
let itemService; // 50/item
let sessionService; // 300/session

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function catalog(name, unit, price, min, max) {
  const r = await q(
    "INSERT INTO service_catalog (category, name, price, pricing_unit, min_quantity, max_quantity, lead_time_days, is_active) VALUES ('laundry', ?, ?, ?, ?, ?, 0, 1)",
    [name, price, unit, min, max],
  );
  return r.insertId;
}

function bookForm(serviceId, fields = {}) {
  const form = new FormData();
  form.append('serviceId', String(serviceId));
  form.append('preferredDate', fields.preferredDate ?? day(3));
  form.append('preferredTimeSlot', fields.preferredTimeSlot ?? 'morning');
  form.append('quantity', String(fields.quantity ?? 1));
  if (fields.notes) form.append('notes', fields.notes);
  return form;
}
const book = (serviceId, fields) => api('service_request.php', { token: maria, form: bookForm(serviceId, fields) });

// A booking for Maria (user 2, Unit A) inserted directly, in any state.
async function booking({ status = 'Pending', date = day(5), window = 'morning', unit = 'kg', price = 100, qty = 3, service = kgService, invoiced = 0 } = {}) {
  const r = await q(
    `INSERT INTO service_requests (user_id, service_id, room_name, service_name, category, unit_price, pricing_unit, quantity, total_cost, preferred_date, preferred_time_slot, status, scheduled_date, scheduled_window, is_invoiced)
     VALUES (2, ?, 'A', 'Workflow svc', 'laundry', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [service, price, unit, qty, price * qty, date, window, status, status === 'Approved' || status === 'In Progress' ? date : null, status === 'Approved' || status === 'In Progress' ? window : null, invoiced],
  );
  return r.insertId;
}
const row = (id) => one('SELECT * FROM service_requests WHERE id = ?', [id]);
const update = (id, json) => api('update_service_status.php', { token: admin, json: { id, ...json } });
const cancel = (id, token = maria) => api('cancel_request.php', { token, json: { id, type: 'Service' } });
const lastNotice = () => one("SELECT message FROM notifications WHERE user_id = 2 AND type = 'service_status' ORDER BY id DESC LIMIT 1");
const queueRow = (id) => one("SELECT status FROM notifications WHERE type = 'service_request' AND metadata_value = ? ORDER BY id DESC LIMIT 1", [`service_request:${id}`]);

beforeAll(async () => {
  admin = await loginAs('admin');
  maria = await loginAs('maria');
  kgService = await catalog('Workflow wash', 'kg', 100, 1, 10);
  itemService = await catalog('Workflow item', 'item', 50, 1, 20);
  sessionService = await catalog('Workflow clean', 'session', 300, 1, null);
});
beforeEach(async () => {
  await q("DELETE FROM service_requests WHERE user_id = 2 AND (service_name = 'Workflow svc' OR service_id IN (?, ?, ?))", [kgService, itemService, sessionService]);
});

describe('booking validation', () => {
  it('books, snapshots the price and tells the tenant', async () => {
    const res = await book(kgService, { quantity: 2.5 });
    expect(res.body.success).toBe(true);
    const r = await row(res.body.id);
    expect(Number(r.total_cost)).toBe(250);
    expect(r.status).toBe('Pending');
    expect(String((await lastNotice()).message)).toMatch(/received your "Workflow wash" booking/);
  });

  it('refuses a made-up time slot, a fractional item, a date too far ahead and a duplicate', async () => {
    expect((await book(kgService, { preferredTimeSlot: 'midnight' })).status).toBe(422);
    expect((await book(itemService, { quantity: 2.5 })).status).toBe(422);
    expect((await book(kgService, { preferredDate: day(61) })).status).toBe(422);
    expect((await book(kgService, { preferredDate: day(60) })).body.success).toBe(true);
    const dup = await book(kgService, { preferredDate: day(60) });
    expect(dup.status).toBe(409);
    // a different slot is a different booking
    expect((await book(kgService, { preferredDate: day(60), preferredTimeSlot: 'afternoon' })).body.success).toBe(true);
  });
});

describe('approving and rejecting', () => {
  it('approving without a slot confirms the tenant\'s preference and tells them', async () => {
    const id = (await book(kgService, { preferredDate: day(4), preferredTimeSlot: 'afternoon' })).body.id;
    const ok = await update(id, { status: 'Approved', assignedTo: 'Aling Rosa' });
    expect(ok.body.success).toBe(true);
    const r = await row(id);
    expect(r.scheduled_date).toBe(day(4));
    expect(r.scheduled_window).toBe('afternoon');
    expect(r.assigned_to).toBe('Aling Rosa');
    const msg = String((await lastNotice()).message);
    expect(msg).toMatch(/approved/);
    expect(msg).toMatch(/visit is scheduled.*afternoon/);
    expect(msg).toMatch(/Aling Rosa will handle/);
    expect((await queueRow(id)).status).toBe('Resolved');
  });

  it('can reschedule an approved booking, and validates the slot', async () => {
    const id = await booking({ status: 'Approved' });
    expect((await update(id, { scheduledDate: day(-1), scheduledWindow: 'morning' })).status).toBe(422);
    expect((await update(id, { scheduledDate: day(6), scheduledWindow: 'night' })).status).toBe(422);
    expect((await update(id, { scheduledDate: day(6) })).status).toBe(422);
    const ok = await update(id, { scheduledDate: day(6), scheduledWindow: 'afternoon' });
    expect(ok.body.success).toBe(true);
    expect(String((await lastNotice()).message)).toMatch(/visit is scheduled/);
  });

  it('a reject or cancel needs a reason the tenant can read', async () => {
    const id = await booking();
    expect((await update(id, { status: 'Rejected' })).status).toBe(422);
    const ok = await update(id, { status: 'Rejected', adminNotes: 'Fully booked that week' });
    expect(ok.body.success).toBe(true);
    const mine = await api('get_my_requests.php', { token: maria });
    const found = mine.body.requests.find((x) => x.type === 'Service' && Number(x.id) === id);
    expect(found.rejection_reason).toBe('Fully booked that week');
    expect(String((await lastNotice()).message)).toMatch(/Reason: Fully booked/);
  });

  it('shows the tenant the visit, assignee and note on My Requests', async () => {
    const id = await booking({ status: 'Approved' });
    await update(id, { assignedTo: 'Juan', adminNotes: 'Please leave the clothes by the door' });
    const mine = await api('get_my_requests.php', { token: maria });
    const found = mine.body.requests.find((x) => x.type === 'Service' && Number(x.id) === id);
    expect(found.assigned_to).toBe('Juan');
    expect(found.scheduled_window).toBe('morning');
    expect(found.admin_note).toBe('Please leave the clothes by the door');
    expect(Number(found.can_cancel_free)).toBe(1);
  });

  it('refuses a stale second status change', async () => {
    const id = await booking();
    expect((await update(id, { status: 'Approved' })).body.success).toBe(true);
    expect((await update(id, { status: 'Approved' })).status).toBe(409);
    expect((await update(id, { status: 'Pending' })).status).toBe(409);
  });
});

describe('tenant cancel', () => {
  it('Pending cancels at once and tells both sides', async () => {
    const id = await booking();
    const res = await cancel(id);
    expect(res.body.success).toBe(true);
    expect((await row(id)).status).toBe('Cancelled');
    expect(String((await lastNotice()).message)).toMatch(/has been cancelled/);
  });

  it('Approved with a far visit cancels freely', async () => {
    const id = await booking({ status: 'Approved', date: day(5) });
    const res = await cancel(id);
    expect(res.body.requested).toBeUndefined();
    expect((await row(id)).status).toBe('Cancelled');
  });

  it('Approved within the cutoff, or In Progress, becomes a request; admin cancels or declines', async () => {
    const near = await booking({ status: 'Approved', date: day(0), window: 'morning' });
    const ask = await cancel(near);
    expect(ask.body.requested).toBe(true);
    expect((await row(near)).status).toBe('Approved');
    expect((await row(near)).cancel_requested_at).not.toBeNull();
    expect((await queueRow(near)).status).toBe('Pending');
    expect((await cancel(near)).status).toBe(409); // asking twice

    const declined = await update(near, { declineCancel: true });
    expect(declined.body.success).toBe(true);
    expect((await row(near)).cancel_requested_at).toBeNull();
    expect((await queueRow(near)).status).toBe('Resolved');
    expect((await update(near, { declineCancel: true })).status).toBe(409); // nothing left to decline

    await cancel(near);
    expect((await update(near, { status: 'Cancelled' })).status).toBe(422); // needs a reason
    const done = await update(near, { status: 'Cancelled', adminNotes: 'Agreed with the tenant' });
    expect(done.body.success).toBe(true);
    expect((await row(near)).cancel_requested_at).toBeNull();

    const working = await booking({ status: 'In Progress' });
    expect((await cancel(working)).body.requested).toBe(true);
  });

  it("will not cancel someone else's, a completed or a billed booking", async () => {
    const id = await booking({ status: 'Approved', date: day(5) });
    const jose = await loginAs('jose');
    expect((await cancel(id, jose)).status).toBe(409);
    const done = await booking({ status: 'Completed' });
    expect((await cancel(done)).status).toBe(409);
    const billed = await booking({ status: 'Approved', date: day(5), invoiced: 1 });
    expect((await cancel(billed)).status).toBe(409);
  });
});

describe('final quantity at completion', () => {
  it('recalculates the total from the booked price, keeps the original and tells the tenant', async () => {
    const id = await booking({ status: 'Approved', qty: 3, price: 100 });
    const ok = await update(id, { status: 'Completed', finalQuantity: 4.5 });
    expect(ok.body.success).toBe(true);
    const r = await row(id);
    expect(Number(r.quantity)).toBe(4.5);
    expect(Number(r.total_cost)).toBe(450);
    expect(Number(r.booked_quantity)).toBe(3);
    expect(Number(r.booked_total_cost)).toBe(300);
    expect(Number(r.invoiced_amount)).toBe(450);
    const msg = String((await lastNotice()).message);
    expect(msg).toMatch(/final quantity was 4\.5 \(booked 3\)/);
    expect(msg).toMatch(/₱450\.00/);
  });

  it('an unchanged quantity leaves the booked columns empty', async () => {
    const id = await booking({ status: 'Approved', qty: 3 });
    await update(id, { status: 'Completed', finalQuantity: 3 });
    const r = await row(id);
    expect(r.booked_quantity).toBeNull();
    expect(Number(r.total_cost)).toBe(300);
  });

  it('refuses zero, over the maximum, a fractional item, a changed session and any non-completing save', async () => {
    const kg = await booking({ status: 'Approved' });
    expect((await update(kg, { status: 'Completed', finalQuantity: 0 })).status).toBe(422);
    expect((await update(kg, { status: 'Completed', finalQuantity: 11 })).status).toBe(422);
    expect((await update(kg, { status: 'In Progress', finalQuantity: 2 })).status).toBe(422);
    expect((await row(kg)).status).toBe('Approved');

    const item = await booking({ status: 'Approved', unit: 'item', price: 50, service: itemService });
    expect((await update(item, { status: 'Completed', finalQuantity: 2.5 })).status).toBe(422);
    expect((await update(item, { status: 'Completed', finalQuantity: 4 })).body.success).toBe(true);

    const session = await booking({ status: 'Approved', unit: 'session', price: 300, qty: 1, service: sessionService });
    expect((await update(session, { status: 'Completed', finalQuantity: 2 })).status).toBe(422);
  });

  it('cancelling the completed booking later still reverses the adjusted charge', async () => {
    const id = await booking({ status: 'Approved', qty: 2, price: 100 });
    await update(id, { status: 'Completed', finalQuantity: 5 });
    expect(Number((await row(id)).invoiced_amount)).toBe(500);
    const res = await update(id, { status: 'Cancelled', adminNotes: 'Charged in error' });
    expect(res.body.success).toBe(true);
    expect((await row(id)).is_invoiced).toBe(0);
  });
});

describe('per-slot capacity', () => {
  let limited;
  beforeAll(async () => {
    limited = await catalog('Workflow limited', 'session', 200, 1, null);
    await q('UPDATE service_catalog SET max_per_slot = 1 WHERE id = ?', [limited]);
  });
  beforeEach(async () => {
    await q('DELETE FROM service_requests WHERE service_id = ?', [limited]);
  });

  it('refuses a booking for a full slot and offers the other slot', async () => {
    expect((await book(limited, { preferredDate: day(6) })).body.success).toBe(true);
    // the same tenant also trips the duplicate rule; another tenant sees the capacity message
    expect((await book(limited, { preferredDate: day(6) })).status).toBe(409);
    const jose = await loginAs('jose');
    const other = await api('service_request.php', { token: jose, form: bookForm(limited, { preferredDate: day(6) }) });
    expect(other.status).toBe(409);
    expect(other.body.message).toMatch(/fully booked/);
    const free = await api('service_request.php', { token: jose, form: bookForm(limited, { preferredDate: day(6), preferredTimeSlot: 'afternoon' }) });
    expect(free.body.success).toBe(true);
  });

  it('reports availability and frees the place when the booking is cancelled', async () => {
    const id = (await book(limited, { preferredDate: day(7) })).body.id;
    const a = await api('get_service_availability.php', { token: maria, query: { serviceId: limited, date: day(7) } });
    expect(a.body.slots.morning).toMatchObject({ limit: 1, taken: 1, full: true });
    expect(a.body.slots.afternoon.full).toBe(false);
    await cancel(id);
    const b = await api('get_service_availability.php', { token: maria, query: { serviceId: limited, date: day(7) } });
    expect(b.body.slots.morning.full).toBe(false);
  });

  it('an unlimited service never reports a full slot, and a bad query is refused', async () => {
    const a = await api('get_service_availability.php', { token: maria, query: { serviceId: kgService, date: day(7) } });
    expect(a.body.slots.morning).toMatchObject({ limit: null, full: false });
    expect((await api('get_service_availability.php', { token: maria, query: { serviceId: kgService, date: 'nope' } })).status).toBe(422);
  });

  it('the admin sets, validates and clears the limit through the catalog', async () => {
    const payload = { action: 'update', id: limited, category: 'laundry', name: 'Workflow limited', price: 200, pricingUnit: 'session', minQuantity: 1, leadTimeDays: 0, isActive: true };
    const bad = await api('manage_service_catalog.php', { token: admin, json: { ...payload, maxPerSlot: 0 } });
    expect(bad.body.success).toBe(false);
    const ok = await api('manage_service_catalog.php', { token: admin, json: { ...payload, maxPerSlot: '' } });
    expect(ok.body.success).toBe(true);
    expect((await one('SELECT max_per_slot FROM service_catalog WHERE id = ?', [limited])).max_per_slot).toBeNull();
    await q('UPDATE service_catalog SET max_per_slot = 1 WHERE id = ?', [limited]);
  });
});

describe('ratings', () => {
  const rate = (id, json, token = maria) => api('rate_service_request.php', { token, json: { id, ...json } });

  it('rates a completed booking once, shows it to the tenant and the admin', async () => {
    const id = await booking({ status: 'Completed' });
    await q('UPDATE service_requests SET completed_at = NOW() WHERE id = ?', [id]);
    const mine = await api('get_my_requests.php', { token: maria });
    expect(Number(mine.body.requests.find((x) => x.type === 'Service' && Number(x.id) === id).can_rate)).toBe(1);
    expect((await rate(id, { rating: 0 })).status).toBe(422);
    expect((await rate(id, { rating: 6 })).status).toBe(422);
    expect((await rate(id, { rating: 4.5 })).status).toBe(422);
    const ok = await rate(id, { rating: 4, comment: 'On time' });
    expect(ok.body.success).toBe(true);
    expect((await rate(id, { rating: 5 })).status).toBe(409);
    const again = await api('get_my_requests.php', { token: maria });
    const found = again.body.requests.find((x) => x.type === 'Service' && Number(x.id) === id);
    expect(Number(found.rating)).toBe(4);
    expect(Number(found.can_rate)).toBe(0);
    const list = await api('get_service_requests.php', { token: admin });
    expect(Number(list.body.requests.find((x) => Number(x.id) === id).rating)).toBe(4);
    const cat = await api('get_service_catalog.php', { token: admin });
    expect(cat.body.services.find((s) => Number(s.id) === kgService).ratingCount).toBeGreaterThanOrEqual(1);
  });

  it('refuses an unfinished, an old or another tenant booking, and hides ratings from tenants on the catalog', async () => {
    const open = await booking({ status: 'Approved' });
    expect((await rate(open, { rating: 5 })).status).toBe(409);
    const old = await booking({ status: 'Completed' });
    await q('UPDATE service_requests SET completed_at = NOW() - INTERVAL 20 DAY WHERE id = ?', [old]);
    expect((await rate(old, { rating: 5 })).status).toBe(409);
    const recent = await booking({ status: 'Completed' });
    await q('UPDATE service_requests SET completed_at = NOW() WHERE id = ?', [recent]);
    const jose = await loginAs('jose');
    expect((await rate(recent, { rating: 5 }, jose)).status).toBe(404);
    const cat = await api('get_service_catalog.php', { token: maria });
    expect(cat.body.services.every((s) => s.avgRating === null)).toBe(true);
  });
});

describe('service categories', () => {
  const manage = (json) => api('manage_service_categories.php', { token: admin, json });
  beforeEach(async () => {
    await q("DELETE FROM service_catalog WHERE category IN ('pest_control', 'pest_control_2')");
    await q("DELETE FROM service_categories WHERE category_key IN ('pest_control', 'pest_control_2')");
  });

  it('lists the three starters, then adds, renames and removes a category', async () => {
    const list = await api('get_service_categories.php');
    expect(list.body.categories.map((c) => c.key)).toEqual(expect.arrayContaining(['cleaning', 'laundry', 'other']));
    expect(list.body.categories.find((c) => c.key === 'cleaning').builtin).toBe(true);

    const created = await manage({ action: 'create', label: 'Pest Control', labelFil: 'Pagpuksa ng peste' });
    expect(created.body.key).toBe('pest_control');
    expect((await manage({ action: 'create', label: 'pest control' })).status).toBe(422);
    const id = created.body.id;
    expect((await manage({ action: 'update', id, label: 'Pest & Bug Control', labelFil: '' })).body.success).toBe(true);
    expect(await one('SELECT label, label_fil FROM service_categories WHERE id = ?', [id])).toMatchObject({ label: 'Pest & Bug Control', label_fil: null });
    expect((await manage({ action: 'delete', id })).body.success).toBe(true);
    expect((await manage({ action: 'delete', id })).status).toBe(404);
  });

  it('a catalog item can use a new category, which then cannot be deleted while in use; starters cannot be deleted', async () => {
    const created = await manage({ action: 'create', label: 'Pest Control' });
    const item = await api('manage_service_catalog.php', { token: admin, json: { action: 'create', category: 'pest_control', name: 'Workflow pest', price: 500, pricingUnit: 'session', minQuantity: 1, leadTimeDays: 0, isActive: true } });
    expect(item.body.success).toBe(true);
    expect((await manage({ action: 'delete', id: created.body.id })).status).toBe(409);
    const unknown = await api('manage_service_catalog.php', { token: admin, json: { action: 'create', category: 'nonsense', name: 'Workflow bad', price: 1, pricingUnit: 'session', minQuantity: 1, leadTimeDays: 0 } });
    expect(unknown.body.success).toBe(false);
    const starter = await one("SELECT id FROM service_categories WHERE category_key = 'cleaning'");
    expect((await manage({ action: 'delete', id: starter.id })).status).toBe(409);
    await q("DELETE FROM service_catalog WHERE name = 'Workflow pest'");
  });

  it('only an admin can manage categories', async () => {
    expect((await api('manage_service_categories.php', { token: maria, json: { action: 'create', label: 'Nope' } })).status).toBeGreaterThanOrEqual(401);
  });
});

describe('booking date window', () => {
  it('allows 60 days ahead and refuses day 61', async () => {
    expect((await book(kgService, { preferredDate: day(60), preferredTimeSlot: 'afternoon' })).body.success).toBe(true);
    expect((await book(kgService, { preferredDate: day(61) })).status).toBe(422);
  });
});
