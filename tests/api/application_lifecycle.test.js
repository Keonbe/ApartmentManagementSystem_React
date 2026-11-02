// Every rent_applications.status write goes through transition_application() /
// archive_application() / restore_application() (backend/config.php): the row is
// locked, the move is checked against APPLICATION_TRANSITIONS and the columns of
// the target status are reset in the same guarded UPDATE.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

let admin;
const dayFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const app = (id) => one('SELECT status, requested_move_out_date, rejection_reason, cancelled_at, pre_archive_status FROM rent_applications WHERE id = ?', [id]);
const setStatus = (id, body) => api('update_tenant_status.php', { token: admin, json: { id, ...body } });

beforeAll(async () => {
  admin = await loginAs('admin');
});

describe('move-out notice (active ↔ pending-move-out)', () => {
  it('files a notice inside the window and cancelling it clears the requested date', async () => {
    const filed = await setStatus(1, { status: 'pending-move-out', requested_move_out_date: dayFromNow(20) });
    expect(filed.body.success).toBe(true);
    expect((await app(1)).status).toBe('pending-move-out');

    const back = await setStatus(1, { status: 'active' });
    expect(back.body.success).toBe(true);
    const row = await app(1);
    expect(row.status).toBe('active');
    expect(row.requested_move_out_date).toBeNull();
  });

  it('the notice window is the one in Settings → Rental, not a fixed 15–30', async () => {
    await setSetting('move_out_min_notice_days', '5');
    await setSetting('move_out_max_notice_days', '10');
    const tooFar = await setStatus(1, { status: 'pending-move-out', requested_move_out_date: dayFromNow(20) });
    expect(tooFar.body.success).toBe(false);
    expect(tooFar.body.message).toMatch(/10 days/);
    const ok = await setStatus(1, { status: 'pending-move-out', requested_move_out_date: dayFromNow(7) });
    expect(ok.body.success).toBe(true);
    await setStatus(1, { status: 'active' });
  });
});

describe('admin cancels an approved application', () => {
  it('records when it was cancelled and frees the room it held', async () => {
    const before = await one('SELECT status FROM rooms WHERE id = ?', ['E']);
    const res = await setStatus(5, { status: 'Cancelled', rejection_reason: 'Changed plans' });
    expect(res.body.success).toBe(true);
    const row = await app(5);
    expect(row.status).toBe('Cancelled');
    expect(row.rejection_reason).toBe('Changed plans');
    expect(row.cancelled_at).not.toBeNull();
    expect(before).toBeTruthy();
    expect((await one('SELECT status FROM rooms WHERE id = ?', ['E'])).status).toBe('vacant');
  });

  it('a cancelled application cannot be moved again', async () => {
    const res = await setStatus(5, { status: 'Approved' });
    expect(res.status).toBe(409);
    expect((await app(5)).status).toBe('Cancelled');
  });
});

describe('archive and restore', () => {
  it('archiving twice is refused and keeps the status to restore to', async () => {
    const first = await api('archive_tenant.php', { token: admin, json: { id: 2, archiveReason: 'End of Rent Term' } });
    expect(first.body.success).toBe(true);
    expect((await app(2))).toMatchObject({ status: 'archived', pre_archive_status: 'active' });

    const again = await api('archive_tenant.php', { token: admin, json: { id: 2, archiveReason: 'End of Rent Term' } });
    expect(again.body.success).toBe(false);
    expect((await app(2)).pre_archive_status).toBe('active');

    const restored = await api('restore_tenant.php', { token: admin, json: { id: 2 } });
    expect(restored.body.success).toBe(true);
    expect((await app(2)).status).toBe('active');
  });

  it('restoring an application that is not archived is refused', async () => {
    const res = await api('restore_tenant.php', { token: admin, json: { id: 2 } });
    expect(res.body.success).toBe(false);
    expect((await app(2)).status).toBe('active');
  });

  it('restoring to moved-out does not bring the cancelled bills back', async () => {
    await q("UPDATE rent_applications SET status = 'archived', pre_archive_status = 'moved-out' WHERE id = 3");
    await q(
      `INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date, cancel_reason)
       VALUES ('INV-TEST-LC-ARCH', 5, 3, 1000, 1000, 'Test bill', 'cancelled', CURDATE() + INTERVAL 5 DAY, 'Archived')`,
    );
    const res = await api('restore_tenant.php', { token: admin, json: { id: 3 } });
    expect(res.body.success).toBe(true);
    expect((await app(3)).status).toBe('moved-out');
    expect((await one("SELECT status FROM invoices WHERE id = 'INV-TEST-LC-ARCH'")).status).toBe('cancelled');
  });
});
