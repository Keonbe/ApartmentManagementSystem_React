// Rent extension requests decided on the Tenants page (get_tenants.php
// extensionRequest + process_tenant_request.php), the Dashboard's separate
// extension_requests line, and a contract's History tab (get_contract_history.php).
// Maria (user 2) rents room A on application 1.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

const MARIA = 2;
const SIGNED = 'uploads/leases/history_test_signed.jpg';
let admin, maria, contractId, requestId;

const mariaRow = async () => (await api('get_tenants.php', { token: admin })).body.data.filter((t) => Number(t.user_id) === MARIA);
const attention = async () => (await api('dashboard_stats.php', { token: admin, query: { section: 'attention' } })).body.attention;
const history = (token, contract) => api('get_contract_history.php', { token, query: contract === undefined ? {} : { contractId: contract } });

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
  await setSetting('min_lease_duration', 1);
  await setSetting('max_rent_ahead_months', 12);
  contractId = (await one('SELECT id FROM lease_contracts WHERE rent_application_id = 1')).id;
  // Two months left and a signed copy on file, so an approved extension archives it.
  await q("UPDATE lease_contracts SET status = 'active', lease_end = DATE_ADD(CURDATE(), INTERVAL 2 MONTH), signed_lease_path = ?, signed_lease_review = 'accepted' WHERE id = ?", [SIGNED, contractId]);
  await q("UPDATE rooms SET lease_end = DATE_ADD(CURDATE(), INTERVAL 2 MONTH) WHERE id = 'A'");
  await q("DELETE FROM notifications WHERE type = 'lease_extension_request'");
  await q("DELETE FROM lease_renewals WHERE contract_id = ?", [contractId]);
});

describe('a rent extension request on the Tenants page', () => {
  it('shows on the tenancy in force, with the profile picture field', async () => {
    const res = await api('extend_lease.php', { token: maria, json: { additionalMonths: 2 } });
    expect(res.body).toMatchObject({ success: true });
    requestId = (await one("SELECT id FROM notifications WHERE user_id = ? AND type = 'lease_extension_request' AND status = 'Pending'", [MARIA])).id;

    const rows = await mariaRow();
    const current = rows.find((t) => ['Approved', 'active', 'pending-move-out'].includes(t.status));
    expect(current.extensionRequest).toEqual(expect.objectContaining({ id: requestId, months: 2 }));
    expect(current).toHaveProperty('avatar');
    // Any older application of the same tenant carries none.
    rows.filter((t) => t !== current).forEach((t) => expect(t.extensionRequest).toBeNull());
  });

  it('the Dashboard counts it on its own line, not with occupancy and household requests', async () => {
    const a = await attention();
    expect(Number(a.extension_requests)).toBe(1);
    const others = (await one("SELECT COUNT(*) AS c FROM notifications WHERE status = 'Pending' AND type IN ('occupancy_request', 'household_request')")).c;
    expect(Number(a.requests_to_decide)).toBe(Number(others));
  });

  it('approving it extends the contract, archives the signed copy and clears the request', async () => {
    const before = (await one('SELECT lease_end FROM lease_contracts WHERE id = ?', [contractId])).lease_end;
    const res = await api('process_tenant_request.php', { token: admin, json: { notificationId: requestId, action: 'approve' } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const after = await one('SELECT lease_end, signed_lease_path FROM lease_contracts WHERE id = ?', [contractId]);
    expect(String(after.lease_end)).not.toBe(String(before));
    expect(after.signed_lease_path).toBeNull();
    const current = (await mariaRow()).find((t) => t.status === 'active');
    expect(current.extensionRequest).toBeNull();
    expect(Number((await attention()).extension_requests)).toBe(0);
    // Deciding it twice (another admin, a second tab) is refused.
    const again = await api('process_tenant_request.php', { token: admin, json: { notificationId: requestId, action: 'reject' } });
    expect(again.body.success).toBe(false);
  });
});

describe('a contract\'s history', () => {
  it('is admin only and needs a known contract', async () => {
    expect((await history(undefined, contractId)).status).toBe(401);
    expect((await history(maria, contractId)).status).toBe(403);
    expect((await history(admin)).status).toBe(422);
    expect((await history(admin, 'CTR-does-not-exist')).status).toBe(404);
  });

  it('lists the tenant\'s contracts with each extension and the copy signed before it', async () => {
    const res = await history(admin, contractId);
    expect(res.status).toBe(200);
    const mine = await q('SELECT lc.id FROM lease_contracts lc JOIN rent_applications ra ON ra.id = lc.rent_application_id WHERE ra.user_id = ?', [MARIA]);
    expect(res.body.contracts.map((c) => c.id).sort()).toEqual(mine.map((r) => r.id).sort());
    const c = res.body.contracts.find((x) => x.id === contractId);
    expect(c.renewals).toHaveLength(1);
    expect(c.renewals[0]).toMatchObject({ addedMonths: 2, previousSignedLeasePath: SIGNED });
    expect(c.signedLeasePath).toBeNull();
    expect(c.leaseEnd).toBe(String(c.renewals[0].newLeaseEnd).slice(0, 10));
  });
});
