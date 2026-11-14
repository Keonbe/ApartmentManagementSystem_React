// Clearance and termination refuse while a payment is still under review
// (audit P-05). A proof waiting for the admin, or an open online checkout, is
// money the tenant may have paid; settling the deposit and then cancelling the
// bill would lose it.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';
import { addInvoice } from './lib/fixtures.js';

let admin;
const CLEAR_APP = 11; // user 13, pending-move-out in the seed
const TERM_APP = 3;   // user 5, active contract
const clear = () => api('update_tenant_status.php', { token: admin, json: { id: CLEAR_APP, status: 'moved-out', deductions: [] } });
const terminate = (cid) => api('update_contract_status.php', { token: admin, json: { contractId: cid, action: 'terminate', reason: 'Mutual agreement', ground: 'mutual' } });
const appStatus = async (id) => (await one('SELECT status FROM rent_applications WHERE id = ?', [id])).status;
const invoiceStatus = async (id) => (await one('SELECT status FROM invoices WHERE id = ?', [id])).status;

beforeAll(async () => {
  admin = await loginAs('admin');
  await q("UPDATE lease_contracts SET status = 'active', deposit_status = 'Held', lease_end = CURDATE() + INTERVAL 30 DAY WHERE rent_application_id IN (?, ?)", [CLEAR_APP, TERM_APP]);
});

describe('clearance with a payment under review', () => {
  it('a proof waiting for verification blocks it (409), nothing changes', async () => {
    await addInvoice('INV-PR-VERIFY', { userId: 13, appId: CLEAR_APP, status: 'pending-verification' });
    const res = await clear();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/INV-PR-VERIFY.*payment under verification/);
    expect(await appStatus(CLEAR_APP)).toBe('pending-move-out');
    expect(await invoiceStatus('INV-PR-VERIFY')).toBe('pending-verification');
  });

  it('an online checkout in progress blocks it too', async () => {
    await q("UPDATE invoices SET status = 'paid' WHERE id = 'INV-PR-VERIFY'");
    await addInvoice('INV-PR-ONLINE', { userId: 13, appId: CLEAR_APP, status: 'processing', sessionId: 'cs_pr', intentId: 'pi_pr' });
    const res = await clear();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/INV-PR-ONLINE.*online payment in progress/);
    expect(await appStatus(CLEAR_APP)).toBe('pending-move-out');
  });

  it('once the admin settles it, clearance goes through', async () => {
    await q("UPDATE invoices SET status = 'cancelled' WHERE id = 'INV-PR-ONLINE'");
    const res = await clear();
    expect(res.body.success).toBe(true);
    expect(await appStatus(CLEAR_APP)).toBe('moved-out');
  });
});

describe('termination with a payment under review', () => {
  it('is refused (409) and the contract stays active', async () => {
    const cid = (await one('SELECT id FROM lease_contracts WHERE rent_application_id = ?', [TERM_APP])).id;
    await addInvoice('INV-PR-TERM', { userId: 5, appId: TERM_APP, status: 'pending-verification' });
    const res = await terminate(cid);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/payment under verification/);
    expect((await one('SELECT status FROM lease_contracts WHERE id = ?', [cid])).status).toBe('active');
    expect(await appStatus(TERM_APP)).not.toBe('moved-out');

    await q("UPDATE invoices SET status = 'paid' WHERE id = 'INV-PR-TERM'");
    const done = await terminate(cid);
    expect(done.body.message ?? '').not.toMatch(/payment under verification/); // the guard no longer blocks it
  });
});
