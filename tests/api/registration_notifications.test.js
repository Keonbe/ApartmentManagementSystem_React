// registration.php: a new account gets a welcome notification, the admin gets a
// "new account" notice, and the sign-up is in the activity log.
import { describe, it, expect } from 'vitest';
import { api } from './lib/api.js';
import { one, q } from './lib/db.js';

const EMAIL = `welcome.${Date.now()}@example.com`;

describe('registration.php notifications', () => {
  it('welcomes the tenant, notifies the admin and logs the sign-up', async () => {
    const res = await api('registration.php', { json: {
      first_name: 'Welcome', last_name: 'Tester', email_address: EMAIL, password: 'Tenant#1234', conPassword: 'Tenant#1234', agree_terms: true,
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

  it('stores when and to which version of the Terms and Privacy Notice the person agreed (RA 10173)', async () => {
    const user = await one('SELECT terms_agreed_at, terms_version FROM users WHERE email_address = ?', [EMAIL]);
    expect(user.terms_version).toBe('2026-11-03');
    expect(user.terms_agreed_at).not.toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['false', false],
    ['the string "false"', 'false'],
  ])('refuses a sign-up without consent (%s), creates no account and uses no rate-limit attempt', async (_label, agree) => {
    const email = `noconsent.${Date.now()}@demo.example`;
    const attempts = async () => (await one("SELECT COUNT(*) AS c FROM rate_limit_events WHERE action = 'registration'")).c;
    const before = await attempts();
    const json = { first_name: 'No', last_name: 'Consent', email_address: email, password: 'Tenant#1234', conPassword: 'Tenant#1234' };
    if (agree !== undefined) json.agree_terms = agree;
    const res = await api('registration.php', { json });
    expect(res.body).toMatchObject({ success: false });
    expect(res.body.message).toMatch(/agree to the Terms/);
    expect(await one('SELECT id FROM users WHERE email_address = ?', [email])).toBeFalsy();
    expect(await attempts()).toBe(before);
  });

  it('a refused sign-up (duplicate email) creates no notification', async () => {
    const before = (await one("SELECT COUNT(*) AS c FROM notifications WHERE type IN ('welcome', 'new_user')")).c;
    const res = await api('registration.php', { json: {
      first_name: 'Welcome', last_name: 'Tester', email_address: EMAIL, password: 'Tenant#1234', conPassword: 'Tenant#1234', agree_terms: true,
    } });
    expect(res.body.success).toBe(false);
    expect((await one("SELECT COUNT(*) AS c FROM notifications WHERE type IN ('welcome', 'new_user')")).c).toBe(before);
  });
});
