// registration.php: a new account gets a welcome notification, the admin gets a
// "new account" notice, and the sign-up is in the activity log.
import { describe, it, expect } from 'vitest';
import { api } from './lib/api.js';
import { one, q } from './lib/db.js';

const EMAIL = `welcome.${Date.now()}@example.com`;

describe('registration.php notifications', () => {
  it('welcomes the tenant, notifies the admin and logs the sign-up', async () => {
    const res = await api('registration.php', { json: {
      first_name: 'Welcome', last_name: 'Tester', email_address: EMAIL, password: 'Tenant#1234', conPassword: 'Tenant#1234',
    } });
    expect(res.body).toMatchObject({ success: true });

    const user = await one('SELECT id FROM users WHERE email_address = ?', [EMAIL]);
    const welcome = await q("SELECT title, message FROM notifications WHERE user_id = ? AND type = 'welcome'", [user.id]);
    expect(welcome).toHaveLength(1);
    expect(welcome[0].title).toBe('Welcome to AMS');
    expect(welcome[0].message).toContain('Welcome');

    const admin = await q("SELECT message, status FROM notifications WHERE type = 'new_user' AND metadata_value = ?", [`new_user:${user.id}`]);
    expect(admin).toHaveLength(1);
    expect(admin[0].message).toContain(EMAIL);
    expect(admin[0].status).toBe('Resolved');

    const log = await one("SELECT category FROM activity_logs WHERE action = 'Account Registered' AND details LIKE ?", [`%${EMAIL}%`]);
    expect(log.category).toBe('user');
  });

  it('a refused sign-up (duplicate email) creates no notification', async () => {
    const before = (await one("SELECT COUNT(*) AS c FROM notifications WHERE type IN ('welcome', 'new_user')")).c;
    const res = await api('registration.php', { json: {
      first_name: 'Welcome', last_name: 'Tester', email_address: EMAIL, password: 'Tenant#1234', conPassword: 'Tenant#1234',
    } });
    expect(res.body.success).toBe(false);
    expect((await one("SELECT COUNT(*) AS c FROM notifications WHERE type IN ('welcome', 'new_user')")).c).toBe(before);
  });
});
