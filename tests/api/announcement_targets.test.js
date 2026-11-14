// Announcements addressed to chosen tenants ("Selected tenants", stored as
// 'Tenants: 2,3'): validation, who is notified, and who sees it in the tenant feed.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

const MARIA = 2;
const JOSE = 3;
const ROSA = 4;
let admin, maria, jose;
beforeAll(async () => {
  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
});

const base = { tag: 'General', title: 'Targeted notice', body: 'Only for chosen tenants.', sendTo: 'Selected tenants', channels: ['in-app'] };
const post = (extra) => api('create_announcement.php', { token: admin, json: { ...base, ...extra } });
const feed = async (token) => (await api('get_announcements.php', { token, query: { public: 1 } })).body.announcements;
const notified = (userId, title) => one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND title = ?", [userId, title]).then((r) => r.n);

describe('validation', () => {
  it.each([
    ['no tenants chosen', { tenantIds: [] }],
    ['tenantIds missing', {}],
    ['a non-number id', { tenantIds: ['abc'] }],
    ['a user who is not a current tenant (admin)', { tenantIds: [1] }],
    ['an unknown user', { tenantIds: [99999] }],
    ['more than the 100 allowed', { tenantIds: Array.from({ length: 101 }, (_, i) => i + 1) }],
  ])('%s is a 422 and nothing is saved', async (_label, extra) => {
    const before = (await one('SELECT COUNT(*) AS n FROM announcements')).n;
    const res = await post(extra);
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.errors)).toContain('tenantIds');
    expect((await one('SELECT COUNT(*) AS n FROM announcements')).n).toBe(before);
  });

  it('tenantIds must be a list', async () => {
    const res = await post({ tenantIds: { a: 1 } });
    expect([400, 422]).toContain(res.status);
  });
});

describe('sending to chosen tenants', () => {
  it('notifies only the chosen tenants and stores the label', async () => {
    const title = 'Chosen two';
    const res = await post({ title, tenantIds: [JOSE, MARIA, MARIA] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const row = await one('SELECT send_to, recipient_count FROM announcements WHERE title = ?', [title]);
    expect(row.send_to).toBe(`Tenants: ${MARIA},${JOSE}`);
    expect(row.recipient_count).toBe(2);
    expect(await notified(MARIA, title)).toBe(1);
    expect(await notified(JOSE, title)).toBe(1);
    expect(await notified(ROSA, title)).toBe(0);
  });

  it('the tenant feed shows it only to the chosen tenants', async () => {
    const title = 'Only Maria';
    await post({ title, tenantIds: [MARIA] });
    expect((await feed(maria)).some((a) => a.title === title)).toBe(true);
    expect((await feed(jose)).some((a) => a.title === title)).toBe(false);
    // The audience list itself is never sent to a tenant.
    expect((await feed(maria)).every((a) => !('send_to' in a))).toBe(true);
  });

  it('an announcement for everyone is still in every tenant feed', async () => {
    const title = 'For everyone';
    await api('create_announcement.php', { token: admin, json: { ...base, sendTo: 'All tenants', title } });
    expect((await feed(maria)).some((a) => a.title === title)).toBe(true);
    expect((await feed(jose)).some((a) => a.title === title)).toBe(true);
  });

  it('a unit announcement is in the feed only of that unit\'s tenant', async () => {
    const title = 'Unit B only';
    const res = await api('create_announcement.php', { token: admin, json: { ...base, sendTo: 'Specific unit', unit: 'B', title } });
    expect(res.status).toBe(200);
    expect((await feed(jose)).some((a) => a.title === title)).toBe(true);
    expect((await feed(maria)).some((a) => a.title === title)).toBe(false);
  });

  it('a chosen tenant who was archived before a scheduled send is dropped when it goes out', async () => {
    const title = 'Scheduled pair';
    const when = (await one("SELECT DATE_FORMAT(NOW() + INTERVAL 30 MINUTE, '%Y-%m-%d %H:%i') AS t")).t;
    const res = await post({ title, tenantIds: [MARIA, JOSE], scheduledAt: when });
    expect(res.status).toBe(200);
    const row = await one('SELECT id, status, send_to FROM announcements WHERE title = ?', [title]);
    expect(row.status).toBe('scheduled');
    expect(row.send_to).toBe(`Tenants: ${MARIA},${JOSE}`);

    await q('UPDATE users SET is_archived = 1 WHERE id = ?', [JOSE]);
    try {
      const send = await api('create_announcement.php', { token: admin, json: { action: 'sendNow', id: row.id } });
      expect(send.status).toBe(200);
      expect(await notified(MARIA, title)).toBe(1);
      expect(await notified(JOSE, title)).toBe(0);
      expect((await one('SELECT recipient_count FROM announcements WHERE id = ?', [row.id])).recipient_count).toBe(1);
    } finally {
      await q('UPDATE users SET is_archived = 0 WHERE id = ?', [JOSE]);
    }
  });
});
