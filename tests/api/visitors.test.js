// get_visitors.php: pre-registrations dated by expected arrival (visitAt),
// and the Checked In / Overstayed split.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria;
const visitors = (token, query) => api('get_visitors.php', { token, query });

async function addVisitor(name, status, { checkInAgo = '0 MINUTE', expectedIn = null, userId = 2, room = 'A' } = {}) {
  const res = await q(
    `INSERT INTO visitor_logs (user_id, room_name, visitor_name, contact_number, purpose, status, check_in_at, expected_at)
     VALUES (?, ?, ?, '09170000000', 'Test visit', ?, NOW() - INTERVAL ${checkInAgo},
             ${expectedIn ? `NOW() + INTERVAL ${expectedIn}` : 'NULL'})`,
    [userId, room, name, status],
  );
  return res.insertId;
}

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
  await q("INSERT INTO system_settings (setting_key, setting_value) VALUES ('visitor_overstay_hours', '24') ON DUPLICATE KEY UPDATE setting_value = '24'");
});

describe('KB-A14 a pre-registration is dated by its expected arrival', () => {
  let id, expectedDay, today;
  beforeAll(async () => {
    const before = (await visitors(admin)).body.stats.today_count;
    id = await addVisitor('Test PreReg', 'pending_approval', { expectedIn: '3 DAY' });
    ({ expectedDay, today } = await one('SELECT DATE(expected_at) AS expectedDay, CURDATE() AS today FROM visitor_logs WHERE id = ?', [id]));
    expect((await visitors(admin)).body.stats.today_count).toBe(before);
  });

  it('visitAt is the expected arrival, not the filing time', async () => {
    const v = (await visitors(admin)).body.visitors.find((x) => x.id === id);
    expect(v.visitAt.slice(0, 10)).toBe(expectedDay);
    expect(v.checkInAt.slice(0, 10)).toBe(today);
  });

  it('found when filtering on its expected day, not on today', async () => {
    const onDay = await visitors(admin, { startDate: expectedDay, endDate: expectedDay });
    expect(onDay.body.visitors.map((x) => x.id)).toContain(id);
    const onToday = await visitors(admin, { startDate: today, endDate: today });
    expect(onToday.body.visitors.map((x) => x.id)).not.toContain(id);
  });
});

describe('KB-A15 / KB-C07 Checked In excludes overstayed visitors', () => {
  let longAgo, justUnder, exactly;
  beforeAll(async () => {
    longAgo = await addVisitor('Test 100h', 'checked_in', { checkInAgo: '100 HOUR' });
    justUnder = await addVisitor('Test 23h59', 'checked_in', { checkInAgo: '1439 MINUTE' });
    exactly = await addVisitor('Test 24h', 'checked_in', { checkInAgo: '24 HOUR' });
  });

  it('status=checked_in lists only visitors under the threshold', async () => {
    const ids = (await visitors(admin, { status: 'checked_in' })).body.visitors.map((x) => x.id);
    expect(ids).toContain(justUnder);
    expect(ids).not.toContain(longAgo);
    expect(ids).not.toContain(exactly);
  });

  it('status=overstayed lists the ones at or past it', async () => {
    const list = (await visitors(admin, { status: 'overstayed' })).body.visitors;
    const ids = list.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([longAgo, exactly]));
    expect(ids).not.toContain(justUnder);
    expect(list.every((x) => x.status === 'overstayed' && x.isOverstayed)).toBe(true);
  });
});

describe('scoping and input', () => {
  it('a tenant only sees their own visitors', async () => {
    await addVisitor('Test Other Tenant', 'checked_out', { userId: 5, room: 'C' });
    const list = (await visitors(maria)).body.visitors;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((x) => x.userId === 2)).toBe(true);
  });

  it('KB-B23 an injection string in search returns nothing and drops nothing', async () => {
    const res = await visitors(admin, { search: "'; DROP TABLE visitor_logs;--" });
    expect(res.status).toBe(200);
    expect(res.body.visitors).toEqual([]);
    expect((await one('SELECT COUNT(*) AS c FROM visitor_logs')).c).toBeGreaterThan(0);
  });
});
