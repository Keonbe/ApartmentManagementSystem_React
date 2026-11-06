// Settings → Rental occupancy: included_occupants (people the room rate covers,
// default 4) and occupant_surcharge_per_person (charge for each one above it).
// The rent is worked out by config.php occupant_surcharge() when an occupant
// change is approved (update_occupants.php → process_tenant_request.php).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

let admin, tenant;
const save = (json, token = admin) => api('update_system_settings.php', { token, json });

// Maria (application 1, room A at ₱4,000) asks for `n` occupants; the admin approves.
async function approveOccupants(n) {
  const req = await api('update_occupants.php', { token: tenant, json: { occupants: n } });
  expect(req.status, JSON.stringify(req.body)).toBe(200);
  const note = await one("SELECT id FROM notifications WHERE type = 'occupancy_request' ORDER BY id DESC LIMIT 1");
  const res = await api('process_tenant_request.php', { token: admin, json: { notificationId: note.id, action: 'approve' } });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return one('SELECT occupants, monthly_rent FROM rent_applications WHERE id = 1');
}

beforeAll(async () => {
  admin = await loginAs('admin');
  tenant = await loginAs('maria');
});

beforeEach(async () => {
  await setSetting('max_occupants_per_unit', '6');
  await setSetting('included_occupants', '4');
  await setSetting('occupant_surcharge_per_person', '1000');
  await q("UPDATE notifications SET status = 'Approved' WHERE type = 'occupancy_request' AND status = 'Pending'");
});

describe('occupancy settings', () => {
  it('are public to read and saved by the admin within their ranges', async () => {
    const s = (await api('get_system_settings.php')).body.settings;
    expect(s.included_occupants).toBe('4');
    expect((await save({ included_occupants: '3', occupant_surcharge_per_person: '1500' })).status).toBe(200);
    for (const bad of [{ included_occupants: '0' }, { included_occupants: '21' }, { included_occupants: 'two' },
      { occupant_surcharge_per_person: '-1' }, { occupant_surcharge_per_person: '100001' }, { occupant_surcharge_per_person: 'free' }]) {
      expect((await save(bad)).status, JSON.stringify(bad)).toBe(422);
    }
    expect((await save({ included_occupants: '5' }, tenant)).status).toBe(403);
  });
});

describe('rent for extra occupants', () => {
  it('4 included: 6 people pay for 2 extra, back to 4 pays nothing', async () => {
    expect(await approveOccupants(6)).toEqual({ occupants: 6, monthly_rent: '6000.00' });
    expect(await approveOccupants(4)).toEqual({ occupants: 4, monthly_rent: '4000.00' });
  });

  it('follows a changed included number and charge', async () => {
    await setSetting('included_occupants', '5');
    await setSetting('occupant_surcharge_per_person', '750');
    expect(await approveOccupants(6)).toEqual({ occupants: 6, monthly_rent: '4750.00' });
  });

  it('a garbled stored value falls back to 4 included and ₱1,000', async () => {
    await setSetting('included_occupants', 'lots');
    await setSetting('occupant_surcharge_per_person', 'abc');
    expect(await approveOccupants(5)).toEqual({ occupants: 5, monthly_rent: '5000.00' });
  });
});
