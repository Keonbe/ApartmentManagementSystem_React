// Login and the session gates every endpoint relies on
// (module_verification_guide.md §3).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

describe('login', () => {
  beforeAll(async () => {
    // Test fixtures are trusted seed accounts; ensure login tests remain valid
    // whether the auth-security migration has already been applied or not.
    try { await q('UPDATE users SET email_verified_at = NOW()'); } catch { /* migration not installed in this test database */ }
  });
  it('admin and tenant get a session token and their role', async () => {
    const admin = await api('login.php', { json: { email_address: 'admin@gmail.com', password: 'admin123' } });
    expect(admin.body).toMatchObject({ valid: true, role: 'admin' });
    expect(admin.body.sessionToken).toMatch(/^[0-9a-f]{64}$/);

    const tenant = await api('login.php', { json: { email_address: 'maria.santos@gmail.com', password: 'tenant123' } });
    expect(tenant.body).toMatchObject({ valid: true, role: 'user' });
  });

  it('a wrong password is refused and counted as a failure', async () => {
    const res = await api('login.php', { json: { email_address: 'maria.santos@gmail.com', password: 'wrong' } });
    expect(res.body).toMatchObject({ valid: false, message: 'Invalid email or password' });
    expect(res.body.sessionToken).toBeUndefined();
    const row = await one('SELECT COUNT(*) AS c FROM login_attempts');
    expect(row.c).toBeGreaterThan(0);
  });

  it('the field is email_address, not email', async () => {
    const res = await api('login.php', { json: { email: 'admin@gmail.com', password: 'admin123' } });
    expect(res.body).toMatchObject({ valid: false, message: 'Email and password are required.' });
  });
});

describe('session gates', () => {
  let tenant;
  beforeAll(async () => { tenant = await loginAs('maria'); });

  it('no token on an admin endpoint → 401', async () => {
    const res = await api('update_system_settings.php', { json: { payment_window_days: '5' } });
    expect(res.status).toBe(401);
  });

  it('tenant token on an admin endpoint → 403, nothing saved (KB-E04)', async () => {
    const before = await one("SELECT setting_value FROM system_settings WHERE setting_key = 'payment_window_days'");
    const res = await api('update_system_settings.php', { token: tenant, json: { payment_window_days: '9' } });
    expect(res.status).toBe(403);
    const after = await one("SELECT setting_value FROM system_settings WHERE setting_key = 'payment_window_days'");
    expect(after).toEqual(before);
  });

  it('a forged X-User-Id / X-Admin-Id does not grant admin', async () => {
    const res = await api('update_system_settings.php', {
      token: tenant, headers: { 'X-User-Id': '4', 'X-Admin-Id': '4' }, json: { payment_window_days: '9' },
    });
    expect(res.status).toBe(403);
  });

  it('a made-up token → 401', async () => {
    const res = await api('get_visitors.php', { token: 'f'.repeat(64) });
    expect(res.status).toBe(401);
  });

  it('an archived account cannot log in', async () => {
    const token = await login('jose.reyes@gmail.com', 'tenant123');
    expect(token).toBeTruthy();
    await q('UPDATE users SET is_archived = 1 WHERE id = 3');
    const res = await api('login.php', { json: { email_address: 'jose.reyes@gmail.com', password: 'tenant123' } });
    expect(res.body).toMatchObject({ valid: false });
    // ...and the session issued before the archive stops working too.
    expect((await api('get_visitors.php', { token })).status).toBe(401);
  });
});
