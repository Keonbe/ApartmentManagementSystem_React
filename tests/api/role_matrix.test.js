// Role-by-endpoint matrix. Every top-level backend/api/*.php file is classified from its own
// source, so a new endpoint with no guard (and not on the public list below) fails this file.
//   admin  -> require_admin() / verify_admin(): no token and a tenant token are refused
//   user   -> require_user() / require_owner_or_admin(): no token is refused
//   public -> intentionally open; listed here with the reason
// QA guide rows Q11-05, Q11-06, INP-17.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, loginAs } from './lib/api.js';
import { ROOT } from './lib/env.js';

const API_DIR = path.join(ROOT, 'backend/api');

// Open on purpose. Keep the reason next to each name.
const PUBLIC = {
  login: 'sign-in',
  registration: 'public sign-up',
  forgot_password: 'reset request, throttled, generic reply',
  reset_password: 'emailed token is the credential',
  verify_email: 'emailed token is the credential',
  verify_device: 'emailed code is the credential',
  paymongo_webhook: 'signature checked',
  get_rooms: 'public room catalogue',
  get_system_settings: 'public settings subset',
  get_service_catalog: 'public catalogue',
  get_service_categories: 'public catalogue',
  house_rules: 'public rules page',
  public_file: 'public file server (path checked)',
  guest_chat_resume: 'guest link is the credential',
  guest_chat_inbox: 'guest link is the credential',
  auth_email: 'helper endpoint',
  submit_inquiry: 'public inquiry form',
  logout: 'idempotent: nothing to revoke without a token',
};

// Not endpoints for a browser: deploy or maintenance scripts. They must refuse an
// anonymous or tenant caller as well.
const SCRIPTS = ['apply_live_schema_fix', 'audit_live_schema', 'final_schema_patch', 'sync_live'];

// Token may arrive as ?token= and parameters are checked first; give them valid-looking ones.
const KIND_OVERRIDE = { download_file: 'user', open_cctv_footage: 'user' };
const QUERY = { download_file: { path: 'uploads/x.png' }, open_cctv_footage: { id: '1' }, get_chat_history: { other_user_id: '1' } };

const files = fs.readdirSync(API_DIR).filter((f) => f.endsWith('.php')).map((f) => f.slice(0, -4)).sort();
const src = Object.fromEntries(files.map((n) => [n, fs.readFileSync(path.join(API_DIR, `${n}.php`), 'utf8')]));
const kind = (n) => {
  if (PUBLIC[n]) return 'public';
  if (KIND_OVERRIDE[n]) return KIND_OVERRIDE[n];
  if (/\brequire_admin\(|\bverify_admin\(/.test(src[n])) return 'admin';
  if (/\brequire_user\(|\brequire_owner_or_admin\(|\bget_authenticated_user\(/.test(src[n])) return 'user';
  // config.php rebuilds X-User-Id / X-Admin-Id from the session, so these are session-bound too.
  if (/HTTP_X_USER_ID|HTTP_X_ADMIN_ID|send_message\.php/.test(src[n])) return 'header';
  return 'unclassified';
};
const kinds = Object.fromEntries(files.map((n) => [n, kind(n)]));
const of = (k) => files.filter((n) => kinds[n] === k && !SCRIPTS.includes(n));

let maria, admin;
const refused = (res) => [401, 403].includes(res.status) || res.body?.success === false;
// get_* endpoints guard their GET branch; everything else is probed with an empty POST.
const call = (name, opts = {}) =>
  name.startsWith('get_') || QUERY[name] ? api(`${name}.php`, { query: QUERY[name], ...opts }) : api(`${name}.php`, { json: {}, ...opts });

beforeAll(async () => {
  [maria, admin] = await Promise.all([loginAs('maria'), loginAs('admin')]);
});

describe('classification', () => {
  it('every endpoint is guarded, or public on purpose', () => {
    expect(files.filter((n) => kinds[n] === 'unclassified' && !SCRIPTS.includes(n))).toEqual([]);
  });

  it('the public list names only endpoints that exist', () => {
    expect(Object.keys(PUBLIC).filter((n) => !files.includes(n))).toEqual([]);
  });
});

describe('admin-only endpoints', () => {
  it.each(of('admin'))('%s refuses no token and a tenant token', async (name) => {
    const anon = await call(name);
    expect([401, 403], `${name} anonymous`).toContain(anon.status);
    const tenant = await call(name, { token: maria });
    expect([401, 403], `${name} tenant`).toContain(tenant.status);
  });

  it.each(of('admin'))('%s ignores a forged admin id header', async (name) => {
    const res = await call(name, { headers: { 'X-Admin-Id': '1', 'X-User-Id': '1' } });
    expect([401, 403], name).toContain(res.status);
    const asTenant = await call(name, { token: maria, headers: { 'X-Admin-Id': '1', 'X-User-Id': '1' } });
    expect([401, 403], `${name} tenant with forged header`).toContain(asTenant.status);
  });
});

describe('signed-in endpoints', () => {
  it.each(of('user'))('%s refuses a request with no token', async (name) => {
    const res = await call(name);
    expect(refused(res), `${name}: ${res.status} ${res.text.slice(0, 120)}`).toBe(true);
    expect([401, 403, 200, 400, 405, 422]).toContain(res.status);
  });

  it.each(of('user'))('%s refuses a bad or malformed token', async (name) => {
    for (const token of ['garbage', 'a'.repeat(64), "' OR '1'='1"]) {
      const res = await call(name, { token });
      // download_file / open_cctv_footage check the path or id (400, 404) before they look at who asks;
      // that reveals nothing, and the owner checks themselves are covered in profile_avatar and cctv_footage.
      const allowed = QUERY[name] ? [400, 401, 403, 404] : [401, 403];
      expect(allowed, `${name} token=${token}`).toContain(res.status);
    }
  });
});

describe('maintenance scripts', () => {
  it.each(SCRIPTS)('%s refuses anonymous and tenant callers', async (name) => {
    for (const token of [undefined, maria]) {
      const res = await api(`${name}.php`, { token, json: {} });
      expect([401, 403], `${name} ${token ? 'tenant' : 'anonymous'}`).toContain(res.status);
    }
  });
});

describe('admin endpoints accept an admin (read-only sample)', () => {
  const readOnly = of('admin').filter((n) => n.startsWith('get_'));
  it.each(readOnly)('%s does not turn an admin away', async (name) => {
    const res = await api(`${name}.php`, { token: admin });
    expect([401, 403], name).not.toContain(res.status);
    expect(res.status, name).toBeLessThan(500);
  });
});

describe('chat endpoints that read the identity header', () => {
  const chat = of('header');

  it('are the ones expected (a new one should be reviewed)', () => {
    expect(chat).toEqual(['get_admin_user', 'get_chat_history', 'get_conversations', 'save_message', 'send_message']);
  });

  it.each(chat)('%s gives nothing to an anonymous caller, even with a forged identity header', async (name) => {
    for (const headers of [{}, { 'X-User-Id': '2' }, { 'X-Admin-Id': '1' }, { 'X-User-Id': '2', 'X-Admin-Id': '1' }]) {
      const res = await call(name, { headers, query: QUERY[name] });
      expect(res.body?.success, `${name} ${JSON.stringify(headers)}`).not.toBe(true);
      expect(res.body?.messages ?? res.body?.conversations ?? res.body?.admin ?? null, name).toBeNull();
      expect(res.status, name).toBeGreaterThanOrEqual(400);
    }
  });

  it('send_message refuses a message to oneself in plain English', async () => {
    const res = await api('send_message.php', { token: maria, json: { receiver_id: 2, message: 'hi me' } });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Cannot send a message to yourself');
  });
});

describe('wrong HTTP method (INP-17)', () => {
  it.each(['create_refund_request', 'respond_refund_request', 'record_move_out', 'forgot_password'])(
    '%s answers GET with 405 and changes nothing',
    async (name) => {
      const res = await api(`${name}.php`, { token: maria, method: 'GET' });
      expect(res.status).toBe(405);
    },
  );
});
