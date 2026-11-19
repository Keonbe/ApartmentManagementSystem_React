// get_users.php: the tenant accounts behind Units → Assign Tenant. Each user
// carries the unit they already rent or have an open application for, so the
// picker can mark them; archived accounts are left out; admins only.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

const list = async () => {
  const res = await api('get_users.php', { token: admin });
  expect(res.status).toBe(200);
  return res.body.data;
};

describe('get_users.php', () => {
  it('is admin only', async () => {
    expect((await api('get_users.php', { token: maria })).status).toBe(403);
    expect((await api('get_users.php')).status).toBe(403);
  });

  it('lists tenant accounts with email, phone and the unit they hold', async () => {
    const users = await list();
    const m = users.find((u) => u.id === 2);
    expect(m).toEqual(expect.objectContaining({ email: expect.any(String), room: 'A', roomStatus: expect.any(String) }));
    expect(Object.keys(m)).toEqual(expect.arrayContaining(['id', 'name', 'email', 'phone', 'room', 'roomStatus']));
    expect(users.some((u) => u.role === 'admin' || u.email === 'admin@gmail.com')).toBe(false);
  });

  it('marks an open application, and leaves an account with none free', async () => {
    const open = await one("SELECT user_id, room_name FROM rent_applications WHERE status IN ('Pending Review','Approved','Action Required','active','pending-move-out') ORDER BY id DESC LIMIT 1");
    const users = await list();
    expect(users.find((u) => u.id === open.user_id).room).toBe(open.room_name);
    const free = await one(`SELECT u.id FROM users u WHERE u.role = 'user' AND u.is_archived = 0 AND NOT EXISTS (
      SELECT 1 FROM rent_applications ra WHERE ra.user_id = u.id AND ra.status IN ('Pending Review','Pending','Approved','Action Required','active','pending-move-out')) LIMIT 1`);
    if (free) expect(users.find((u) => u.id === free.id)).toEqual(expect.objectContaining({ room: null, roomStatus: null }));
  });

  it('leaves archived accounts out', async () => {
    const target = await one("SELECT id FROM users WHERE role = 'user' AND is_archived = 0 ORDER BY id DESC LIMIT 1");
    await q('UPDATE users SET is_archived = 1 WHERE id = ?', [target.id]);
    try {
      expect((await list()).some((u) => u.id === target.id)).toBe(false);
    } finally {
      await q('UPDATE users SET is_archived = 0 WHERE id = ?', [target.id]);
    }
  });
});
