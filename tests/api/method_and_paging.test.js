// Cross-cutting API hygiene (QA manual 3D, INP-17, INP-10, INP-13):
//   1. a write endpoint answers a wrong HTTP method without side effects,
//   2. wrong-typed JSON (objects where text is expected) never produces a server error,
//   3. a page past the end of a list is a clean answer, not an error,
//   4. an oversized body is refused or ignored, and the server stays up.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, loginAs } from './lib/api.js';
import { one } from './lib/db.js';
import { ROOT } from './lib/env.js';

const API_DIR = path.join(ROOT, 'backend/api');
const names = fs.readdirSync(API_DIR).filter((f) => f.endsWith('.php')).map((f) => f.slice(0, -4)).sort();
const source = (n) => fs.readFileSync(path.join(API_DIR, `${n}.php`), 'utf8');

// Not meant for a JSON probe: file servers, redirects, sweeps, deploy scripts, webhooks, token links.
const SKIP = new Set([
  'download_file', 'open_cctv_footage', 'public_file', 'paymongo_webhook', 'apply_live_schema_fix', 'audit_live_schema',
  'final_schema_patch', 'sync_live', 'logout', 'verify_email', 'verify_device', 'guest_chat_resume', 'guest_chat_inbox',
  'send_test_notification', 'auth_email',
]);
const writers = names.filter((n) => !SKIP.has(n) && !n.startsWith('get_') && source(n).includes('php://input'));

// A body whose every common field has the wrong type.
const WRONG = {};
for (const k of ['id', 'user_id', 'userId', 'email', 'email_address', 'password', 'token', 'name', 'first_name', 'last_name', 'title', 'message',
  'description', 'reason', 'status', 'action', 'type', 'amount', 'date', 'room_name', 'unit', 'invoice', 'invoice_id', 'category', 'months',
  'occupants', 'contractId', 'rentApplicationId', 'leaseStart', 'leaseEnd', 'billingPeriod', 'dueDate', 'tenantName', 'preferences', 'content']) {
  WRONG[k] = { nested: [1, 2, 3] };
}

let admin, maria;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

const totals = async () => (await one(
  'SELECT (SELECT COUNT(*) FROM invoices) + (SELECT COUNT(*) FROM lease_contracts) + (SELECT COUNT(*) FROM rooms) + (SELECT COUNT(*) FROM unit_reservations) + (SELECT COUNT(*) FROM refund_requests) AS n',
)).n;

describe('1. wrong method', () => {
  const sample = ['create_invoice', 'create_contract', 'update_contract_status', 'manage_users', 'create_room', 'archive_room', 'create_reservation',
    'update_reservation_status', 'update_parking_status', 'respond_refund_request', 'create_refund_request', 'record_move_out', 'update_occupants'];

  it.each(sample)('%s answers GET with no side effect and no server error', async (name) => {
    const before = await totals();
    for (const token of [admin, maria]) {
      const res = await api(`${name}.php`, { token, method: 'GET' });
      expect(res.status, name).toBeLessThan(500);
    }
    expect(await totals()).toBe(before);
  });

  it.each(['DELETE', 'PUT', 'PATCH'])('a %s on create_room changes nothing', async (method) => {
    const before = await totals();
    const res = await api('create_room.php', { token: admin, method, json: { id: 'ZZ9', type: 'Studio', floor: '9F', rent: 1000 } });
    expect(res.status).toBeLessThan(500);
    expect(await totals()).toBe(before + (res.body?.success ? 1 : 0));
  });
});

// The single-threaded test server is shared with every other file running in parallel, so a probe can hit a
// connect timeout under load; retry only that, a real 5xx fails every time.
describe('2. wrong-typed JSON never causes a server error', { retry: 2 }, () => {
  it('found the write endpoints to probe', () => {
    expect(writers.length).toBeGreaterThan(40);
  });

  it.each(writers)('%s (admin token, every field an object)', async (name) => {
    const res = await api(`${name}.php`, { token: admin, json: WRONG });
    expect(res.status, `${name}: ${res.text.slice(0, 160)}`).toBeLessThan(500);
  });

  it.each(writers)('%s (tenant token, every field an object)', async (name) => {
    const res = await api(`${name}.php`, { token: maria, json: WRONG });
    expect(res.status, `${name}: ${res.text.slice(0, 160)}`).toBeLessThan(500);
  });

  it.each(['null', '"text"', '12', '[]', '[1,2]', '{"id":'])('create_invoice survives the body %s', async (raw) => {
    const res = await api('create_invoice.php', { token: admin, raw, headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBeLessThan(500);
  });
});

describe('3. paging past the end', () => {
  const lists = [
    'get_activity_logs', 'get_inquiries', 'get_notifications', 'get_invoices', 'get_announcements',
    'get_visitors', 'get_maintenance_requests', 'get_service_requests',
  ];
  it.each(lists)('%s with page=99999 is a clean answer', async (name) => {
    const res = await api(`${name}.php`, { token: admin, query: { page: 99999, limit: 10 } });
    expect(res.status, name).toBeLessThan(500);
    expect(res.body, name).not.toBeNull();
  });

  it.each(['-1', '0', 'abc', '1e9', '9999999999999999999'])('get_activity_logs with page=%s does not error', async (page) => {
    const res = await api('get_activity_logs.php', { token: admin, query: { page } });
    expect(res.status).toBe(200);
    expect(res.body.page).toBeGreaterThanOrEqual(1);
  });
});

describe('4. oversized bodies', () => {
  it('a 6 MB field is refused or ignored, and the server keeps answering', async () => {
    const res = await api('create_notification.php', { token: admin, json: { userId: 2, title: 'big', message: 'x'.repeat(6 * 1024 * 1024) } });
    expect(res.status).toBeLessThan(500);
    expect((await api('get_rooms.php')).status).toBe(200);
  });

  it('a 300 KB name is refused with a validation error', async () => {
    const res = await api('submit_inquiry.php', { json: { full_name: 'n'.repeat(300000), email: 'big.name@demo.example', contact_no: '09171234500' } });
    expect(res.status).toBeLessThan(500);
    expect(res.body.success).toBe(false);
    expect(await one("SELECT id FROM inquiries WHERE email = 'big.name@demo.example'")).toBeNull();
  });
});
