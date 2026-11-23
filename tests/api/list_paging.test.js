// Server-side list paging (list_page_request() / list_page_meta() in config.php).
// Paging is opt-in: with ?page= a list answers one page plus total / page / limit /
// pages; without it the endpoint answers exactly as before, so pickers, the
// header bells and tenant pages keep their full lists.
//   get_visitors.php, get_refund_requests.php, get_notifications.php  ?page=&limit=
//   get_invoices.php ?view=desk        open bills only + paid summary + collected
//   get_maintenance_requests.php ?closedDays=N  open tickets + recently closed ones
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria, adminId;
const MARIA = 2;
const TAG = 'PagingTest';

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
  adminId = (await one("SELECT id FROM users WHERE email_address = 'admin@gmail.com'")).id;
  // 30 visitor rows, 30 refund requests and 30 admin notifications to page through.
  for (let i = 1; i <= 30; i++) {
    await q("INSERT INTO visitor_logs (room_name, visitor_name, contact_number, purpose, status, user_id) VALUES ('A', ?, '09170000000', ?, 'checked_out', ?)", [`Visitor ${i}`, TAG, MARIA]);
    await q("INSERT INTO refund_requests (user_id, type, amount, reason, status, raised_by_role) VALUES (?, 'overpayment', 100, ?, ?, 'admin')", [MARIA, TAG, i % 3 === 0 ? 'Rejected' : 'Pending Review']);
    await q("INSERT INTO notifications (user_id, title, message, type, audience) VALUES (?, ?, ?, 'paging_test', 'admin')", [adminId, `${TAG} ${i}`, i % 2 ? `${TAG} odd 50%` : `${TAG} even`]);
  }
});

describe('the paging contract', () => {
  it('answers one page with the filtered total', async () => {
    const res = await api('get_visitors.php', { token: admin, query: { search: TAG, page: 1, limit: 10 } });
    expect(res.status).toBe(200);
    expect(res.body.visitors).toHaveLength(10);
    expect(res.body).toMatchObject({ total: 30, page: 1, limit: 10, pages: 3 });
  });

  it('pages do not overlap and the last page holds the rest', async () => {
    const pages = await Promise.all([1, 2, 3].map((page) => api('get_visitors.php', { token: admin, query: { search: TAG, page, limit: 12 } })));
    const ids = pages.flatMap((p) => p.body.visitors.map((v) => v.id));
    expect(pages.map((p) => p.body.visitors.length)).toEqual([12, 12, 6]);
    expect(new Set(ids).size).toBe(30);
  });

  it('a page past the end is empty, with the real total', async () => {
    const res = await api('get_visitors.php', { token: admin, query: { search: TAG, page: 99, limit: 10 } });
    expect(res.status).toBe(200);
    expect(res.body.visitors).toEqual([]);
    expect(res.body).toMatchObject({ total: 30, page: 99, pages: 3 });
  });

  it('clamps the limit to 1–100 and a bad page to 1', async () => {
    const zero = await api('get_visitors.php', { token: admin, query: { search: TAG, page: 1, limit: 0 } });
    expect(zero.body.limit).toBe(1);
    expect(zero.body.visitors).toHaveLength(1);
    const huge = await api('get_visitors.php', { token: admin, query: { search: TAG, page: 1, limit: 500 } });
    expect(huge.body.limit).toBe(100);
    const bad = await api('get_visitors.php', { token: admin, query: { search: TAG, page: 'abc', limit: 10 } });
    expect(bad.status).toBe(200);
    expect(bad.body.page).toBe(1);
  });

  it('without ?page= the answer is the full list, without paging fields', async () => {
    const res = await api('get_visitors.php', { token: admin, query: { search: TAG } });
    expect(res.body.visitors).toHaveLength(30);
    expect(res.body.total).toBeUndefined();
  });

  it('a tenant cannot page another tenant in: ?page= is ignored outside the admin view', async () => {
    const res = await api('get_visitors.php', { token: maria, query: { page: 1, limit: 5 } });
    expect(res.status).toBe(200);
    expect(res.body.total).toBeUndefined();
    expect(res.body.visitors.every((v) => v.userId === MARIA)).toBe(true);
  });
});

describe('refund requests', () => {
  it('pages one status and counts every status for the tabs', async () => {
    const res = await api('get_refund_requests.php', { token: admin, query: { status: 'Rejected', page: 1, limit: 4 } });
    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(4);
    expect(res.body.requests.every((r) => r.status === 'Rejected')).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(10);
    expect(res.body.counts.Rejected).toBe(res.body.total);
    expect(res.body.counts.all).toBeGreaterThanOrEqual(30);
  });
});

describe('admin notifications', () => {
  it('filters by type and search on the server; unread counts the whole feed', async () => {
    const res = await api('get_notifications.php', { token: admin, query: { types: 'paging_test', search: 'odd 50%', page: 1, limit: 5 } });
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(5);
    expect(res.body.total).toBe(15);
    expect(res.body.notifications.every((n) => n.type === 'paging_test' && n.message.includes('odd 50%'))).toBe(true);
    // The old count stopped at the 100 rows sent; this one is over everything unread.
    const unread = await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'paging_test' AND is_read = 0", [adminId]);
    expect(res.body.unread_count).toBeGreaterThanOrEqual(Number(unread.n));
  });

  it('a "%" in the search is literal, and a bad type name is ignored', async () => {
    const res = await api('get_notifications.php', { token: admin, query: { types: "paging_test,x') OR 1=1 --", search: '50%', page: 1 } });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(15);
  });

  it('the bells and tenant page still get the newest rows without paging fields', async () => {
    const res = await api('get_notifications.php', { token: admin });
    expect(res.body.total).toBeUndefined();
    expect(res.body.notifications.length).toBeLessThanOrEqual(100);
    const tenant = await api('get_notifications.php', { token: maria, query: { page: 1 } });
    expect(tenant.body.total).toBeUndefined();
  });
});

describe('Admin Payments desk view', () => {
  it('sends only open bills, a paid summary per tenant and the collected total', async () => {
    await q("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date, paid_at) VALUES ('INV-PAGE-PAID', ?, 1, 700, 700, 700, 'Paging', 'paid', CURDATE(), NOW())", [MARIA]);
    await q("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date) VALUES ('INV-PAGE-OPEN', ?, 1, 800, 800, 'Paging', 'pending', CURDATE() + INTERVAL 5 DAY)", [MARIA]);
    const [desk, full] = await Promise.all([
      api('get_invoices.php', { token: admin, query: { view: 'desk' } }),
      api('get_invoices.php', { token: admin }),
    ]);
    expect(desk.status).toBe(200);
    const ids = desk.body.invoices.map((i) => i.id);
    expect(ids).toContain('INV-PAGE-OPEN');
    expect(ids).not.toContain('INV-PAGE-PAID');
    expect(desk.body.invoices.every((i) => ['pending', 'unpaid', 'overdue', 'pending-verification', 'scheduled', 'processing', 'payment-failed'].includes(i.status))).toBe(true);

    const paid = await one("SELECT COUNT(*) AS n, COALESCE(SUM(total_amount), 0) AS t FROM invoices WHERE user_id = ? AND status = 'paid'", [MARIA]);
    const maria2 = desk.body.paid_summary.find((s) => s.user_id === MARIA);
    expect(maria2.paid_count).toBe(Number(paid.n));
    expect(maria2.paid_total).toBeCloseTo(Number(paid.t), 2);
    const allPaid = await one("SELECT COALESCE(SUM(total_amount), 0) AS t FROM invoices WHERE status = 'paid' AND user_id IS NOT NULL");
    expect(desk.body.collected).toBeCloseTo(Number(allPaid.t), 2);
    expect(desk.body.accounts).toBeTruthy();

    // The full list is unchanged for the other callers.
    expect(full.body.invoices.map((i) => i.id)).toContain('INV-PAGE-PAID');
    expect(full.body.paid_summary).toBeUndefined();
  });

  it('the opened tenant\'s history comes from ?userId= and includes the paid bill', async () => {
    const res = await api('get_invoices.php', { token: admin, query: { userId: MARIA } });
    expect(res.body.invoices.map((i) => i.id)).toContain('INV-PAGE-PAID');
  });
});

describe('maintenance board window', () => {
  it('keeps every open ticket, drops tickets closed before the window and counts them', async () => {
    const base = "INSERT INTO maintenance_requests (user_id, issue_category, urgency, preferred_date, preferred_time, description, status, title, resolved_at, created_at) VALUES (?, 'Plumbing', 'Low', CURDATE(), 'Morning', 'paging', ?, ?, ?, ?)";
    await q(base, [MARIA, 'Pending', `${TAG} open old`, null, '2020-01-01 09:00:00']);
    await q(base, [MARIA, 'Completed', `${TAG} closed old`, '2020-02-01 09:00:00', '2020-01-15 09:00:00']);
    await q(base, [MARIA, 'Completed', `${TAG} closed recent`, new Date().toISOString().slice(0, 19).replace('T', ' '), '2020-01-20 09:00:00']);

    const board = await api('get_maintenance_requests.php', { token: admin, query: { closedDays: 90 } });
    expect(board.status).toBe(200);
    const titles = board.body.requests.map((r) => r.title);
    expect(titles).toContain(`${TAG} open old`);
    expect(titles).toContain(`${TAG} closed recent`);
    expect(titles).not.toContain(`${TAG} closed old`);
    expect(board.body.olderClosed).toBeGreaterThanOrEqual(1);

    const all = await api('get_maintenance_requests.php', { token: admin });
    expect(all.body.requests.map((r) => r.title)).toContain(`${TAG} closed old`);
    expect(all.body.olderClosed).toBeUndefined();
  });
});
