// SPRINT 178: per-field validation on the endpoints the 2026-10-31 pass left out
// (update_room, create_room, create_reservation, update_inquiry_status,
// update_reservation_status, create_invoice, adjust_invoice, create_contract,
// update_contract_status, update_tenant_status, maintenance and service forms).
// A refused request answers 422 with `errors` keyed by field and writes nothing.
// Also: three endpoints took the admin id from the X-Admin-Id header and wrote it
// to created_by / handled_by; it now comes from the session.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria, adminId;

const expectFields = (res, fields) => {
  expect(res.status).toBe(422);
  expect(res.body.success).toBe(false);
  expect(Object.keys(res.body.errors).sort()).toEqual([...fields].sort());
};
const room = (id) => one('SELECT * FROM rooms WHERE id = ?', [id]);
const dayFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
  adminId = (await one("SELECT id FROM users WHERE email_address = 'admin@gmail.com'")).id;
  await q("INSERT INTO rooms (id, type, floor, monthly_rent, status, occupants) VALUES ('V1', 'Studio', '7F', 3000, 'vacant', 0), ('V2', 'Studio', '7F', 3000, 'vacant', 0), ('V3', 'Studio', '7F', 3000, 'vacant', 0)");
});

describe('update_room.php', () => {
  const upd = (body) => api('update_room.php', { token: admin, json: { id: 'V1', ...body } });

  it.each([
    ['furnishing_status', { furnishing_status: 'Palace' }],
    ['room_condition', { room_condition: 'x'.repeat(101) }],
    ['maintenance_flag', { maintenance_flag: 'maybe' }],
    ['last_inspection_date', { last_inspection_date: '2026-02-30' }],
    ['available_date', { available_date: 'tomorrow' }],
    ['monthly_rent', { monthly_rent: 'abc' }],
  ])('refuses a bad %s and changes nothing', async (field, body) => {
    const before = await room('V1');
    const res = await upd(body);
    expectFields(res, [field]);
    expect(await room('V1')).toEqual(before);
  });

  it('refuses an infinite or oversized rent, and an inspection date in the future', async () => {
    expectFields(await upd({ monthly_rent: 1e300 }), ['monthly_rent']);
    expectFields(await upd({ monthly_rent: '1e400' }), ['monthly_rent']);
    expectFields(await upd({ last_inspection_date: dayFromNow(3) }), ['last_inspection_date']);
  });

  it('reports every bad field together', async () => {
    expectFields(await upd({ furnishing_status: 'Palace', maintenance_flag: 'maybe', last_inspection_date: 'x' }), ['furnishing_status', 'maintenance_flag', 'last_inspection_date']);
  });

  it('stores a good update, with the flag as 0/1 and a null date allowed', async () => {
    const res = await upd({ maintenance_flag: true, furnishing_status: 'Fully Furnished', room_condition: 'Fair', last_inspection_date: dayFromNow(-2), available_date: null });
    expect(res.body.success).toBe(true);
    expect(await room('V1')).toMatchObject({ maintenance_flag: 1, furnishing_status: 'Fully Furnished', room_condition: 'Fair', available_date: null });
    expect((await upd({ maintenance_flag: 0 })).body.success).toBe(true);
    expect((await room('V1')).maintenance_flag).toBe(0);
  });

  it('assigning a tenant: bad dates, end before start and missing identity check are 422, not 500', async () => {
    // A user with no rent or application anywhere (the 409 "already has an open rent" check comes first).
    const free = (await q("INSERT INTO users (first_name, last_name, email_address, password, role) VALUES ('Free', 'Agent', 'free.agent@demo.example', 'x', 'user')")).insertId;
    const assign = (extra) => upd({ id: 'V2', status: 'occupied', user_id: free, ...extra });
    expectFields(await assign({ lease_start: '2026-02-30', lease_end: dayFromNow(200), identity_verified: true }), ['lease_start']);
    expectFields(await assign({ lease_start: dayFromNow(10), lease_end: dayFromNow(5), identity_verified: true }), ['lease_end']);
    expectFields(await assign({ lease_start: dayFromNow(1), lease_end: dayFromNow(200) }), ['identity_verified']);
    expectFields(await upd({ id: 'V2', status: 'occupied', user_id: 'abc', identity_verified: true }), ['user_id']);
    expect((await room('V2')).status).toBe('vacant');
  });
});

describe('create_room.php', () => {
  const create = (body) => api('create_room.php', { token: admin, json: body });

  it('refuses an id, type or floor longer than its column, and an oversized rent', async () => {
    expectFields(await create({ id: 'U'.repeat(51), type: 'Studio', floor: '8F', rent: 3000 }), ['id']);
    expectFields(await create({ id: 'N1', type: 'T'.repeat(51), floor: 'F'.repeat(51), rent: 3000 }), ['type', 'floor']);
    expectFields(await create({ id: 'N1', type: 'Studio', floor: '8F', rent: 1e12 }), ['rent']);
    expect(await room('N1')).toBeNull();
  });
});

describe('reservations and inquiries', () => {
  const reserve = (body, headers = {}) => api('create_reservation.php', { token: admin, headers, json: body });

  it('create_reservation.php: bad email, fee and hold are 422 and nothing is held', async () => {
    const res = await reserve({ room_name: 'V3', reserved_for_name: 'Pat', email: 'not-an-email', reservation_fee: 'abc', hold_days: 'x' });
    expectFields(res, ['email', 'reservation_fee', 'hold_days']);
    expectFields(await reserve({ room_name: 'V3', reserved_for_name: 'P'.repeat(151) }), ['reserved_for_name']);
    expect((await room('V3')).status).toBe('vacant');
  });

  it('the admin recorded is the session\'s, whatever X-Admin-Id says', async () => {
    const res = await reserve({ room_name: 'V3', reserved_for_name: 'Pat', hold_days: 5 }, { 'X-Admin-Id': '999' });
    expect(res.body.success).toBe(true);
    const row = await one('SELECT created_by FROM unit_reservations WHERE id = ?', [res.body.reservation_id]);
    expect(row.created_by).toBe(adminId);

    // And it is still admin only, with or without the header.
    expect((await api('create_reservation.php', { token: maria, headers: { 'X-Admin-Id': String(adminId) }, json: { room_name: 'V1', reserved_for_name: 'Pat' } })).status).toBe(403);
    expect((await api('create_reservation.php', { headers: { 'X-Admin-Id': String(adminId) }, json: { room_name: 'V1', reserved_for_name: 'Pat' } })).status).toBe(401);

    // update_reservation_status.php: reason length, then the session's admin in the log.
    expectFields(await api('update_reservation_status.php', { token: admin, json: { id: res.body.reservation_id, status: 'Cancelled', reason: 'r'.repeat(256) } }), ['reason']);
    const cancel = await api('update_reservation_status.php', { token: admin, headers: { 'X-Admin-Id': '999' }, json: { id: res.body.reservation_id, status: 'Cancelled', reason: 'changed their mind' } });
    expect(cancel.body.success).toBe(true);
    const log = await one("SELECT performed_by FROM activity_logs WHERE action = 'Updated Reservation Status' ORDER BY id DESC LIMIT 1");
    expect(log.performed_by).toBe(adminId);
  });

  it('update_inquiry_status.php: reason and notes are capped, handled_by is the session admin', async () => {
    const id = (await q("INSERT INTO inquiries (full_name, email, contact_no, status) VALUES ('Probe', 'probe.178@demo.example', '+639171234578', 'New')")).insertId;
    const upd = (body, headers = {}) => api('update_inquiry_status.php', { token: admin, headers, json: { id, ...body } });
    expectFields(await upd({ status: 'Closed', closed_reason: 'c'.repeat(256) }), ['closed_reason']);
    expect((await one('SELECT status FROM inquiries WHERE id = ?', [id])).status).toBe('New');
    const ok = await upd({ status: 'Contacted' }, { 'X-Admin-Id': '999' });
    expect(ok.body.success).toBe(true);
    expect((await one('SELECT handled_by FROM inquiries WHERE id = ?', [id])).handled_by).toBe(adminId);
  });
});

describe('invoices and contracts', () => {
  it('create_invoice.php: an oversized or infinite amount and a long invoice number are refused', async () => {
    const make = (body) => api('create_invoice.php', { token: admin, json: { userId: 2, ...body } });
    expectFields(await make({ baseRent: '1e400' }), ['baseRent']);
    expectFields(await make({ baseRent: 1e12 }), ['baseRent']);
    expectFields(await make({ baseRent: 5000, invoiceNumber: 'I'.repeat(51) }), ['invoiceNumber']);
    expectFields(await make({ baseRent: 9999999, water: 9999999, electricity: 9999999, parking: 9999999, lateFee: 9999999, unit: 'U'.repeat(51) }), ['unit']);
  });

  it('adjust_invoice.php: an oversized amount is a field error', async () => {
    await q("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date) VALUES ('INV-178-ADJ', 2, 1, 1500, 1500, 'Test bill', 'pending', CURDATE() + INTERVAL 5 DAY)");
    const res = await api('adjust_invoice.php', { token: admin, json: { invoiceId: 'INV-178-ADJ', reason: 'a fair reason', baseRent: 1e12, water: '1e400' } });
    expectFields(res, ['baseRent', 'water']);
    expect(Number((await one("SELECT total_amount FROM invoices WHERE id = 'INV-178-ADJ'")).total_amount)).toBe(1500);
  });

  it('create_contract.php: a text application id, a bad deposit and a bad contract id are refused', async () => {
    const make = (body) => api('create_contract.php', { token: admin, json: { leaseStart: dayFromNow(1), leaseEnd: dayFromNow(200), ...body } });
    expectFields(await make({ rentApplicationId: 'abc' }), ['rentApplicationId']);
    expectFields(await make({ rentApplicationId: 1, depositAmount: 'abc' }), ['depositAmount']);
    expectFields(await make({ rentApplicationId: 1, depositAmount: -5, id: "x'; DROP" }), ['depositAmount', 'id']);
  });

  it('update_contract_status.php: long text, a bad notice date and bad deduction amounts are refused', async () => {
    const lc = (await one('SELECT id FROM lease_contracts LIMIT 1')).id;
    const call = (body) => api('update_contract_status.php', { token: admin, json: { contractId: lc, ...body } });
    expectFields(await call({ action: 'flag', reason: 'r'.repeat(1001) }), ['reason']);
    expectFields(await call({ action: 'flag', notice_date: '2026-02-30' }), ['notice_date']);
    expectFields(await call({ action: 'terminate', damage_deduction: -50, utility_deduction: 'abc', deposit_interest: 1e12 }), ['damage_deduction', 'utility_deduction', 'deposit_interest']);
    expectFields(await call({ action: 'clear', contractId: 'C'.repeat(51) }), ['contractId']);
  });

  it('update_tenant_status.php: clearance amounts and notes are checked before anything is written', async () => {
    const app = await one("SELECT id, status FROM rent_applications WHERE user_id = 2 AND status IN ('Approved','active') LIMIT 1");
    const clear = (body) => api('update_tenant_status.php', { token: admin, json: { id: app.id, status: 'moved-out', ...body } });
    expectFields(await clear({ damage_deduction: -100 }), ['damage_deduction']);
    expectFields(await clear({ utility_deduction: 'abc', deposit_interest: -1, notice_deduction: 1e12 }), ['utility_deduction', 'deposit_interest', 'notice_deduction']);
    expectFields(await clear({ clearance_notes: 'n'.repeat(2001) }), ['clearance_notes']);
    expect((await one('SELECT status FROM rent_applications WHERE id = ?', [app.id])).status).toBe(app.status);
  });
});

describe('maintenance and service forms', () => {
  it('create_maintenance_request_admin.php: a list where text belongs is 400, a long title is 422', async () => {
    const form = (fields) => {
      const f = new FormData();
      for (const [k, v] of fields) f.append(k, v);
      return api('create_maintenance_request_admin.php', { token: admin, form: f });
    };
    expect((await form([['title[]', 'x'], ['unit', 'V1'], ['issueType', 'Plumbing'], ['priority', 'Medium']])).status).toBe(400);
    expectFields(await form([['title', 'T'.repeat(151)], ['unit', 'V1'], ['issueType', 'Plumbing'], ['priority', 'Medium']]), ['title']);
  });

  it('maintenance_request.php and service_request.php refuse a list where a single value belongs (400, not a 500)', async () => {
    const f1 = new FormData();
    f1.append('description[]', 'x'); f1.append('issueType', 'Plumbing'); f1.append('preferredDate', dayFromNow(2)); f1.append('preferredTime', 'morning');
    expect((await api('maintenance_request.php', { token: maria, form: f1 })).status).toBe(400);
    const f2 = new FormData();
    f2.append('notes[]', 'x'); f2.append('serviceId', '1'); f2.append('preferredDate', dayFromNow(2)); f2.append('preferredTimeSlot', 'morning');
    expect((await api('service_request.php', { token: maria, form: f2 })).status).toBe(400);
  });

  it('update_maintenance_status.php: infinite costs, a long assignee and a long reason are field errors', async () => {
    const id = (await q("INSERT INTO maintenance_requests (user_id, title, issue_category, description, status, urgency) VALUES (2, 'Leak', 'Plumbing', 'Dripping tap', 'Pending', 'Medium')")).insertId;
    const upd = (body) => api('update_maintenance_status.php', { token: admin, json: { id, ...body } });
    expectFields(await upd({ actualCost: '1e400' }), ['actualCost']);
    expectFields(await upd({ estimatedCost: 1e12 }), ['estimatedCost']);
    expectFields(await upd({ assignedTo: 'A'.repeat(101) }), ['assignedTo']);
    expectFields(await upd({ status: 'Rejected', rejectionReason: 'r'.repeat(256) }), ['rejectionReason']);
  });
});
