// Display names carry the suffix ("Maria Santos Jr.": person_name() in
// config.php and its SQL form), and the first sign-in is told apart from later
// ones (users.last_login_at, record_sign_in(): login.php and verify_device.php
// return user.first_login, which Home and My Room use for "Welcome" vs
// "Welcome back").
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

const HASH = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy'; // tenant123
let admin;

const signIn = (email, headers = {}) => api('login.php', { json: { email_address: email, password: 'tenant123' }, headers });
const newUser = async (email, extra = '') => {
  await q(
    `INSERT INTO users (first_name, last_name, email_address, password, role, email_verified_at${extra ? ', login_otp_mode' : ''})
     VALUES ('Nova', 'Signin', ?, ?, 'user', NOW()${extra ? ', ?' : ''})`,
    extra ? [email, HASH, extra] : [email, HASH],
  );
  return (await one('SELECT id FROM users WHERE email_address = ?', [email])).id;
};

beforeAll(async () => {
  admin = await loginAs('admin');
  // Maria (user 2, application 1) has a suffix on her account and her application.
  await q("UPDATE users SET suffix = 'Jr.' WHERE id = 2");
  await q("UPDATE rent_applications SET suffix = 'Jr.' WHERE id = 1");
});

describe('names include the suffix', () => {
  it('the tenant list for admins', async () => {
    const res = await api('get_users.php', { token: admin });
    expect(res.status).toBe(200);
    expect(res.body.data.find((u) => u.id === 2).name).toBe('Maria Santos Jr.');
  });

  it('the tenants page (from the application)', async () => {
    const res = await api('get_tenants.php', { token: admin });
    expect(res.status).toBe(200);
    expect(res.body.data.map((t) => t.name)).toContain('Maria Santos Jr.');
  });

  it('invoices send the suffix with the name parts', async () => {
    const res = await api('get_invoices.php', { token: admin });
    expect(res.status).toBe(200);
    const list = res.body.data || res.body.invoices || res.body;
    const maria = (Array.isArray(list) ? list : []).find((i) => Number(i.user_id) === 2);
    expect(maria).toBeTruthy();
    expect(maria.suffix).toBe('Jr.');
  });

  it('a name with no suffix has no trailing space', async () => {
    const res = await api('get_users.php', { token: admin });
    for (const u of res.body.data.filter((x) => x.id !== 2)) expect(u.name).toBe(u.name.trim());
  });
});

describe('first sign-in', () => {
  it('password sign-in: first_login is true once, then false', async () => {
    const email = 'first.signin@demo.example';
    const id = await newUser(email);
    const first = await signIn(email);
    expect(first.body.valid).toBe(true);
    expect(first.body.user.first_login).toBe(true);
    expect((await one('SELECT last_login_at FROM users WHERE id = ?', [id])).last_login_at).not.toBeNull();

    const again = await signIn(email);
    expect(again.body.valid).toBe(true);
    expect(again.body.user.first_login).toBe(false);
  });

  it('a wrong password does not use up the first sign-in', async () => {
    const email = 'first.wrongpw@demo.example';
    const id = await newUser(email);
    const bad = await api('login.php', { json: { email_address: email, password: 'nope-nope' } });
    expect(bad.body.valid).toBe(false);
    expect((await one('SELECT last_login_at FROM users WHERE id = ?', [id])).last_login_at).toBeNull();
    expect((await signIn(email)).body.user.first_login).toBe(true);
  });

  it('sign-in with a device code: first_login comes with verify_device.php, not the code request', async () => {
    const email = 'first.code@code-test.example'; // outside the bypass domain
    const id = await newUser(email, 'on');
    const asked = await signIn(email, { Cookie: 'unrelated=1' });
    expect(asked.body.status).toBe('device_verification_required');
    expect((await one('SELECT last_login_at FROM users WHERE id = ?', [id])).last_login_at).toBeNull();

    const { login_otp: otp } = await one('SELECT login_otp FROM users WHERE id = ?', [id]);
    const verified = await api('verify_device.php', { json: { email_address: email, otp } });
    expect(verified.body.valid).toBe(true);
    expect(verified.body.user.first_login).toBe(true);
  });

  it('two sign-ins at the same time: only one is the first', async () => {
    const email = 'first.race@demo.example';
    await newUser(email);
    const results = await Promise.all([signIn(email), signIn(email), signIn(email)]);
    expect(results.every((r) => r.body.valid)).toBe(true);
    expect(results.filter((r) => r.body.user.first_login === true)).toHaveLength(1);
  });
});
