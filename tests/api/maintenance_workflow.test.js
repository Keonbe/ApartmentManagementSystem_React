// Maintenance workflow: scheduled visit, tenant-visible progress, tenant cancel
// request on work under way, tenant "not fixed" reopen, and the tenant-charge notice.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin;
let maria;

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function ticket({ status = 'Pending', responsible = 0, resolvedDaysAgo = null, invoiced = 0, actual = null } = {}) {
  const r = await q(
    `INSERT INTO maintenance_requests (user_id, issue_category, urgency, preferred_date, preferred_time, description, status, tenant_responsible, actual_cost, estimated_cost, is_invoiced, resolved_at, room_name)
     VALUES (2, 'General Maintenance', 'Low', CURDATE(), 'morning', 'Workflow test', ?, ?, ?, 500, ?, ${resolvedDaysAgo === null ? 'NULL' : 'NOW() - INTERVAL ? DAY'}, 'A')`,
    resolvedDaysAgo === null ? [status, responsible, actual, invoiced] : [status, responsible, actual, invoiced, resolvedDaysAgo],
  );
  return r.insertId;
}
const row = (id) => one('SELECT * FROM maintenance_requests WHERE id = ?', [id]);
const update = (id, json) => api('update_maintenance_status.php', { token: admin, json: { id, ...json } });
const lastNotice = () => one("SELECT message FROM notifications WHERE user_id = 2 AND type = 'maintenance_update' ORDER BY id DESC LIMIT 1");

beforeAll(async () => {
  admin = await loginAs('admin');
  maria = await loginAs('maria');
});
beforeEach(async () => {
  await q("DELETE FROM maintenance_requests WHERE description = 'Workflow test'");
});

describe('scheduled visit', () => {
  it('saves the visit and tells the tenant; rejects a bad window, a past date and a half pair', async () => {
    const id = await ticket();
    const ok = await update(id, { scheduledDate: day(2), scheduledWindow: 'afternoon', assignedTo: 'Juan' });
    expect(ok.body.success).toBe(true);
    const r = await row(id);
    expect(r.scheduled_window).toBe('afternoon');
    expect(String((await lastNotice()).message)).toMatch(/visit is scheduled.*afternoon/);
    expect(String((await lastNotice()).message)).toMatch(/Juan has been assigned/);

    expect((await update(id, { scheduledDate: day(2), scheduledWindow: 'night' })).status).toBe(422);
    expect((await update(id, { scheduledDate: day(-1), scheduledWindow: 'morning' })).status).toBe(422);
    expect((await update(id, { scheduledDate: day(3) })).status).toBe(422);

    const cleared = await update(id, { scheduledDate: '', scheduledWindow: '' });
    expect(cleared.body.success).toBe(true);
    expect((await row(id)).scheduled_date).toBeNull();
  });

  it('shows the tenant who is coming and when', async () => {
    const id = await ticket({ status: 'In Progress' });
    await update(id, { scheduledDate: day(1), scheduledWindow: 'morning', assignedTo: 'Pedro' });
    const mine = await api('get_my_requests.php', { token: maria });
    const found = mine.body.requests.find((x) => x.type === 'Maintenance' && Number(x.id) === id);
    expect(found.assigned_to).toBe('Pedro');
    expect(found.scheduled_window).toBe('morning');
    expect(found.charge_amount).toBeNull();
  });
});

describe('tenant responsibility', () => {
  it('tells the tenant when the flag is set and shows the amount they will pay', async () => {
    const id = await ticket({ status: 'In Progress' });
    await update(id, { tenantResponsible: true });
    expect(String((await lastNotice()).message)).toMatch(/your responsibility.*estimated ₱500\.00/);
    const mine = await api('get_my_requests.php', { token: maria });
    const found = mine.body.requests.find((x) => x.type === 'Maintenance' && Number(x.id) === id);
    expect(Number(found.charge_amount)).toBe(500);
    await update(id, { tenantResponsible: false });
    expect(String((await lastNotice()).message)).toMatch(/no longer billed/);
  });

  it('refuses to complete a tenant-billed repair with no actual cost', async () => {
    const id = await ticket({ status: 'In Progress', responsible: 1 });
    const res = await update(id, { status: 'Completed' });
    expect(res.status).toBe(422);
    expect((await row(id)).status).toBe('In Progress');
    const ok = await update(id, { status: 'Completed', actualCost: 0 });
    expect(ok.body.success).toBe(true);
  });
});

describe('tenant cancel request on work under way', () => {
  it('Pending still cancels at once; In Progress only records a request; admin cancels or declines', async () => {
    const pending = await ticket();
    const direct = await api('cancel_request.php', { token: maria, json: { id: pending, type: 'Maintenance' } });
    expect(direct.body.success).toBe(true);
    expect((await row(pending)).status).toBe('Cancelled');

    const id = await ticket({ status: 'In Progress' });
    const ask = await api('cancel_request.php', { token: maria, json: { id, type: 'Maintenance' } });
    expect(ask.body.requested).toBe(true);
    expect((await row(id)).status).toBe('In Progress');
    expect((await row(id)).cancel_requested_at).not.toBeNull();
    // asking twice is refused
    expect((await api('cancel_request.php', { token: maria, json: { id, type: 'Maintenance' } })).status).toBe(409);

    const declined = await update(id, { declineCancel: true });
    expect(declined.body.success).toBe(true);
    expect((await row(id)).cancel_requested_at).toBeNull();

    await api('cancel_request.php', { token: maria, json: { id, type: 'Maintenance' } });
    const cancelled = await update(id, { status: 'Cancelled' });
    expect(cancelled.body.success).toBe(true);
    const r = await row(id);
    expect(r.status).toBe('Cancelled');
    expect(r.cancel_requested_at).toBeNull();
  });

  it('moving the ticket back to Pending clears the cancel request from the admin queue', async () => {
    const id = await ticket({ status: 'In Progress' });
    await api('cancel_request.php', { token: maria, json: { id, type: 'Maintenance' } });
    const queued = () => one("SELECT status FROM notifications WHERE type = 'maintenance_request' AND metadata_value = ? ORDER BY id DESC LIMIT 1", [`maintenance_request:${id}`]);
    expect((await queued()).status).toBe('Pending');
    await update(id, { status: 'Pending' });
    expect((await queued()).status).toBe('Resolved');
    expect((await row(id)).cancel_requested_at).toBeNull();
  });

  it("will not cancel another tenant's or a completed request", async () => {
    const id = await ticket({ status: 'In Progress' });
    const jose = await loginAs('jose');
    expect((await api('cancel_request.php', { token: jose, json: { id, type: 'Maintenance' } })).status).toBe(409);
    const done = await ticket({ status: 'Completed', resolvedDaysAgo: 1 });
    expect((await api('cancel_request.php', { token: maria, json: { id: done, type: 'Maintenance' } })).status).toBe(409);
  });
});

describe('tenant reports a repair as not fixed', () => {
  it('reopens a recent, unbilled completed repair with the reason', async () => {
    const id = await ticket({ status: 'Completed', resolvedDaysAgo: 2 });
    const mine = await api('get_my_requests.php', { token: maria });
    expect(Number(mine.body.requests.find((x) => x.type === 'Maintenance' && Number(x.id) === id).can_reopen)).toBe(1);

    expect((await api('reopen_maintenance_request.php', { token: maria, json: { id, reason: '  ' } })).status).toBe(422);
    const res = await api('reopen_maintenance_request.php', { token: maria, json: { id, reason: 'Still leaking' } });
    expect(res.body.success).toBe(true);
    const r = await row(id);
    expect(r.status).toBe('In Progress');
    expect(r.resolved_at).toBeNull();
    expect(r.reopen_reason).toBe('Still leaking');
    // reopening again is a stale state, not a second reopen
    expect((await api('reopen_maintenance_request.php', { token: maria, json: { id, reason: 'again' } })).status).toBe(409);
  });

  it('refuses an old, already-billed or someone else\'s repair', async () => {
    const old = await ticket({ status: 'Completed', resolvedDaysAgo: 9 });
    expect((await api('reopen_maintenance_request.php', { token: maria, json: { id: old, reason: 'x' } })).status).toBe(409);
    const billed = await ticket({ status: 'Completed', resolvedDaysAgo: 1, responsible: 1, invoiced: 1, actual: 100 });
    expect((await api('reopen_maintenance_request.php', { token: maria, json: { id: billed, reason: 'x' } })).status).toBe(409);
    const mine = await api('get_my_requests.php', { token: maria });
    expect(Number(mine.body.requests.find((x) => x.type === 'Maintenance' && Number(x.id) === billed).can_reopen)).toBe(0);
    const recent = await ticket({ status: 'Completed', resolvedDaysAgo: 1 });
    const jose = await loginAs('jose');
    expect((await api('reopen_maintenance_request.php', { token: jose, json: { id: recent, reason: 'x' } })).status).toBe(404);
  });

  it('the completion notice mentions the charge and the reopen window', async () => {
    const id = await ticket({ status: 'In Progress', responsible: 1 });
    await update(id, { status: 'Completed', actualCost: 750 });
    const msg = String((await lastNotice()).message);
    expect(msg).toMatch(/₱750\.00 will be added to your invoice/);
    expect(msg).toMatch(/within 7 days/);
  });
});
