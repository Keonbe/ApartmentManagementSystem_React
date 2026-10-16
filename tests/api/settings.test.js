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
    const res = await save({ payment_window_days: '5', max_parking_slots: '0' });
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
    ['max_parking_slots', '2', '500', '501'],
  ])('KB-C05 %s accepts %s and %s, refuses %s', async (key, low, high, over) => {
    expect((await save({ [key]: low })).status).toBe(200);
    expect(await setting(key)).toBe(low);
    expect((await save({ [key]: high })).status).toBe(200);
    expect(await setting(key)).toBe(high);
    expect((await save({ [key]: over })).status).toBe(422);
    expect(await setting(key)).toBe(high);
  });

  it('parking slots cannot drop below an assigned slot', async () => {
    const res = await save({ max_parking_slots: '1' });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Slot #2 is still assigned/);
  });

  it('max_rent_ahead_months 0 → 422', async () => {
    expect((await save({ max_rent_ahead_months: '0' })).status).toBe(422);
  });
});
