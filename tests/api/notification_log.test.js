// get_notification_log.php: a tenant's own delivery history (the texts and
// emails sent to them), without the recipient, provider error or provider ids.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q } from './lib/db.js';

const MARIA = 2;
const JOSE = 3;
let maria;
beforeAll(async () => {
  maria = await loginAs('maria');
});

const log = (token, query) => api('get_notification_log.php', { token, query });
const add = (userId, channel, status, subject) => q(
  `INSERT INTO notification_log (user_id, channel, event_type, recipient, subject, message_body, status, error_message, provider_message_id)
   VALUES (?, ?, 'payment_reminder', 'secret@demo.example', ?, 'body', ?, 'provider said no', 'prov-1')`,
  [userId, channel, subject, status],
);

describe('get_notification_log.php', () => {
  it('needs a session', async () => {
    expect((await log(undefined)).status).toBe(401);
  });

  it("lists only the caller's texts and emails, newest first, without private columns", async () => {
    await q('DELETE FROM notification_log WHERE user_id IN (?, ?)', [MARIA, JOSE]);
    await add(MARIA, 'email', 'sent', 'Rent due soon');
    await add(MARIA, 'sms', 'failed', 'Overdue notice');
    await add(MARIA, 'in-app', 'sent', 'Not listed');
    await add(JOSE, 'email', 'sent', 'Jose email');
    const res = await log(maria);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.entries.map((e) => e.subject)).toEqual(['Overdue notice', 'Rent due soon']);
    expect(Object.keys(res.body.entries[0]).sort()).toEqual(['channel', 'event_type', 'id', 'sent_at', 'status', 'subject']);
    expect(res.text).not.toMatch(/secret@demo|provider said no|prov-1|Jose email/);
  });

  it('filters by channel and status, and pages', async () => {
    expect((await log(maria, { channel: 'email' })).body.entries.map((e) => e.subject)).toEqual(['Rent due soon']);
    expect((await log(maria, { status: 'failed' })).body.total).toBe(1);
    const page = await log(maria, { limit: 1, offset: 1 });
    expect(page.body).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(page.body.entries).toHaveLength(1);
  });

  it.each([[{ limit: 0 }], [{ limit: 51 }], [{ offset: -1 }], [{ limit: 'abc' }], [{ channel: 'fax' }], [{ status: 'maybe' }]])('refuses bad query %j with 400', async (query) => {
    expect((await log(maria, query)).status).toBe(400);
  });
});
