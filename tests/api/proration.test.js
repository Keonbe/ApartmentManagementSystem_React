// Final-period proration (Settings -> Payments "Prorate the final rent period",
// prorate_final_rent_period() in config.php). With the setting on, the move-out
// clearance charges the rent period holding the move-out day at base_rent ÷ 30 a
// day, cancels an untouched rent bill for a later period, and returns rent already
// paid for days after the move-out with the deposit. Off (the default), billing
// is by whole months exactly as before.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

let admin;
const APP = 11; // user 13, room L, pending-move-out in the seed
const USER = 13;
const CONTRACT = 'LC-0010';
const DEPOSIT = 3500;
const RENT = 4000;

// Local calendar dates (the suite runs in Asia/Manila, like the server).
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
const TODAY = ymd(now);
const THIS_START = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
const NEXT_START = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1));
const PREV_START = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const PREV_END = ymd(new Date(now.getFullYear(), now.getMonth(), 0));
const DAYS_IN_MONTH = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
// The lease started on the 1st two months ago, so every rent period is a calendar month.
const LEASE_START = ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1));

const clear = (json = {}) => api('update_tenant_status.php', { token: admin, json: { id: APP, status: 'moved-out', deductions: [], ...json } });
const invoice = (id) => one('SELECT status, base_rent, total_amount, amount_paid, cancel_reason FROM invoices WHERE id = ?', [id]);

async function rentBill(id, periodStart, { status = 'pending', paid = 0 } = {}) {
  await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date, rent_period_start, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, 'Proration test', ?, ?, ?, ?)`,
  [id, USER, APP, RENT, RENT, paid, status, periodStart, periodStart, status === 'paid' ? `${periodStart} 09:00:00` : null]);
}

beforeAll(async () => {
  admin = await loginAs('admin');
});

beforeEach(async () => {
  await q('DELETE FROM deposit_deductions WHERE rent_application_id = ?', [APP]);
  await q('DELETE FROM refund_requests WHERE rent_application_id = ?', [APP]);
  await q("DELETE FROM invoices WHERE id LIKE 'INV-PRO-%' OR (rent_application_id = ? AND billing_period = 'Move-out balance')", [APP]);
  await q("UPDATE invoices SET status = 'cancelled' WHERE rent_application_id = ? AND status <> 'paid'", [APP]);
  await q('UPDATE rent_applications SET status = ?, requested_move_out_date = CURDATE(), moved_out_date = NULL WHERE id = ?', ['pending-move-out', APP]);
  await q("UPDATE rooms r JOIN rent_applications ra ON ra.room_name = r.id SET r.status = 'occupied', r.tenant_name = TRIM(CONCAT_WS(' ', ra.first_name, ra.last_name, NULLIF(TRIM(ra.suffix), ''))) WHERE ra.id = ?", [APP]);
  await q(`UPDATE lease_contracts SET status = 'active', lease_start = ?, deposit_amount = ?, deposit_status = 'Held', damage_deduction = 0, utility_deduction = 0,
           refund_amount = 0, refund_date = NULL, lease_end = CURDATE() + INTERVAL 3 MONTH WHERE id = ?`, [LEASE_START, DEPOSIT, CONTRACT]);
  await setSetting('prorate_final_period', '0');
});

describe('setting off (the default)', () => {
  it('bills the last period in full and keeps a lead-issued next period owed', async () => {
    await rentBill('INV-PRO-OFF-NOW', THIS_START);
    await rentBill('INV-PRO-OFF-NEXT', NEXT_START);
    const res = await clear({ move_out_date: TODAY });
    expect(res.status).toBe(200);
    expect(res.body.prorated).toBeUndefined();
    expect(res.body.move_out_date).toBe(TODAY);
    // The deposit paid what it reached; nothing was lowered.
    const now1 = await invoice('INV-PRO-OFF-NOW');
    expect(Number(now1.total_amount)).toBe(RENT);
    expect(Number((await invoice('INV-PRO-OFF-NEXT')).total_amount)).toBe(RENT);
    expect((await one('SELECT moved_out_date FROM rent_applications WHERE id = ?', [APP])).moved_out_date).toBeTruthy();
    expect((await one("SELECT COUNT(*) AS n FROM invoice_adjustments WHERE invoice_id LIKE 'INV-PRO-OFF-%'")).n).toBe(0);
  });
});

describe('setting on', () => {
  beforeEach(() => setSetting('prorate_final_period', '1'));

  it('charges the open last period by the day and cancels the next period', async () => {
    await rentBill('INV-PRO-NOW', THIS_START);
    await rentBill('INV-PRO-NEXT', NEXT_START);
    const days = now.getDate();
    const expected = days >= DAYS_IN_MONTH ? RENT : Math.min(RENT, Math.round(RENT * 100 * days / 30) / 100);
    const res = await clear({ move_out_date: TODAY });
    expect(res.status).toBe(200);
    expect(res.body.prorated.lines.length).toBeGreaterThanOrEqual(1);

    const cur = await invoice('INV-PRO-NOW');
    expect(Number(cur.total_amount)).toBeCloseTo(expected, 2);
    expect(Number(cur.base_rent)).toBeCloseTo(expected, 2);
    const next = await invoice('INV-PRO-NEXT');
    expect(next.status).toBe('cancelled');
    expect(next.cancel_reason).toMatch(/period after the move-out/);
    if (expected < RENT) {
      const adj = await one("SELECT reason, old_total, new_total FROM invoice_adjustments WHERE invoice_id = 'INV-PRO-NOW'");
      expect(adj.reason).toMatch(/Prorated final rent period/);
      expect(Number(adj.old_total)).toBe(RENT);
      expect(Number(adj.new_total)).toBeCloseTo(expected, 2);
    }
    // The deposit then settles against the lowered total.
    const refund = Math.max(0, Math.round((DEPOSIT - expected) * 100) / 100);
    expect(res.body.deposit.refund_amount).toBeCloseTo(refund, 2);
  });

  it('returns rent paid for days after the move-out with the deposit', async () => {
    await rentBill('INV-PRO-PAID', THIS_START, { status: 'paid', paid: RENT });
    const days = now.getDate();
    const charged = days >= DAYS_IN_MONTH ? RENT : Math.round(RENT * 100 * days / 30) / 100;
    const res = await clear({ move_out_date: TODAY });
    expect(res.status).toBe(200);
    // The paid record is kept as it was.
    const paid = await invoice('INV-PRO-PAID');
    expect(paid.status).toBe('paid');
    expect(Number(paid.total_amount)).toBe(RENT);
    expect(res.body.deposit.refund_amount).toBeCloseTo(DEPOSIT + (RENT - charged), 2);
    if (charged < RENT) {
      const r = await one("SELECT amount, reason FROM refund_requests WHERE rent_application_id = ? AND type = 'deposit'", [APP]);
      expect(r.reason).toMatch(/rent paid for days after the move-out/);
    }
  });

  it('a move-out on the last day of a period owes that period in full', async () => {
    await rentBill('INV-PRO-PREV', PREV_START, { status: 'paid', paid: RENT });
    await rentBill('INV-PRO-CUR', THIS_START);
    const res = await clear({ move_out_date: PREV_END });
    expect(res.status).toBe(200);
    expect((await invoice('INV-PRO-PREV')).status).toBe('paid');
    expect(Number((await invoice('INV-PRO-PREV')).total_amount)).toBe(RENT);
    expect((await invoice('INV-PRO-CUR')).status).toBe('cancelled');
    expect(res.body.deposit.refund_amount).toBeCloseTo(DEPOSIT, 2);
  });

  it('a part-paid last period covered by its parts is marked paid and the rest credited', async () => {
    // 3,900 received on a 4,000 bill; prorated to less than that only after day 29.
    await rentBill('INV-PRO-PART', THIS_START, { paid: 3900 });
    const days = now.getDate();
    const charged = days >= DAYS_IN_MONTH ? RENT : Math.round(RENT * 100 * days / 30) / 100;
    const res = await clear({ move_out_date: TODAY });
    expect(res.status).toBe(200);
    const bill = await invoice('INV-PRO-PART');
    if (charged <= 3900) {
      expect(bill.status).toBe('paid');
      expect(Number(bill.total_amount)).toBe(3900);
      expect(res.body.deposit.refund_amount).toBeCloseTo(DEPOSIT + (3900 - charged), 2);
    } else {
      expect(Number(bill.total_amount)).toBeCloseTo(charged, 2);
    }
  });
});

describe('the move-out date', () => {
  it('is refused in the future, before the move-in day, or malformed; nothing is saved', async () => {
    await setSetting('prorate_final_period', '1');
    await rentBill('INV-PRO-BAD', THIS_START);
    const tomorrow = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    for (const move_out_date of [tomorrow, '2020-01-01', '2026-02-30', 'soon']) {
      const res = await clear({ move_out_date });
      expect(res.status).toBe(422);
    }
    expect((await one('SELECT status, moved_out_date FROM rent_applications WHERE id = ?', [APP]))).toMatchObject({ status: 'pending-move-out', moved_out_date: null });
    expect(Number((await invoice('INV-PRO-BAD')).total_amount)).toBe(RENT);
  });
});

describe('the setting', () => {
  it('saves only on or off', async () => {
    const bad = await api('update_system_settings.php', { token: admin, json: { prorate_final_period: 'maybe' } });
    expect(bad.status).toBe(422);
    const ok = await api('update_system_settings.php', { token: admin, json: { prorate_final_period: true } });
    expect(ok.status).toBe(200);
    expect((await one("SELECT setting_value FROM system_settings WHERE setting_key = 'prorate_final_period'")).setting_value).toBe('1');
  });
});
