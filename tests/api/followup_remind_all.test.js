// Notifications → Needs follow-up → Remind all (monitor_followups.php
// action=remind_all): one reminder per outstanding item, the once-a-day rule per
// item, and two admins pressing it together do not double-send.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin;
const remindAll = (token = admin) => api('monitor_followups.php', { token, json: { action: 'remind_all' } });
const nudges = async () => (await one("SELECT COUNT(*) AS c FROM notifications WHERE metadata_value LIKE 'followup:%'")).c;

beforeAll(async () => {
  admin = await loginAs('admin');
  // An overdue bill for Maria (application 1), so the payment list is not empty.
  await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, rent_period_start, status, due_date)
           VALUES ('INV-FOLLOWUP-1', 2, 1, 4000, 4000, 'Follow-up test', DATE_SUB(CURDATE(), INTERVAL 40 DAY), 'overdue', DATE_SUB(CURDATE(), INTERVAL 40 DAY))`);
});

describe('remind all', () => {
  it('a tenant cannot use it', async () => {
    expect((await remindAll(await loginAs('maria'))).status).toBe(403);
  });

  it('sends one reminder per outstanding item, then skips them for a day', async () => {
    const list = (await api('monitor_followups.php', { token: admin })).body;
    const remindable = [...list.payments, ...list.documents].filter((i) => i.kind !== 'lapsed').length;
    expect(remindable).toBeGreaterThan(0);

    const before = await nudges();
    const first = await remindAll();
    expect(first.status).toBe(200);
    expect(first.body.sent).toBeGreaterThan(0);
    expect(first.body.sent + first.body.skipped).toBe(list.payments.length + list.documents.length);
    expect(await nudges()).toBe(before + first.body.sent);

    const again = await remindAll();
    expect(again.status).toBe(200);
    expect(again.body.sent).toBe(0);
    expect(again.body.message).toMatch(/No reminders sent/);
    expect(await nudges()).toBe(before + first.body.sent);
  });

  it('two at the same time send each reminder once', async () => {
    await q("DELETE FROM notifications WHERE metadata_value LIKE 'followup:%'");
    const results = await Promise.all([remindAll(), remindAll()]);
    const sent = results.filter((r) => r.status === 200).reduce((s, r) => s + r.body.sent, 0);
    expect(sent).toBe(await nudges());
    const dupes = await one("SELECT COUNT(*) AS c FROM (SELECT user_id, metadata_value FROM notifications WHERE metadata_value LIKE 'followup:%' GROUP BY user_id, metadata_value HAVING COUNT(*) > 1) d");
    expect(dupes.c).toBe(0);
  });
});
