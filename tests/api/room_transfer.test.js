// Room transfer in place (transfer_room.php, room_transfers table).
// An active tenant moves to another vacant unit without moving out: the same
// application, contract, rent anniversary, parking and household stay. The
// deposit follows the new rent (top-up bill or excess refund request); future
// unstarted rent bills are repriced to the new rent; visitor pre-registrations
// for the old unit are cancelled; waitlist is notified.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin;
const APP = 1; // user 2 (Maria Santos), room A (₱4,000, 1F) in the seed
const USER = 2;
const OLD_ROOM = 'A';
const TARGET_CHEAPER = 'J'; // ₱3,500, 3F, vacant
const TARGET_OCCUPIED = 'B'; // occupied by Jose
const TARGET_HELD = 'I'; // held by Katrina Villareal
const TARGET_PRICIER = 'D'; // ₱4,000, or we can adjust target's monthly_rent

const transfer = (json = {}) => api('transfer_room.php', { token: admin, json: { applicationId: APP, toRoom: TARGET_CHEAPER, reason: 'Testing room transfer', ...json } });

beforeAll(async () => {
  admin = await loginAs('admin');
});

beforeEach(async () => {
  // Reset room_transfers, refunds and bills for APP
  await q('DELETE FROM room_transfers WHERE rent_application_id = ?', [APP]);
  await q('DELETE FROM refund_requests WHERE rent_application_id = ?', [APP]);
  await q("DELETE FROM invoices WHERE id LIKE 'INV-TRF-%' OR (rent_application_id = ? AND billing_period = 'Deposit top-up')", [APP]);
  await q('DELETE FROM advance_credits WHERE rent_application_id = ?', [APP]);
  await q('DELETE FROM household_members WHERE rent_application_id = ? AND full_name = "Baby"', [APP]);

  // Restore application 1 to active in Room A with rent 4000
  await q("UPDATE rent_applications SET room_name = 'A', monthly_rent = 4000, status = 'active', occupants = 1 WHERE id = ?", [APP]);

  // Restore Room A
  await q("UPDATE rooms SET status = 'occupied', tenant_name = 'Maria Santos', monthly_rent = 4000 WHERE id = 'A'");
  // Restore Room J (vacant, 3500)
  await q("UPDATE rooms SET status = 'vacant', tenant_name = NULL, last_tenant = 'Paolo Garcia', monthly_rent = 3500 WHERE id = 'J'");
  // Restore Room B (occupied, 4000)
  await q("UPDATE rooms SET status = 'occupied', tenant_name = 'Jose Reyes', monthly_rent = 4000 WHERE id = 'B'");
  // Ensure Room I has an active reservation
  await q("UPDATE rooms SET status = 'vacant', tenant_name = NULL, monthly_rent = 3500 WHERE id = 'I'");
  await q("UPDATE unit_reservations SET status = 'Active', room_name = 'I' WHERE id = 1");

  // Restore contract for APP
  await q("UPDATE lease_contracts SET deposit_amount = 4000, deposit_status = 'Held', status = 'active' WHERE rent_application_id = ?", [APP]);
});

describe('room transfer happy path (cheaper unit)', () => {
  it('preview mode calculates amounts without saving anything', async () => {
    const res = await transfer({ preview: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.preview).toBe(true);
    expect(res.body.fromRoom).toBe('A');
    expect(res.body.toRoom).toBe('J');
    expect(Number(res.body.oldRent)).toBe(4000);
    expect(Number(res.body.newRent)).toBe(3500);
    expect(Number(res.body.depositDifference)).toBe(-500);

    // Confirm nothing changed in DB
    const app = await one('SELECT room_name, monthly_rent FROM rent_applications WHERE id = ?', [APP]);
    expect(app.room_name).toBe('A');
    const roomA = await one('SELECT status FROM rooms WHERE id = ?', ['A']);
    expect(roomA.status).toBe('occupied');
    const transfers = await q('SELECT * FROM room_transfers WHERE rent_application_id = ?', [APP]);
    expect(transfers.length).toBe(0);
  });

  it('moves the tenant, swaps room statuses, updates contract, records history, and raises excess refund', async () => {
    const res = await transfer();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.fromRoom).toBe('A');
    expect(res.body.toRoom).toBe('J');
    expect(Number(res.body.oldRent)).toBe(4000);
    expect(Number(res.body.newRent)).toBe(3500);
    expect(res.body.refundRequestId).toBeTruthy();

    // Application updated
    const app = await one('SELECT room_name, monthly_rent FROM rent_applications WHERE id = ?', [APP]);
    expect(app.room_name).toBe('J');
    expect(Number(app.monthly_rent)).toBe(3500);

    // Old room is vacant with last_tenant, new room is occupied with Maria Santos
    const oldRoom = await one('SELECT status, tenant_name, last_tenant FROM rooms WHERE id = ?', ['A']);
    expect(oldRoom.status).toBe('vacant');
    expect(oldRoom.tenant_name).toBeNull();
    expect(oldRoom.last_tenant).toBe('Maria Santos');

    const newRoom = await one('SELECT status, tenant_name FROM rooms WHERE id = ?', ['J']);
    expect(newRoom.status).toBe('occupied');
    expect(newRoom.tenant_name).toBe('Maria Santos');

    // Contract deposit updated to new rent
    const contract = await one('SELECT deposit_amount FROM lease_contracts WHERE rent_application_id = ?', [APP]);
    expect(Number(contract.deposit_amount)).toBe(3500);

    // Refund request created for excess deposit (₱500)
    const refund = await one('SELECT amount, type, status FROM refund_requests WHERE id = ?', [res.body.refundRequestId]);
    expect(refund.type).toBe('deposit');
    expect(Number(refund.amount)).toBe(500);

    // room_transfers row created
    const tr = await one('SELECT * FROM room_transfers WHERE rent_application_id = ?', [APP]);
    expect(tr.from_room).toBe('A');
    expect(tr.to_room).toBe('J');
    expect(Number(tr.old_rent)).toBe(4000);
    expect(Number(tr.new_rent)).toBe(3500);
    expect(Number(tr.old_deposit)).toBe(4000);
    expect(Number(tr.new_deposit)).toBe(3500);
    expect(tr.reason).toBe('Testing room transfer');

    // GET transfer_room.php lists the transfer
    const getRes = await api(`transfer_room.php?applicationId=${APP}`, { token: admin, method: 'GET' });
    expect(getRes.status).toBe(200);
    expect(getRes.body.transfers.length).toBe(1);
    expect(getRes.body.transfers[0].fromRoom).toBe('A');
    expect(getRes.body.transfers[0].toRoom).toBe('J');

    // get_tenants.php includes transfers array
    const tenantsRes = await api('get_tenants.php', { token: admin, method: 'GET' });
    const maria = tenantsRes.body.data.find(t => Number(t.id) === APP);
    expect(maria).toBeDefined();
    expect(maria.transfers.length).toBe(1);
    expect(maria.transfers[0].toRoom).toBe('J');

    // my_room.php includes transfers array
    const myRoomRes = await api(`my_room.php?userId=${USER}`, { token: admin, method: 'GET' });
    expect(myRoomRes.status).toBe(200);
    expect(myRoomRes.body.data.transfers.length).toBe(1);
    expect(myRoomRes.body.data.transfers[0].toRoom).toBe('J');
  });
});

describe('room transfer happy path (pricier unit)', () => {
  it('creates a deposit top-up invoice when moving to a unit with higher rent', async () => {
    // Set Room J to ₱4,500 so it is pricier than Room A's ₱4,000
    await q('UPDATE rooms SET monthly_rent = 4500 WHERE id = "J"');

    const res = await transfer({ toRoom: 'J' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.newRent)).toBe(4500);
    expect(Number(res.body.depositDifference)).toBe(500);
    expect(res.body.depositInvoiceId).toBeTruthy();

    // Top-up invoice created
    const inv = await one('SELECT * FROM invoices WHERE id = ?', [res.body.depositInvoiceId]);
    expect(inv.billing_period).toBe('Deposit top-up');
    expect(Number(inv.security_deposit)).toBe(500);
    expect(Number(inv.total_amount)).toBe(500);
    expect(inv.status).toBe('pending');

    // Contract deposit updated
    const contract = await one('SELECT deposit_amount FROM lease_contracts WHERE rent_application_id = ?', [APP]);
    expect(Number(contract.deposit_amount)).toBe(4500);
  });
});

describe('room transfer validation and refusals', () => {
  it('refuses when the target room is occupied (409)', async () => {
    const res = await transfer({ toRoom: TARGET_OCCUPIED });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not vacant/i);
  });

  it('refuses when the target room is held by a reservation (409)', async () => {
    const res = await transfer({ toRoom: TARGET_HELD });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/hold/i);
  });

  it('refuses when the target room is the same room (422)', async () => {
    const res = await transfer({ toRoom: OLD_ROOM });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already lives in/i);
  });

  it('refuses when the tenancy is not active (409)', async () => {
    await q("UPDATE rent_applications SET status = 'pending-move-out' WHERE id = ?", [APP]);
    const res = await transfer();
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/move-out notice/i);
  });

  it('refuses when a payment is in review (409)', async () => {
    // Insert a pending-verification invoice
    await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date)
             VALUES ('INV-TRF-REV', ?, ?, 4000, 4000, 0, 'Test period', 'pending-verification', CURDATE())`, [USER, APP]);

    const res = await transfer();
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/payment/i);
  });

  it('refuses when unused advance credits exist (409)', async () => {
    await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date)
             VALUES ('INV-TRF-ADV', ?, ?, 4000, 4000, 4000, 'Advance rent', 'paid', CURDATE())`, [USER, APP]);
    await q(`INSERT INTO advance_credits (rent_application_id, user_id, advance_invoice_id, period_start, amount, status)
             VALUES (?, ?, 'INV-TRF-ADV', CURDATE(), 4000, 'available')`, [APP, USER]);

    const res = await transfer();
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/prepaid/i);
  });

  it('refuses when reason is missing or too short in non-preview mode (422)', async () => {
    const res = await transfer({ reason: 'Hi' });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});
