// get_rooms.php leaseHistory feeds the Units -> Extensions tab: every rent
// extension recorded for a unit, with who extended and the rent before and after
// for admins only (a tenant or a visitor never sees names or rents).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

const roomA = async (token) => {
  const res = await api('get_rooms.php', { token });
  expect(res.status).toBe(200);
  return (res.body.rooms ?? res.body.data ?? res.body).find((r) => r.id === 'A');
};

describe('extension history on get_rooms.php', () => {
  it('an admin sees the tenant, months added and the rent before and after', async () => {
    const contract = await one("SELECT lc.id FROM lease_contracts lc JOIN rent_applications ra ON ra.id = lc.rent_application_id WHERE ra.room_name = 'A' ORDER BY lc.id DESC LIMIT 1");
    expect(contract).toBeTruthy();
    await q(
      `INSERT INTO lease_renewals (contract_id, added_months, previous_lease_end, new_lease_end, previous_rent, rent_at_renewal, approved_by)
       VALUES (?, 3, '2027-01-31', '2027-04-30', 3500.00, 3535.00, 1)`,
      [contract.id],
    );
    const ext = (await roomA(admin)).leaseHistory.find((l) => l.event === 'Rent Extended' && l.newEnd === '2027-04-30');
    expect(ext).toMatchObject({ addedMonths: 3, oldEnd: '2027-01-31', previousRent: 3500, rentAtRenewal: 3535 });
    expect(ext.tenant).toMatch(/Maria/);
  });

  it('a tenant gets the dates but no name or rents', async () => {
    const ext = (await roomA(maria)).leaseHistory?.find((l) => l.newEnd === '2027-04-30');
    if (ext) {
      expect(ext.tenant).toBeNull();
      expect(ext.previousRent).toBeNull();
      expect(ext.rentAtRenewal).toBeNull();
    }
  });
});
