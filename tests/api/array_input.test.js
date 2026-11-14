// read_json_input() (config.php): a field that is an array where the endpoint
// expects one value, or a body that is not a JSON object, is refused with 400
// before any (string) cast. That cast used to warn "Array to string conversion"
// and carry on with the text "Array" (or a TypeError 500 from trim()).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';

let admin, maria;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

const refused = (res, field) => {
  expect(res.status).toBe(400);
  expect(res.body?.success).toBe(false);
  expect(res.body.message).toMatch(/single value/);
  if (field) expect(res.body.field).toBe(field);
  expect(res.text).not.toMatch(/Warning|Array to string|Fatal|TypeError/);
};

describe('an array where one value is expected', () => {
  // (endpoint, token, body): each used to cast or trim() the array.
  const cases = [
    ['respond_refund_request.php', 'admin', { message: ['x'] }, 'message'],
    ['update_visitor_status.php', 'admin', { action: ['x'] }, 'action'],
    ['adjust_invoice.php', 'admin', { invoice_id: ['x'], reason: 'r' }, 'invoice_id'],
    ['create_invoice.php', 'admin', { user_id: 2, billing_period: ['x'] }, 'billing_period'],
    ['record_payment_admin.php', 'admin', { invoice_id: ['x'] }, 'invoice_id'],
    ['update_maintenance_status.php', 'admin', { id: 1, status: ['x'] }, 'status'],
    ['create_notification.php', 'admin', { title: ['x'] }, 'title'],
    ['cctv_request.php', 'maria', { location: ['x'] }, 'location'],
    ['create_reservation.php', 'admin', { room_name: ['x'] }, 'room_name'],
    ['registration.php', null, { email_address: ['a@b.co'] }, 'email_address'],
    ['submit_inquiry.php', null, { full_name: ['x'] }, 'full_name'],
    ['login.php', null, { email_address: ['a@b.co'], password: 'x' }, 'email_address'],
    ['archive_room.php', 'admin', { id: ['A'] }, 'id'],
  ];
  for (const [endpoint, who, json, field] of cases) {
    it(`${endpoint} refuses ${field}: [..] with 400`, async () => {
      const token = who === 'admin' ? admin : who === 'maria' ? maria : undefined;
      refused(await api(endpoint, { token, json }), field);
    });
  }
});

describe('a body that is not a JSON object', () => {
  for (const [label, raw] of [['a list', '[1,2]'], ['a number', '5'], ['broken JSON', '{"a":']]) {
    it(`pay_bill.php refuses ${label} with 400`, async () => {
      const res = await api('pay_bill.php', { token: maria, raw, headers: { 'Content-Type': 'application/json' } });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  }

  it('an empty body still reaches the endpoint (its own required-field answer, not a 5xx)', async () => {
    const res = await api('pay_bill.php', { token: maria, raw: '', headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBeLessThan(500);
    expect(res.body.success).toBe(false);
  });
});

describe('fields that really are lists still work', () => {
  it('create_announcement.php accepts channels: [..]', async () => {
    const res = await api('create_announcement.php', { token: admin, json: { title: 'List ok', message: 'Channels are a list', send_to: 'All Tenants', channels: ['in_app'], status: 'draft' } });
    expect(res.status).not.toBe(400);
    expect(res.status).toBeLessThan(500);
  });

  it('update_system_settings.php accepts object values', async () => {
    const res = await api('update_system_settings.php', { token: admin, json: { child_restricted_floors: [3] } });
    expect(res.status).not.toBe(400);
    expect(res.status).toBeLessThan(500);
  });
});
