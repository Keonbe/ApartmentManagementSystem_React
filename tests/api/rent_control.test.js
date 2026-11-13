// RA 9653 (Rent Control Act) as extended by NHSB Resolution 2024-01:
// rent_cap_refusal() in config.php through admin_extend_rent.php (a renewal's
// new rent), update_room.php (no rent change on an occupied unit), the late-fee
// ceiling in promote_overdue_invoices(), and the settings rules.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

const APP = 3;      // Jose, unit C, active in the seed
const ROOM = 'C';
let admin, rent, contractId;

const extend = (json) => api('admin_extend_rent.php', { token: admin, json: { roomId: ROOM, addMonths: 3, ...json } });
const capOf = (base, pct) => Math.floor(base * (1 + pct / 100) * 100) / 100;

beforeAll(async () => {
  admin = await loginAs('admin');
  await setSetting('min_lease_duration', 3);
  await setSetting('max_rent_ahead_months', 12);
  await setSetting('rent_cap_percent', 1);
  await setSetting('rent_cap_max_covered_rent', 10000);
  contractId = (await one('SELECT id FROM lease_contracts WHERE rent_application_id = ?', [APP])).id;
});

// A running tenancy with two months left, its rent at `amount`, no renewals this year.
async function reset(amount = 5000) {
  rent = amount;
  await q('DELETE FROM lease_renewals WHERE contract_id = ?', [contractId]);
  await q("UPDATE lease_contracts SET status = 'active', lease_end = DATE_ADD(CURDATE(), INTERVAL 2 MONTH) WHERE id = ?", [contractId]);
  await q('UPDATE rooms SET lease_end = DATE_ADD(CURDATE(), INTERVAL 2 MONTH), monthly_rent = ? WHERE id = ?', [amount, ROOM]);
  await q("UPDATE rent_applications SET status = 'active', monthly_rent = ? WHERE id = ?", [amount, APP]);
  await q("UPDATE invoices SET status = 'cancelled' WHERE rent_application_id = ? AND status IN ('pending','overdue','unpaid','payment-failed')", [APP]);
}

describe('yearly rent-control cap on renewal', () => {
  beforeEach(() => reset(5000));

  it('allows a raise up to the cap and records the previous rent', async () => {
    const res = await extend({ newRent: capOf(5000, 1) });
    expect(res.status).toBe(200);
    const row = await one('SELECT previous_rent, rent_at_renewal FROM lease_renewals WHERE contract_id = ? ORDER BY id DESC LIMIT 1', [contractId]);
    expect(row).toMatchObject({ previous_rent: '5000.00', rent_at_renewal: '5050.00' });
    expect((await one('SELECT monthly_rent FROM rent_applications WHERE id = ?', [APP])).monthly_rent).toBe('5050.00');
  });

  it('refuses a raise above the cap and changes nothing', async () => {
    const before = await one("SELECT DATE_FORMAT(lease_end, '%Y-%m-%d') AS d FROM lease_contracts WHERE id = ?", [contractId]);
    const res = await extend({ newRent: 5100 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/rent control/);
    expect(res.body.message).toMatch(/5,050\.00/);
    expect((await one("SELECT DATE_FORMAT(lease_end, '%Y-%m-%d') AS d FROM lease_contracts WHERE id = ?", [contractId])).d).toBe(before.d);
    expect((await one('SELECT COUNT(*) AS n FROM lease_renewals WHERE contract_id = ?', [contractId])).n).toBe(0);
  });

  it('counts every raise in the same calendar year against one cap', async () => {
    expect((await extend({ newRent: 5030 })).status).toBe(200);
    // 5030 -> 5060 is under 1% of 5030 but over 1% of the year's starting 5000.
    const second = await extend({ newRent: 5060 });
    expect(second.status).toBe(409);
    expect((await extend({ newRent: 5050 })).status).toBe(200);
  });

  it('allows keeping or lowering the rent', async () => {
    expect((await extend({ newRent: 5000 })).status).toBe(200);
    expect((await extend({ newRent: 4800 })).status).toBe(200);
  });

  it('does not cap a unit renting above the covered limit', async () => {
    await reset(12000);
    expect((await extend({ newRent: 13000 })).status).toBe(200);
  });

  it('follows the cap in Settings', async () => {
    await setSetting('rent_cap_percent', 2.3);
    expect((await extend({ newRent: capOf(5000, 2.3) })).status).toBe(200);
    await setSetting('rent_cap_percent', 1);
  });
});

describe('update_room.php', () => {
  beforeEach(() => reset(5000));

  it('refuses a rent change on an occupied unit', async () => {
    const res = await api('update_room.php', { token: admin, json: { id: ROOM, monthly_rent: 6000 } });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Extend Rent/);
    expect((await one('SELECT monthly_rent FROM rooms WHERE id = ?', [ROOM])).monthly_rent).toBe('5000.00');
  });

  it('still saves other fields when the rent is unchanged', async () => {
    const res = await api('update_room.php', { token: admin, json: { id: ROOM, monthly_rent: 5000, room_condition: 'Good' } });
    expect(res.status).toBe(200);
  });

  it('lets a vacant unit be re-priced for the next tenant', async () => {
    const vacant = await one("SELECT id, monthly_rent FROM rooms WHERE status = 'vacant' AND archived_at IS NULL LIMIT 1");
    const res = await api('update_room.php', { token: admin, json: { id: vacant.id, monthly_rent: Number(vacant.monthly_rent) + 1000 } });
    expect(res.status).toBe(200);
    await q('UPDATE rooms SET monthly_rent = ? WHERE id = ?', [vacant.monthly_rent, vacant.id]);
  });
});

describe('late fee ceiling', () => {
  const INV = 'INV-RC-LATE-1';
  beforeEach(async () => {
    await q('DELETE FROM invoices WHERE id = ?', [INV]);
    await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date)
             SELECT ?, user_id, id, 4000, 4000, 'Late fee test', 'pending', DATE_SUB(CURDATE(), INTERVAL 3 DAY) FROM rent_applications WHERE id = ?`, [INV, APP]);
    await setSetting('late_fee_enabled', 'true');
    await q("DELETE FROM system_settings WHERE setting_key = 'billing_checks_last_run'");
  });

  const fee = async () => {
    await api('get_invoices.php', { token: admin });
    return Number((await one('SELECT late_fee FROM invoices WHERE id = ?', [INV])).late_fee);
  };

  it('caps a flat fee at 5% of the base rent', async () => {
    await setSetting('late_fee_type', 'flat');
    await setSetting('late_fee_value', 1000);
    expect(await fee()).toBe(200);
  });

  it('caps a percentage fee at 5%', async () => {
    await setSetting('late_fee_type', 'percent');
    await setSetting('late_fee_value', 10);
    expect(await fee()).toBe(200);
  });

  it('refuses a percentage above 5% in Settings', async () => {
    const res = await api('update_system_settings.php', { token: admin, json: { late_fee_type: 'percent', late_fee_value: '8' } });
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/5%/);
  });

  it('cleans up', async () => {
    await setSetting('late_fee_enabled', 'false');
    await setSetting('late_fee_type', 'flat');
    await setSetting('late_fee_value', 200);
    await q('DELETE FROM invoices WHERE id = ?', [INV]);
  });
});

describe('rent-control settings', () => {
  it('validates the cap, the limit and the date', async () => {
    const bad = async (json) => (await api('update_system_settings.php', { token: admin, json })).body.success;
    expect(await bad({ rent_cap_percent: '150' })).toBe(false);
    expect(await bad({ rent_cap_max_covered_rent: '-1' })).toBe(false);
    expect(await bad({ rent_cap_valid_until: '2026-13-01' })).toBe(false);
    expect(await bad({ deposit_refundable_default: '0' })).toBe(false);
    expect(await bad({ rent_cap_percent: '2.3', rent_cap_valid_until: '2027-12-31' })).toBe(true);
    await setSetting('rent_cap_percent', 1);
  });
});
