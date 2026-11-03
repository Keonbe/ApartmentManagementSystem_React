// create_announcement.php "Schedule for later": a scheduled announcement is stored
// without notifying anyone, send_due_announcements() (run by the poll in
// get_notifications.php and by cron/process_queue.php) sends it once when its
// time comes, and the admin can send it now, edit it, or turn it back into a draft.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria;
beforeAll(async () => { [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]); });
beforeEach(async () => {
  await q("DELETE FROM announcements WHERE title LIKE 'Sched %'");
  await q("DELETE FROM notifications WHERE title LIKE 'Sched %'");
});

// 'YYYY-MM-DD HH:MM' relative to the database clock (the server uses the same zone).
const at = async (minutes) => (await one("SELECT DATE_FORMAT(NOW() + INTERVAL ? MINUTE, '%Y-%m-%d %H:%i') AS t", [minutes])).t;
const base = { tag: 'General', title: 'Sched water', body: 'Water is off on Saturday.', sendTo: 'All tenants', channels: ['in-app'] };
const post = (json, token = admin) => api('create_announcement.php', { token, json });
const row = (id) => one('SELECT id, status, scheduled_date, recipient_count FROM announcements WHERE id = ?', [id]);
const notices = async (title) => (await one("SELECT COUNT(*) AS c FROM notifications WHERE title = ?", [title])).c;
const tenants = async () => (await one("SELECT COUNT(DISTINCT ra.user_id) AS c FROM rent_applications ra JOIN users u ON u.id = ra.user_id WHERE ra.status IN ('Approved','active','pending-move-out') AND u.role = 'user' AND u.is_archived = 0")).c;
const latest = () => one("SELECT id FROM announcements WHERE title LIKE 'Sched %' ORDER BY id DESC LIMIT 1");

// The poll in get_notifications.php runs the sweep after it answers, throttled to
// once a minute: clear the throttle and wait for the row to change.
async function sweep(id, status) {
  await q("DELETE FROM system_settings WHERE setting_key = 'poll_checks_last_run'");
  await api('get_notifications.php', { token: maria });
  for (let i = 0; i < 30; i++) {
    if ((await row(id)).status === status) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}
const makeDue = (id) => q("UPDATE announcements SET scheduled_date = NOW() - INTERVAL 1 MINUTE WHERE id = ?", [id]);

describe('scheduling', () => {
  it('stores a scheduled announcement and notifies nobody', async () => {
    const res = await post({ ...base, scheduledAt: await at(30) });
    expect(res.body).toMatchObject({ success: true, scheduled: true });
    const r = await row((await latest()).id);
    expect(r.status).toBe('scheduled');
    expect(r.scheduled_date).toBeTruthy();
    expect(await notices('Sched water')).toBe(0);
    // Tenants never see it in the feed.
    const feed = await api('get_announcements.php', { token: maria, query: { public: '1' } });
    expect(feed.body.announcements.some((a) => a.title === 'Sched water')).toBe(false);
  });

  it.each([
    ['a time in the past', async () => await at(-5)],
    ['less than a minute away', async () => (await one("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i') AS t")).t],
    ['more than a year away', async () => (await one("SELECT DATE_FORMAT(NOW() + INTERVAL 400 DAY, '%Y-%m-%d %H:%i') AS t")).t],
    ['not a date', async () => 'next friday'],
  ])('%s → 422 on scheduledAt, nothing saved', async (_, when) => {
    const res = await post({ ...base, scheduledAt: await when() });
    expect(res.status).toBe(422);
    expect(res.body.fieldErrors.scheduledAt).toBeTruthy();
    expect(await latest()).toBeNull();
  });

  it('a draft cannot also be scheduled → 422', async () => {
    const res = await post({ ...base, draft: true, scheduledAt: await at(30) });
    expect(res.status).toBe(422);
    expect(await latest()).toBeNull();
  });

  it('a tenant cannot schedule → 403', async () => {
    const res = await post({ ...base, scheduledAt: await at(30) }, maria);
    expect(res.status).toBe(403);
    expect(await latest()).toBeNull();
  });

  it('an SMS announcement that is too long is refused when scheduled too', async () => {
    const res = await post({ ...base, body: 'x'.repeat(200), channels: ['in-app', 'sms'], scheduledAt: await at(30) });
    expect(res.status).toBe(422);
    expect(await latest()).toBeNull();
  });
});

describe('sending when due', () => {
  it('sends a due announcement once, to every current tenant, and a second sweep does nothing', async () => {
    await post({ ...base, scheduledAt: await at(30) });
    const { id } = await latest();
    await makeDue(id);
    await sweep(id, 'sent');
    const r = await row(id);
    expect(r.status).toBe('sent');
    expect(r.recipient_count).toBe(await tenants());
    expect(await notices('Sched water')).toBe(await tenants());

    await sweep(id, 'sent');
    expect(await notices('Sched water')).toBe(await tenants());
    const feed = await api('get_announcements.php', { token: maria, query: { public: '1' } });
    expect(feed.body.announcements.some((a) => a.title === 'Sched water')).toBe(true);
  });

  it('one that is not due yet is left alone', async () => {
    await post({ ...base, scheduledAt: await at(30) });
    const { id } = await latest();
    await sweep(id, 'sent');
    expect((await row(id)).status).toBe('scheduled');
    expect(await notices('Sched water')).toBe(0);
  });

  it('a specific unit only reaches that unit\'s tenants', async () => {
    await post({ ...base, sendTo: 'Specific unit', unit: 'A', scheduledAt: await at(30) });
    const { id } = await latest();
    await makeDue(id);
    await sweep(id, 'sent');
    expect(await notices('Sched water')).toBe(1);
    expect((await one("SELECT user_id FROM notifications WHERE title = 'Sched water'")).user_id).toBe(2);
  });

  it('with nobody to send to it goes back to a draft and the admin is told', async () => {
    await post({ ...base, sendTo: 'Specific unit', unit: 'ZZ', scheduledAt: await at(30) });
    const { id } = await latest();
    await makeDue(id);
    await sweep(id, 'draft');
    const r = await row(id);
    expect(r.status).toBe('draft');
    expect(r.scheduled_date).toBeNull();
    expect(await notices('Sched water')).toBe(0);
    expect((await one("SELECT COUNT(*) AS c FROM notifications WHERE title = 'Scheduled announcement not sent'")).c).toBeGreaterThan(0);
  });
});

describe('changing a scheduled announcement', () => {
  it('"Back to draft" clears the schedule; doing it again → 409', async () => {
    await post({ ...base, scheduledAt: await at(30) });
    const { id } = await latest();
    expect((await post({ action: 'unschedule', id })).body).toMatchObject({ success: true });
    const r = await row(id);
    expect([r.status, r.scheduled_date]).toEqual(['draft', null]);
    expect((await post({ action: 'unschedule', id })).status).toBe(409);
  });

  it('"Send now" delivers it immediately, once', async () => {
    await post({ ...base, scheduledAt: await at(30) });
    const { id } = await latest();
    const res = await post({ action: 'sendNow', id });
    expect(res.body).toMatchObject({ success: true, delivered: await tenants() });
    expect((await row(id)).status).toBe('sent');
    expect(await notices('Sched water')).toBe(await tenants());
    expect((await post({ action: 'sendNow', id })).status).toBe(409);
    expect(await notices('Sched water')).toBe(await tenants());
  });

  it('editing the reopened row keeps it scheduled with the new time', async () => {
    await post({ ...base, scheduledAt: await at(30) });
    const { id } = await latest();
    const later = await at(90);
    const res = await post({ ...base, title: 'Sched water v2', draftId: id, scheduledAt: later });
    expect(res.body).toMatchObject({ success: true, scheduled: true });
    expect(await q("SELECT COUNT(*) AS c FROM announcements WHERE title LIKE 'Sched water%'")).toEqual([{ c: 1 }]);
    const r = await row(id);
    expect(r.status).toBe('scheduled');
    expect(r.scheduled_date.slice(0, 16)).toBe(later);
  });

  it('sending a reopened scheduled row from the composer sends it now', async () => {
    await post({ ...base, scheduledAt: await at(30) });
    const { id } = await latest();
    const res = await post({ ...base, draftId: id });
    expect(res.body).toMatchObject({ success: true });
    const r = await row(id);
    expect(r.status).toBe('sent');
    expect(r.scheduled_date).toBeNull();
  });

  it('unscheduling or sending now as a tenant → 403', async () => {
    await post({ ...base, scheduledAt: await at(30) });
    const { id } = await latest();
    expect((await post({ action: 'unschedule', id }, maria)).status).toBe(403);
    expect((await post({ action: 'sendNow', id }, maria)).status).toBe(403);
    expect((await row(id)).status).toBe('scheduled');
  });
});
