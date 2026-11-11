// create_reservation.php, update_reservation_status.php, expire_reservations.php,
// expire_contracts.php (the admin gate), manage_waitlist.php, get_inquiries.php,
// update_inquiry_status.php.
// QA guide rows Q2-xx / inquiries. These endpoints answer 200 with success:false for most
// validation failures, so the tests check the body and the database, not just the status.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria;
const room = async (id) => (await one('SELECT status FROM rooms WHERE id = ?', [id])).status;
const addRoom = (id, status = 'vacant') =>
  q("INSERT INTO rooms (id, type, floor, monthly_rent, status, occupants) VALUES (?, 'Studio', '9F', 4000, ?, 0)", [id, status]);
const addInquiry = async (name, { userId = null, status = 'New', roomName = null } = {}) =>
  (await q("INSERT INTO inquiries (user_id, full_name, email, contact_no, room_name, status) VALUES (?, ?, ?, '+639171234500', ?, ?)",
    [userId, name, `${name.replace(/\W/g, '').toLowerCase() || 'x'}@demo.example`, roomName, status])).insertId;

const reserve = (token, body) => api('create_reservation.php', { token, json: body });
const setRes = (token, body) => api('update_reservation_status.php', { token, json: body });
const wl = (token, body) => api('manage_waitlist.php', { token, json: body });
const inq = (token, body) => api('update_inquiry_status.php', { token, json: body });

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
  for (const id of ['QA1', 'QA2', 'QA3', 'QA4', 'QA5', 'QA6']) await addRoom(id);
  await addRoom('QAOCC', 'occupied');
});

describe('create_reservation.php', () => {
  it('is for admins only and changes nothing otherwise', async () => {
    expect((await reserve(undefined, { room_name: 'QA1', reserved_for_name: 'Ann' })).status).toBe(403);
    expect((await reserve(maria, { room_name: 'QA1', reserved_for_name: 'Ann' })).status).toBe(403);
    expect(await room('QA1')).toBe('vacant');
  });

  it.each([
    ['no unit', { reserved_for_name: 'Ann' }],
    ['blank name', { room_name: 'QA1', reserved_for_name: '   ' }],
    ['negative fee', { room_name: 'QA1', reserved_for_name: 'Ann', reservation_fee: -1 }],
    ['hold of 0 days', { room_name: 'QA1', reserved_for_name: 'Ann', hold_days: 0 }],
    ['hold of 91 days', { room_name: 'QA1', reserved_for_name: 'Ann', hold_days: 91 }],
    ['unknown unit', { room_name: 'NOPE', reserved_for_name: 'Ann' }],
    ['occupied unit', { room_name: 'QAOCC', reserved_for_name: 'Ann' }],
    ['unknown source inquiry', { room_name: 'QA1', reserved_for_name: 'Ann', inquiry_id: 99999 }],
  ])('refuses %s', async (_n, body) => {
    const res = await reserve(admin, body);
    expect(res.body.success).toBe(false);
    expect(await room('QA1')).toBe('vacant');
    expect((await one("SELECT COUNT(*) AS n FROM unit_reservations WHERE room_name IN ('QA1','QAOCC')")).n).toBe(0);
  });

  it('holds the unit, advances the inquiry and notifies the linked tenant', async () => {
    const id = await addInquiry('Ann Hold', { userId: 2, status: 'Contacted' });
    const res = await reserve(admin, { room_name: 'QA1', reserved_for_name: 'Ann Hold', inquiry_id: id, hold_days: 7, reservation_fee: 500, contact_no: '09171234567' });
    expect(res.body.success).toBe(true);
    expect(await room('QA1')).toBe('reserved');
    const r = await one('SELECT status, user_id, contact_no, reservation_fee, hold_expires_at = DATE_ADD(CURDATE(), INTERVAL 7 DAY) AS seven FROM unit_reservations WHERE id = ?', [res.body.reservation_id]);
    expect(r).toMatchObject({ status: 'Active', user_id: 2, contact_no: '+639171234567' });
    expect(Number(r.seven)).toBe(1);
    expect((await one('SELECT status FROM inquiries WHERE id = ?', [id])).status).toBe('Reserved');
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 2 AND title = 'Unit Reserved'")).n).toBe(1);
  });

  it('allows the boundary holds of 1 and 90 days', async () => {
    expect((await reserve(admin, { room_name: 'QA2', reserved_for_name: 'Bo One', hold_days: 1 })).body.success).toBe(true);
    expect((await reserve(admin, { room_name: 'QA3', reserved_for_name: 'Cy Ninety', hold_days: 90 })).body.success).toBe(true);
  });

  it('refuses a unit that is already held and a unit with a pending application', async () => {
    expect((await reserve(admin, { room_name: 'QA1', reserved_for_name: 'Dee' })).body.success).toBe(false);
    await addRoom('QA7');
    await q("INSERT INTO rent_applications (user_id, room_name, status, monthly_rent) VALUES (3, 'QA7', 'Pending Review', 4000)");
    const pending = await one("SELECT id FROM rent_applications WHERE room_name = 'QA7' AND status = 'Pending Review'");
    expect(pending).not.toBeNull(); // the fixture must exist or this test proves nothing
    expect((await reserve(admin, { room_name: 'QA7', reserved_for_name: 'Eve' })).body.success).toBe(false);
    expect(await room('QA7')).toBe('vacant');
  });

  it('keeps unicode and markup in names and notes as text', async () => {
    const name = "Zoë 李 😀 O'Brien <img src=x onerror=alert(1)>";
    const res = await reserve(admin, { room_name: 'QA4', reserved_for_name: name, notes: name });
    expect(res.body.success).toBe(true);
    expect(await one('SELECT reserved_for_name, notes FROM unit_reservations WHERE id = ?', [res.body.reservation_id])).toEqual({ reserved_for_name: name, notes: name });
  });

  it('two simultaneous holds on one unit leave exactly one', async () => {
    const [a, b] = await Promise.all([
      reserve(admin, { room_name: 'QA5', reserved_for_name: 'Race A' }),
      reserve(admin, { room_name: 'QA5', reserved_for_name: 'Race B' }),
    ]);
    expect([a, b].filter((r) => r.body.success).length).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM unit_reservations WHERE room_name = 'QA5' AND status = 'Active'")).n).toBe(1);
  });
});

describe('update_reservation_status.php', () => {
  const mkHold = async (roomId, inquiryStatus = 'Reserved') => {
    const i = await addInquiry(`Hold ${roomId}`, { userId: 2, status: inquiryStatus });
    const r = await reserve(admin, { room_name: roomId, reserved_for_name: `Hold ${roomId}`, inquiry_id: i });
    return { id: r.body.reservation_id, inquiry: i };
  };

  it('is for admins only', async () => {
    const { id } = await mkHold('QA6');
    expect((await setRes(maria, { id, status: 'Cancelled' })).status).toBe(403);
    expect((await setRes(undefined, { id, status: 'Cancelled' })).status).toBe(403);
    expect(await room('QA6')).toBe('reserved');
  });

  it('rejects a missing id and a status outside Cancelled, Expired, Converted', async () => {
    const r = await one("SELECT id FROM unit_reservations WHERE room_name = 'QA6' AND status = 'Active'");
    expect((await setRes(admin, { status: 'Cancelled' })).body.success).toBe(false);
    for (const status of ['Active', 'Done', '', 'cancelled']) expect((await setRes(admin, { id: r.id, status })).body.success, status).toBe(false);
    expect((await setRes(admin, { id: 99999, status: 'Cancelled' })).body.success).toBe(false);
    expect((await one('SELECT status FROM unit_reservations WHERE id = ?', [r.id])).status).toBe('Active');
  });

  it('cancelling frees the unit, returns the inquiry to Contacted and tells the tenant', async () => {
    const r = await one("SELECT id, inquiry_id FROM unit_reservations WHERE room_name = 'QA6' AND status = 'Active'");
    const res = await setRes(admin, { id: r.id, status: 'Cancelled', reason: 'Changed their mind 😀' });
    expect(res.body.success).toBe(true);
    expect(await room('QA6')).toBe('vacant');
    expect((await one('SELECT status, released_reason FROM unit_reservations WHERE id = ?', [r.id]))).toEqual({ status: 'Cancelled', released_reason: 'Changed their mind 😀' });
    expect((await one('SELECT status FROM inquiries WHERE id = ?', [r.inquiry_id])).status).toBe('Contacted');
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 2 AND title = 'Reservation Cancelled'")).n).toBeGreaterThanOrEqual(1);
  });

  it('cannot change a reservation that is no longer Active', async () => {
    const r = await one("SELECT id FROM unit_reservations WHERE room_name = 'QA6' AND status = 'Cancelled'");
    expect((await setRes(admin, { id: r.id, status: 'Converted' })).body.success).toBe(false);
    expect((await one('SELECT status FROM unit_reservations WHERE id = ?', [r.id])).status).toBe('Cancelled');
  });

  it('Converted keeps the unit reserved and marks the inquiry Converted', async () => {
    const { id, inquiry } = await mkHold('QA6');
    expect((await setRes(admin, { id, status: 'Converted' })).body.success).toBe(true);
    expect(await room('QA6')).toBe('reserved');
    expect((await one('SELECT status FROM inquiries WHERE id = ?', [inquiry])).status).toBe('Converted');
  });

  it('never frees a unit that is no longer reserved (stale hold)', async () => {
    await addRoom('QA8');
    const { id } = await mkHold('QA8');
    await q("UPDATE rooms SET status = 'occupied' WHERE id = 'QA8'");
    expect((await setRes(admin, { id, status: 'Cancelled' })).body.success).toBe(true);
    expect(await room('QA8')).toBe('occupied');
  });

  it('two simultaneous cancels settle once', async () => {
    await addRoom('QA9');
    const { id } = await mkHold('QA9');
    const [a, b] = await Promise.all([setRes(admin, { id, status: 'Cancelled' }), setRes(admin, { id, status: 'Cancelled' })]);
    expect([a, b].filter((r) => r.body.success).length).toBe(1);
  });
});

describe('expire_reservations.php', () => {
  it('releases only holds whose date has passed and frees their units', async () => {
    await addRoom('QAE1');
    await addRoom('QAE2');
    const old = await reserve(admin, { room_name: 'QAE1', reserved_for_name: 'Old Hold' });
    const fresh = await reserve(admin, { room_name: 'QAE2', reserved_for_name: 'Fresh Hold' });
    await q('UPDATE unit_reservations SET hold_expires_at = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE id = ?', [old.body.reservation_id]);
    const res = await api('expire_reservations.php', { token: admin });
    expect(res.body.success).toBe(true);
    expect(res.body.released).toBeGreaterThanOrEqual(1);
    expect((await one('SELECT status FROM unit_reservations WHERE id = ?', [old.body.reservation_id])).status).toBe('Expired');
    expect(await room('QAE1')).toBe('vacant');
    expect((await one('SELECT status FROM unit_reservations WHERE id = ?', [fresh.body.reservation_id])).status).toBe('Active');
    expect(await room('QAE2')).toBe('reserved');
    expect((await api('expire_reservations.php', { token: admin })).body.released).toBe(0); // idempotent
  });

  it('a hold that expires today is still active (boundary is "before today")', async () => {
    await addRoom('QAE3');
    const r = await reserve(admin, { room_name: 'QAE3', reserved_for_name: 'Today Hold' });
    await q('UPDATE unit_reservations SET hold_expires_at = CURDATE() WHERE id = ?', [r.body.reservation_id]);
    await api('expire_reservations.php', { token: admin });
    expect((await one('SELECT status FROM unit_reservations WHERE id = ?', [r.body.reservation_id])).status).toBe('Active');
  });

  it('needs an admin session: no token is 401, a tenant is 403, and nothing is released', async () => {
    await addRoom('QAE4');
    const r = await reserve(admin, { room_name: 'QAE4', reserved_for_name: 'Gate Hold' });
    await q('UPDATE unit_reservations SET hold_expires_at = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE id = ?', [r.body.reservation_id]);
    expect((await api('expire_reservations.php', {})).status).toBe(401);
    expect((await api('expire_reservations.php', { token: maria })).status).toBe(403);
    expect((await one('SELECT status FROM unit_reservations WHERE id = ?', [r.body.reservation_id])).status).toBe('Active');
    await api('expire_reservations.php', { token: admin }); // an admin run does release it
    expect((await one('SELECT status FROM unit_reservations WHERE id = ?', [r.body.reservation_id])).status).toBe('Expired');
  });
});

describe('expire_contracts.php', () => {
  it('needs an admin session: no token is 401, a tenant is 403, an admin gets the count', async () => {
    expect((await api('expire_contracts.php', {})).status).toBe(401);
    expect((await api('expire_contracts.php', { token: maria })).status).toBe(403);
    const res = await api('expire_contracts.php', { token: admin });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.expired).toBe('number');
  });
});

describe('manage_waitlist.php', () => {
  let inquiryId;
  beforeAll(async () => {
    inquiryId = await addInquiry('Wendy Wait', { userId: 2, roomName: 'QAOCC' });
  });

  it('is for admins only', async () => {
    expect((await api('manage_waitlist.php')).status).toBe(401);
    expect((await api('manage_waitlist.php', { token: maria })).status).toBe(403);
    expect((await wl(maria, { action: 'add', inquiryId })).status).toBe(403);
  });

  it('validates the inquiry, the unit and the action', async () => {
    expect((await wl(admin, { action: 'add', inquiryId: 99999 })).status).toBe(404);
    expect((await wl(admin, { action: 'add', inquiryId, roomName: 'NOPE' })).status).toBe(404);
    expect((await wl(admin, { action: 'add', inquiryId, roomName: 'QA9' })).status).toBe(409); // vacant after cancel: hold instead
    expect((await wl(admin, { action: 'dance' })).status).toBe(422);
    const closed = await addInquiry('Closed One', { status: 'Closed', roomName: 'QAOCC' });
    expect((await wl(admin, { action: 'add', inquiryId: closed })).status).toBe(409);
    expect((await one('SELECT COUNT(*) AS n FROM unit_waitlist')).n).toBe(0);
  });

  it('adds once per inquiry and unit, numbers the line and notifies the person', async () => {
    const res = await wl(admin, { action: 'add', inquiryId });
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('number 1');
    expect((await wl(admin, { action: 'add', inquiryId })).status).toBe(409); // duplicate
    const second = await addInquiry('Sam Second', { roomName: 'QAOCC' });
    expect((await wl(admin, { action: 'add', inquiryId: second })).body.message).toContain('number 2');
    const list = await api('manage_waitlist.php', { token: admin });
    expect(list.body.entries.filter((e) => e.roomName === 'QAOCC').map((e) => e.position)).toEqual([1, 2]);
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 2 AND type = 'waitlist_update'")).n).toBe(1);
  });

  it('removes an entry once and 404s the second time; closing an inquiry removes its entries', async () => {
    const entry = (await one("SELECT id FROM unit_waitlist WHERE inquiry_id = ? AND status = 'Waiting'", [inquiryId])).id;
    expect((await wl(admin, { action: 'remove', id: entry })).body.success).toBe(true);
    expect((await wl(admin, { action: 'remove', id: entry })).status).toBe(404);
    expect((await wl(admin, { action: 'remove', id: 0 })).status).toBe(404);

    const other = (await one("SELECT inquiry_id FROM unit_waitlist WHERE status = 'Waiting'")).inquiry_id;
    expect((await inq(admin, { id: other, status: 'Closed', closed_reason: 'No longer looking' })).body.success).toBe(true);
    expect((await one("SELECT COUNT(*) AS n FROM unit_waitlist WHERE status = 'Waiting'")).n).toBe(0);
  });

  it('keeps unicode in the waitlisted name', async () => {
    const name = 'Zoë 李 😀 O\'Brien';
    const id = await addInquiry(name, { roomName: 'QAOCC' });
    expect((await wl(admin, { action: 'add', inquiryId: id })).body.success).toBe(true);
    const list = await api('manage_waitlist.php', { token: admin });
    expect(list.body.entries.some((e) => e.fullName === name)).toBe(true);
  });
});

describe('inquiries: update_inquiry_status.php and get_inquiries.php', () => {
  it('update is for admins only', async () => {
    const id = await addInquiry('Ivy Inquiry', { userId: 2 });
    expect((await inq(maria, { id, status: 'Contacted' })).status).toBe(403);
    expect((await inq(undefined, { id, status: 'Contacted' })).status).toBe(403);
    expect((await one('SELECT status FROM inquiries WHERE id = ?', [id])).status).toBe('New');
  });

  it('validates id, status and the viewing date requirement', async () => {
    const id = await addInquiry('Vera Validate');
    expect((await inq(admin, { status: 'Contacted' })).body.success).toBe(false);
    expect((await inq(admin, { id: 99999, status: 'Contacted' })).body.success).toBe(false);
    for (const status of ['Done', 'contacted', '', 'Closed; DROP TABLE inquiries'])
      expect((await inq(admin, { id, status })).body.success, status).toBe(false);
    expect((await inq(admin, { id, status: 'Scheduled' })).body.success).toBe(false);
    expect((await inq(admin, { id, status: 'Scheduled', viewing_date: '   ' })).body.success).toBe(false);
    expect((await one('SELECT status FROM inquiries WHERE id = ?', [id])).status).toBe('New');
  });

  it('moves status, keeps notes and unicode, notifies the account and resolves the admin queue', async () => {
    const id = await addInquiry('Nora Notes', { userId: 2 });
    const note = "Call back Zoë 李 😀 <b>tonight</b> O'Brien";
    const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) + ' 14:00:00';
    const res = await inq(admin, { id, status: 'Scheduled', viewing_date: date, admin_notes: note });
    expect(res.body.success).toBe(true);
    const row = await one('SELECT status, admin_notes, handled_by FROM inquiries WHERE id = ?', [id]);
    expect(row).toMatchObject({ status: 'Scheduled', admin_notes: note });
    expect(row.handled_by).not.toBeNull();
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 2 AND type = 'inquiry_update' AND message LIKE 'A unit viewing%'")).n).toBe(1);
  });

  it('listing is for admins only and includes the inquiries', async () => {
    expect((await api('get_inquiries.php')).status).toBe(403);
    expect((await api('get_inquiries.php', { token: maria })).status).toBe(403);
    const res = await api('get_inquiries.php', { token: admin });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('Nora Notes');
  });
});
