// manage_users.php (admin account management) and update_occupants.php (tenant occupancy request).
// QA guide rows Q11-16, Q1-04, Q1-05, INP-14.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, login } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

const HASH = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy'; // tenant123
const mk = (id, first, email, role = 'user', extra = '') =>
  q(`INSERT INTO users (id, first_name, last_name, contact_no, gender, email_address, password, role, email_verified_at)
     VALUES (?, ?, 'Qa', ?, 'Male', ?, ?, ?, NOW())`, [id, first, `+63 91712341${id}`, email, HASH, role]);

let admin;
const act = (token, body) => api('manage_users.php', { token, json: body });
const userRow = (id) => one('SELECT role, is_archived, first_name, email_address, contact_no FROM users WHERE id = ?', [id]);
const adminCount = async () => (await one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_archived = 0")).n;

beforeAll(async () => {
  admin = await loginAs('admin');
  await mk(131, 'Tess', 'tess.target@demo.example');
  await mk(132, 'Uma', 'uma.second@demo.example');
  await mk(133, 'Vic', 'vic.third@demo.example');
  await mk(134, 'Wes', 'wes.admin@demo.example', 'admin');
});

describe('manage_users.php access', () => {
  it('lists users for an admin only', async () => {
    const maria = await loginAs('maria');
    expect((await api('manage_users.php')).status).toBe(401);
    expect((await api('manage_users.php', { token: maria })).status).toBe(403);
    const res = await api('manage_users.php', { token: admin });
    expect(res.body.users.some((u) => u.is_self)).toBe(true);
    expect(res.body.users.find((u) => u.id === 131)).not.toHaveProperty('password');
  });

  it('refuses a tenant for every action and changes nothing', async () => {
    const maria = await loginAs('maria');
    for (const body of [
      { action: 'set_role', user_id: 131, role: 'admin' },
      { action: 'delete', user_id: 131 },
      { action: 'reset_password', user_id: 131, new_password: 'Brand#New2026' },
    ]) expect((await act(maria, body)).status).toBe(403);
    expect(await userRow(131)).toMatchObject({ role: 'user', is_archived: 0 });
  });

  it('validates the request shape and the target', async () => {
    expect((await act(admin, {})).status).toBe(422);
    expect((await act(admin, { action: 'delete' })).status).toBe(422);
    expect((await act(admin, { action: 'explode', user_id: 131 })).status).toBe(422);
    expect((await act(admin, { action: 'delete', user_id: 99999 })).status).toBe(404);
  });

  it('will not let an admin act on their own account', async () => {
    const me = (await one("SELECT id FROM users WHERE email_address = 'admin@gmail.com'")).id;
    for (const action of ['set_role', 'delete', 'update', 'reset_password'])
      expect((await act(admin, { action, user_id: me, role: 'user' })).status).toBe(409);
    expect((await userRow(me)).role).toBe('admin');
  });
});

describe('manage_users.php update', () => {
  const upd = (over = {}) => act(admin, { action: 'update', user_id: 131, first_name: 'Tess', last_name: 'Target', email: 'tess.target@demo.example', contact_no: '09171234131', gender: 'Female', ...over });

  it('stores names exactly: apostrophes, accents, emoji and markup are kept as text', async () => {
    const name = "O'Brien Zoë 李 😀";
    expect((await upd({ first_name: name })).body.success).toBe(true);
    expect((await userRow(131)).first_name).toBe(name);
    const markup = '<img src=x onerror=alert(1)>';
    expect((await upd({ first_name: markup })).body.success).toBe(true);
    expect((await userRow(131)).first_name).toBe(markup);
  });

  it('normalises the phone number to +639XXXXXXXXX', async () => {
    expect((await upd({ contact_no: '0917 123 4131' })).body.success).toBe(true);
    expect((await userRow(131)).contact_no).toBe('+639171234131');
  });

  it.each([
    ['blank first name', { first_name: '   ' }],
    ['first name over 30 characters', { first_name: 'x'.repeat(31) }],
    ['bad email', { email: 'tess@' }],
    ['email with a space', { email: 'te ss@demo.example' }],
    ['bad phone', { contact_no: '12-ab' }],
  ])('rejects %s with 422', async (_n, over) => {
    const before = await userRow(131);
    expect((await upd(over)).status).toBe(422);
    expect(await userRow(131)).toEqual(before);
  });

  it('keeps an email unique regardless of letter case', async () => {
    expect((await upd({ email: 'UMA.SECOND@demo.example' })).status).toBe(409);
    expect((await userRow(131)).email_address).toBe('tess.target@demo.example');
  });
});

describe('manage_users.php reset_password, set_role, delete', () => {
  it('resets a password, ends that user\'s sessions and enforces the policy', async () => {
    const t = await login('uma.second@demo.example', 'tenant123');
    expect((await act(admin, { action: 'reset_password', user_id: 132, new_password: 'weak' })).status).toBe(422);
    expect((await act(admin, { action: 'reset_password', user_id: 132, new_password: 'tenant123' })).status).toBe(422);
    expect((await api('get_my_requests.php', { token: t })).status).toBe(200);
    expect((await act(admin, { action: 'reset_password', user_id: 132, new_password: 'Brand#New2026' })).body.success).toBe(true);
    expect((await api('get_my_requests.php', { token: t })).status).toBe(401);
    expect(await login('uma.second@demo.example', 'Brand#New2026')).toBeTruthy();
  });

  it('promotes and demotes, signs the user out, and caps admin accounts at three', async () => {
    const t = await login('vic.third@demo.example', 'tenant123');
    expect(await adminCount()).toBe(2); // seed admin + Wes
    expect((await act(admin, { action: 'set_role', user_id: 133, role: 'owner' })).status).toBe(422);
    expect((await act(admin, { action: 'set_role', user_id: 131, role: 'user' })).status).toBe(409); // already a user

    expect((await act(admin, { action: 'set_role', user_id: 133, role: 'admin' })).body.success).toBe(true);
    expect((await userRow(133)).role).toBe('admin');
    expect((await api('get_my_requests.php', { token: t })).status).toBe(401); // old privileges end with the session
    expect(await adminCount()).toBe(3);

    expect((await act(admin, { action: 'set_role', user_id: 131, role: 'admin' })).status).toBe(409); // limit reached
    expect((await userRow(131)).role).toBe('user');

    expect((await act(admin, { action: 'set_role', user_id: 133, role: 'user' })).body.success).toBe(true);
    expect(await adminCount()).toBe(2);
  });

  it('will not archive an admin, or a tenant with an active rental; archives and restores others', async () => {
    expect((await act(admin, { action: 'delete', user_id: 134 })).status).toBe(409); // admin
    expect((await act(admin, { action: 'delete', user_id: 3 })).status).toBe(409); // Jose has a rental
    expect((await userRow(3)).is_archived).toBe(0);

    const t = await login('tess.target@demo.example', 'tenant123');
    expect((await act(admin, { action: 'delete', user_id: 131 })).body.success).toBe(true);
    expect((await userRow(131)).is_archived).toBe(1);
    expect((await api('get_my_requests.php', { token: t })).status).toBe(401);
    expect((await act(admin, { action: 'delete', user_id: 131 })).status).toBe(409); // already archived
    expect((await api('login.php', { json: { email_address: 'tess.target@demo.example', password: 'tenant123' } })).body.sessionToken).toBeUndefined();

    expect((await act(admin, { action: 'unarchive', user_id: 131 })).body.success).toBe(true);
    expect((await act(admin, { action: 'unarchive', user_id: 131 })).status).toBe(409);
    expect((await userRow(131)).is_archived).toBe(0);
  });

  it('refuses to promote an archived account, and logs every change', async () => {
    await act(admin, { action: 'delete', user_id: 132 });
    expect((await act(admin, { action: 'set_role', user_id: 132, role: 'admin' })).status).toBe(409);
    const logged = await q("SELECT action FROM activity_logs WHERE category = 'user' ORDER BY id");
    for (const title of ['Edited User', 'Reset User Password', 'Changed User Role', 'Archived User', 'Restored User'])
      expect(logged.map((r) => r.action)).toContain(title);
  });
});

describe('update_occupants.php', () => {
  const request = (token, occupants) => api('update_occupants.php', { token, json: { occupants } });
  let maria, jose;

  beforeAll(async () => {
    maria = await loginAs('maria');
    jose = await loginAs('jose');
    await setSetting('max_occupants_per_unit', 4);
  });
  const current = async (userId) => (await one("SELECT occupants FROM rent_applications WHERE user_id = ? AND status IN ('Approved','active','pending-move-out') ORDER BY id DESC LIMIT 1", [userId])).occupants;
  const open = async (userId) => (await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'occupancy_request' AND status = 'Pending'", [userId])).n;

  it('needs a session', async () => {
    expect((await api('update_occupants.php', { json: { occupants: 2 } })).status).toBe(401);
  });

  it('rejects zero, negative, fractional-to-zero, text, the current count and anything above the limit', async () => {
    const now = await current(2);
    for (const bad of [0, -3, 'abc', null, now, 99]) {
      const res = await request(maria, bad);
      expect(res.body.success, `occupants=${bad}`).toBe(false);
    }
    expect(await open(2)).toBe(0);
  });

  it('files one pending request for the caller and blocks a second while it is open', async () => {
    const now = await current(2);
    const next = now < 4 ? now + 1 : now - 1;
    const res = await request(maria, next);
    expect(res.body.success).toBe(true);
    expect(await open(2)).toBe(1);
    const row = await one("SELECT user_id, metadata_value FROM notifications WHERE type = 'occupancy_request' AND user_id = 2");
    expect(String(row.metadata_value)).toBe(String(next));
    expect((await request(maria, next === 1 ? 2 : 1)).body.success).toBe(false); // already pending
    expect(await open(2)).toBe(1);
  });

  it('files only for the signed-in tenant, whatever the body says', async () => {
    const now = await current(3);
    const next = now < 4 ? now + 1 : now - 1;
    const res = await api('update_occupants.php', { token: jose, json: { occupants: next, user_id: 2, email: 'maria.santos@demo.example' } });
    expect(res.body.success).toBe(true);
    expect(await open(3)).toBe(1);
    expect(await open(2)).toBe(1); // Maria's count is unchanged
  });

  it('has no room to change for an account without a rental', async () => {
    const t = await login('tess.target@demo.example', 'tenant123');
    expect((await request(t, 2)).body.success).toBe(false);
  });
});
