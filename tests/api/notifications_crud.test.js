// create_notification.php, get_notifications.php, mark_notification_read.php, archive_notification.php,
// delete_notification.php, get_notification_preferences.php, update_notification_preferences.php.
// QA guide rows Q6-02, Q6-03.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

const MARIA = 2;
const JOSE = 3;
let admin, maria, jose;

const add = async (userId, { title = 'Test notice', type = 'info', status = 'Resolved', read = 0 } = {}) =>
  (await q('INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, ?, ?, ?, ?, ?)', [userId, type, title, 'body', status, read])).insertId;
const row = (id) => one('SELECT * FROM notifications WHERE id = ?', [id]);
const feed = async (token) => (await api('get_notifications.php', { token })).body;

beforeAll(async () => {
  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
});

describe('create_notification.php', () => {
  const send = (token, body) => api('create_notification.php', { token, json: body });

  it('is admin only', async () => {
    expect((await send(undefined, { userId: MARIA, title: 'Hi', message: 'x' })).status).toBe(401);
    expect((await send(maria, { userId: JOSE, title: 'Phish', message: 'x' })).status).toBe(403);
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE title = 'Phish'")).n).toBe(0);
  });

  it.each([
    ['no user', { title: 'Hi', message: 'x' }],
    ['blank title', { userId: MARIA, title: '   ', message: 'x' }],
    ['blank message', { userId: MARIA, title: 'Hi', message: '' }],
    ['message over 5000 characters', { userId: MARIA, title: 'Hi', message: 'x'.repeat(5001) }],
    ['title over 255 characters', { userId: MARIA, title: 'x'.repeat(256), message: 'x' }],
    ['type with capitals', { userId: MARIA, title: 'Hi', message: 'x', type: 'Info!' }],
    ['a decision-queue type', { userId: MARIA, title: 'Hi', message: 'x', type: 'rent_application' }],
  ])('rejects %s with 422', async (_n, body) => {
    expect((await send(admin, body)).status).toBe(422);
  });

  it('404s an unknown user, and delivers to a real one with unicode and markup kept as text', async () => {
    expect((await send(admin, { userId: 99999, title: 'Hi', message: 'x' })).status).toBe(404);
    const text = "Zoë 李 😀 O'Brien <script>alert(1)</script>";
    const res = await send(admin, { userId: MARIA, title: text.slice(0, 40), message: text });
    expect(res.body).toMatchObject({ success: true, delivered: true });
    const stored = await one('SELECT message FROM notifications WHERE user_id = ? AND title = ?', [MARIA, text.slice(0, 40)]);
    expect(stored.message).toBe(text);
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Sent Notification'")).n).toBeGreaterThanOrEqual(1);
  });

  it('allows a title of exactly 255 characters', async () => {
    expect((await send(admin, { userId: MARIA, title: 'y'.repeat(255), message: 'x' })).body.success).toBe(true);
  });
});

describe('get_notifications.php', () => {
  it('needs a session and returns only the caller\'s own inbox', async () => {
    expect((await api('get_notifications.php')).status).toBe(401);
    const mine = await add(MARIA, { title: 'For Maria only' });
    const theirs = await add(JOSE, { title: 'For Jose only' });
    const asMaria = JSON.stringify(await feed(maria));
    expect(asMaria).toContain('For Maria only');
    expect(asMaria).not.toContain('For Jose only');
    // ?userId= is ignored
    const spoof = await api('get_notifications.php', { token: maria, query: { userId: JOSE } });
    expect(JSON.stringify(spoof.body)).not.toContain('For Jose only');
    expect(mine).not.toBe(theirs);
  });
});

describe('mark_notification_read.php', () => {
  const mark = (token, body) => api('mark_notification_read.php', { token, json: body });

  it('needs a session', async () => {
    expect((await mark(undefined, {})).status).toBe(401);
  });

  it('marks one of the caller\'s notifications and refuses someone else\'s', async () => {
    const mine = await add(MARIA);
    const theirs = await add(JOSE);
    expect((await mark(maria, { id: mine })).body.success).toBe(true);
    expect((await row(mine)).is_read).toBe(1);
    expect((await mark(maria, { id: theirs })).status).toBe(404);
    expect((await row(theirs)).is_read).toBe(0);
    expect((await mark(maria, { id: 99999 })).status).toBe(404);
  });

  it('"mark all" touches only the caller\'s unread rows', async () => {
    const a = await add(MARIA);
    const b = await add(JOSE);
    expect((await mark(maria, {})).body.success).toBe(true);
    expect((await row(a)).is_read).toBe(1);
    expect((await row(b)).is_read).toBe(0);
    expect((await one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [MARIA])).n).toBe(0);
  });

  it('an admin\'s "mark all" never marks a tenant\'s decision notice as read', async () => {
    const tenantNotice = await add(MARIA, { type: 'parking_reservation', status: 'Resolved' });
    await mark(admin, {});
    expect((await row(tenantNotice)).is_read).toBe(0);
  });
});

describe('archive_notification.php and delete_notification.php', () => {
  const archive = (token, body) => api('archive_notification.php', { token, json: body });
  const del = (token, body) => api('delete_notification.php', { token, json: body });

  it('need a session', async () => {
    expect((await archive(undefined, {})).status).toBe(401);
    expect((await del(undefined, {})).status).toBe(401);
  });

  it('archive: own row only, never a Pending request, 404 for others\' or missing rows', async () => {
    const mine = await add(MARIA);
    const pending = await add(MARIA, { type: 'occupancy_request', status: 'Pending' });
    const theirs = await add(JOSE);
    expect((await archive(maria, { id: mine })).body.success).toBe(true);
    expect((await row(mine)).is_archived).toBe(1);
    expect((await archive(maria, { id: pending })).status).toBe(409);
    expect((await row(pending)).is_archived).toBe(0);
    expect((await archive(maria, { id: theirs })).status).toBe(404);
    expect((await row(theirs)).is_archived).toBe(0);
    expect((await archive(maria, { id: 99999 })).status).toBe(404);
  });

  it('delete: own row only, never a Pending request, 404 for others\' rows; second delete is 404', async () => {
    const mine = await add(MARIA);
    const pending = await add(MARIA, { type: 'occupancy_request', status: 'Pending' });
    const theirs = await add(JOSE);
    expect((await del(maria, { id: mine })).body.success).toBe(true);
    expect(await row(mine)).toBeNull();
    expect((await del(maria, { id: mine })).status).toBe(404);
    expect((await del(maria, { id: pending })).status).toBe(409);
    expect(await row(pending)).not.toBeNull();
    expect((await del(maria, { id: theirs })).status).toBe(404);
    expect(await row(theirs)).not.toBeNull();
  });

  it('"clear all" removes only the caller\'s non-pending rows', async () => {
    const jose1 = await add(JOSE);
    const pending = await add(MARIA, { type: 'occupancy_request', status: 'Pending' });
    expect((await del(maria, {})).body.success).toBe(true);
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND status <> 'Pending'", [MARIA])).n).toBe(0);
    expect(await row(pending)).not.toBeNull();
    expect(await row(jose1)).not.toBeNull();
  });
});

describe('notification preferences', () => {
  const get = (token) => api('get_notification_preferences.php', { token });
  const put = (token, body) => api('update_notification_preferences.php', { token, json: body });

  it('need a session', async () => {
    expect((await get(undefined)).status).toBe(401);
    expect((await put(undefined, { preferences: { announcements: false } })).status).toBe(401);
  });

  it('default to everything on, for every category', async () => {
    const res = await get(maria);
    expect(res.body.preferences.length).toBeGreaterThan(0);
    expect(res.body.preferences.every((p) => p.in_app_enabled && p.sms_enabled && p.email_enabled)).toBe(true);
  });

  it.each([
    ['nothing provided', {}],
    ['empty preferences', { preferences: {} }],
    ['not an object', { preferences: 'all' }],
    ['unknown category', { preferences: { nonsense: true } }],
    ['non-boolean value', { preferences: { announcements: 'maybe' } }],
    ['non-boolean channel', { preferences: { announcements: { sms: 'yes please' } } }],
  ])('rejects %s with 422 and saves nothing', async (_n, body) => {
    expect((await put(maria, body)).status).toBe(422);
    expect((await one('SELECT COUNT(*) AS n FROM notification_preferences WHERE user_id = ?', [MARIA])).n).toBe(0);
  });

  it('saves one channel without touching the others, only for the caller, and logs the change', async () => {
    const res = await put(maria, { preferences: { announcements: { sms: false } } });
    expect(res.body).toMatchObject({ success: true, changed: 1 });
    const mine = (await get(maria)).body.preferences.find((p) => p.category === 'announcements');
    expect(mine).toMatchObject({ in_app_enabled: true, sms_enabled: false, email_enabled: true });
    const others = (await get(jose)).body.preferences.find((p) => p.category === 'announcements');
    expect(others.sms_enabled).toBe(true);
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Updated Notification Preferences'")).n).toBe(1);
    expect((await put(maria, { preferences: { announcements: { sms: false } } })).body.changed).toBe(0); // no-op
  });

  it('accepts 0, 1, "0", "1" and booleans, and saves the global opt-outs', async () => {
    for (const v of [0, 1, '0', '1', true, false]) expect((await put(maria, { preferences: { visitor_updates: v } })).status, String(v)).toBe(200);
    expect((await put(maria, { sms_opt_out: true, email_opt_out: false })).body.success).toBe(true);
    const me = (await get(maria)).body;
    expect(me).toMatchObject({ sms_opt_out: true, email_opt_out: false });
  });

  it('a muted category drops the in-app notification for that user', async () => {
    await put(jose, { preferences: { announcements: { in_app: false } } });
    const res = await api('create_notification.php', { token: admin, json: { userId: JOSE, title: 'Muted one', message: 'x', type: 'info' } });
    expect(res.body).toMatchObject({ success: true, delivered: false });
    expect(await one("SELECT id FROM notifications WHERE user_id = ? AND title = 'Muted one'", [JOSE])).toBeNull();
  });
});
