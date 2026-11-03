// Rent extensions when another applicant already wants the unit: the tenant's
// request and the admin's Extend Rent are refused (409/400) while an applicant
// who wants to move in before the new rent end is still in the pipeline. The
// admin can override from Units → Extend Rent, which tells the applicant.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

let admin, maria;
beforeAll(async () => {
  await setSetting('min_lease_duration', 3);
  await setSetting('max_rent_ahead_months', 12);
  await setSetting('extension_deadline_days', 0);
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
  await q(`INSERT INTO users (id, first_name, last_name, email_address, password, role)
           VALUES (91, 'Cora', 'Competitor', 'cora91@example.com', 'x', 'user')`);
});

// Maria (user 2, room A, application 1): rent ends in 6 months.
beforeEach(async () => {
  await q("DELETE FROM rent_applications WHERE user_id IN (91, 92)");
  await q("DELETE FROM notifications WHERE type = 'lease_extension_request' OR title = 'Unit move-in date changed'");
  await q('UPDATE lease_contracts SET lease_end = DATE_ADD(CURDATE(), INTERVAL 6 MONTH), status = \'active\' WHERE rent_application_id = 1');
  await q("UPDATE rooms SET lease_end = DATE_ADD(CURDATE(), INTERVAL 6 MONTH) WHERE id = 'A'");
});

// Another applicant for unit A, wanting to move in `months` months from today
// (null = "as soon as it is free").
async function competitor({ userId = 91, status = 'Pending Review', months = 6, room = 'A' } = {}) {
  const when = months === null ? null : (await one('SELECT DATE_ADD(CURDATE(), INTERVAL ? MONTH) AS d', [months])).d;
  const res = await q(`INSERT INTO rent_applications (user_id, first_name, last_name, contact_no, email, gender, occupants, months_of_rent, room_name, monthly_rent, status, preferred_move_in_date, created_at)
                       VALUES (?, 'Cora', 'Competitor', '+63 9171234591', ?, 'Female', 1, 6, ?, 4000, ?, ?, NOW())`, [userId, `cora${userId}@example.com`, room, status, when]);
  return { id: res.insertId, when };
}
const extend = (json) => api('admin_extend_rent.php', { token: admin, json: { roomId: 'A', addMonths: 3, ...json } });
const leaseEnd = async () => (await one('SELECT lease_end FROM lease_contracts WHERE rent_application_id = 1')).lease_end;

describe('another applicant wants the unit before the new rent end', () => {
  it('the tenant request is refused and nothing is queued', async () => {
    await competitor();
    const res = await api('extend_lease.php', { token: maria, json: { additionalMonths: 3 } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Another applicant has asked for Unit A from/);
    expect(res.body.message).not.toMatch(/Cora/); // the tenant is not told who
    const queued = await one("SELECT COUNT(*) AS c FROM notifications WHERE user_id = 2 AND type = 'lease_extension_request'");
    expect(queued.c).toBe(0);
  });

  it('my_room.php still reports the extension as available (no months chosen yet)', async () => {
    await competitor();
    const ext = (await api('my_room.php', { token: maria })).body.data.extension;
    expect(ext.allowed).toBe(true);
  });

  it('Extend Rent without the override → 409 listing the applicant, rent end unchanged', async () => {
    const c = await competitor({ status: 'Approved' });
    const before = await leaseEnd();
    const res = await extend();
    expect(res.status).toBe(409);
    expect(res.body.conflict.applications).toEqual([
      { id: c.id, name: 'Cora Competitor', status: 'Approved', moveInDate: c.when },
    ]);
    expect(await leaseEnd()).toBe(before);
  });

  it('"as soon as it is free" (no date) also counts', async () => {
    await competitor({ months: null, status: 'Action Required' });
    expect((await extend()).status).toBe(409);
  });

  it('with the override → extended, applicant told, logged, application untouched', async () => {
    const c = await competitor();
    const res = await extend({ overrideConflict: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await leaseEnd()).not.toBe((await one("SELECT DATE_ADD(CURDATE(), INTERVAL 6 MONTH) AS d")).d);

    const notice = await one("SELECT title, message FROM notifications WHERE user_id = 91 AND type = 'application_update'");
    expect(notice.title).toBe('Unit move-in date changed');
    expect(notice.message).toContain('Unit A is occupied until');
    const log = await one("SELECT details FROM activity_logs WHERE action = 'Extended Rent Over Pending Application'");
    expect(log.details).toContain(`#${c.id}`);
    expect((await one('SELECT status FROM rent_applications WHERE id = ?', [c.id])).status).toBe('Pending Review');
  });

  it('approving a queued tenant request is refused the same way', async () => {
    const queuedAt = await api('extend_lease.php', { token: maria, json: { additionalMonths: 3 } });
    expect(queuedAt.body.success).toBe(true);
    await competitor();
    const notif = await one("SELECT id FROM notifications WHERE user_id = 2 AND type = 'lease_extension_request' AND status = 'Pending'");
    const res = await api('process_tenant_request.php', { token: admin, json: { notificationId: notif.id, action: 'approve' } });
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Another applicant has asked for Unit A/);
  });
});

describe('claims that do not count', () => {
  it.each(['Rejected', 'Declined', 'Cancelled'])('an application that is %s is ignored', async (status) => {
    await competitor({ status });
    expect((await extend()).status).toBe(200);
  });

  it('an applicant who wants to move in after the new rent end is ignored', async () => {
    await competitor({ months: 10 }); // new end is month 9
    expect((await extend()).status).toBe(200);
  });

  it('an application for another unit is ignored', async () => {
    await competitor({ room: 'B' });
    expect((await extend()).status).toBe(200);
  });

  it('with no competing application the extension is unchanged and notifies nobody else', async () => {
    const res = await extend();
    expect(res.status).toBe(200);
    expect((await one("SELECT COUNT(*) AS c FROM notifications WHERE type = 'application_update' AND title = 'Unit move-in date changed'")).c).toBe(0);
  });
});
