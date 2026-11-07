// Parking slots managed one by one (parking_slots.php), requests for a chosen
// slot (parking_reservation.php: e-bike plate optional, OR/CR only when the slot
// needs it, several per tenant, cancel), the tenant's view
// (get_available_parking_slots.php), assigning several requests at once and
// closing the rest when the lot is full (update_parking_status.php), and free
// parking (no fee, never billed).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { q, one, setting, setSetting } from './lib/db.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
let admin, maria, jose, rosa, ben, grace;

const slots = (json, token = admin) => api('parking_slots.php', { token, json });
const create = (over = {}) => slots({ action: 'create', label: 'X1', icon: 'motorcycle', vehicle_types: ['motorcycle'], requires_registration: false, ...over });
const slotId = async (label) => (await one('SELECT id FROM parking_slots WHERE label = ? AND archived_at IS NULL', [label])).id;
const form = (fields, file) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) f.append(k, v);
  if (file) f.append('uploadedFile', new Blob([PNG], { type: 'image/png' }), 'orcr.png');
  return f;
};
const moto = (slot, over = {}) => ({ slotId: String(slot), vehicleType: 'motorcycle', vehicleModel: 'Honda Click', plateNumber: 'ABC 1234', transmission: 'Automatic', durationMonths: '2', ...over });
const reserve = (token, fields, file = false) => api('parking_reservation.php', { token, form: form(fields, file) });
const assign = (id, slot) => api('update_parking_status.php', { token: admin, json: { id, status: 'Assigned', slotNumber: slot } });

beforeAll(async () => {
  admin = await loginAs('admin');
  maria = await loginAs('maria');
  jose = await loginAs('jose');
  rosa = await loginAs('rosa');
  ben = await login('ben.flores@demo.example', 'tenant123');
  grace = await login('grace.mendoza@demo.example', 'tenant123');
  // A clean lot: no reservations, no slots.
  await q('DELETE FROM parking_charges');
  await q('DELETE FROM parking_reservations');
  await q('DELETE FROM parking_slots');
});

describe('managing slots (parking_slots.php)', () => {
  it('is admin only', async () => {
    expect((await slots({ action: 'create' }, maria)).status).toBe(403);
    expect((await api('parking_slots.php', { token: maria })).status).toBe(403);
  });

  it.each([
    ['no name', { label: '' }, 'label'],
    ['a name with symbols', { label: 'A*1' }, 'label'],
    ['a name over 20 characters', { label: 'x'.repeat(21) }, 'label'],
    ['an unknown icon', { icon: 'rocket' }, 'icon'],
    ['no vehicle type', { vehicle_types: [] }, 'vehicle_types'],
    ['an unknown vehicle type', { vehicle_types: ['tank'] }, 'vehicle_types'],
    ['no OR/CR choice', { requires_registration: 'yes' }, 'requires_registration'],
    ['an unknown status', { status: 'closed' }, 'status'],
    ['21 at once', { quantity: 21 }, 'quantity'],
  ])('refuses %s', async (_n, over, field) => {
    const res = await create(over);
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty(field);
    expect((await one('SELECT COUNT(*) AS n FROM parking_slots')).n).toBe(0);
  });

  it('adds one slot, refuses the same name twice, and numbers a batch after the highest', async () => {
    expect((await create({ label: 'E1', icon: 'ebike', vehicle_types: ['ebike'] })).body.success).toBe(true);
    expect((await create({ label: 'E1' })).status).toBe(409);
    const batch = await create({ label: 'M', quantity: 3, requires_registration: true });
    expect(batch.body.labels).toEqual(['M1', 'M2', 'M3']);
    expect((await create({ label: 'M', quantity: 1, vehicle_types: ['sedan', 'motorcycle'] })).body.success).toBe(true); // "M" itself
    const more = await create({ label: 'M', quantity: 2 });
    expect(more.body.labels).toEqual(['M4', 'M5']);
    const row = await one("SELECT icon, vehicle_types, requires_registration FROM parking_slots WHERE label = 'M1'");
    expect(row).toEqual({ icon: 'motorcycle', vehicle_types: '["motorcycle"]', requires_registration: 1 });
    // types kept in a fixed order whatever order they were sent in
    expect((await one("SELECT vehicle_types FROM parking_slots WHERE label = 'M'")).vehicle_types).toBe('["motorcycle","sedan"]');
  });

  it('edits a slot and removes one (archived; its name can be used again)', async () => {
    const id = await slotId('M5');
    expect((await slots({ action: 'update', id, label: 'M5b', icon: 'car', vehicle_types: ['sedan'], requires_registration: true, status: 'maintenance' })).body.success).toBe(true);
    expect(await one('SELECT label, icon, status FROM parking_slots WHERE id = ?', [id])).toEqual({ label: 'M5b', icon: 'car', status: 'maintenance' });
    expect((await slots({ action: 'update', id, label: 'M1', icon: 'car', vehicle_types: ['sedan'], requires_registration: true })).status).toBe(409); // name taken
    expect((await slots({ action: 'remove', id })).body.success).toBe(true);
    expect((await one('SELECT archived_at FROM parking_slots WHERE id = ?', [id])).archived_at).not.toBeNull();
    expect((await slots({ action: 'remove', id })).status).toBe(404);
    expect((await create({ label: 'M5b' })).body.success).toBe(true);
    const list = (await api('parking_slots.php', { token: admin })).body;
    expect(list.slots.map((s) => s.label)).not.toContain('M4x');
    expect(list.slots.filter((s) => s.label === 'M5b')).toHaveLength(1);
  });
});

describe('requesting a slot (parking_reservation.php)', () => {
  it('an e-bike needs no plate and no transmission; a slot without OR/CR needs no file', async () => {
    const res = await reserve(maria, { slotId: String(await slotId('E1')), vehicleType: 'ebike', vehicleModel: 'NWOW', durationMonths: '1' });
    expect(res.status).toBe(200);
    expect(await one('SELECT plate_number, transmission, document_path, monthly_fee, total_cost FROM parking_reservations WHERE id = ?', [res.body.id]))
      .toEqual({ plate_number: null, transmission: null, document_path: null, monthly_fee: '300.00', total_cost: '300.00' });
  });

  it('a motorcycle needs a plate and a transmission; a slot that needs the OR/CR refuses without it', async () => {
    const m1 = await slotId('M1');
    expect((await reserve(jose, moto(m1, { plateNumber: '' }), true)).body.errors).toHaveProperty('plateNumber');
    expect((await reserve(jose, moto(m1, { transmission: '' }), true)).body.errors).toHaveProperty('transmission');
    expect((await reserve(jose, moto(m1))).body.errors).toHaveProperty('uploadedFile'); // M1 requires OR/CR
    expect((await reserve(jose, moto(m1, { vehicleType: 'van' }), true)).body.errors).toHaveProperty('vehicleType'); // M1 takes motorcycles only
    expect((await one('SELECT COUNT(*) AS n FROM parking_reservations WHERE user_id = 3')).n).toBe(0);
    expect((await reserve(jose, moto(m1), true)).status).toBe(200);
  });

  it('a slot under maintenance or unknown is refused', async () => {
    await q("UPDATE parking_slots SET status = 'maintenance' WHERE label = 'M2'");
    expect((await reserve(rosa, moto(await slotId('M2')), true)).status).toBe(409);
    await q("UPDATE parking_slots SET status = 'active' WHERE label = 'M2'");
    expect((await reserve(rosa, moto(99999), true)).status).toBe(409);
  });

  it('the duration follows the setting', async () => {
    await setSetting('parking_max_duration_months', '3');
    expect((await reserve(rosa, moto(await slotId('M2'), { durationMonths: '4' }), true)).body.errors).toHaveProperty('durationMonths');
    await setSetting('parking_max_duration_months', '6');
  });

  it('several open reservations per tenant up to the setting; the same plate only once', async () => {
    await setSetting('parking_max_per_tenant', '2');
    const m2 = await slotId('M2');
    expect((await reserve(jose, moto(m2), true)).status).toBe(409); // same plate as the open one
    expect((await reserve(jose, moto(m2, { plateNumber: 'XYZ 777' }), true)).status).toBe(200);
    expect((await reserve(jose, moto(m2, { plateNumber: 'QQQ 111' }), true)).status).toBe(409); // third
    await setSetting('parking_max_per_tenant', '1');
  });

  it('a tenant cancels their own pending request only', async () => {
    const mine = await one("SELECT id FROM parking_reservations WHERE user_id = 3 AND plate_number = 'XYZ 777'");
    const cancel = (token, id) => api('parking_reservation.php', { token, form: form({ action: 'cancel', id: String(id) }) });
    expect((await cancel(maria, mine.id)).status).toBe(409);
    expect((await cancel(jose, mine.id)).body.success).toBe(true);
    expect((await one('SELECT status FROM parking_reservations WHERE id = ?', [mine.id])).status).toBe('Cancelled');
    expect((await cancel(jose, mine.id)).status).toBe(409);
  });
});

describe("the tenant's view (get_available_parking_slots.php)", () => {
  it('shows each slot as free, requested, mine, taken or maintenance, never who parks there', async () => {
    const e1 = await slotId('E1');
    const m1 = await slotId('M1');
    const r = await one("SELECT id FROM parking_reservations WHERE user_id = 2 AND status = 'Pending'");
    expect((await assign(r.id, e1)).body.success).toBe(true);
    await q("UPDATE parking_slots SET status = 'maintenance' WHERE label = 'M3'");

    const view = (await api('get_available_parking_slots.php', { token: maria })).body;
    const state = (label) => view.slots.find((s) => s.label === label).state;
    expect(state('E1')).toBe('mine');
    expect(state('M1')).toBe('free'); // jose asked for it, but a request does not hold the slot
    expect(state('M3')).toBe('maintenance');
    expect(view.slots[0]).not.toHaveProperty('occupant');
    expect(view.my_reservations[0]).toMatchObject({ status: 'Assigned', slot_label: 'E1' });
    expect(view.max_duration_months).toBe(6);

    const joseView = (await api('get_available_parking_slots.php', { token: jose })).body;
    expect(joseView.slots.find((s) => s.id === m1).state).toBe('requested');
    expect(joseView.slots.find((s) => s.id === e1).state).toBe('taken');
    await q("UPDATE parking_slots SET status = 'active' WHERE label = 'M3'");
  });
});

describe('assigning: several at once, then the lot is full', () => {
  it('a slot must take the vehicle type and not be under maintenance', async () => {
    const r = await one("SELECT id FROM parking_reservations WHERE user_id = 3 AND status = 'Pending'");
    expect((await assign(r.id, await slotId('E1'))).status).toBe(422); // E1 takes e-bikes only
    await q("UPDATE parking_slots SET status = 'maintenance' WHERE label = 'M2'");
    expect((await assign(r.id, await slotId('M2'))).status).toBe(409);
    await q("UPDATE parking_slots SET status = 'active' WHERE label = 'M2'");
  });

  it('accepts requests until every motorcycle slot is taken, then closes the rest and tells them', async () => {
    // Motorcycle slots now: M1, M2, M3, M, M4, M5b. Four tenants ask; all four are assigned.
    await q("DELETE FROM parking_reservations WHERE status = 'Pending'");
    const tenants = [jose, rosa, ben, grace];
    const ids = [];
    for (const [i, token] of tenants.entries()) {
      const res = await reserve(token, moto(await slotId('M1'), { plateNumber: `PLT ${100 + i}` }), true);
      expect(res.status).toBe(200);
      ids.push(res.body.id);
    }
    const labels = ['M1', 'M2', 'M3'];
    for (const [i, label] of labels.entries()) expect((await assign(ids[i], await slotId(label))).body.success).toBe(true);
    expect(await one('SELECT status FROM parking_reservations WHERE id = ?', [ids[3]])).toEqual({ status: 'Pending' }); // M and M5b still free

    // M4 and M5b stay free, so nothing is closed.
    await q("UPDATE parking_slots SET status = 'maintenance' WHERE label = 'M5b'");
    const last = await assign(ids[3], await slotId('M'));
    expect(last.body.success).toBe(true);
    expect(last.body.closed_full).toEqual([]);

    // A new request now finds every motorcycle slot taken.
    expect((await reserve(maria, moto(await slotId('M5b'), { plateNumber: 'NEW 999' }), true)).status).toBe(409); // maintenance
  });

  it('closes pending requests no free slot can take any more, with a "parking is full" notice', async () => {
    await q("UPDATE parking_slots SET status = 'active' WHERE label = 'M5b'");
    expect((await slots({ action: 'remove', id: await slotId('M4') })).body.success).toBe(true); // M5b is the last free motorcycle slot
    await setSetting('parking_max_per_tenant', '3');
    const a = await reserve(jose, moto(await slotId('M5b'), { plateNumber: 'FUL 001' }), true);
    const b = await reserve(rosa, moto(await slotId('M5b'), { plateNumber: 'FUL 002' }), true);
    const bike = await reserve(ben, { slotId: String(await slotId('E1')), vehicleType: 'ebike', vehicleModel: 'Ebike', durationMonths: '1' });
    expect(bike.status).toBe(409); // E1 is Maria's
    expect((await assign(a.body.id, await slotId('M5b'))).body.closed_full).toEqual([b.body.id]);
    expect(await one('SELECT status, rejection_reason FROM parking_reservations WHERE id = ?', [b.body.id])).toEqual({ status: 'Rejected', rejection_reason: 'Parking is full' });
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 5 AND title = 'Parking Is Full'")).n).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE type = 'parking_reservation' AND metadata_value LIKE ? AND status = 'Pending'", [`%${b.body.id}`])).n).toBe(0);
    await setSetting('parking_max_per_tenant', '1');
  });
});

describe('free parking', () => {
  it('a request made while parking is free costs nothing and is never billed; the fee is kept per permit', async () => {
    await q("DELETE FROM parking_reservations WHERE user_id = 14");
    await create({ label: 'F1' });
    await setSetting('parking_free', '1');
    const res = await reserve(grace, moto(await slotId('F1'), { plateNumber: 'FRE 001' }));
    expect(res.status).toBe(200);
    expect(await one('SELECT monthly_fee, total_cost FROM parking_reservations WHERE id = ?', [res.body.id])).toEqual({ monthly_fee: '0.00', total_cost: '0.00' });
    expect((await assign(res.body.id, await slotId('F1'))).body.success).toBe(true);
    await setSetting('parking_free', '0'); // later requests pay again; this permit stays free
    const bill = await api('sync_parking_to_invoice.php', { token: admin, json: { reservation_id: res.body.id } });
    expect(bill.status).toBe(409);
    expect(bill.body.message).toMatch(/free/);
    expect((await one('SELECT COUNT(*) AS n FROM parking_charges WHERE reservation_id = ?', [res.body.id])).n).toBe(0);
    expect(await setting('parking_free')).toBe('0');
  });
});
