// The built-in contract template (get_contract_template.php?default=1) quotes the
// admin's Rental settings instead of hardcoded numbers, and the late fee has a
// saveable on/off switch (late_fee_enabled).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { setSetting, setting } from './lib/db.js';

let admin, maria;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

const variables = async () => {
  const res = await api('get_contract_template.php', { token: admin, query: { default: 1 } });
  expect(res.status).toBe(200);
  return Object.fromEntries(res.body.template.variables.map((v) => [v.key, v.value]));
};

describe('default template variables follow Settings', () => {
  it('uses the seeded values', async () => {
    expect(await variables()).toMatchObject({ occupancy_limit: '4', excess_occupant_fee: '₱1,000', move_out_notice_days: '15' });
  });

  it('follows included_occupants, the extra-person charge and the move-out notice', async () => {
    await setSetting('included_occupants', '3');
    await setSetting('occupant_surcharge_per_person', '1500');
    await setSetting('move_out_min_notice_days', '20');
    expect(await variables()).toMatchObject({ occupancy_limit: '3', excess_occupant_fee: '₱1,500', move_out_notice_days: '20' });
  });
});

describe('late_fee_enabled', () => {
  it('saves on and off as 1 / 0', async () => {
    let res = await api('update_system_settings.php', { token: admin, json: { late_fee_enabled: '1' } });
    expect(res.status).toBe(200);
    expect(await setting('late_fee_enabled')).toBe('1');
    res = await api('update_system_settings.php', { token: admin, json: { late_fee_enabled: false } });
    expect(res.status).toBe(200);
    expect(await setting('late_fee_enabled')).toBe('0');
  });

  it('refuses a value that is neither on nor off', async () => {
    const res = await api('update_system_settings.php', { token: admin, json: { late_fee_enabled: 'maybe' } });
    expect(res.status).toBe(422);
    expect(await setting('late_fee_enabled')).toBe('0');
  });

  it('is admin only', async () => {
    const res = await api('update_system_settings.php', { token: maria, json: { late_fee_enabled: '1' } });
    expect(res.status).toBe(403);
  });

  it('a percentage over the 5% ceiling is still refused', async () => {
    const res = await api('update_system_settings.php', { token: admin, json: { late_fee_type: 'percent', late_fee_value: '9' } });
    expect(res.status).toBe(422);
  });
});
