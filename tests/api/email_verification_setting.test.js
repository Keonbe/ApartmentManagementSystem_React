// Email verification on/off (Admin → Other Settings → Sign-in & Verification):
// login_otp_settings.php action=set_email_verification, and what registration.php,
// login.php and verify_device.php do with email_verification_enabled.
// Accounts are on demo.example, so the device code (a separate setting) is skipped.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { q, one, setting, setSetting } from './lib/db.js';

const HASH = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy'; // tenant123
const WAITING = 'verify.waiting@demo.example'; // signed up, never opened the link
let admin;

const post = (json, token = admin) => api('login_otp_settings.php', { token, json });
const signIn = (email, password) => api('login.php', { json: { email_address: email, password } });
const register = (email) => api('registration.php', { json: {
  first_name: 'Vera', last_name: 'Fication', email_address: email, password: 'Tenant#1234', conPassword: 'Tenant#1234',
} });

beforeAll(async () => {
  admin = await login('admin@gmail.com', 'admin123');
  await q(
    `INSERT INTO users (first_name, last_name, email_address, password, role, email_verified_at, verification_token)
     VALUES ('Wait', 'Ing', ?, ?, 'user', NULL, REPEAT('a', 64))`, [WAITING, HASH],
  );
});

afterAll(async () => {
  await setSetting('email_verification_enabled', '1');
});

describe('the setting', () => {
  it('is on by default and reported with the sign-in code settings', async () => {
    expect(await setting('email_verification_enabled')).toBe('1');
    const res = await api('login_otp_settings.php', { token: admin });
    expect(res.status).toBe(200);
    expect(res.body.email_verification).toBe(true);
  });

  it('a tenant cannot change it', async () => {
    const tenant = await loginAs('maria');
    expect((await post({ action: 'set_email_verification', enabled: false }, tenant)).status).toBe(403);
    expect(await setting('email_verification_enabled')).toBe('1');
  });

  it('refuses anything but true or false', async () => {
    const res = await post({ action: 'set_email_verification', enabled: '0' });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty('enabled');
    expect(await setting('email_verification_enabled')).toBe('1');
  });
});

describe('on', () => {
  it('a new account gets a link and cannot sign in until it opens it', async () => {
    const email = 'verify.on@demo.example';
    const res = await register(email);
    expect(res.body).toMatchObject({ success: true, verification_required: true });
    const user = await one('SELECT email_verified_at, verification_token FROM users WHERE email_address = ?', [email]);
    expect(user.email_verified_at).toBeNull();
    expect(user.verification_token).toMatch(/^[a-f0-9]{64}$/);

    const refused = await signIn(email, 'Tenant#1234');
    expect(refused.body).toMatchObject({ valid: false, email_verification_required: true });
  });

  it('an account waiting for its link cannot sign in', async () => {
    expect((await signIn(WAITING, 'tenant123')).body.email_verification_required).toBe(true);
  });
});

describe('off', () => {
  beforeAll(async () => {
    const res = await post({ action: 'set_email_verification', enabled: false });
    expect(res.body).toMatchObject({ success: true, email_verification: false });
    expect(await setting('email_verification_enabled')).toBe('0');
    const log = await one("SELECT category FROM activity_logs WHERE action = 'Updated Email Verification Setting' ORDER BY id DESC LIMIT 1");
    expect(log.category).toBe('auth');
  });

  it('a new account is verified at sign-up, gets no link and signs straight in', async () => {
    const email = 'verify.off@demo.example';
    const res = await register(email);
    expect(res.body).toMatchObject({ success: true, verification_required: false });
    const user = await one('SELECT id, email_verified_at, verification_token FROM users WHERE email_address = ?', [email]);
    expect(user.email_verified_at).not.toBeNull();
    expect(user.verification_token).toBeNull();
    const welcome = await one("SELECT message FROM notifications WHERE user_id = ? AND type = 'welcome'", [user.id]);
    expect(welcome.message).not.toMatch(/verify/i);

    const ok = await signIn(email, 'Tenant#1234');
    expect(ok.body.valid).toBe(true);
    expect(ok.body.sessionToken).toBeTruthy();
  });

  it('an account still waiting for its link can sign in', async () => {
    const ok = await signIn(WAITING, 'tenant123');
    expect(ok.body.valid).toBe(true);
  });

  it('a wrong password is still refused', async () => {
    const res = await signIn(WAITING, 'wrong-password');
    expect(res.body.valid).toBe(false);
    expect(res.body.email_verification_required).toBeUndefined();
  });

  it('turned back on, accounts made while it was off still sign in', async () => {
    expect((await post({ action: 'set_email_verification', enabled: true })).body.email_verification).toBe(true);
    expect((await signIn('verify.off@demo.example', 'Tenant#1234')).body.valid).toBe(true);
    expect((await signIn(WAITING, 'tenant123')).body.email_verification_required).toBe(true);
  });
});
