// Dashboard "needs attention" counts (dashboard_stats.php → attention). Each count
// must move with the rows it describes, and an advance-rent invoice (a prepayment
// the tenant opened, not a debt) must never count as something owed or overdue.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { q, setting, setSetting } from './lib/db.js';

let admin;
const attention = async () => {
  const res = await api('dashboard_stats.php', { token: admin });
  expect(res.status).toBe(200);
  expect(res.body?.success).toBe(true);
  return res.body.attention;
};

async function addBill(id, { userId = 2, appId = 1, status = 'pending', dueDays = 5, advance = null }) {
  await q(
    `INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date, advance_months)
     VALUES (?, ?, ?, 1500, 1500, 0, 'Test bill', ?, CURDATE() + INTERVAL ? DAY, ?)`,
    [id, userId, appId, status, dueDays, advance],
  );
}

describe('dashboard attention counts', () => {
  beforeAll(async () => { admin = await login('admin@gmail.com', 'admin123'); });

  it('is admin only', async () => {
    const tenant = await loginAs('maria');
    const res = await api('dashboard_stats.php', { token: tenant });
    expect([401, 403]).toContain(res.status);
  });

  it('keeps the existing stats alongside the new block', async () => {
    const res = await api('dashboard_stats.php', { token: admin });
    expect(res.body.stats).toHaveProperty('total_revenue');
    expect(res.body.attention).toHaveProperty('proofs_to_verify');
  });

  it('counts proofs, overdue bills and tenants, but not an advance-rent invoice', async () => {
    const before = await attention();
    await addBill('INV-ATT-PROOF', { status: 'pending-verification' });
    await addBill('INV-ATT-LATE', { status: 'pending', dueDays: -3 });
    await addBill('INV-ATT-ADV', { status: 'pending-verification', dueDays: -3, advance: 1 });
    await addBill('INV-ATT-PAID', { status: 'paid', dueDays: -3 });
    const after = await attention();
    expect(after.proofs_to_verify - before.proofs_to_verify).toBe(1);
    expect(after.overdue_invoices - before.overdue_invoices).toBe(1);
    // Maria (user 2) is paid up in the seed, so her late bill adds one overdue tenant.
    expect(after.overdue_tenants - before.overdue_tenants).toBe(1);
  });

  it('counts pending CCTV requests only', async () => {
    const before = await attention();
    await q(`INSERT INTO cctv_requests (user_id, incident_date, incident_time, location_details, reason_request, status)
             VALUES (2, CURDATE(), '10:00', 'Lobby', 'Test', 'Pending')`);
    await q(`INSERT INTO cctv_requests (user_id, incident_date, incident_time, location_details, reason_request, status)
             VALUES (2, CURDATE(), '11:00', 'Lobby', 'Test', 'Approved')`);
    const after = await attention();
    expect(after.cctv_requests - before.cctv_requests).toBe(1);
  });

  it('counts a move-out request from the seed', async () => {
    // Mark (user 13) has filed a move-out notice in the seed: status pending-move-out.
    const now = await attention();
    expect(now.move_out_requests).toBeGreaterThanOrEqual(1);
  });

  it("keeps the dashboard up and flags the block incomplete when one count's table fails", async () => {
    // A deployment missing a table must lose that group, not the whole dashboard, and
    // the page must be told so it never reads the gap as "nothing waiting".
    await q('RENAME TABLE cctv_requests TO cctv_requests_gone');
    try {
      const res = await api('dashboard_stats.php', { token: admin });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats).toHaveProperty('total_revenue');
      expect(res.body.attention.incomplete).toBe(true);
      expect(res.body.attention).not.toHaveProperty('cctv_requests');
      // The groups that did count are still there.
      expect(res.body.attention).toHaveProperty('proofs_to_verify');
    } finally {
      await q('RENAME TABLE cctv_requests_gone TO cctv_requests');
    }
    const ok = await attention();
    expect(ok.incomplete).toBeUndefined();
  });

  it('reads a 0-day rent-end reminder as 0, not the 30-day default', async () => {
    const was = await setting('lease_end_reminder_days');
    await setSetting('lease_end_reminder_days', '0');
    try {
      expect((await attention()).contracts_ending_days).toBe(0);
    } finally {
      await setSetting('lease_end_reminder_days', was ?? '30');
    }
  });
});
