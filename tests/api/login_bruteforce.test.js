// login.php throttling (QA guide Q11-17): wrong passwords are counted per account and address, the
// lock holds against the right password, other accounts are unaffected, unknown and known emails are
// treated alike, and a successful sign-in clears the count.
import { describe, it, expect, beforeEach } from 'vitest';
import { api } from './lib/api.js';
import { q, one } from './lib/db.js';

const MARIA = 'maria.santos@demo.example';
const JOSE = 'jose.reyes@demo.example';
const login = (email, password) => api('login.php', { json: { email_address: email, password } });
const failures = async (email) => (await one('SELECT COUNT(*) AS n FROM login_attempts WHERE email = ?', [email])).n;

beforeEach(async () => {
  await q('DELETE FROM login_attempts');
});

describe('login throttling', () => {
  it('a wrong password is refused with the same message for a real and an unknown account', async () => {
    const real = await login(MARIA, 'Wrong#Pass1');
    const unknown = await login('nobody.at.all@demo.example', 'Wrong#Pass1');
    expect(real.status).toBe(unknown.status);
    expect(real.body.message).toBe(unknown.body.message);
    expect(real.body.sessionToken).toBeUndefined();
    expect(await failures(MARIA)).toBe(1);
    expect(await failures('nobody.at.all@demo.example')).toBe(1); // counted too, so the limit gives nothing away
  });

  it('locks the account after five misses, even for the right password, with a 429', async () => {
    for (let i = 0; i < 5; i++) expect((await login(MARIA, 'Wrong#Pass1')).status).not.toBe(429);
    const locked = await login(MARIA, 'tenant123');
    expect(locked.status).toBe(429);
    expect(locked.body.sessionToken).toBeUndefined();
    expect(String(locked.body.message)).toMatch(/15 minutes/);
    expect(await failures(MARIA)).toBe(5); // a locked attempt is not counted again
  });

  it('the lock is per account: another tenant on the same address can still sign in', async () => {
    for (let i = 0; i < 5; i++) await login(MARIA, 'Wrong#Pass1');
    expect((await login(MARIA, 'tenant123')).status).toBe(429);
    const other = await login(JOSE, 'tenant123');
    expect(other.status).toBe(200);
    expect(other.body.sessionToken).toBeTruthy();
  });

  it('four misses do not lock; the fifth does (boundary)', async () => {
    for (let i = 0; i < 4; i++) await login(MARIA, 'Wrong#Pass1');
    const ok = await login(MARIA, 'tenant123');
    expect(ok.status).toBe(200);
    expect(ok.body.sessionToken).toBeTruthy();
  });

  it('a successful sign-in clears the account\'s earlier misses', async () => {
    for (let i = 0; i < 3; i++) await login(MARIA, 'Wrong#Pass1');
    expect(await failures(MARIA)).toBe(3);
    expect((await login(MARIA, 'tenant123')).status).toBe(200);
    expect(await failures(MARIA)).toBe(0);
  });

  it('the lock lifts once the misses are older than the lockout window', async () => {
    for (let i = 0; i < 5; i++) await login(MARIA, 'Wrong#Pass1');
    expect((await login(MARIA, 'tenant123')).status).toBe(429);
    await q('UPDATE login_attempts SET attempt_time = DATE_SUB(NOW(), INTERVAL 16 MINUTE)');
    expect((await login(MARIA, 'tenant123')).status).toBe(200);
  });

  it('email case and spacing do not dodge the count', async () => {
    for (const email of [MARIA.toUpperCase(), ` ${MARIA} `, MARIA, MARIA.toUpperCase(), MARIA]) await login(email, 'Wrong#Pass1');
    expect(await failures(MARIA)).toBeGreaterThanOrEqual(5);
    expect((await login(MARIA, 'tenant123')).status).toBe(429);
  });

  it('missing fields and odd input are refused without a crash or a session', async () => {
    for (const json of [{}, { email_address: MARIA }, { password: 'x' }, { email_address: '', password: '' }, { email_address: MARIA, password: ['array'] }, { email_address: { $ne: 1 }, password: 'x' }]) {
      const res = await api('login.php', { json });
      expect(res.status, JSON.stringify(json)).toBeLessThan(500);
      expect(res.body?.sessionToken).toBeUndefined();
    }
  });

  it('a very long password is refused cleanly', async () => {
    const res = await login(MARIA, 'x'.repeat(100000));
    expect(res.status).toBeLessThan(500);
    expect(res.body?.sessionToken).toBeUndefined();
  });
});
