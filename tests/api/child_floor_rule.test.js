// Children rule per floor (manager interview Q6): no children under 5 on 3F
// (stairs), no limit on 1F/2F. household_members.php checks it on the tenant's
// add request and process_tenant_request.php again on the admin's approval.
// Also: the visitor house rule follows the Visitor Management toggle.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { one, setSetting, setting } from './lib/db.js';

let admin, maria, ana;
const saveSettings = (json) => api('update_system_settings.php', { token: admin, json });
const addMember = (token, fullName, age, relationship = 'Child') =>
  api('household_members.php', { token, json: { action: 'add', fullName, relationship, age } });
const requestFor = (userId, memberId) => one(
  "SELECT id FROM notifications WHERE user_id = ? AND type = 'household_request' AND metadata_value = ?", [userId, `add:${memberId}`],
);
const decide = (notificationId, action = 'approve') =>
  api('process_tenant_request.php', { token: admin, json: { notificationId, action } });

beforeAll(async () => {
  admin = await loginAs('admin');
  maria = await loginAs('maria'); // room A, 1F
  ana = await login('ana.bautista@gmail.com', 'tenant123'); // user 12, room K, 3F
});

describe('defaults', () => {
  it('ships with 3F restricted below age 5 and no building-wide minimum', async () => {
    expect(JSON.parse(await setting('child_restricted_floors'))).toEqual(['3F']);
    expect(await setting('child_restricted_below_age')).toBe('5');
    expect(await setting('min_household_age')).toBe('0');
  });

  it('the household roster tells a 3F tenant about the rule, a 1F tenant gets none', async () => {
    const k = await api('household_members.php', { token: ana });
    expect(k.body.childFloorRule).toMatchObject({ floor: '3F', floorLabel: '3rd floor', belowAge: 5 });
    const a = await api('household_members.php', { token: maria });
    expect(a.body.childFloorRule).toBeNull();
  });
});

describe('household add request', () => {
  it('age 3 on a 3F unit is refused with the stairs message, nothing saved', async () => {
    const res = await addMember(ana, 'Baby Bautista', 3);
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Children under 5 cannot live on the 3rd floor because of the stairs.');
    expect(await one("SELECT id FROM household_members WHERE full_name = 'Baby Bautista'")).toBeNull();
  });

  it('age 0 (a newborn) on 3F is refused too', async () => {
    const res = await addMember(ana, 'Newborn Bautista', 0);
    expect(res.status).toBe(422);
  });

  it('age 5 on 3F is allowed (the limit is "under 5")', async () => {
    const res = await addMember(ana, 'Five Bautista', 5);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('age 3 on a 1F unit is allowed', async () => {
    const res = await addMember(maria, 'Toddler Santos', 3);
    expect(res.status).toBe(200);
    const row = await one("SELECT status, age, age_category FROM household_members WHERE full_name = 'Toddler Santos'");
    expect(row).toMatchObject({ status: 'Pending', age: 3, age_category: 'toddler' });
  });
});

describe('admin approval re-checks the rule', () => {
  it('a 3F request made while the rule was off is refused at approval once it is back on', async () => {
    await setSetting('child_restricted_floors', '[]');
    const add = await addMember(ana, 'Later Bautista', 2);
    expect(add.status).toBe(200);
    const member = await one("SELECT id FROM household_members WHERE full_name = 'Later Bautista'");
    const notif = await requestFor(12, member.id);

    await setSetting('child_restricted_floors', '["3F"]');
    const res = await decide(notif.id);
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Children under 5 cannot live on the 3rd floor/);
    // Rolled back: the request stays open and the member pending.
    expect((await one('SELECT status FROM household_members WHERE id = ?', [member.id])).status).toBe('Pending');
    expect((await one('SELECT status FROM notifications WHERE id = ?', [notif.id])).status).toBe('Pending');

    // Rejecting it is still possible.
    const rej = await decide(notif.id, 'reject');
    expect(rej.status).toBe(200);
  });

  it('a 1F child request is approved', async () => {
    const member = await one("SELECT id FROM household_members WHERE full_name = 'Toddler Santos'");
    const notif = await requestFor(2, member.id);
    const res = await decide(notif.id);
    expect(res.status).toBe(200);
    expect((await one('SELECT status FROM household_members WHERE id = ?', [member.id])).status).toBe('Active');
  });
});

describe('settings validation', () => {
  it.each([
    ['a non-array', { child_restricted_floors: '3F' }],
    ['an object', { child_restricted_floors: { a: '3F' } }],
    ['an unknown floor', { child_restricted_floors: ['9F'] }],
    ['duplicates', { child_restricted_floors: ['3F', '3F'] }],
    ['a number in the list', { child_restricted_floors: [3] }],
    ['age 18', { child_restricted_below_age: 18 }],
    ['age -1', { child_restricted_below_age: -1 }],
    ['age as text', { child_restricted_below_age: 'five' }],
    ['age with decimals', { child_restricted_below_age: 4.5 }],
    ['minimum age 18', { min_household_age: 18 }],
  ])('%s is refused with 422 and nothing saved', async (_label, body) => {
    const before = [await setting('child_restricted_floors'), await setting('child_restricted_below_age'), await setting('min_household_age')];
    const res = await saveSettings(body);
    expect(res.status).toBe(422);
    expect([await setting('child_restricted_floors'), await setting('child_restricted_below_age'), await setting('min_household_age')]).toEqual(before);
  });

  it('valid values save (age 0 is allowed and means no limit)', async () => {
    const res = await saveSettings({ child_restricted_floors: ['2F', '3F'], child_restricted_below_age: 0, min_household_age: 0 });
    expect(res.status).toBe(200);
    expect(JSON.parse(await setting('child_restricted_floors'))).toEqual(['2F', '3F']);
    expect(await setting('child_restricted_below_age')).toBe('0');
    // Age limit 0: a baby on 3F is accepted.
    const add = await addMember(ana, 'Zero Limit Bautista', 1);
    expect(add.status).toBe(200);
  });

  it('an empty floor list lifts the restriction: a 3-year-old on 3F is allowed', async () => {
    const res = await saveSettings({ child_restricted_floors: [], child_restricted_below_age: 5 });
    expect(res.status).toBe(200);
    expect(await setting('child_restricted_floors')).toBe('[]');
    const add = await addMember(ana, 'Free Floor Bautista', 3);
    expect(add.status).toBe(200);
  });

  it('a non-admin cannot change the rule', async () => {
    const res = await api('update_system_settings.php', { token: ana, json: { child_restricted_floors: [] } });
    expect([401, 403]).toContain(res.status);
  });
});

describe('visitor house rule follows the Visitor Management toggle', () => {
  const visitorRule = (rules) => rules.some((r) => r.category === 'Visitors & Guests');

  it('is shown to tenants while visitor management is on', async () => {
    await setSetting('service_visitor_management_active', 'true');
    const res = await api('house_rules.php', { token: maria, query: { scope: 'house' } });
    expect(visitorRule(res.body.rules)).toBe(true);
  });

  it('is hidden from tenants and guests while it is off, still listed for the admin', async () => {
    await setSetting('service_visitor_management_active', 'false');
    const tenant = await api('house_rules.php', { token: maria, query: { scope: 'house' } });
    expect(visitorRule(tenant.body.rules)).toBe(false);
    expect(tenant.body.rules.length).toBeGreaterThan(0);
    const guest = await api('house_rules.php', { query: { scope: 'all' } });
    expect(visitorRule(guest.body.rules)).toBe(false);
    const adminView = await api('house_rules.php', { token: admin, query: { scope: 'house' } });
    expect(visitorRule(adminView.body.rules)).toBe(true);
    await setSetting('service_visitor_management_active', 'true');
  });
});
