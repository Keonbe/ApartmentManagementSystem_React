// Rent extension range and rules: my_room.php, extend_lease.php,
// get_rooms.php (extensionRange) and admin_extend_rent.php all share
// config.php extension_month_range() / extension_block_reason().
// Rent ends are set relative to today, so the suite doesn't depend on the
// seed's date.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

// Rent end for an application, months from today (contract + room).
async function setRentEnd(appId, room, monthsFromToday) {
  await q('UPDATE lease_contracts SET lease_end = DATE_ADD(CURDATE(), INTERVAL ? MONTH) WHERE rent_application_id = ?', [monthsFromToday, appId]);
  await q('UPDATE rooms SET lease_end = DATE_ADD(CURDATE(), INTERVAL ? MONTH) WHERE id = ?', [monthsFromToday, room]);
}
const request = (token, additionalMonths, extra = {}) => api('extend_lease.php', { token, json: { additionalMonths, ...extra } });
const myExtension = async (token) => (await api('my_room.php', { token })).body.data.extension;
const pendingRequests = (userId) => one("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'lease_extension_request' AND status = 'Pending'", [userId]);

let admin, maria, rosa;
beforeAll(async () => {
  await setSetting('min_lease_duration', 3);
  await setSetting('max_rent_ahead_months', 12);
  [admin, maria, rosa] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('rosa')]);
});

describe('range when the minimum does not fit (Maria, 10 months left)', () => {
  beforeAll(() => setRentEnd(1, 'A', 10));

  it('KB-A06 the minimum shrinks to what fits: min = max = 2', async () => {
    expect(await myExtension(maria)).toMatchObject({ allowed: true, minMonths: 2, maxMonths: 2, maxMonthsAhead: 12 });
  });

  it('KB-B07 / KB-C01 one month past the limit is refused', async () => {
    const res = await request(maria, 3);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Rent can only be extended up to 12 month\(s\) ahead/);
  });

  it('KB-A07 / KB-C01 a request ending exactly on the limit is filed; a body userId is ignored (KB-E08)', async () => {
    const res = await request(maria, 2, { userId: 5, user_id: 5 });
    expect(res.body).toMatchObject({ success: true });
    expect((await pendingRequests(2)).c).toBe(1);
    expect((await pendingRequests(5)).c).toBe(0);
  });

  it('KB-B10 a second request while one is pending is refused', async () => {
    const res = await request(maria, 2);
    expect(res.body).toMatchObject({ success: false });
    expect(res.body.message).toMatch(/already have a pending rent extension request/);
    expect((await pendingRequests(2)).c).toBe(1);
  });

  it('KB-C03 a minimum of 6 also shrinks to 2', async () => {
    await setSetting('min_lease_duration', 6);
    expect(await myExtension(maria)).toMatchObject({ minMonths: 2, maxMonths: 2 });
    await setSetting('min_lease_duration', 3);
  });
});

describe('minimum and validation (Rosa, 2 months left)', () => {
  beforeAll(() => setRentEnd(3, 'C', 2));

  it('range is the full minimum to what fits: 3–10', async () => {
    expect(await myExtension(rosa)).toMatchObject({ allowed: true, minMonths: 3, maxMonths: 10 });
  });

  it('KB-B05 asking below the minimum is refused', async () => {
    const res = await request(rosa, 2);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('The rent must be extended by at least 3 month(s).');
  });

  it.each([0, 13, -1, 'abc'])('KB-B06 additionalMonths %s → 400 "between 1 and 12"', async (months) => {
    const res = await request(rosa, months);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/between 1 and 12/);
  });

  it('nothing was filed for Rosa', async () => {
    expect((await pendingRequests(5)).c).toBe(0);
  });
});

describe('blocked tenancies', () => {
  it('KB-C02 nothing fits (12 months left): not allowed, max 0', async () => {
    await setRentEnd(9, 'H', 12);
    const carlo = await login('carlo.villanueva@gmail.com', 'tenant123');
    const ext = await myExtension(carlo);
    expect(ext).toMatchObject({ allowed: false, maxMonths: 0 });
    expect(ext.reason).toMatch(/Rent can only be extended up to 12 month\(s\) ahead/);
  });

  it('KB-B08 overdue bills block the request and name the amount', async () => {
    await setRentEnd(2, 'B', 2);
    const res = await request(await loginAs('jose'), 3);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/^There is ₱[\d,.]+ overdue/);
  });

  it('KB-B09 a scheduled move-out blocks the request', async () => {
    const res = await request(await loginAs('mark'), 3);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/A move-out is scheduled/);
  });
});

describe('admin Extend Rent uses the same range (unit C)', () => {
  beforeAll(() => setRentEnd(3, 'C', 2));

  it('KB-A08 get_rooms.php returns extensionRange per occupied unit', async () => {
    const res = await api('get_rooms.php', { token: admin });
    const rooms = res.body.rooms;
    const c = rooms.find((r) => r.id === 'C');
    expect(c.extensionRange).toEqual({ min: 3, max: 10 });
    const vacant = rooms.find((r) => r.id === 'J');
    expect(vacant.extensionRange).toBeNull();
  });

  it('KB-E06 a tenant gets no extensionRange', async () => {
    const res = await api('get_rooms.php', { token: rosa });
    const rooms = res.body.rooms;
    expect(rooms.length).toBeGreaterThan(0);
    expect(rooms.every((r) => r.extensionRange == null)).toBe(true);
  });

  it('below the minimum → 409 with the same message', async () => {
    const res = await api('admin_extend_rent.php', { token: admin, json: { roomId: 'C', addMonths: 2 } });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The rent must be extended by at least 3 month(s).');
  });

  it('KB-A08 extending by the minimum moves the rent end and records it', async () => {
    const before = await one("SELECT lease_end FROM lease_contracts WHERE rent_application_id = 3");
    const res = await api('admin_extend_rent.php', { token: admin, json: { roomId: 'C', addMonths: 3 } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const after = await one("SELECT lease_end, DATE_ADD(?, INTERVAL 3 MONTH) AS expected FROM lease_contracts WHERE rent_application_id = 3", [before.lease_end]);
    expect(after.lease_end).toBe(after.expected);
    expect(res.body.newLeaseEnd).toBe(after.expected);
    const renewal = await one('SELECT added_months FROM lease_renewals WHERE new_lease_end = ? ORDER BY id DESC LIMIT 1', [after.expected]);
    expect(renewal?.added_months).toBe(3);
  });

  it('KB-E04 a tenant cannot call admin Extend Rent', async () => {
    const res = await api('admin_extend_rent.php', { token: rosa, json: { roomId: 'C', addMonths: 3 } });
    expect(res.status).toBe(403);
  });
});
