// SPRINT 169, 174, 82: security headers, the writes the Privacy Notice promises being
// logged, and the guest chat token stored as a hash. (The sign-in code, trusted-device
// and lockout changes of SPRINT 172 were taken back 2026-11-19, so no tests here.)
import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';
import { BASE } from './lib/env.js';

const HASH = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy'; // tenant123
const sha = (s) => createHash('sha256').update(s).digest('hex');
let admin, seq = 0;

// A verified tenant outside the demo domain (the code is asked for on a new device).
async function newTenant(label) {
  const email = `${label}.${++seq}@hardening.example`;
  const res = await q(
    `INSERT INTO users (first_name, last_name, contact_no, gender, email_address, password, role, email_verified_at)
     VALUES ('Hard', ?, ?, 'Female', ?, ?, 'user', NOW())`,
    [label, `+6391755${String(10000 + seq)}`, email, HASH],
  );
  return { id: res.insertId, email };
}
const lastLog = (action) => one('SELECT performed_by, category, details FROM activity_logs WHERE action = ? ORDER BY id DESC LIMIT 1', [action]);

beforeAll(async () => {
  admin = await loginAs('admin');
});

describe('security headers (169)', () => {
  it('every API response says nosniff and a referrer policy, and none of them forbids framing', async () => {
    const res = await fetch(`${BASE}/get_rooms.php`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    // The app previews files from download_file.php inside an iframe.
    expect(res.headers.get('x-frame-options')).toBeNull();
    // Plain HTTP: HSTS would be ignored by browsers, so it is not sent.
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });

  // fetch() will not let a test choose the Host header, node:http will.
  const hstsFor = (host) => new Promise((resolve, reject) => {
    const url = new URL(`${BASE}/get_rooms.php`);
    http.get({ hostname: url.hostname, port: url.port, path: url.pathname, headers: { Host: host, 'X-Forwarded-Proto': 'https' } }, (res) => {
      res.resume();
      resolve(res.headers['strict-transport-security'] ?? null);
    }).on('error', reject);
  });

  it('HSTS only over HTTPS and never for a local host', async () => {
    expect(await hstsFor('ams.example.test')).toBe('max-age=31536000');
    expect(await hstsFor('localhost:8080')).toBeNull();
    expect(await hstsFor('127.0.0.1:8091')).toBeNull();
  });
});

describe('writes the Privacy Notice promises are logged (174)', () => {
  it('house rules: add, edit, reorder and remove', async () => {
    const add = await api('house_rules.php', { token: admin, json: { category: 'General', title: 'Quiet hours', description: 'Keep the noise down after 10 pm.', scope: 'house' } });
    expect(add.body.success).toBe(true);
    expect((await lastLog('Added House Rule')).details).toContain('Quiet hours');
    const id = add.body.id;

    const edit = await api('house_rules.php', { token: admin, method: 'PUT', json: { id, category: 'General', title: 'Quiet hours (updated)', description: 'Keep the noise down after 9 pm.', scope: 'house' } });
    expect(edit.body.success).toBe(true);
    expect((await lastLog('Updated House Rule')).details).toContain('Quiet hours (updated)');

    const order = await api('house_rules.php', { token: admin, method: 'PUT', json: { action: 'reorder', rules: [{ id }] } });
    expect(order.body.success).toBe(true);
    expect((await lastLog('Reordered House Rules')).details).toContain('1 rules');

    const del = await api('house_rules.php', { token: admin, method: 'DELETE', json: { id } });
    expect(del.body.success).toBe(true);
    expect((await lastLog('Removed House Rule')).details).toContain(`#${id}`);
    expect((await lastLog('Removed House Rule')).performed_by).not.toBeNull();
  });

  it('verified email and password reset requests are recorded against the account', async () => {
    const t = await newTenant('logged');
    const token = 'ab'.repeat(32);
    await q('UPDATE users SET verification_token = ?, email_verified_at = NULL WHERE id = ?', [token, t.id]);
    expect((await api('verify_email.php', { json: { token } })).body.success).toBe(true);
    expect(await lastLog('Verified Email')).toMatchObject({ performed_by: t.id });

    expect((await api('forgot_password.php', { json: { email: t.email } })).status).toBe(200);
    const log = await lastLog('Requested Password Reset');
    expect(log.performed_by).toBe(t.id);
    expect(log.details).not.toContain(t.email); // no address in the log text
  });
});

describe('the guest chat token is stored hashed (82)', () => {
  it('a new inquiry returns the raw token and keeps only its sha256', async () => {
    const res = await api('submit_inquiry.php', { json: { full_name: 'Hash Guest', email: 'hash.guest@hardening.example', contact_no: '+639171230000', message: 'Is the unit still free?' } });
    expect(res.body.success).toBe(true);
    const raw = res.body.guest_token;
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    const row = await one('SELECT guest_token, guest_token_hashed FROM inquiries WHERE id = ?', [res.body.inquiry_id]);
    expect(row.guest_token).toBe(sha(raw));
    expect(row.guest_token_hashed).toBe(1);
    // The raw token opens the thread; the stored hash, presented as a token, does not.
    expect((await api('guest_chat.php', { headers: { 'X-Guest-Token': raw } })).status).toBe(200);
    expect((await api('guest_chat.php', { headers: { 'X-Guest-Token': row.guest_token } })).status).toBe(404);
  });
});
