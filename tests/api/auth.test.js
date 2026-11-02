// Login and the session gates every endpoint relies on
// (module_verification_guide.md §3).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

describe('login', () => {
  it('admin gets a session token and their role at once', async () => {
    const admin = await api('login.php', { json: { email_address: 'admin@gmail.com', password: 'admin123' } });
    expect(admin.body).toMatchObject({ valid: true, role: 'admin' });
    expect(admin.body.sessionToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('seed accounts are verified (SetupDB / seed_mock_data)', async () => {
    const row = await one('SELECT COUNT(*) AS c FROM users WHERE email_verified_at IS NULL');
    expect(row.c).toBe(0);
  });

  it('a tenant on a new device needs the emailed code; the code makes the device trusted', async () => {
    const maria = { email_address: 'maria.santos@gmail.com', password: 'tenant123' };
    const first = await api('login.php', { json: maria });
    expect(first.body).toMatchObject({ valid: false, status: 'device_verification_required' });
    expect(first.body.sessionToken).toBeUndefined();

    const { login_otp: otp } = await one('SELECT login_otp FROM users WHERE id = 2');
    const wrong = String((Number(otp) + 1) % 1000000).padStart(6, '0');
    expect((await api('verify_device.php', { json: { email_address: maria.email_address, otp: wrong } })).body.valid).toBe(false);

    const ok = await api('verify_device.php', { json: { email_address: maria.email_address, otp } });
    expect(ok.body).toMatchObject({ valid: true, role: 'user' });
    expect(ok.body.sessionToken).toMatch(/^[0-9a-f]{64}$/);
    // The code is single use.
    expect((await api('verify_device.php', { json: { email_address: maria.email_address, otp } })).body.valid).toBe(false);
  });

  it('a trusted-device cookie skips the code; a made-up one does not', async () => {
    const raw = 'a'.repeat(64);
    const sha = (await import('node:crypto')).createHash('sha256').update(raw).digest('hex');
    await q('INSERT INTO trusted_devices (user_id, device_token) VALUES (2, ?)', [sha]);
    const maria = { email_address: 'maria.santos@gmail.com', password: 'tenant123' };
    const trusted = await api('login.php', { json: maria, headers: { Cookie: `ams_trusted_device=${raw}` } });
    expect(trusted.body).toMatchObject({ valid: true, role: 'user' });
    const unknown = await api('login.php', { json: maria, headers: { Cookie: `ams_trusted_device=${'b'.repeat(64)}` } });
    expect(unknown.body.status).toBe('device_verification_required');
  });

  it('an unverified account is refused before any code is sent', async () => {
    await q("UPDATE users SET email_verified_at = NULL, login_otp = NULL WHERE email_address = 'jose.reyes@gmail.com'");
    const res = await api('login.php', { json: { email_address: 'jose.reyes@gmail.com', password: 'tenant123' } });
    expect(res.body).toMatchObject({ valid: false, email_verification_required: true });
    expect((await one("SELECT login_otp FROM users WHERE email_address = 'jose.reyes@gmail.com'")).login_otp).toBeNull();
    await q("UPDATE users SET email_verified_at = NOW() WHERE email_address = 'jose.reyes@gmail.com'");
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
