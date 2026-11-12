// Cancellation fee: an admin cancelling an approved application at the tenant's
// request keeps the fee (Settings → Rental) out of the refunds; a rejection or
// decline by Management never does (update_tenant_status.php, raise_rejection_refunds).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

let admin;
const APP = 5; // user 7, room E, Approved in the seed
const USER = 7;

const cancel = (json = {}) => api('update_tenant_status.php', { token: admin, json: { id: APP, status: 'Cancelled', rejection_reason: 'Changed their mind', ...json } });
const refunds = () => q("SELECT amount, reason, status FROM refund_requests WHERE rent_application_id = ? AND type = 'rejected_application' ORDER BY id", [APP]);
const total = (rows) => Math.round(rows.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;

beforeAll(async () => { admin = await loginAs('admin'); });

// Two paid invoices (₱3,000 and ₱2,000), the application approved again, no refunds.
beforeEach(async () => {
  await q("DELETE FROM refund_requests WHERE rent_application_id = ?", [APP]);
  await q("DELETE FROM invoices WHERE id IN ('INV-FEE-1', 'INV-FEE-2')");
  for (const [id, amount, period] of [['INV-FEE-1', 3000, 'Fee test A'], ['INV-FEE-2', 2000, 'Fee test B']]) {
    await q(`INSERT INTO invoices (id, user_id, rent_application_id, services, total_amount, amount_paid, billing_period, status, due_date, paid_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', CURDATE(), NOW())`, [id, USER, APP, amount, amount, amount, period]);
  }
  // The seeded move-in money of this application is not part of these cases.
  await q("UPDATE invoices SET amount_paid = 0, status = 'cancelled' WHERE rent_application_id = ? AND id NOT IN ('INV-FEE-1', 'INV-FEE-2')", [APP]);
  await q("UPDATE rent_applications SET status = 'Approved' WHERE id = ?", [APP]);
  await setSetting('cancellation_fee', '0');
});

describe('cancelled at the tenant\'s request', () => {
  it('fee 0: everything paid is refunded', async () => {
    const res = await cancel({ at_tenant_request: true });
    expect(res.status).toBe(200);
    expect(total(await refunds())).toBe(5000);
    expect(res.body.cancellation_fee_kept).toBeUndefined();
  });

  it('a fee comes off the refunds and is named in the reason', async () => {
    await setSetting('cancellation_fee', '1000');
    const res = await cancel({ at_tenant_request: true });
    expect(res.status).toBe(200);
    expect(res.body.cancellation_fee_kept).toBe(1000);
    const rows = await refunds();
    expect(total(rows)).toBe(4000);
    expect(rows.some((r) => /cancellation fee of ₱/.test(r.reason))).toBe(true);
    const note = await one("SELECT message FROM notifications WHERE user_id = ? AND type = 'application_update' ORDER BY id DESC LIMIT 1", [USER]);
    expect(note.message).toMatch(/cancellation fee of ₱1,000\.00 was kept/);
  });

  it('a fee larger than the first invoice carries into the next one', async () => {
    await setSetting('cancellation_fee', '3500');
    const res = await cancel({ at_tenant_request: true });
    expect(res.status).toBe(200);
    const rows = await refunds();
    expect(rows).toHaveLength(1); // one invoice is used up: no request for it
    expect(total(rows)).toBe(1500);
  });

  it('a fee above everything paid refunds nothing and keeps only what was paid', async () => {
    await setSetting('cancellation_fee', '9000');
    const res = await cancel({ at_tenant_request: true });
    expect(res.status).toBe(200);
    expect(res.body.cancellation_fee_kept).toBe(5000);
    expect(await refunds()).toEqual([]);
    expect((await one('SELECT status FROM rent_applications WHERE id = ?', [APP])).status).toBe('Cancelled');
  });
});

describe('Management rejects or declines', () => {
  it('is refunded in full whatever the fee', async () => {
    await setSetting('cancellation_fee', '1000');
    const res = await api('update_tenant_status.php', { token: admin, json: { id: APP, status: 'Rejected', rejection_reason: 'Unit no longer available' } });
    expect(res.status).toBe(200);
    expect(total(await refunds())).toBe(5000);
  });

  it('a cancellation without the tenant-request box ignores the fee too', async () => {
    await setSetting('cancellation_fee', '1000');
    expect((await cancel()).status).toBe(200);
    expect(total(await refunds())).toBe(5000);
  });
});

describe('the fee flag is only for an approved application being cancelled', () => {
  it('with a rejection → 422, nothing changes', async () => {
    const res = await api('update_tenant_status.php', { token: admin, json: { id: APP, status: 'Rejected', rejection_reason: 'x', at_tenant_request: true } });
    expect(res.status).toBe(422);
    expect((await one('SELECT status FROM rent_applications WHERE id = ?', [APP])).status).toBe('Approved');
    expect(await refunds()).toEqual([]);
  });

  it('a tenant cannot set it (admin only)', async () => {
    const tenant = await loginAs('maria');
    const res = await api('update_tenant_status.php', { token: tenant, json: { id: APP, status: 'Cancelled', rejection_reason: 'x', at_tenant_request: true } });
    expect([401, 403]).toContain(res.status);
  });
});

describe('cancellation_fee setting', () => {
  it.each([['-1'], ['abc'], ['100000.01']])('%s is refused', async (value) => {
    const res = await api('update_system_settings.php', { token: admin, json: { cancellation_fee: value } });
    expect(res.status).toBe(422);
  });

  it('a valid amount is saved', async () => {
    const res = await api('update_system_settings.php', { token: admin, json: { cancellation_fee: '250.50' } });
    expect(res.status).toBe(200);
    expect((await one("SELECT setting_value FROM system_settings WHERE setting_key = 'cancellation_fee'")).setting_value).toBe('250.50');
  });
});
