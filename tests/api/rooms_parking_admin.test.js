// create_room.php, update_room.php, archive_room.php, set_unit_maintenance.php, apply_floor_rate.php,
// parking_reservation.php, update_parking_status.php, get_available_parking_slots.php.
// QA guide rows Q2-02, Q2-03, Q10-01, Q10-02.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

const ymd = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// A 1x1 PNG, and a text file posing as one.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const room = (id) => one('SELECT * FROM rooms WHERE id = ?', [id]);

let admin, maria, jose;
beforeAll(async () => {
  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
});

describe('create_room.php', () => {
  const create = (token, body) => api('create_room.php', { token, json: body });

  it('is admin only', async () => {
    expect((await create(undefined, { id: 'R1', type: 'Studio', floor: '8F', rent: 3000 })).status).toBe(401);
    expect((await create(maria, { id: 'R1', type: 'Studio', floor: '8F', rent: 3000 })).status).toBe(403);
    expect(await room('R1')).toBeNull();
  });

  it.each([
    ['no id', { type: 'Studio', floor: '8F', rent: 3000 }],
    ['no type', { id: 'R2', floor: '8F', rent: 3000 }],
    ['no floor', { id: 'R2', type: 'Studio', rent: 3000 }],
    ['no rent and no floor rate', { id: 'R2', type: 'Studio', floor: '8F' }],
    ['zero rent', { id: 'R2', type: 'Studio', floor: '8F', rent: 0 }],
    ['negative rent', { id: 'R2', type: 'Studio', floor: '8F', rent: -100 }],
    ['text rent', { id: 'R2', type: 'Studio', floor: '8F', rent: 'abc' }],
    ['blank id', { id: '   ', type: 'Studio', floor: '8F', rent: 3000 }],
  ])('rejects %s with 400', async (_n, body) => {
    expect((await create(admin, body)).status).toBe(400);
    expect(await room('R2')).toBeNull();
  });

  it('creates a vacant unit, refuses a duplicate id, and logs it', async () => {
    const res = await create(admin, { id: 'R3', type: 'Studio', floor: '8F', rent: 3500.5 });
    expect(res.body.success).toBe(true);
    expect(await room('R3')).toMatchObject({ status: 'vacant', floor: '8F' });
    expect(Number((await room('R3')).monthly_rent)).toBe(3500.5);
    expect((await create(admin, { id: 'R3', type: 'Studio', floor: '8F', rent: 3500 })).status).toBe(409);
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Created Unit R3'")).n).toBe(1);
  });

  it('takes the floor rent when no rent is given, and marks a different rent as custom', async () => {
    await setSetting('floor_rates', JSON.stringify({ '7F': 4200 }));
    const auto = await create(admin, { id: 'R4', type: 'Studio', floor: '7F' });
    expect(auto.body.success).toBe(true);
    expect(await room('R4')).toMatchObject({ rent_is_custom: 0 });
    expect(Number((await room('R4')).monthly_rent)).toBe(4200);
    await create(admin, { id: 'R5', type: 'Studio', floor: '7F', rent: 4300 });
    expect((await room('R5')).rent_is_custom).toBe(1);
  });

  it('keeps unusual unit ids exactly (apostrophe, accent, emoji)', async () => {
    const id = "Zöe's 李";
    expect((await create(admin, { id, type: 'Studio', floor: '8F', rent: 3000 })).body.success).toBe(true);
    expect((await room(id)).id).toBe(id);
  });

  it('restoring an archived unit brings it back vacant and clean', async () => {
    await q("UPDATE rooms SET archived_at = NOW() WHERE id = 'R3'");
    const res = await create(admin, { id: 'R3', type: 'Loft', floor: '8F', rent: 3999 });
    expect(res.body.success).toBe(true);
    expect(await room('R3')).toMatchObject({ archived_at: null, status: 'vacant', type: 'Loft' });
  });
});

describe('update_room.php', () => {
  const upd = (token, body) => api('update_room.php', { token, json: body });

  it('is admin only and needs a known unit', async () => {
    expect((await upd(undefined, { id: 'R3', monthly_rent: 1 })).status).toBe(401);
    expect((await upd(maria, { id: 'R3', monthly_rent: 1 })).status).toBe(403);
    expect((await upd(admin, {})).status).toBe(400);
    expect((await upd(admin, { id: 'NOPE', monthly_rent: 3000 })).status).toBe(404);
  });

  it('refuses a zero or negative rent and a change to status or tenant fields', async () => {
    const before = Number((await room('R3')).monthly_rent);
    for (const rent of [0, -5]) expect((await upd(admin, { id: 'R3', monthly_rent: rent })).status).toBe(422);
    expect((await upd(admin, { id: 'R3', status: 'occupied' })).status).toBe(422);
    expect(Number((await room('R3')).monthly_rent)).toBe(before);
    expect((await room('R3')).status).toBe('vacant');
  });

  it('refuses an update with no usable fields', async () => {
    expect((await upd(admin, { id: 'R3' })).status).toBe(400);
  });

  it('updates the rent of a vacant unit', async () => {
    const res = await upd(admin, { id: 'R3', monthly_rent: 4100 });
    expect(res.body.success).toBe(true);
    expect(Number((await room('R3')).monthly_rent)).toBe(4100);
  });
});

describe('archive_room.php', () => {
  const arch = (token, body) => api('archive_room.php', { token, json: body });

  it('is admin only, needs an id and a known unit', async () => {
    expect((await arch(undefined, { id: 'R5' })).status).toBe(401);
    expect((await arch(maria, { id: 'R5' })).status).toBe(403);
    expect((await arch(admin, {})).status).toBe(400);
    expect((await arch(admin, { id: 'NOPE' })).status).toBe(404);
    expect((await room('R5')).archived_at).toBeNull();
  });

  it('refuses an occupied unit, a unit with an application, and a unit with an active hold', async () => {
    const occupied = (await one("SELECT room_name AS id FROM rent_applications WHERE user_id = 2 AND status IN ('Approved','active') LIMIT 1")).id;
    expect((await arch(admin, { id: occupied })).status).toBe(409);
    expect((await room(occupied)).archived_at).toBeNull();

    await q("INSERT INTO rooms (id, type, floor, monthly_rent, status, occupants) VALUES ('RH', 'Studio', '6F', 3000, 'vacant', 0)");
    await q("INSERT INTO unit_reservations (room_name, reserved_for_name, hold_expires_at, status) VALUES ('RH', 'Held', DATE_ADD(CURDATE(), INTERVAL 5 DAY), 'Active')");
    expect((await arch(admin, { id: 'RH' })).status).toBe(409);

    await q("INSERT INTO rooms (id, type, floor, monthly_rent, status, occupants) VALUES ('RA', 'Studio', '6F', 3000, 'vacant', 0)");
    await q("INSERT INTO rent_applications (user_id, room_name, status, monthly_rent) VALUES (3, 'RA', 'Pending Review', 3000)");
    expect((await arch(admin, { id: 'RA' })).status).toBe(409);
  });

  it('removes a free vacant unit once; the second call says it is already removed', async () => {
    expect((await arch(admin, { id: 'R5' })).body.success).toBe(true);
    expect((await room('R5')).archived_at).not.toBeNull();
    expect((await arch(admin, { id: 'R5' })).status).toBe(409);
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Removed Unit R5'")).n).toBe(1);
  });

  it('two simultaneous removals settle once', async () => {
    await q("INSERT INTO rooms (id, type, floor, monthly_rent, status, occupants) VALUES ('RR', 'Studio', '6F', 3000, 'vacant', 0)");
    const [a, b] = await Promise.all([arch(admin, { id: 'RR' }), arch(admin, { id: 'RR' })]);
    expect([a, b].filter((r) => r.body.success).length).toBe(1);
  });
});

describe('set_unit_maintenance.php', () => {
  const maint = (token, body) => api('set_unit_maintenance.php', { token, json: body });

  it('is admin only and needs a known unit', async () => {
    expect((await maint(undefined, { unitId: 'R3', completionDate: ymd(5) })).status).toBe(401);
    expect((await maint(maria, { unitId: 'R3', completionDate: ymd(5) })).status).toBe(403);
    expect((await maint(admin, {})).status).toBe(400);
    expect((await maint(admin, { unitId: 'NOPE', completionDate: ymd(5) })).status).toBe(404);
  });

  it('refuses an occupied unit and a bad or past completion date', async () => {
    const occupied = (await one("SELECT room_name AS id FROM rent_applications WHERE user_id = 2 AND status IN ('Approved','active') LIMIT 1")).id;
    expect((await maint(admin, { unitId: occupied, completionDate: ymd(5) })).status).toBe(409);
    for (const completionDate of ['', 'soon', '2031-2-3', ymd(-1)]) {
      expect((await maint(admin, { unitId: 'R3', completionDate })).status, completionDate).toBe(422);
    }
    expect((await room('R3')).maintenance_flag).toBe(0);
  });

  it('starts (today is the edge and allowed) and completes maintenance', async () => {
    const res = await maint(admin, { unitId: 'R3', completionDate: ymd(0), notes: 'Fix wiring 😀' });
    expect(res.body.success).toBe(true);
    expect(await room('R3')).toMatchObject({ maintenance_flag: 1, room_condition: 'Under Maintenance' });
    expect((await maint(admin, { unitId: 'R3', action: 'complete' })).body.success).toBe(true);
    expect(await room('R3')).toMatchObject({ maintenance_flag: 0, room_condition: 'Good', available_date: null });
    expect((await maint(admin, { unitId: 'R3', action: 'explode' })).status).toBe(400);
  });
});

describe('apply_floor_rate.php', () => {
  const rate = (token, body) => api('apply_floor_rate.php', { token, json: body });

  it('is admin only and needs a floor that has a saved rate', async () => {
    expect((await rate(undefined, { floor: '7F' })).status).toBe(401);
    expect((await rate(maria, { floor: '7F' })).status).toBe(403);
    expect((await rate(admin, {})).status).toBe(400);
    expect((await rate(admin, { floor: '1Z' })).status).toBe(422);
    expect((await api('apply_floor_rate.php', { token: admin, method: 'GET' })).status).toBe(405);
  });

  it('previews without writing, then applies to vacant non-custom units only', async () => {
    await q("INSERT INTO rooms (id, type, floor, monthly_rent, status, occupants, rent_is_custom) VALUES ('F1','Studio','7F',3000,'vacant',0,0), ('F2','Studio','7F',3000,'vacant',0,1), ('F3','Studio','7F',3000,'reserved',0,0)");
    const preview = await rate(admin, { floor: '7F', preview: true });
    expect(preview.body).toMatchObject({ success: true, preview: true, rate: 4200 });
    expect(Number((await room('F1')).monthly_rent)).toBe(3000);

    const real = await rate(admin, { floor: '7F' });
    expect(real.body.success).toBe(true);
    expect(Number((await room('F1')).monthly_rent)).toBe(4200); // vacant, not custom
    expect(Number((await room('F2')).monthly_rent)).toBe(3000); // custom, kept
    expect(Number((await room('F3')).monthly_rent)).toBe(3000); // reserved, kept
    expect((await rate(admin, { floor: '7F' })).body.updated).toBe(0); // nothing left to change
  });
});

describe('parking_reservation.php', () => {
  const form = (fields, { file = { bytes: PNG, type: 'image/png', name: 'orcr.png' } } = {}) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    if (file) f.append('uploadedFile', new Blob([file.bytes], { type: file.type }), file.name);
    return f;
  };
  const good = (over = {}) => ({ vehicleType: 'motorcycle', vehicleModel: 'Honda Click', plateNumber: 'abc 1234', transmission: 'Automatic', durationMonths: '3', ...over });
  const reserve = (token, fields, opts) => api('parking_reservation.php', { token, form: form(fields, opts) });
  const open = (userId) => one("SELECT COUNT(*) AS n FROM parking_reservations WHERE user_id = ? AND status IN ('Pending','Assigned')", [userId]);

  it('is for signed-in tenants with an active rental, via POST', async () => {
    expect((await reserve(undefined, good())).status).toBe(401);
    expect((await reserve(admin, good())).status).toBe(403);
    expect((await api('parking_reservation.php', { token: maria, method: 'GET' })).status).toBe(405);
    expect((await open(2)).n).toBe(0);
  });

  it.each([
    ['missing model', { vehicleModel: '' }],
    ['one-character model', { vehicleModel: 'H' }],
    ['model over 100 characters', { vehicleModel: 'x'.repeat(101) }],
    ['plate too short', { plateNumber: 'AB' }],
    ['plate with symbols', { plateNumber: 'AB*1234' }],
    ['bad transmission', { transmission: 'CVT' }],
    ['duration 0', { durationMonths: '0' }],
    ['duration 7 (max is 6)', { durationMonths: '7' }],
    ['fractional duration', { durationMonths: '1.5' }],
    ['vehicle type not accepted', { vehicleType: 'truck' }],
  ])('rejects %s with 422', async (_n, over) => {
    expect((await reserve(maria, good(over))).status).toBe(422);
    expect((await open(2)).n).toBe(0);
  });

  it('refuses a missing, wrong-type or fake document', async () => {
    expect((await reserve(maria, good(), { file: null })).status).toBe(422);
    expect((await reserve(maria, good(), { file: { bytes: Buffer.from('MZ evil'), type: 'image/png', name: 'orcr.png' } })).status).toBe(422); // content is not an image
    expect((await reserve(maria, good(), { file: { bytes: PNG, type: 'image/png', name: 'orcr.exe' } })).status).toBe(422);
    expect((await open(2)).n).toBe(0);
  });

  it('files one pending request (edges 1 and 6 months allowed) and refuses a second', async () => {
    const res = await reserve(maria, good({ durationMonths: '6' }));
    expect(res.status).toBe(200);
    const row = await one('SELECT status, plate_number, duration_months, document_path FROM parking_reservations WHERE id = ?', [res.body.id]);
    expect(row).toMatchObject({ status: 'Pending', plate_number: 'ABC 1234', duration_months: 6 });
    expect(row.document_path).toMatch(/^uploads\/documents\//);
    expect((await reserve(maria, good())).status).toBe(409);
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE type = 'parking_reservation' AND status = 'Pending'")).n).toBeGreaterThanOrEqual(1);
    expect((await reserve(jose, good({ durationMonths: '1' }))).status).toBe(200);
  });

  it('refuses when parking is switched off', async () => {
    await setSetting('service_parking_active', 'false');
    expect((await reserve(await loginAs('rosa'), good())).status).toBe(403);
    await setSetting('service_parking_active', 'true');
  });
});

describe('update_parking_status.php and get_available_parking_slots.php', () => {
  const setP = (token, body) => api('update_parking_status.php', { token, json: body });
  const pend = (userId) => one("SELECT id FROM parking_reservations WHERE user_id = ? AND status = 'Pending' ORDER BY id DESC LIMIT 1", [userId]);

  it('slots: needs a session, shows capacity and the caller\'s own request', async () => {
    expect((await api('get_available_parking_slots.php')).status).toBe(401);
    const res = await api('get_available_parking_slots.php', { token: maria });
    expect(res.body.max_slots).toBeGreaterThan(0);
    expect(res.body.my_reservation).toMatchObject({ status: 'Pending' });
    expect(res.body).not.toHaveProperty('taken_slots'); // admin only
    expect((await api('get_available_parking_slots.php', { token: admin })).body).toHaveProperty('taken_slots');
  });

  it('is admin only', async () => {
    const r = await pend(2);
    expect((await setP(undefined, { id: r.id, status: 'Rejected', reason: 'x' })).status).toBe(401);
    expect((await setP(maria, { id: r.id, status: 'Assigned', slotNumber: 1 })).status).toBe(403);
    expect((await one('SELECT status FROM parking_reservations WHERE id = ?', [r.id])).status).toBe('Pending');
  });

  it('validates the status, the reason and the slot number', async () => {
    const r = await pend(2);
    expect((await setP(admin, { id: 0, status: 'Assigned', slotNumber: 1 })).status).toBe(422);
    expect((await setP(admin, { id: r.id, status: 'Cancelled' })).status).toBe(422);
    expect((await setP(admin, { id: r.id, status: 'Rejected', reason: '   ' })).status).toBe(422);
    expect((await setP(admin, { id: r.id, status: 'Rejected', reason: 'x'.repeat(256) })).status).toBe(422);
    for (const slotNumber of [undefined, 0, -1, 999]) expect((await setP(admin, { id: r.id, status: 'Assigned', slotNumber })).status, String(slotNumber)).toBe(422);
    expect((await setP(admin, { id: 99999, status: 'Assigned', slotNumber: 1 })).status).toBe(404);
    expect((await one('SELECT status FROM parking_reservations WHERE id = ?', [r.id])).status).toBe('Pending');
  });

  it('assigns a slot, refuses the same slot twice, and releases only an assigned one', async () => {
    await setSetting('max_parking_slots', 3);
    const a = await pend(2);
    const b = await pend(3);
    expect((await setP(admin, { id: a.id, status: 'Assigned', slotNumber: 3 })).body.success).toBe(true); // top edge
    expect((await one('SELECT status, slot_number FROM parking_reservations WHERE id = ?', [a.id]))).toMatchObject({ status: 'Assigned', slot_number: 3 });
    expect((await setP(admin, { id: b.id, status: 'Assigned', slotNumber: 3 })).status).toBe(409);
    expect((await setP(admin, { id: a.id, status: 'Assigned', slotNumber: 1 })).status).toBe(422); // not pending any more
    expect((await setP(admin, { id: b.id, status: 'Released', reason: 'nope' })).status).toBe(422); // pending cannot be released
    expect((await setP(admin, { id: a.id, status: 'Released', reason: 'Moved vehicle 😀' })).body.success).toBe(true);
    expect((await one('SELECT status, release_reason FROM parking_reservations WHERE id = ?', [a.id]))).toEqual({ status: 'Released', release_reason: 'Moved vehicle 😀' });
    expect((await setP(admin, { id: a.id, status: 'Released', reason: 'again' })).status).toBe(422);
  });

  it('rejects with a reason and notifies the tenant', async () => {
    const b = await pend(3);
    expect((await setP(admin, { id: b.id, status: 'Rejected', reason: 'Document unclear' })).body.success).toBe(true);
    expect((await one('SELECT status, rejection_reason FROM parking_reservations WHERE id = ?', [b.id]))).toEqual({ status: 'Rejected', rejection_reason: 'Document unclear' });
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 3 AND title = 'Parking Request Rejected'")).n).toBe(1);
  });

  it('two simultaneous assigns of one slot give it to one tenant', async () => {
    await q("DELETE FROM parking_reservations");
    const ids = [];
    for (const [uid, plate] of [[2, 'AAA 111'], [3, 'BBB 222']]) {
      ids.push((await q("INSERT INTO parking_reservations (user_id, vehicle_type, vehicle_model, plate_number, status, transmission, duration_months, total_cost, document_path) VALUES (?, 'motorcycle', 'Test', ?, 'Pending', 'Manual', 1, 300, 'uploads/documents/x.png')", [uid, plate])).insertId);
    }
    const [x, y] = await Promise.all(ids.map((id) => setP(admin, { id, status: 'Assigned', slotNumber: 1 })));
    expect([x, y].filter((r) => r.body.success).length).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM parking_reservations WHERE status = 'Assigned' AND slot_number = 1")).n).toBe(1);
  });
});
