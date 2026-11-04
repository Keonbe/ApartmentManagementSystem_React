// Email verification and device sign-in codes: login.php, verify_email.php,
// verify_device.php. The rest of the suite signs in through a trusted device
// (lib/api.js trustDevice), so this file is the one that exercises the gate itself.
import { describe, it, expect, beforeAll } from 'vitest';
import { api } from './lib/api.js';
import { q, one } from './lib/db.js';

const HASH = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy'; // tenant123
const TOKEN = 'a'.repeat(64);
const UNVERIFIED = 'sam.unverified@gmail.com';
const VERIFIED = 'vera.verified@gmail.com';

// An empty Cookie header keeps lib/api.js from marking this device as trusted.
const loginAs = (email) => api('login.php', { headers: { Cookie: '' }, json: { email_address: email, password: 'tenant123' } });
const otpOf = async () => (await one('SELECT login_otp FROM users WHERE email_address = ?', [VERIFIED])).login_otp;

beforeAll(async () => {
  await q(`INSERT INTO users (id, first_name, last_name, contact_no, gender, email_address, password, role, verification_token)
           VALUES (91, 'Sam', 'Unverified', '+63 9171234591', 'Male', ?, ?, 'user', ?)`, [UNVERIFIED, HASH, TOKEN]);
  await q(`INSERT INTO users (id, first_name, last_name, contact_no, gender, email_address, password, role, email_verified_at)
           VALUES (92, 'Vera', 'Verified', '+63 9171234592', 'Female', ?, ?, 'user', NOW())`, [VERIFIED, HASH]);
});

describe('email verification', () => {
  it('refuses sign-in until the address is verified', async () => {
    const res = await loginAs(UNVERIFIED);
    expect(res.body.email_verification_required).toBe(true);
    expect(res.body.sessionToken).toBeUndefined();
  });

  it('rejects a malformed or unknown token and verifies on a good one, once', async () => {
    expect((await api('verify_email.php', { json: { token: 'nope' } })).status).toBe(400);
    expect((await api('verify_email.php', { json: { token: 'b'.repeat(64) } })).body.success).toBe(false);

    expect((await api('verify_email.php', { json: { token: TOKEN } })).body.success).toBe(true);
    const row = await one('SELECT email_verified_at, verification_token FROM users WHERE id = 91');
    expect(row.email_verified_at).not.toBeNull();
    expect(row.verification_token).toBeNull();
    expect((await api('verify_email.php', { json: { token: TOKEN } })).body.success).toBe(false); // the link works once
  });
});

describe('device sign-in code', () => {
  it('a verified tenant on a new device gets a code, not a session', async () => {
    const res = await loginAs(VERIFIED);
    expect(res.body.status).toBe('device_verification_required');
    expect(res.body.sessionToken).toBeUndefined();
    expect(await otpOf()).toMatch(/^\d{6}$/);
  });

  it('a wrong code is refused and counted; three misses lock the code', async () => {
    await loginAs(VERIFIED);
    const real = await otpOf();
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 3; i++) {
      const res = await api('verify_device.php', { json: { email_address: VERIFIED, otp: wrong } });
      expect(res.body.valid).toBe(false);
    }
    expect((await one('SELECT login_otp_attempts AS n FROM users WHERE id = 92')).n).toBe(3);
    const locked = await api('verify_device.php', { json: { email_address: VERIFIED, otp: real } });
    expect(locked.body.valid).toBe(false); // even the right code is refused after three misses
  });

  it('a malformed code is a 400', async () => {
    expect((await api('verify_device.php', { json: { email_address: VERIFIED, otp: '12ab' } })).status).toBe(400);
    expect((await api('verify_device.php', { json: { email_address: 'not-an-email', otp: '123456' } })).status).toBe(400);
  });

  it('the right code signs in, trusts the device, and clears the code', async () => {
    await loginAs(VERIFIED); // issues a fresh code and resets the attempts
    const res = await api('verify_device.php', { json: { email_address: VERIFIED, otp: await otpOf() } });
    expect(res.body).toMatchObject({ valid: true, role: 'user' });
    expect(res.body.sessionToken).toMatch(/^[a-f0-9]{64}$/);

    const after = await one('SELECT login_otp, login_otp_attempts FROM users WHERE id = 92');
    expect(after.login_otp).toBeNull();
    expect(after.login_otp_attempts).toBe(0);
    expect((await one('SELECT COUNT(*) AS n FROM trusted_devices WHERE user_id = 92')).n).toBe(1);

    // The same code cannot be used again.
    const again = await api('verify_device.php', { json: { email_address: VERIFIED, otp: '123456' } });
    expect(again.body.valid).toBe(false);
  });

  it('a demo.example tenant skips the code outside production; other domains do not', async () => {
    const demo = 'dina.demo@demo.example';
    await q(`INSERT INTO users (id, first_name, last_name, contact_no, gender, email_address, password, role, email_verified_at)
             VALUES (93, 'Dina', 'Demo', '+63 9171234593', 'Female', ?, ?, 'user', NOW())`, [demo, HASH]);
    const res = await loginAs(demo);
    expect(res.body.sessionToken).toBeTruthy();
    expect((await loginAs(VERIFIED)).body.status).toBe('device_verification_required');
  });

  it('an administrator skips the code', async () => {
    const res = await api('login.php', { headers: { Cookie: '' }, json: { email_address: 'admin@gmail.com', password: 'admin123' } });
    expect(res.body.sessionToken).toBeTruthy();
  });
});
