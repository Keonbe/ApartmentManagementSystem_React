// update_system_settings.php: per-key validation and the all-or-nothing save.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, setting } from './lib/db.js';

let admin;
const save = (json) => api('update_system_settings.php', { token: admin, json });
const snapshot = async () => Object.fromEntries(
  (await q('SELECT setting_key, setting_value FROM system_settings ORDER BY setting_key')).map((r) => [r.setting_key, r.setting_value]),
);

beforeAll(async () => { admin = await loginAs('admin'); });

describe('valid saves', () => {
  it('KB-A09 a valid change is saved', async () => {
    const res = await save({ payment_window_days: '9' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, changed: 1 });
    expect(await setting('payment_window_days')).toBe('9');
  });

  it('saving the same value again changes nothing', async () => {
    const res = await save({ payment_window_days: '9' });
    expect(res.body).toMatchObject({ success: true, changed: 0 });
  });
});

describe('a refused key saves nothing', () => {
  it('KB-B01 a valid key followed by an invalid one leaves both unsaved', async () => {
    await save({ payment_window_days: '3' });
    const before = await snapshot();
    const res = await save({ payment_window_days: '5', parking_max_per_tenant: '0' });
    expect(res.status).toBe(422);
    expect(await snapshot()).toEqual(before);
  });

  it('KB-B04 an invalid key → 422, nothing saved', async () => {
    const before = await snapshot();
    const res = await save({ payment_window_days: '6', 'bad key!': '1' });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Invalid setting key.');
    expect(await snapshot()).toEqual(before);
  });

  it('KB-B25 an injection string as a value is refused, nothing else changes', async () => {
    const before = await snapshot();
    const res = await save({ payment_window_days: "1' OR 1=1--" });
    expect(res.status).toBe(422);
    expect(await snapshot()).toEqual(before);
  });
});

describe('field validation', () => {
  it.each(['0', '25', 'abc', '3.5', '30', '-1'])('KB-B02 min_lease_duration %s → 422', async (value) => {
    const res = await save({ min_lease_duration: value });
    expect(res.status).toBe(422);
  });

  it.each(['0', '31', '-1', 'x'])('KB-B03 payment_window_days %s → 422 with errors.paymentWindowDays', async (value) => {
    const res = await save({ payment_window_days: value });
    expect(res.status).toBe(422);
    expect(res.body.errors?.paymentWindowDays).toBeTruthy();
  });

  // KB-C05. Parking slots start at 2, not 1: the seed has slot #2 assigned,
  // and slots can't drop below the highest assigned one.
  it.each([
    ['min_lease_duration', '1', '24', '25'],
    ['payment_window_days', '1', '30', '31'],
    ['max_rent_ahead_months', '1', '12', '13'],
    ['parking_max_duration_months', '1', '12', '13'],
    ['parking_max_per_tenant', '1', '5', '6'],
  ])('KB-C05 %s accepts %s and %s, refuses %s', async (key, low, high, over) => {
    expect((await save({ [key]: low })).status).toBe(200);
    expect(await setting(key)).toBe(low);
    expect((await save({ [key]: high })).status).toBe(200);
    expect(await setting(key)).toBe(high);
    expect((await save({ [key]: over })).status).toBe(422);
    expect(await setting(key)).toBe(high);
  });

  it('the old parking slot count is ignored (slots are managed in parking_slots.php)', async () => {
    expect((await save({ max_parking_slots: '1', parking_allowed_vehicle_types: '["van"]' })).status).toBe(200);
    expect(await setting('max_parking_slots')).toBeNull();
    expect(await setting('parking_allowed_vehicle_types')).toBeNull();
  });

  it('parking_free is stored as 1 / 0 and refuses anything else', async () => {
    expect((await save({ parking_free: true })).status).toBe(200);
    expect(await setting('parking_free')).toBe('1');
    expect((await save({ parking_free: '0' })).status).toBe(200);
    expect(await setting('parking_free')).toBe('0');
    expect((await save({ parking_free: 'maybe' })).status).toBe(422);
    expect(await setting('parking_free')).toBe('0');
  });

  it('max_rent_ahead_months 0 → 422', async () => {
    expect((await save({ max_rent_ahead_months: '0' })).status).toBe(422);
  });
});

describe('move-in date window (Settings → Rental)', () => {
  it('the shipped defaults are 0 / 365', async () => {
    expect(await setting('move_in_min_days')).toBe('0');
    expect(await setting('move_in_max_days')).toBe('365');
  });

  it('a valid pair saves together', async () => {
    const res = await save({ move_in_min_days: '2', move_in_max_days: '90' });
    expect(res.body).toMatchObject({ success: true, changed: 2 });
    expect(await setting('move_in_min_days')).toBe('2');
    expect(await setting('move_in_max_days')).toBe('90');
  });

  it.each([
    ['move_in_min_days', '61'], ['move_in_min_days', '-1'], ['move_in_min_days', '1.5'], ['move_in_min_days', 'abc'],
    ['move_in_max_days', '0'], ['move_in_max_days', '366'], ['move_in_max_days', ''],
  ])('%s = %j → 422, nothing saved', async (key, value) => {
    const before = await setting(key);
    expect((await save({ [key]: value })).status).toBe(422);
    expect(await setting(key)).toBe(before);
  });

  it('the latest cannot be earlier than the earliest (in one request, or against the stored value)', async () => {
    expect((await save({ move_in_min_days: '30', move_in_max_days: '10' })).status).toBe(422);
    expect((await save({ move_in_max_days: '1' })).status).toBe(422); // stored min is 2
    expect(await setting('move_in_max_days')).toBe('90');
  });

  it('0 (today) is a valid earliest', async () => {
    expect((await save({ move_in_min_days: '0' })).status).toBe(200);
    expect(await setting('move_in_min_days')).toBe('0');
  });

  it('get_system_settings.php returns them as numbers', async () => {
    const body = (await api('get_system_settings.php')).body;
    const s = body.settings || body.data || body;
    expect(s.move_in_min_days).toBe(0);
    expect(s.move_in_max_days).toBe(90);
  });
});

describe('rule table (the plain single-value keys)', () => {
  it.each([
    ['overdue_threshold_days', '0'],
    ['reservation_hold_days', '91'],
    ['smtp_port', '70000'],
    ['notifications_quiet_start', '24'],
    ['notification_log_retention_days', '-1'],
    ['maintenance_monthly_budget', 'lots'],
    ['payment_mode', 'bitcoin'],
    ['email_driver', 'carrier-pigeon'],
    ['sms_provider', 'smoke-signal'],
    ['overdue_reminder_interval_days', '0'],
  ])('%s = %s → 422', async (key, value) => {
    const before = await setting(key);
    const res = await save({ [key]: value });
    expect(res.status).toBe(422);
    expect(await setting(key)).toBe(before);
  });

  it('0 is a valid log retention (keep forever) and a valid quiet hour', async () => {
    const res = await save({ notification_log_retention_days: '0', notifications_quiet_start: '0' });
    expect(res.status).toBe(200);
    expect(await setting('notification_log_retention_days')).toBe('0');
  });

  it('a refused key in the same request saves none of them', async () => {
    const before = await snapshot();
    const res = await save({ overdue_threshold_days: '20', smtp_port: '0' });
    expect(res.status).toBe(422);
    expect(await snapshot()).toEqual(before);
  });
});
