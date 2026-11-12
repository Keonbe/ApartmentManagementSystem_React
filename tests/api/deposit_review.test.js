// Tenant "Request review" on a settled security deposit (request_deposit_review.php,
// get_deposit_statement.php) and the admin answer (get_deposit_reviews.php,
// resolve_deposit_review.php); plus the overdue deposit refund notice (sweep) and
// the report lines for returned / withheld deposits.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

let admin, mark, maria;
const APP = 11; // user 13, room L, pending-move-out in the seed
const CONTRACT = 'LC-0010';
const DEPOSIT = 3500;

const clear = (json = {}) => api('update_tenant_status.php', { token: admin, json: { id: APP, status: 'moved-out', ...json } });
const statement = () => api('get_deposit_statement.php', { token: mark });
const askReview = (message = 'The window was already broken when I moved in.') => api('request_deposit_review.php', { token: mark, json: { message } });
const answer = (json) => api('resolve_deposit_review.php', { token: admin, json });
const contract = () => one('SELECT deposit_status, refund_amount FROM lease_contracts WHERE id = ?', [CONTRACT]);
const reviews = () => q('SELECT * FROM deposit_reviews WHERE rent_application_id = ? ORDER BY id', [APP]);
const depositRefunds = () => q("SELECT id, amount, status FROM refund_requests WHERE rent_application_id = ? AND type = 'deposit' ORDER BY id", [APP]);

// A cleared move-out on a refundable contract with a ₱500 damage line.
async function cleared() {
  await q('DELETE FROM deposit_reviews WHERE rent_application_id = ?', [APP]);
  await q('DELETE FROM deposit_deductions WHERE rent_application_id = ?', [APP]);
  await q("DELETE FROM refund_requests WHERE rent_application_id = ? AND type = 'deposit'", [APP]);
  await q("UPDATE invoices SET status = 'cancelled' WHERE rent_application_id = ? AND status <> 'paid'", [APP]);
  await q("UPDATE rent_applications SET status = 'pending-move-out', requested_move_out_date = CURDATE() WHERE id = ?", [APP]);
  await q("UPDATE rooms r JOIN rent_applications ra ON ra.room_name = r.id SET r.status = 'occupied', r.tenant_name = TRIM(CONCAT_WS(' ', ra.first_name, ra.last_name, NULLIF(TRIM(ra.suffix), ''))) WHERE ra.id = ?", [APP]);
  await q(`UPDATE lease_contracts SET status = 'active', deposit_amount = ?, deposit_status = 'Held', deposit_refundable = 1,
           damage_deduction = 0, utility_deduction = 0, refund_amount = 0, refund_date = NULL, lease_end = CURDATE() - INTERVAL 1 DAY WHERE id = ?`, [DEPOSIT, CONTRACT]);
  const res = await clear({ deductions: [{ category: 'damage', reason: 'Broken window', amount: 500 }] });
  expect(res.status).toBe(200);
}

beforeAll(async () => {
  admin = await loginAs('admin');
  mark = await loginAs('mark');
  maria = await loginAs('maria');
});

describe('deposit statement', () => {
  beforeAll(cleared);

  it('shows the settled deposit, its lines and that a review can be asked for', async () => {
    const res = await statement();
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ deposit: DEPOSIT, status: 'Refund Pending', refundable: true, refundAmount: 3000, canRequestReview: true, review: null });
    expect(res.body.data.deductions).toHaveLength(1);
  });

  it('is empty for a tenant with nothing settled', async () => {
    const res = await api('get_deposit_statement.php', { token: maria });
    expect(res.body.data).toBeNull();
  });

  it('needs a sign-in', async () => {
    expect([401, 403]).toContain((await api('get_deposit_statement.php')).status);
  });
});

describe('asking for a review', () => {
  beforeEach(cleared);

  it.each([['an empty message', ''], ['a blank message', '   '], ['a message over 1000 characters', 'x'.repeat(1001)]])('%s → 422', async (_l, message) => {
    expect((await askReview(message)).status).toBe(422);
    expect(await reviews()).toEqual([]);
  });

  it('is saved, queued for the admin, and only one is allowed', async () => {
    const res = await askReview();
    expect(res.status).toBe(200);
    expect(await reviews()).toHaveLength(1);
    const queued = await one("SELECT COUNT(*) AS c FROM notifications WHERE type = 'deposit_review' AND status = 'Pending'");
    expect(queued.c).toBe(1);
    expect((await askReview('again')).status).toBe(409);
    expect(await reviews()).toHaveLength(1);
    expect((await statement()).body.data).toMatchObject({ canRequestReview: false, review: { status: 'Open' } });
  });

  it('is refused after the review period', async () => {
    await q("UPDATE lease_contracts SET refund_date = CURDATE() - INTERVAL 40 DAY WHERE id = ?", [CONTRACT]);
    const res = await askReview();
    expect(res.status).toBe(409);
    expect(await reviews()).toEqual([]);
  });

  it('is still allowed on the last day of the period', async () => {
    await setSetting('deposit_refund_days', '30');
    await q("UPDATE lease_contracts SET refund_date = CURDATE() - INTERVAL 30 DAY WHERE id = ?", [CONTRACT]);
    expect((await askReview()).status).toBe(200);
  });

  it('is refused when nothing was deducted or withheld', async () => {
    await q('DELETE FROM deposit_deductions WHERE rent_application_id = ?', [APP]);
    await q("UPDATE lease_contracts SET refund_amount = deposit_amount WHERE id = ?", [CONTRACT]);
    expect((await askReview()).status).toBe(409);
  });

  it('a tenant without a settled deposit gets 404', async () => {
    const res = await api('request_deposit_review.php', { token: maria, json: { message: 'Hello' } });
    expect(res.status).toBe(404);
  });
});

describe('answering a review', () => {
  beforeEach(async () => { await cleared(); expect((await askReview()).status).toBe(200); });
  const open = async () => (await reviews())[0];

  it('a tenant cannot answer', async () => {
    const res = await api('resolve_deposit_review.php', { token: mark, json: { id: (await open()).id, outcome: 'upheld', response: 'Fine' } });
    expect([401, 403]).toContain(res.status);
    expect((await open()).status).toBe('Open');
  });

  it.each([
    ['no outcome', { response: 'x' }, 400],
    ['a response is required', { outcome: 'upheld', response: '  ' }, 422],
    ['a response over 1000 characters', { outcome: 'upheld', response: 'x'.repeat(1001) }, 422],
    ['adjusted without an amount', { outcome: 'adjusted', response: 'x' }, 422],
    ['adjusted with ₱0', { outcome: 'adjusted', response: 'x', amount: 0 }, 422],
    ['adjusted with a negative amount', { outcome: 'adjusted', response: 'x', amount: -5 }, 422],
    ['adjusted with text', { outcome: 'adjusted', response: 'x', amount: 'lots' }, 422],
    ['adjusted above what was kept (₱500)', { outcome: 'adjusted', response: 'x', amount: 500.01 }, 422],
  ])('%s', async (_l, body, status) => {
    const res = await answer({ id: (await open()).id, ...body });
    expect(res.status).toBe(status);
    expect((await open()).status).toBe('Open');
    expect(await depositRefunds()).toHaveLength(1); // only the clearance refund
  });

  it('upheld closes it with the reason and changes no money', async () => {
    const res = await answer({ id: (await open()).id, outcome: 'upheld', response: 'The move-in photos show it intact.' });
    expect(res.status).toBe(200);
    expect(await open()).toMatchObject({ status: 'Resolved', outcome: 'upheld', admin_response: 'The move-in photos show it intact.' });
    expect(await depositRefunds()).toHaveLength(1);
    expect((await contract()).refund_amount).toBe('3000.00');
    const note = await one("SELECT message FROM notifications WHERE user_id = 13 AND title = 'Deposit Review Answered' ORDER BY id DESC LIMIT 1");
    expect(note.message).toContain('it stands');
    const queued = await one("SELECT COUNT(*) AS c FROM notifications WHERE type = 'deposit_review' AND status = 'Pending' AND metadata_value = ?", [`deposit_review:${(await open()).id}`]);
    expect(queued.c).toBe(0);
  });

  it('adjusted returns more through an approved deposit refund', async () => {
    const res = await answer({ id: (await open()).id, outcome: 'adjusted', amount: 200, response: 'Half of the repair was wear and tear.' });
    expect(res.status).toBe(200);
    const refunds = await depositRefunds();
    expect(refunds).toHaveLength(2);
    expect(refunds[1]).toMatchObject({ amount: '200.00', status: 'Approved' });
    expect(await contract()).toMatchObject({ refund_amount: '3200.00', deposit_status: 'Refund Pending' });
    expect(await open()).toMatchObject({ outcome: 'adjusted', adjusted_amount: '200.00' });
    // Paying out the adjustment alone must not settle the deposit while the first refund is still open.
    const paid = await api('update_refund_request.php', { token: admin, json: { id: refunds[1].id, action: 'mark_refunded', payout_method: 'Cash', payout_reference: 'R-2' } });
    expect(paid.status).toBe(200);
    expect((await contract()).deposit_status).toBe('Refund Pending');
    // Once the last open refund is paid, the contract reads Refunded.
    expect((await api('update_refund_request.php', { token: admin, json: { id: refunds[0].id, action: 'approve' } })).status).toBe(200);
    const paid2 = await api('update_refund_request.php', { token: admin, json: { id: refunds[0].id, action: 'mark_refunded', payout_method: 'GCash', payout_reference: 'R-1' } });
    expect(paid2.status).toBe(200);
    expect((await contract()).deposit_status).toBe('Refunded');
    // The admin queue notice for the adjustment says it is ready for payout, not that it needs review.
    const note = await one("SELECT message FROM notifications WHERE type = 'refund_request' AND title = 'Deposit Refund Ready for Payout' ORDER BY id DESC LIMIT 1");
    expect(note.message).toMatch(/approved and waiting for its payout/);
  });

  it('a second answer is refused (double submit)', async () => {
    const id = (await open()).id;
    expect((await answer({ id, outcome: 'adjusted', amount: 100, response: 'ok' })).status).toBe(200);
    expect((await answer({ id, outcome: 'adjusted', amount: 100, response: 'ok' })).status).toBe(409);
    expect(await depositRefunds()).toHaveLength(2);
  });

  it('the admin list shows the review with its settlement', async () => {
    const res = await api('get_deposit_reviews.php', { token: admin });
    expect(res.status).toBe(200);
    const openId = (await open()).id;
    const row = res.body.data.find((r) => r.id === openId);
    expect(row).toMatchObject({ status: 'Open', deposit: DEPOSIT, maxAdjustment: 500 });
    expect(row.deductions).toHaveLength(1);
    expect([401, 403]).toContain((await api('get_deposit_reviews.php', { token: mark })).status);
  });

  it('restoring the tenancy removes the review with the settlement', async () => {
    await q("UPDATE rent_applications SET status = 'archived', pre_archive_status = 'active' WHERE id = ?", [APP]);
    expect((await api('restore_tenant.php', { token: admin, json: { id: APP } })).body.success).toBe(true);
    expect(await reviews()).toEqual([]);
  });
});

describe('overdue deposit refund notice (sweep)', () => {
  const sweep = () => api('check_due_date_reminders.php', { token: admin, json: {} });
  const notices = () => one("SELECT COUNT(*) AS c FROM notifications WHERE title = 'Deposit Refund Overdue'");
  const tenantNotices = () => one("SELECT COUNT(*) AS c FROM notifications WHERE user_id = 13 AND title = 'Your Deposit Refund Is Late'");

  beforeEach(async () => {
    await cleared();
    await q("DELETE FROM notifications WHERE title IN ('Deposit Refund Overdue', 'Your Deposit Refund Is Late')");
    await setSetting('deposit_refund_days', '30');
  });

  it('nothing inside the period', async () => {
    expect((await sweep()).status).toBe(200);
    expect((await notices()).c).toBe(0);
  });

  it('notifies admins and the tenant once when it is past due, however often the sweep runs', async () => {
    await q("UPDATE refund_requests SET created_at = NOW() - INTERVAL 31 DAY WHERE rent_application_id = ? AND type = 'deposit'", [APP]);
    expect((await sweep()).status).toBe(200);
    expect((await sweep()).status).toBe(200);
    expect((await notices()).c).toBe(1);
    expect((await tenantNotices()).c).toBe(1);
    expect((await one("SELECT overdue_notified_at AS t FROM refund_requests WHERE rent_application_id = ? AND type = 'deposit'", [APP])).t).not.toBeNull();
  });

  it('not once it has been paid out', async () => {
    await q("UPDATE refund_requests SET created_at = NOW() - INTERVAL 31 DAY, status = 'Refunded' WHERE rent_application_id = ? AND type = 'deposit'", [APP]);
    await sweep();
    expect((await notices()).c).toBe(0);
  });

  it('a shorter refund period makes it overdue sooner', async () => {
    await setSetting('deposit_refund_days', '5');
    await q("UPDATE refund_requests SET created_at = NOW() - INTERVAL 6 DAY WHERE rent_application_id = ? AND type = 'deposit'", [APP]);
    await sweep();
    expect((await notices()).c).toBe(1);
  });
});

describe('reports', () => {
  it('count returned and withheld deposits apart from the deduction categories', async () => {
    await cleared();
    await q("INSERT INTO deposit_deductions (rent_application_id, contract_id, category, reason, amount) VALUES (?, ?, 'forfeiture', 'No move-out notice was given', 1200)", [APP, CONTRACT]);
    const res = await api('get_report_data.php', { token: admin });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.depositsRefunded).toBeGreaterThanOrEqual(3000);
    expect(d.depositsForfeited).toBeGreaterThanOrEqual(1200);
    expect(d.depositDeductions.byCategory.map((c) => c.category)).not.toContain('forfeiture');
    expect(d.depositDeductions.byCategory.map((c) => c.category)).toContain('damage');
  });
});
