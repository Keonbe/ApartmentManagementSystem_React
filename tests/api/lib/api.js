// HTTP helpers for the PHP endpoints on the test server.
import { createHash } from 'node:crypto';
import { BASE } from './env.js';
import { q, one } from './db.js';

// login.php sends a tenant on a device it has not seen an emailed code instead of
// a session. The suite signs in as many tenants, so each account's test device is
// marked trusted first (the cookie is the token; the table holds its SHA-256) and
// the cookie rides along on every login.php call. Admins skip the code anyway.
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const trustedDevices = new Set();
export const deviceTokenFor = (email) => sha256(`test-device:${email}`);
export async function trustDevice(email) {
  if (trustedDevices.has(email)) return deviceTokenFor(email);
  const user = await one('SELECT id FROM users WHERE email_address = ?', [email]);
  if (user) {
    await q('INSERT IGNORE INTO trusted_devices (user_id, device_token) VALUES (?, ?)', [user.id, sha256(deviceTokenFor(email))]);
    trustedDevices.add(email);
  }
  return deviceTokenFor(email);
}

// api('get_rooms.php', { token, query, json, form, headers, method })
// Returns { status, body, text }. body is the parsed JSON, or null when the
// response is not JSON (the raw text is kept for the failure message).
export async function api(endpoint, { token, query, json, form, headers = {}, method, raw } = {}) {
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);

  const init = { method: method ?? (json !== undefined || form || raw !== undefined ? 'POST' : 'GET'), headers: { ...headers } };
  if (endpoint === 'login.php' && json?.email_address && !('Cookie' in init.headers)) {
    init.headers.Cookie = `ams_trusted_device=${await trustDevice(json.email_address)}`;
  }
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (form) {
    init.body = form;
  } else if (raw !== undefined) {
    init.body = raw;
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body, text };
}

export async function login(email, password) {
  const res = await api('login.php', { json: { email_address: email, password } });
  if (!res.body?.sessionToken) throw new Error(`Login failed for ${email}: ${res.text}`);
  return res.body.sessionToken;
}

export const ACCOUNTS = {
  admin: ['admin@gmail.com', 'admin123'],
  maria: ['maria.santos@demo.example', 'tenant123'], // user 2, room A, app 1, paid up
  jose: ['jose.reyes@demo.example', 'tenant123'], // user 3, room B, overdue invoices
  rosa: ['rosa.delacruz@demo.example', 'tenant123'], // user 5, room C, app 3
  grace: ['grace.mendoza@demo.example', 'tenant123'], // user 14, app 12
  mark: ['mark.santiago@demo.example', 'tenant123'], // user 13, room L, pending-move-out
};

export const loginAs = (who) => login(...ACCOUNTS[who]);
