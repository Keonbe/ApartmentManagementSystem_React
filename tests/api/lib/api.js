// HTTP helpers for the PHP endpoints on the test server.
import { BASE } from './env.js';

// api('get_rooms.php', { token, query, json, form, headers, method })
// Returns { status, body, text }. body is the parsed JSON, or null when the
// response is not JSON (the raw text is kept for the failure message).
export async function api(endpoint, { token, query, json, form, headers = {}, method, raw } = {}) {
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);

  const init = { method: method ?? (json !== undefined || form || raw !== undefined ? 'POST' : 'GET'), headers: { ...headers } };
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
  maria: ['maria.santos@gmail.com', 'tenant123'], // user 2, room A, app 1, paid up
  jose: ['jose.reyes@gmail.com', 'tenant123'], // user 3, room B, overdue invoices
  rosa: ['rosa.delacruz@gmail.com', 'tenant123'], // user 5, room C, app 3
  mark: ['mark.santiago@gmail.com', 'tenant123'], // user 13, room L, pending-move-out
};

export const loginAs = (who) => login(...ACCOUNTS[who]);
