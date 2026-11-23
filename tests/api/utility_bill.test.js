// Utility billing from the provider bill (manager interview Q17):
// save_utility_reading.php entry_mode 'bill' stores the typed Meralco / water
// amounts, a meter reading is optional information, and
// sync_utility_to_invoice.php bills exactly those amounts.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria;
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const period = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const today = `${period}-${pad(now.getDate())}`;
const monthsAgo = (n) => {
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const save = (json) => api('save_utility_reading.php', { token: admin, json: { billing_period: period, reading_date: today, entry_mode: 'bill', ...json } });
const reading = (room) => one('SELECT * FROM utility_readings WHERE room_name = ? AND billing_period = ?', [room, period]);

beforeAll(async () => {
  admin = await loginAs('admin');
  maria = await loginAs('maria');
});

describe('refused input (nothing saved)', () => {
  it.each([
    ['both amounts zero', { water_bill_amount: 0, electric_bill_amount: 0 }, /at least one/],
    ['both amounts missing', {}, /at least one/],
    ['a negative amount', { water_bill_amount: -5, electric_bill_amount: 100 }, /cannot be negative/],
    ['an amount over 1,000,000', { water_bill_amount: 1000000.01 }, /at most/],
    ['a non-numeric amount', { water_bill_amount: 'abc', electric_bill_amount: 100 }, /must be a number/],
    ['a non-numeric meter reading', { water_bill_amount: 100, water_curr_reading: 'x' }, /must be a number/],
    ['a negative meter reading', { water_bill_amount: 100, electric_curr_reading: -1 }, /cannot be negative/],
    ['a reading lower than the previous one', { water_bill_amount: 100, water_curr_reading: 100 }, /lower than the previous reading \(114\.5\)/],
    ['a note over 500 characters', { water_bill_amount: 100, notes: 'x'.repeat(501) }, /500/],
  ])('%s → 422', async (_label, body, message) => {
    const res = await save({ room_name: 'A', ...body });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(message);
    expect(await reading('A')).toBeNull();
  });

  it('an unknown entry mode → 422', async () => {
    const res = await save({ room_name: 'A', entry_mode: 'guess', water_bill_amount: 100 });
    expect(res.status).toBe(422);
  });

  it('a vacant unit → 422', async () => {
    const res = await save({ room_name: 'I', water_bill_amount: 100 });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/no tenant/);
  });

  it('a tenant cannot record a bill', async () => {
    const res = await api('save_utility_reading.php', { token: maria, json: { room_name: 'A', billing_period: period, entry_mode: 'bill', water_bill_amount: 1 } });
    expect([401, 403]).toContain(res.status);
  });
});

describe('saving a provider bill', () => {
  it('stores the bill amounts as typed (rounded to cents), no rate, no reading', async () => {
    const res = await save({ room_name: 'K', water_bill_amount: '350.555', electric_bill_amount: 1240.75 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, entry_mode: 'bill', water_amount: 350.56, electric_amount: 1240.75, total_amount: 1591.31 });
    const row = await reading('K');
    expect(row).toMatchObject({
      entry_mode: 'bill', water_amount: '350.56', electric_amount: '1240.75', water_other_fees: '0.00', electric_other_fees: '0.00',
      water_rate_per_unit: null, electric_rate_per_unit: null,
      water_curr_reading: null, water_consumption: null, electric_curr_reading: null, electric_consumption: null,
    });
  });

  it('a second bill for the same unit and month → 409', async () => {
    const res = await save({ room_name: 'K', water_bill_amount: 10 });
    expect(res.status).toBe(409);
  });

  it('one bill only (electricity 0) is fine; an optional reading records consumption from the previous one', async () => {
    const res = await save({ room_name: 'A', water_bill_amount: 0, electric_bill_amount: 980, electric_curr_reading: 2200.5 });
    expect(res.status).toBe(200);
    const row = await reading('A');
    expect(row).toMatchObject({
      water_amount: '0.00', electric_amount: '980.00',
      electric_prev_reading: '2145.00', electric_curr_reading: '2200.50', electric_consumption: '55.50',
      water_curr_reading: null, water_consumption: null,
    });
  });

  it('get_utility_readings returns the bill row with its amounts and no fake usage change', async () => {
    const res = await api('get_utility_readings.php', { token: maria });
    const row = res.body.data.find((r) => r.billing_period === period);
    expect(row).toMatchObject({ entry_mode: 'bill', electric_amount: '980.00', water_consumption: null, water_change_pct: null });
  });
});

describe('sync puts exactly the bill amounts on the invoice', () => {
  it('merge: the open invoice gets water/electricity = the bill amounts', async () => {
    const invId = `INV-TEST-BILL-${Date.now()}`;
    await q(
      `INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date)
       VALUES (?, 12, 10, 99999, 99999, ?, 'pending', CURDATE() + INTERVAL 5 DAY)`,
      [invId, period],
    );
    const row = await reading('K');
    const res = await api('sync_utility_to_invoice.php', { token: admin, json: { id: row.id, sync_mode: 'merge' } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, invoice_id: invId, merged: true });
    const inv = await one('SELECT water, electricity, total_amount FROM invoices WHERE id = ?', [invId]);
    expect(inv).toMatchObject({ water: '350.56', electricity: '1240.75', total_amount: '101590.31' });
  });

  it('a synced bill cannot be synced twice', async () => {
    const row = await reading('K');
    const res = await api('sync_utility_to_invoice.php', { token: admin, json: { id: row.id, sync_mode: 'merge' } });
    expect(res.status).toBe(409);
  });

});

describe('the meter chain skips bill rows without a reading', () => {
  const monthsAgo = (n) => {
    const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  beforeAll(async () => {
    // Room B (Jose): a metered reading two months ago, then last month a bill
    // with an electricity reading only (water NULL).
    await q(`INSERT INTO utility_readings (room_name, user_id, billing_period, reading_date, entry_mode,
               water_prev_reading, water_curr_reading, water_consumption, water_amount, electric_prev_reading, electric_curr_reading, electric_consumption, electric_amount, is_invoiced)
             VALUES ('B', 3, ?, ?, 'metered', 40, 50, 10, 400, 300, 400, 100, 1200, 1),
                    ('B', 3, ?, ?, 'bill', NULL, NULL, NULL, 380, 400, 500, 100, 1500, 1)`,
      [monthsAgo(2), `${monthsAgo(2)}-28`, monthsAgo(1), `${monthsAgo(1)}-28`]);
  });

  it('a bill reading below the last recorded value is refused for that meter only', async () => {
    const res = await save({ room_name: 'B', electric_bill_amount: 100, electric_curr_reading: 450 });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Electricity reading .* lower than the previous reading \(500\)/);
  });

  it('a metered reading takes water from the older metered row and electricity from the bill row', async () => {
    const low = await api('save_utility_reading.php', { token: admin, json: { room_name: 'B', billing_period: period, reading_date: today, entry_mode: 'metered', water_curr_reading: 45, electric_curr_reading: 600 } });
    expect(low.status).toBe(422);
    expect(low.body.message).toMatch(/Water reading .* previous reading \(50\)/);

    const res = await api('save_utility_reading.php', { token: admin, json: { room_name: 'B', billing_period: period, reading_date: today, entry_mode: 'metered', water_curr_reading: 60, electric_curr_reading: 600 } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ water_consumption: 10, electric_consumption: 100 });
  });
});

describe('merging utility bill into rent invoice (tenant choice)', () => {
  it('allows a tenant to merge their standalone utility bill into their open rent invoice', async () => {
    // Record a reading for Room C (Rosa, user_id=4) as separate bill
    const resSave = await save({ room_name: 'C', water_bill_amount: 250, electric_bill_amount: 800 });
    expect(resSave.status).toBe(200);
    const readingId = resSave.body.id;

    // Sync as separate utility invoice
    const resSync = await api('sync_utility_to_invoice.php', { token: admin, json: { id: readingId, sync_mode: 'separate' } });
    expect(resSync.status).toBe(200);
    const utilInvId = resSync.body.invoice_id;

    // Create an open rent invoice for Room C (Rosa, user_id=5) for the same period
    const rentInvId = 'INV-RENT-C-' + Date.now();
    await q(
      `INSERT INTO invoices (id, user_id, billing_period, base_rent, total_amount, status, due_date)
       VALUES (?, 5, ?, 8000.00, 8000.00, 'pending', ?)`,
      [rentInvId, period, today]
    );

    // Tenant Rosa merges the utility bill into the rent invoice
    const rosa = await loginAs('rosa');
    const mergeRes = await api('merge_utility_into_rent.php', { token: rosa, json: { reading_id: readingId } });
    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body).toMatchObject({ success: true, rent_invoice_id: rentInvId, merged: true });

    // Verify separate invoice was cancelled and rent invoice was updated
    const oldInv = await one('SELECT status FROM invoices WHERE id = ?', [utilInvId]);
    expect(oldInv.status).toBe('cancelled');

    const rentInv = await one('SELECT water, electricity, total_amount FROM invoices WHERE id = ?', [rentInvId]);
    expect(rentInv).toMatchObject({ water: '250.00', electricity: '800.00', total_amount: '9050.00' });
  });
});

describe('meter replacement or reset this cycle', () => {
  it('allows a lower reading when meter reset is enabled with a new baseline', async () => {
    // Insert an earlier reading for Room E (user_id=6)
    await q(
      `INSERT INTO utility_readings (room_name, user_id, billing_period, reading_date, entry_mode,
         water_prev_reading, water_curr_reading, water_consumption, water_amount,
         electric_prev_reading, electric_curr_reading, electric_consumption, electric_amount, is_invoiced)
       VALUES ('E', 6, ?, ?, 'metered', 100, 150, 50, 2000, 1000, 1200, 200, 2400, 1)`,
      [monthsAgo(1), `${monthsAgo(1)}-28`]
    );

    // Recording a lower reading without reset fails
    const failRes = await api('save_utility_reading.php', {
      token: admin,
      json: { room_name: 'E', billing_period: period, reading_date: today, entry_mode: 'metered', water_curr_reading: 10, electric_curr_reading: 50 },
    });
    expect(failRes.status).toBe(422);
    expect(failRes.body.message).toMatch(/lower than the previous reading/);

    // Recording with reset enabled and starting baseline succeeds
    const okRes = await api('save_utility_reading.php', {
      token: admin,
      json: {
        room_name: 'E',
        billing_period: period,
        reading_date: today,
        entry_mode: 'metered',
        water_meter_reset: true,
        water_initial_reading: 0,
        water_curr_reading: 10,
        electric_meter_reset: true,
        electric_initial_reading: 0,
        electric_curr_reading: 50,
      },
    });
    expect(okRes.status).toBe(200);
    expect(okRes.body).toMatchObject({
      water_consumption: 10,
      electric_consumption: 50,
    });

    const row = await reading('E');
    expect(row.notes).toMatch(/reset\/replaced/);
  });
});

describe('utility settings and tenant self-pay restriction', () => {
  it('allows admin to toggle utility_allow_tenant_self_pay and blocks self-pay actions when disabled', async () => {
    // 1. Admin disables tenant self-pay
    const updateRes = await api('update_system_settings.php', {
      token: admin,
      json: { utility_allow_tenant_self_pay: '0' },
    });
    expect(updateRes.status).toBe(200);

    // 2. get_utility_readings returns allow_tenant_self_pay = false
    const readingsRes = await api('get_utility_readings.php', { token: admin });
    expect(readingsRes.status).toBe(200);
    expect(readingsRes.body.allow_tenant_self_pay).toBe(false);

    // 3. Tenant Rosa attempting merge_utility_into_rent is refused with 403
    const rosa = await loginAs('rosa');
    const mergeRes = await api('merge_utility_into_rent.php', { token: rosa, json: { reading_id: 1 } });
    expect(mergeRes.status).toBe(403);
    expect(mergeRes.body.message).toMatch(/Tenant self-payment for utilities is disabled/);

    // 4. Restore setting to enabled
    const restoreRes = await api('update_system_settings.php', {
      token: admin,
      json: { utility_allow_tenant_self_pay: '1' },
    });
    expect(restoreRes.status).toBe(200);
  });
});
