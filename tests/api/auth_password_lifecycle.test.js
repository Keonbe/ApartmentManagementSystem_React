// Password lifecycle: forgot_password.php, reset_password.php, change_password.php, logout.php.
// QA guide rows Q11-09 .. Q11-15.
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { api, login } from './lib/api.js';
import { q, one } from './lib/db.js';

const HASH = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy'; // tenant123
const OLD = 'tenant123';
const NEW_PW = 'Brand#New2026';
const sha = (s) => createHash('sha256').update(s).digest('hex');

const EMAIL = 'pw.lifecycle@demo.example';
const ID = 111;
let seq = 0;

// A reset row the test controls: returns the raw token the email link would carry.
async function resetToken({ minutes = 30, used = 0, email = EMAIL } = {}) {
  const token = `${'t'.repeat(40)}${String(++seq).padStart(24, '0')}`;
  await q(
    'INSERT INTO password_resets (email, token_hash, expires_at, used) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)',
    [email, sha(token), minutes, used],
  );
  return token;
}
const sessionCount = async () => (await one('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', [ID])).n;
const resetBody = (token, pw = NEW_PW, confirm = pw) => ({ token, new_password: pw, confirm_password: confirm });

beforeAll(async () => {
  await q(`INSERT INTO users (id, first_name, last_name, contact_no, gender, email_address, password, role, email_verified_at)
           VALUES (?, 'Pat', 'Lifecycle', '+63 9171234111', 'Female', ?, ?, 'user', NOW())`, [ID, EMAIL, HASH]);
});

describe('forgot_password.php', () => {
  it('answers a known and an unknown address identically (no enumeration)', async () => {
    const known = await api('forgot_password.php', { json: { email: EMAIL } });
    const unknown = await api('forgot_password.php', { json: { email: 'nobody.here@demo.example' } });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    // Only the real account gets a reset row.
    expect((await one('SELECT COUNT(*) AS n FROM password_resets WHERE email = ?', [EMAIL])).n).toBe(1);
    expect((await one('SELECT COUNT(*) AS n FROM password_resets WHERE email = ?', ['nobody.here@demo.example'])).n).toBe(0);
  });

  it('stores only a hash and retires the earlier link when a new one is requested', async () => {
    await q('DELETE FROM password_resets WHERE email = ?', [EMAIL]);
    await q("DELETE FROM password_reset_requests WHERE email = ?", [EMAIL]);
    await api('forgot_password.php', { json: { email: EMAIL } });
    await api('forgot_password.php', { json: { email: EMAIL } });
    const rows = await q('SELECT token_hash, used FROM password_resets WHERE email = ? ORDER BY id', [EMAIL]);
    expect(rows).toHaveLength(2);
    expect(rows[0].used).toBe(1);
    expect(rows[1].used).toBe(0);
    expect(rows[1].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a missing address and a wrong method', async () => {
    expect((await api('forgot_password.php', { json: { email: '   ' } })).body.success).toBe(false);
    expect((await api('forgot_password.php', { method: 'GET' })).status).toBe(405);
  });

  it('throttles repeated requests for one address (429), same for unknown addresses', async () => {
    const addr = 'throttle.me@demo.example';
    let last;
    for (let i = 0; i < 4; i++) last = await api('forgot_password.php', { json: { email: addr } });
    expect(last.status).toBe(429);
  });
});

describe('reset_password.php', () => {
  it('rejects a wrong, expired or already-used token and leaves the password alone', async () => {
    const expired = await resetToken({ minutes: -5 });
    const used = await resetToken({ used: 1 });
    for (const token of ['f'.repeat(64), expired, used]) {
      const res = await api('reset_password.php', { json: resetBody(token) });
      expect(res.body.success).toBe(false);
    }
    expect((await one('SELECT password FROM users WHERE id = ?', [ID])).password).toBe(HASH);
  });

  it('refuses weak, mismatched and unchanged passwords but keeps the token usable', async () => {
    const token = await resetToken();
    expect((await api('reset_password.php', { json: resetBody(token, 'short') })).body.success).toBe(false);
    expect((await api('reset_password.php', { json: resetBody(token, NEW_PW, 'Different#2026') })).status).toBe(422);
    expect((await api('reset_password.php', { json: resetBody(token, OLD) })).body.success).toBe(false); // fails policy
    expect((await api('reset_password.php', { json: { token, new_password: NEW_PW } })).body.success).toBe(false); // no confirmation
    const row = await one('SELECT used FROM password_resets WHERE token_hash = ?', [sha(token)]);
    expect(row.used).toBe(0);
  });

  it('resets once, ends every session, and the link cannot be replayed', async () => {
    const oldSession = await login(EMAIL, OLD);
    expect(await sessionCount()).toBeGreaterThan(0);

    const token = await resetToken();
    const other = await resetToken(); // a second live link for the same address
    const res = await api('reset_password.php', { json: resetBody(token) });
    expect(res.body.success).toBe(true);

    expect(await sessionCount()).toBe(0);
    expect((await api('get_my_requests.php', { token: oldSession })).status).toBe(401);
    // Every outstanding link for the address is burned, not just the one used.
    for (const t of [token, other]) {
      expect((await one('SELECT used FROM password_resets WHERE token_hash = ?', [sha(t)])).used).toBe(1);
      expect((await api('reset_password.php', { json: resetBody(t, 'Another#Pass2026') })).body.success).toBe(false);
    }

    // The new password works, the old one does not.
    expect((await api('login.php', { json: { email_address: EMAIL, password: OLD } })).body.sessionToken).toBeUndefined();
    expect(await login(EMAIL, NEW_PW)).toBeTruthy();
  });
});

describe('change_password.php', () => {
  beforeAll(async () => {
    await q('UPDATE users SET password = ? WHERE id = ?', [HASH, ID]);
  });
  const change = (token, body) => api('change_password.php', { token, json: body });

  it('needs a session', async () => {
    expect((await change(undefined, { current_password: OLD, new_password: NEW_PW, confirm_password: NEW_PW })).status).toBe(401);
  });

  it('refuses a wrong current password, a mismatch, a weak or unchanged password', async () => {
    const token = await login(EMAIL, OLD);
    expect((await change(token, { current_password: 'Wrong#Pass1', new_password: NEW_PW, confirm_password: NEW_PW })).status).toBe(422);
    expect((await change(token, { current_password: OLD, new_password: NEW_PW, confirm_password: 'Mismatch#1234' })).status).toBe(422);
    expect((await change(token, { current_password: OLD, new_password: 'weak', confirm_password: 'weak' })).status).toBe(422);
    expect((await change(token, { current_password: '', new_password: NEW_PW, confirm_password: NEW_PW })).status).toBe(422);
    expect((await one('SELECT password FROM users WHERE id = ?', [ID])).password).toBe(HASH);
  });

  it('changes the password, keeps this device signed in and signs the others out', async () => {
    const mine = await login(EMAIL, OLD);
    const elsewhere = await login(EMAIL, OLD);
    const res = await change(mine, { current_password: OLD, new_password: NEW_PW, confirm_password: NEW_PW });
    expect(res.body.success).toBe(true);
    expect(res.body.sessions_ended).toBeGreaterThanOrEqual(1);
    expect((await api('get_my_requests.php', { token: mine })).status).toBe(200);
    expect((await api('get_my_requests.php', { token: elsewhere })).status).toBe(401);
    expect(await login(EMAIL, NEW_PW)).toBeTruthy();
  });
});

describe('logout.php', () => {
  it('kills the token that was used and only that one', async () => {
    const a = await login(EMAIL, NEW_PW);
    const b = await login(EMAIL, NEW_PW);
    expect((await api('logout.php', { token: a, json: {} })).body.success).toBe(true);
    expect((await api('get_my_requests.php', { token: a })).status).toBe(401);
    expect((await api('get_my_requests.php', { token: b })).status).toBe(200);
    const log = await one("SELECT COUNT(*) AS n FROM activity_logs WHERE performed_by = ? AND action = 'Signed Out'", [ID]);
    expect(log.n).toBe(1);
  });

  it('is harmless without a token', async () => {
    expect((await api('logout.php', { json: {} })).body.success).toBe(true);
  });
});
