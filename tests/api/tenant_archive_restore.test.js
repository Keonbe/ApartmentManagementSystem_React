// archive_tenant.php and restore_tenant.php (Tenant Management). QA guide rows Q1-xx.
// Rosa (user 5, application 3, Unit C) is archived and restored; Jose (user 3) is the bystander.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, login } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria, rosa;
const archive = (token, body) => api('archive_tenant.php', { token, json: body });
const restore = (token, body) => api('restore_tenant.php', { token, json: body });
const app = (id) => one('SELECT status, pre_archive_status, archive_reason, archive_notes, archive_date FROM rent_applications WHERE id = ?', [id]);
const user = (id) => one('SELECT is_archived FROM users WHERE id = ?', [id]);
const room = (id) => one('SELECT status, tenant_name FROM rooms WHERE id = ?', [id]);
const contract = (appId) => one('SELECT status, termination_reason FROM lease_contracts WHERE rent_application_id = ?', [appId]);

beforeAll(async () => {
  [admin, maria, rosa] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('rosa')]);
  await q("INSERT INTO invoices (id, user_id, rent_application_id, total_amount, billing_period, status, due_date) VALUES ('INV-ARCH-1', 5, 3, 4500, 'Archive test', 'pending', DATE_ADD(CURDATE(), INTERVAL 9 DAY)), ('INV-ARCH-2', 5, 3, 900, 'Older cancel', 'cancelled', DATE_SUB(CURDATE(), INTERVAL 9 DAY))");
  await q("UPDATE invoices SET cancel_reason = 'Tenant request' WHERE id = 'INV-ARCH-2'");
});

describe('access and input', () => {
  it('are admin only', async () => {
    for (const fn of [archive, restore]) {
      expect((await fn(undefined, { id: 3 })).status).toBe(403);
      expect((await fn(maria, { id: 3 })).status).toBe(403);
    }
    expect((await app(3)).status).toBe('active');
  });

  it.each([[0], [-1], ['abc'], [null], [undefined]])('id=%s is "Invalid ID" and changes nothing', async (id) => {
    for (const fn of [archive, restore]) {
      const res = await fn(admin, { id });
      expect(res.body.success).toBe(false);
      expect(res.status).toBeLessThan(500);
    }
    expect((await app(3)).status).toBe('active');
  });

  it('an unknown application is reported, not archived', async () => {
    expect((await archive(admin, { id: 99999 })).body).toMatchObject({ success: false, message: 'Application record not found.' });
    expect((await restore(admin, { id: 99999 })).body).toMatchObject({ success: false, message: 'Application record not found.' });
  });

  it('restoring an application that is not archived is refused', async () => {
    const res = await restore(admin, { id: 3 });
    expect(res.body.success).toBe(false);
    expect((await app(3)).status).toBe('active');
  });
});

describe('archive_tenant.php', () => {
  it('archives the application, the login, the contract, the open bills and the unit together', async () => {
    const session = await login('rosa.delacruz@demo.example', 'tenant123');
    const notes = "Zoë 李 😀 O'Brien <b>moved abroad</b>";
    const res = await archive(admin, { id: 3, archiveReason: 'End of Rent Term', archiveNotes: notes });
    expect(res.body.success).toBe(true);

    expect(await app(3)).toMatchObject({ status: 'archived', pre_archive_status: 'active', archive_reason: 'End of Rent Term', archive_notes: notes });
    expect((await user(5)).is_archived).toBe(1);
    expect(await contract(3)).toMatchObject({ status: 'terminated', termination_reason: 'End of Rent Term' });
    expect((await one("SELECT status, cancel_reason FROM invoices WHERE id = 'INV-ARCH-1'"))).toEqual({ status: 'cancelled', cancel_reason: 'Archived' });
    expect((await room('C')).status).toBe('vacant');
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Archived Tenant' AND details LIKE '%Application ID: 3%'")).n).toBe(1);

    // the archived tenant is locked out, with the old session and with the password
    expect((await api('get_my_requests.php', { token: session })).status).toBe(401);
    expect((await api('login.php', { json: { email_address: 'rosa.delacruz@demo.example', password: 'tenant123' } })).body.sessionToken).toBeUndefined();
  });

  it('refuses a second archive and leaves the first one\'s record alone', async () => {
    const before = await app(3);
    const res = await archive(admin, { id: 3, archiveReason: 'Something else', archiveNotes: 'second try' });
    expect(res.body).toMatchObject({ success: false, message: 'This application is already archived.' });
    expect(await app(3)).toEqual(before);
  });

  it('leaves other tenants alone', async () => {
    expect((await app(2)).status).toBe('active');
    expect((await user(3)).is_archived).toBe(0);
    expect((await room('B')).status).toBe('occupied');
  });

  it('uses the default reason when none is given', async () => {
    const res = await archive(admin, { id: 2 });
    expect(res.body.success).toBe(true);
    expect((await app(2)).archive_reason).toBe('End of Rent Term');
    await restore(admin, { id: 2 });
  });
});

describe('restore_tenant.php', () => {
  it('brings back the status, login, contract, the bills this archive cancelled, and the unit', async () => {
    const res = await restore(admin, { id: 3 });
    expect(res.body).toMatchObject({ success: true, room_restored: true });

    expect(await app(3)).toMatchObject({ status: 'active', pre_archive_status: null, archive_reason: null, archive_notes: null });
    expect((await user(5)).is_archived).toBe(0);
    expect((await contract(3)).status).toBe('active');
    expect((await one("SELECT status, cancel_reason FROM invoices WHERE id = 'INV-ARCH-1'"))).toEqual({ status: 'pending', cancel_reason: null });
    // a bill cancelled for another reason before the archive stays cancelled
    expect((await one("SELECT status, cancel_reason FROM invoices WHERE id = 'INV-ARCH-2'"))).toEqual({ status: 'cancelled', cancel_reason: 'Tenant request' });
    expect(await room('C')).toMatchObject({ status: 'occupied' });
    expect(await login('rosa.delacruz@demo.example', 'tenant123')).toBeTruthy();
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Restore Tenant'")).n).toBeGreaterThanOrEqual(1);
  });

  it('cannot be restored twice', async () => {
    const res = await restore(admin, { id: 3 });
    expect(res.body.success).toBe(false);
    expect((await app(3)).status).toBe('active');
  });

  it('restores a moved-out tenant without reviving the contract, bills or unit', async () => {
    await q("UPDATE rent_applications SET status = 'moved-out' WHERE id = 3");
    await q("UPDATE lease_contracts SET status = 'expired' WHERE rent_application_id = 3");
    await q("UPDATE rooms SET status = 'vacant', tenant_name = NULL WHERE id = 'C'");
    expect((await archive(admin, { id: 3, archiveReason: 'After move-out' })).body.success).toBe(true);
    expect((await app(3)).pre_archive_status).toBe('moved-out');
    const res = await restore(admin, { id: 3 });
    expect(res.body.success).toBe(true);
    expect(res.body.room_restored).toBe(false);
    expect((await app(3)).status).toBe('moved-out');
    expect((await room('C')).status).toBe('vacant');
  });

  it('does not overwrite a unit that someone else now holds', async () => {
    await q("UPDATE rent_applications SET status = 'active' WHERE id = 3");
    await q("UPDATE rooms SET status = 'occupied', tenant_name = 'Rosa Delacruz' WHERE id = 'C'");
    expect((await archive(admin, { id: 3 })).body.success).toBe(true);
    // the unit is let to someone else while Rosa is archived
    await q("UPDATE rooms SET status = 'occupied', tenant_name = 'New Tenant' WHERE id = 'C'");
    const res = await restore(admin, { id: 3 });
    expect(res.body.success).toBe(true);
    expect(res.body.room_restored).toBe(false);
    expect(res.body.message).toMatch(/no longer vacant/);
    expect(await room('C')).toMatchObject({ status: 'occupied', tenant_name: 'New Tenant' });
  });

  it('two simultaneous restores settle once', async () => {
    await archive(admin, { id: 2 });
    const [a, b] = await Promise.all([restore(admin, { id: 2 }), restore(admin, { id: 2 })]);
    expect([a, b].filter((r) => r.body.success).length).toBe(1);
  });
});
