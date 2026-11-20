// The Inquiries chat window (inquiry_thread.php) and its follow-up rules
// (backend/inquiries.php): opening an inquiry marks it seen (it stops counting as
// New in the Dashboard and the bell), and an admin reply in its own chat moves a
// New inquiry to Contacted, for a guest chat (guest_chat.php) and for an account
// holder (send_message.php with inquiry_id). Later statuses are never touched.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria, adminId;
let seq = 0;

// Inquiries are built straight in the DB (submit_inquiry.php is rate limited per IP).
async function addInquiry({ kind = 'office', status = 'New', userId = null, message = 'Is the unit free?' } = {}) {
  seq += 1;
  const guest = kind === 'guest';
  const token = guest ? (String(seq).padStart(4, '0') + 'cd'.repeat(30)).slice(0, 64) : null;
  const res = await q(
    `INSERT INTO inquiries (user_id, full_name, email, contact_no, message, source, status, thread_type, guest_token, guest_name, guest_email, guest_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, `Prospect ${seq}`, `prospect${seq}@demo.example`, `+6391780${String(seq).padStart(5, '0')}`, message,
      kind === 'office' ? 'walk-in' : 'web', status, guest ? 'guest' : 'registered', token,
      guest ? `Prospect ${seq}` : null, guest ? `prospect${seq}@demo.example` : null, guest ? `+6391780${String(seq).padStart(5, '0')}` : null],
  );
  const id = res.insertId;
  if (guest) await q("INSERT INTO guest_messages (inquiry_id, sender_role, message) VALUES (?, 'guest', ?)", [id, message]);
  // The "New Unit Inquiry" bell entry submit_inquiry.php raises.
  await q("INSERT INTO notifications (user_id, type, title, message, status, metadata_value) VALUES (?, 'inquiry', 'New Unit Inquiry', 'x', 'Pending', ?)", [adminId, `inquiry:${id}`]);
  return { id, token };
}
const row = (id) => one('SELECT status, admin_seen_at, handled_by FROM inquiries WHERE id = ?', [id]);
const pendingBell = (id) => one("SELECT COUNT(*) AS c FROM notifications WHERE type = 'inquiry' AND metadata_value = ? AND status = 'Pending'", [`inquiry:${id}`]).then((r) => Number(r.c));
const newCount = async () => (await api('dashboard_stats.php', { token: admin, query: { section: 'attention' } })).body.attention.new_inquiries;

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
  adminId = (await one("SELECT id FROM users WHERE role = 'admin' AND is_archived = 0 ORDER BY id LIMIT 1")).id;
});

describe('inquiry_thread.php', () => {
  it('is admin only and needs an existing inquiry', async () => {
    const { id } = await addInquiry();
    expect((await api('inquiry_thread.php', { query: { id } })).status).toBe(401);
    expect((await api('inquiry_thread.php', { token: maria, query: { id } })).status).toBe(403);
    expect((await api('inquiry_thread.php', { token: admin, query: { id: 0 } })).status).toBe(422);
    expect((await api('inquiry_thread.php', { token: admin, query: { id: 99999999 } })).status).toBe(404);
  });

  it('opening it marks it seen: off the New count and the bell, status unchanged', async () => {
    const { id } = await addInquiry();
    const before = await newCount();
    const res = await api('inquiry_thread.php', { token: admin, query: { id } });
    expect(res.status).toBe(200);
    expect(res.body.inquiry.adminSeenAt).toBeTruthy();
    expect(await newCount()).toBe(before - 1);
    expect(await pendingBell(id)).toBe(0);
    expect((await row(id)).status).toBe('New');
  });

  it('an office inquiry has no chat: the form message only, no reply', async () => {
    const { id } = await addInquiry({ kind: 'office', message: 'Walked in asking about Unit I' });
    const res = await api('inquiry_thread.php', { token: admin, query: { id } });
    expect(res.body.channel).toBe('none');
    expect(res.body.canReply).toBe(false);
    expect(res.body.noReplyReason).toMatch(/phone or email/);
    expect(res.body.messages).toEqual([expect.objectContaining({ kind: 'inquiry', from: 'prospect', text: 'Walked in asking about Unit I' })]);
  });

  it('get_inquiries.php lists the chat kind, seen time and unread count', async () => {
    const g = await addInquiry({ kind: 'guest' });
    const list = (await api('get_inquiries.php', { token: admin })).body.inquiries;
    const item = list.find((i) => Number(i.id) === g.id);
    expect(item).toEqual(expect.objectContaining({ channel: 'guest', adminSeenAt: null, unreadCount: 1 }));
  });
});

describe('a reply marks a New inquiry Contacted', () => {
  it('guest chat: the admin reply moves it, the guest still sees their message first', async () => {
    const { id } = await addInquiry({ kind: 'guest', message: 'Hello, is Unit J free?' });
    const thread = await api('inquiry_thread.php', { token: admin, query: { id } });
    expect(thread.body.channel).toBe('guest');
    expect(thread.body.canReply).toBe(true);
    expect(thread.body.messages[0]).toEqual(expect.objectContaining({ kind: 'inquiry', text: 'Hello, is Unit J free?' }));

    const sent = await api('guest_chat.php', { token: admin, json: { thread_id: id, message: 'Yes, it is.' } });
    expect(sent.status).toBe(200);
    expect(await row(id)).toEqual(expect.objectContaining({ status: 'Contacted', handled_by: adminId }));
    const after = await api('inquiry_thread.php', { token: admin, query: { id } });
    expect(after.body.messages.at(-1)).toEqual(expect.objectContaining({ from: 'admin', text: 'Yes, it is.' }));
  });

  it('opening the guest chat from Messages also marks it seen', async () => {
    const { id } = await addInquiry({ kind: 'guest' });
    await api('guest_chat.php', { token: admin, query: { thread_id: id } });
    expect((await row(id)).admin_seen_at).toBeTruthy();
    expect((await row(id)).status).toBe('New');
  });

  it('a later status is never moved back by a reply', async () => {
    const { id } = await addInquiry({ kind: 'guest', status: 'Scheduled' });
    await api('guest_chat.php', { token: admin, json: { thread_id: id, message: 'See you on Saturday.' } });
    expect((await row(id)).status).toBe('Scheduled');
  });

  it('account holder: only a reply sent for that inquiry counts', async () => {
    const mine = await addInquiry({ kind: 'account', userId: 2 });
    const thread = await api('inquiry_thread.php', { token: admin, query: { id: mine.id } });
    expect(thread.body.channel).toBe('account');
    expect(thread.body.canReply).toBe(true);

    // A plain message from Messages (no inquiry_id) leaves it New.
    expect((await api('send_message.php', { token: admin, json: { receiver_id: 2, message: 'About your rent' } })).status).toBe(200);
    expect((await row(mine.id)).status).toBe('New');

    // inquiry_id of somebody else's inquiry: ignored.
    const other = await addInquiry({ kind: 'account', userId: 3 });
    await api('send_message.php', { token: admin, json: { receiver_id: 2, message: 'Hi', inquiry_id: other.id } });
    expect((await row(other.id)).status).toBe('New');

    await api('send_message.php', { token: admin, json: { receiver_id: 2, message: 'Thanks for asking about the unit!', inquiry_id: mine.id } });
    expect((await row(mine.id)).status).toBe('Contacted');
    const after = await api('inquiry_thread.php', { token: admin, query: { id: mine.id } });
    expect(after.body.messages.at(-1)).toEqual(expect.objectContaining({ from: 'admin', text: 'Thanks for asking about the unit!' }));
  });

  it('a tenant cannot use inquiry_id to change an inquiry', async () => {
    const { id } = await addInquiry({ kind: 'account', userId: 2 });
    await api('send_message.php', { token: maria, json: { receiver_id: adminId, message: 'Hello', inquiry_id: id } });
    expect((await row(id)).status).toBe('New');
  });
});
