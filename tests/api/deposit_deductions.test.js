// Itemized move-out deductions (plan Phase 4): update_tenant_status.php
// 'moved-out' with deductions: [{category, reason, amount}] writes one
// deposit_deductions row per line and derives the legacy contract totals.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, mark;
const MARK_APP = 11; // user 13, room L, pending-move-out in the seed
const clear = (json) => api('update_tenant_status.php', { token: admin, json: { id: MARK_APP, status: 'moved-out', ...json } });
const line = (over = {}) => ({ category: 'damage', reason: 'Broken window', amount: 500, ...over });
const rows = () => q('SELECT category, reason, amount, contract_id, recorded_by FROM deposit_deductions WHERE rent_application_id = ? ORDER BY id', [MARK_APP]);

beforeAll(async () => {
  admin = await loginAs('admin');
  mark = await loginAs('mark');
  // A live contract to settle, whatever the seed dates did to it.
  await q("UPDATE lease_contracts SET status = 'active', deposit_status = 'Held', lease_end = CURDATE() + INTERVAL 30 DAY WHERE rent_application_id = ?", [MARK_APP]);
});

describe('validation (422, nothing written)', () => {
  it.each([
    ['not a list', { deductions: 'abc' }, /must be a list/],
    ['an object instead of a list', { deductions: { a: line() } }, /must be a list/],
    ['more than 20 lines', { deductions: Array.from({ length: 21 }, () => line()) }, /at most 20/],
    ['an unknown category', { deductions: [line({ category: 'fines' })] }, /category/],
    ['a missing reason', { deductions: [line({ reason: '' })] }, /reason is required/],
    ['a whitespace-only reason', { deductions: [line({ reason: '   ' })] }, /reason is required/],
    ['a reason over 255 characters', { deductions: [line({ reason: 'x'.repeat(256) })] }, /255/],
    ['a zero amount', { deductions: [line({ amount: 0 })] }, /more than/],
    ['a negative amount', { deductions: [line({ amount: -10 })] }, /more than/],
    ['a non-numeric amount', { deductions: [line({ amount: 'ten' })] }, /must be a number/],
    ['NaN as text', { deductions: [line({ amount: 'NaN' })] }, /must be a number/],
    ['a boolean amount', { deductions: [line({ amount: true })] }, /must be a number/],
    ['an amount over 1,000,000', { deductions: [line({ amount: 1000000.01 })] }, /at most/],
    ['a bad second line', { deductions: [line(), line({ reason: '' })] }, /Deduction 2/],
  ])('%s', async (_label, body, message) => {
    const res = await clear(body);
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(message);
    expect(await rows()).toEqual([]);
    expect((await one('SELECT status FROM rent_applications WHERE id = ?', [MARK_APP])).status).toBe('pending-move-out');
  });

  it('an itemized clearance for a tenant without a move-out notice → 409', async () => {
    const res = await api('update_tenant_status.php', { token: admin, json: { id: 1, status: 'moved-out', deductions: [line()] } });
    expect(res.status).toBe(409);
    expect((await one('SELECT status FROM rent_applications WHERE id = 1')).status).toBe('active');
  });

  it('a tenant cannot clear themselves', async () => {
    const res = await api('update_tenant_status.php', { token: mark, json: { id: MARK_APP, status: 'moved-out', deductions: [] } });
    expect([401, 403]).toContain(res.status);
  });
});

describe('itemized clearance', () => {
  it('stores each line, derives the contract totals and lists the lines to the tenant', async () => {
    const res = await clear({
      deductions: [
        line({ amount: '500.005' }),
        line({ category: 'other', reason: 'Lost key', amount: 150 }),
        line({ category: 'electricity', reason: 'Final Meralco bill', amount: 812.4 }),
        line({ category: 'water', reason: 'Final water bill', amount: 210 }),
        line({ category: 'unpaid_rent', reason: 'Last 3 days', amount: 300 }),
      ],
      clearance_notes: 'Itemized test',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const saved = await rows();
    expect(saved.map((r) => [r.category, r.reason, r.amount])).toEqual([
      ['damage', 'Broken window', '500.01'], ['other', 'Lost key', '150.00'], ['electricity', 'Final Meralco bill', '812.40'],
      ['water', 'Final water bill', '210.00'], ['unpaid_rent', 'Last 3 days', '300.00'],
    ]);
    const adminId = (await one("SELECT id FROM users WHERE email_address = 'admin@gmail.com'")).id;
    expect(saved.map((r) => [r.contract_id, r.recorded_by])).toEqual(Array(5).fill(['LC-0010', adminId]));

    const contract = await one('SELECT damage_deduction, utility_deduction, deposit_status FROM lease_contracts WHERE rent_application_id = ?', [MARK_APP]);
    expect(contract).toMatchObject({ damage_deduction: '650.01', utility_deduction: '1322.40', deposit_status: 'Applied to Bills/Damages' });

    const notif = await one("SELECT message FROM notifications WHERE user_id = 13 AND title = 'Move-Out Completed' ORDER BY id DESC LIMIT 1");
    expect(notif.message).toContain('Damage – Broken window: ₱500.01');
    expect(notif.message).toContain('Unpaid rent – Last 3 days: ₱300.00');
  });

  it('get_invoices returns the lines in the deposit block', async () => {
    const res = await api('get_invoices.php', { token: admin });
    const accounts = res.body.accounts || res.body.data?.accounts;
    const acct = accounts?.[13] ?? accounts?.['13'];
    expect(acct.deposit.items).toHaveLength(5);
    expect(acct.deposit.items[0]).toMatchObject({ category: 'damage', label: 'Damage', reason: 'Broken window', amount: 500.01 });
  });

  it('a second (stale or double) clearance is refused and adds no lines', async () => {
    const res = await clear({ deductions: [line()] });
    expect(res.status).toBe(409);
    expect(await rows()).toHaveLength(5);
  });

  it('restoring the tenancy removes the lines with the totals', async () => {
    await q("UPDATE rent_applications SET status = 'archived', pre_archive_status = 'active' WHERE id = ?", [MARK_APP]);
    const res = await api('restore_tenant.php', { token: admin, json: { id: MARK_APP } });
    expect(res.body.success).toBe(true);
    expect(await rows()).toEqual([]);
    const contract = await one('SELECT damage_deduction, utility_deduction FROM lease_contracts WHERE rent_application_id = ?', [MARK_APP]);
    expect(contract).toMatchObject({ damage_deduction: '0.00', utility_deduction: '0.00' });
  });
});

describe('legacy two-field payload', () => {
  it('still works when deductions is absent (no line rows)', async () => {
    await q("UPDATE rent_applications SET status = 'pending-move-out' WHERE id = ?", [MARK_APP]);
    await q("UPDATE lease_contracts SET status = 'active' WHERE rent_application_id = ?", [MARK_APP]);
    const res = await clear({ damage_deduction: 200, utility_deduction: 50, clearance_notes: 'Legacy' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await rows()).toEqual([]);
    const contract = await one('SELECT damage_deduction, utility_deduction FROM lease_contracts WHERE rent_application_id = ?', [MARK_APP]);
    expect(contract).toMatchObject({ damage_deduction: '200.00', utility_deduction: '50.00' });
  });
});

// The lease end can pass before the admin clears the move-out, and
// expire_lapsed_contracts() then marks the contract 'expired'. The clearance used
// to match only 'active' contracts: the deposit stayed Held, the totals never
// reached the contract (or the Security Deposit Ledger) and the deposit was left
// out of the balance.
describe('a contract that expired before the clearance', () => {
  const reopen = async (depositStatus) => {
    await q("DELETE FROM deposit_deductions WHERE rent_application_id = ?", [MARK_APP]);
    await q("UPDATE rent_applications SET status = 'pending-move-out' WHERE id = ?", [MARK_APP]);
    await q("UPDATE lease_contracts SET status = 'expired', deposit_status = ?, damage_deduction = 0, utility_deduction = 0, refund_date = NULL, lease_end = CURDATE() - INTERVAL 1 DAY WHERE rent_application_id = ?", [depositStatus, MARK_APP]);
  };

  it('settles the contract, links the lines to it and counts the deposit in the balance', async () => {
    await reopen('Held');
    const res = await clear({ deductions: [line({ amount: 500 }), line({ category: 'water', reason: 'Final water bill', amount: 120 })] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const contract = await one('SELECT id, status, deposit_status, damage_deduction, utility_deduction, refund_date FROM lease_contracts WHERE rent_application_id = ?', [MARK_APP]);
    expect(contract).toMatchObject({ status: 'expired', deposit_status: 'Applied to Bills/Damages', damage_deduction: '500.00', utility_deduction: '120.00' });
    expect(contract.refund_date).not.toBeNull();
    expect((await rows()).map((r) => r.contract_id)).toEqual([contract.id, contract.id]);

    // The deposit (one month's rent) covers ₱620, so no balance is reported.
    expect(res.body.balance_due ?? 0).toBe(0);
  });

  it('a deposit that was never paid is recorded as not collected, and is not counted', async () => {
    await reopen('Pending');
    const res = await clear({ deductions: [line({ amount: 500 })] });
    expect(res.status).toBe(200);
    const contract = await one('SELECT deposit_status, damage_deduction FROM lease_contracts WHERE rent_application_id = ?', [MARK_APP]);
    expect(contract).toMatchObject({ deposit_status: 'Not Collected', damage_deduction: '500.00' });
    // No paid deposit to draw on, so the whole deduction is still owed.
    expect(res.body.balance_due).toBe(500);
  });
});
