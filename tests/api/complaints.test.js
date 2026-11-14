// Complaints (SPRINT 189, checklist 7.7): a tenant files one with a category, the
// admin moves it Open -> In Review -> Resolved, and the chat thread follows it.
// file_complaint.php, update_complaint_status.php, get_complaints.php,
// and the complaint_id that send_message.php / get_chat_history.php /
// get_conversations.php carry.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria, jose, adminId;
const MARIA = 2;
const JOSE = 3;

const file = (token, json) => api('file_complaint.php', { token, json });
const setStatus = (token, complaintId, status) => api('update_complaint_status.php', { token, json: { complaintId, status } });
const send = (token, receiver_id, message) => api('send_message.php', { token, json: { receiver_id, message } });
const statusOf = async (id) => (await one('SELECT status FROM complaints WHERE id = ?', [id])).status;
const queueRow = (id) => one("SELECT status FROM notifications WHERE type = 'complaint' AND metadata_value = ?", [`complaint:${id}`]);

beforeAll(async () => {
  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
  adminId = (await one("SELECT id FROM users WHERE email_address = 'admin@gmail.com'")).id;
});

describe('file_complaint.php', () => {
  it('needs a tenant session', async () => {
    expect((await file(undefined, { category: 'Noise', message: 'Loud music every night' })).status).toBe(401);
    const asAdmin = await file(admin, { category: 'Noise', message: 'Loud music every night' });
    expect(asAdmin.status).toBe(403);
  });

  it.each([
    ['no category', { message: 'Loud music every night' }, 'category'],
    ['an unknown category', { category: 'Gossip', message: 'Loud music every night' }, 'category'],
    ['a message that is too short', { category: 'Noise', message: 'No' }, 'message'],
    ['a message over 2,000 characters', { category: 'Noise', message: 'x'.repeat(2001) }, 'message'],
    ['an array where a value is expected', { category: ['Noise'], message: 'Loud music every night' }, null],
  ])('refuses %s and files nothing', async (_label, body, field) => {
    const before = (await one('SELECT COUNT(*) AS c FROM complaints')).c;
    const res = await file(maria, body);
    expect([400, 422]).toContain(res.status);
    if (field) expect(res.body.errors[field]).toBeTruthy();
    expect((await one('SELECT COUNT(*) AS c FROM complaints')).c).toBe(before);
  });

  it('files an Open complaint with its first message, tells the admin queue and logs it', async () => {
    const res = await file(maria, { category: 'Noise', message: '  Loud music from the unit above every night  ' });
    expect(res.status).toBe(200);
    const id = res.body.complaint.id;
    expect(res.body.complaint).toMatchObject({ category: 'Noise', status: 'Open' });

    expect(await one('SELECT user_id, category, status, resolved_at FROM complaints WHERE id = ?', [id]))
      .toEqual({ user_id: MARIA, category: 'Noise', status: 'Open', resolved_at: null });
    const first = await one('SELECT sender_id, receiver_id, message, complaint_id FROM messages WHERE id = ?', [res.body.message.id]);
    expect(first).toEqual({ sender_id: MARIA, receiver_id: adminId, message: 'Loud music from the unit above every night', complaint_id: id });
    expect(await queueRow(id)).toEqual({ status: 'Pending' });
    const log = await one("SELECT performed_by, details FROM activity_logs WHERE action = 'Filed Complaint' ORDER BY id DESC LIMIT 1");
    expect(log).toEqual({ performed_by: MARIA, details: `Complaint #${id} (Noise)` });
  });

  it('refuses a second complaint while one is still open, and keeps one row', async () => {
    const before = (await one('SELECT COUNT(*) AS c FROM complaints WHERE user_id = ?', [MARIA])).c;
    const res = await file(maria, { category: 'Billing', message: 'Another problem entirely' });
    expect(res.status).toBe(409);
    expect((await one('SELECT COUNT(*) AS c FROM complaints WHERE user_id = ?', [MARIA])).c).toBe(before);
  });
});

describe('the conversation follows the complaint', () => {
  let complaintId;
  beforeAll(async () => {
    complaintId = (await one("SELECT id FROM complaints WHERE user_id = ? AND status = 'Open'", [MARIA])).id;
  });

  it('messages between the tenant and the admin carry its id; a message to another tenant does not', async () => {
    const fromTenant = await send(maria, adminId, 'It was loud again last night');
    expect(fromTenant.body.message.complaint_id).toBe(complaintId);
    const fromAdmin = await send(admin, MARIA, 'We have noted it and will talk to the unit above');
    expect(fromAdmin.body.message.complaint_id).toBe(complaintId);
    const toNeighbour = await send(maria, JOSE, 'Hi Jose');
    expect(toNeighbour.body.message.complaint_id).toBeNull();
    // Another tenant writing to the admin is not part of Maria's complaint.
    const other = await send(jose, adminId, 'Question about my bill');
    expect(other.body.message.complaint_id).toBeNull();
  });

  it('chat history carries the complaint id', async () => {
    const hist = await api('get_chat_history.php', { token: admin, query: { other_user_id: MARIA } });
    const flagged = hist.body.messages.filter((m) => m.complaint_id === complaintId);
    expect(flagged.length).toBeGreaterThanOrEqual(3);
  });

  it('the admin inbox and the tenant widget both show the open complaint', async () => {
    const inbox = await api('get_conversations.php', { token: admin });
    const row = inbox.body.conversations.find((c) => c.other_user_id === MARIA);
    expect(row.complaint).toEqual({ id: complaintId, category: 'Noise', status: 'Open' });
    expect(inbox.body.conversations.find((c) => c.other_user_id === JOSE)?.complaint ?? null).toBeNull();

    const mine = await api('get_conversations.php', { token: maria });
    expect(mine.body.conversations.find((c) => c.is_admin).complaint).toEqual({ id: complaintId, category: 'Noise', status: 'Open' });
  });
});

describe('get_complaints.php', () => {
  it('a tenant sees only their own; the admin sees all, with names, and can filter to open ones', async () => {
    const mine = await api('get_complaints.php', { token: maria });
    expect(mine.body.complaints.length).toBeGreaterThan(0);
    expect(mine.body.complaints.every((c) => c.userId === MARIA)).toBe(true);
    expect(mine.body.complaints[0].tenantName).toBeNull();
    expect((await api('get_complaints.php', { token: jose })).body.complaints).toEqual([]);

    const all = await api('get_complaints.php', { token: admin, query: { open: 1 } });
    expect(all.body.complaints.some((c) => c.userId === MARIA && c.tenantName)).toBe(true);
    expect((await api('get_complaints.php')).status).toBe(401);
  });
});

describe('update_complaint_status.php', () => {
  let id;
  beforeAll(async () => {
    id = (await one("SELECT id FROM complaints WHERE user_id = ? AND status = 'Open'", [MARIA])).id;
  });

  it('is for the admin only and validates its input', async () => {
    expect((await setStatus(maria, id, 'Resolved')).status).toBe(403);
    expect((await setStatus(undefined, id, 'Resolved')).status).toBe(401);
    expect((await setStatus(admin, id, 'Closed')).status).toBe(422);
    expect((await setStatus(admin, 'abc', 'Resolved')).status).toBe(422);
    expect((await setStatus(admin, 999999, 'Resolved')).status).toBe(404);
    expect(await statusOf(id)).toBe('Open');
  });

  it('Open -> In Review tells the tenant, keeps the queue item, and logs it', async () => {
    const res = await setStatus(admin, id, 'In Review');
    expect(res.body).toMatchObject({ success: true, complaint: { id, status: 'In Review' } });
    expect(await statusOf(id)).toBe('In Review');
    expect(await queueRow(id)).toEqual({ status: 'Pending' });
    const note = await one("SELECT message FROM notifications WHERE user_id = ? AND type = 'complaint_update' ORDER BY id DESC LIMIT 1", [MARIA]);
    expect(note.message).toMatch(new RegExp(`#${id}.*In Review`));
    const log = await one("SELECT details FROM activity_logs WHERE action = 'Updated Complaint Status' ORDER BY id DESC LIMIT 1");
    expect(log.details).toBe(`Complaint #${id}: Open -> In Review`);
  });

  it('refuses a move to the status it already has (a second admin or tab) with 409', async () => {
    const res = await setStatus(admin, id, 'In Review');
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already In Review/);
  });

  it('Resolved stamps who and when, clears the queue item and lets the tenant file a new complaint', async () => {
    expect((await setStatus(admin, id, 'Resolved')).status).toBe(200);
    expect(await one('SELECT status, resolved_by FROM complaints WHERE id = ?', [id])).toEqual({ status: 'Resolved', resolved_by: adminId });
    expect((await one('SELECT resolved_at FROM complaints WHERE id = ?', [id])).resolved_at).not.toBeNull();
    expect(await queueRow(id)).toEqual({ status: 'Resolved' });

    // Later messages are ordinary chat again.
    expect((await send(maria, adminId, 'Thank you')).body.message.complaint_id).toBeNull();
    expect((await file(maria, { category: 'Billing', message: 'A different problem now' })).status).toBe(200);
  });

  it('a resolved complaint can be reopened; only the listed moves are allowed', async () => {
    expect((await setStatus(admin, id, 'Open')).status).toBe(409); // Resolved -> Open is not a move
    expect((await setStatus(admin, id, 'In Review')).status).toBe(200);
    expect(await one('SELECT resolved_at, resolved_by FROM complaints WHERE id = ?', [id])).toEqual({ resolved_at: null, resolved_by: null });
  });
});

describe('abuse limits', () => {
  it('a tenant who keeps filing is slowed down (5 an hour)', async () => {
    await q("UPDATE complaints SET status = 'Resolved' WHERE user_id = ?", [JOSE]);
    await q("DELETE FROM rate_limit_events WHERE action = 'complaint'");
    for (let i = 0; i < 5; i++) await q("INSERT INTO rate_limit_events (action, rate_key) VALUES ('complaint', ?)", [String(JOSE)]);
    const res = await file(jose, { category: 'Staff', message: 'The staff were rude to me' });
    expect(res.status).toBe(429);
    expect(await one('SELECT COUNT(*) AS c FROM complaints WHERE user_id = ?', [JOSE])).toEqual({ c: 0 });
  });
});
