// Guest inquiry chat: the admin inbox's unread count, the one-per-thread admin
// bell entry, the guest token staying out of URLs, and a guest thread moving
// into the account's normal chat when the guest signs in.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, login, ACCOUNTS } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin;
let seq = 0;
let adminId;

// A guest thread built straight in the DB (submit_inquiry.php is rate limited per IP).
async function addGuestThread(messages) {
  const token = (String(++seq).padStart(2, '0') + 'ab'.repeat(31)).slice(0, 64);
  const phone = '+63917' + String(1000000 + seq);
  const res = await q(
    "INSERT INTO inquiries (full_name, email, contact_no, status, thread_type, guest_token, guest_name, guest_email, guest_phone) VALUES (?, ?, ?, 'New', 'guest', ?, ?, ?, ?)",
    [`Guest ${seq}`, `guest${seq}@example.com`, phone, token, `Guest ${seq}`, `guest${seq}@example.com`, phone],
  );
  const id = res.insertId;
  for (const [role, text, read] of messages) {
    await q('INSERT INTO guest_messages (inquiry_id, sender_role, sender_id, message, is_read) VALUES (?, ?, ?, ?, ?)',
      [id, role, role === 'admin' ? adminId : null, text, read ? 1 : 0]);
  }
  return { id, token };
}

const guestSend = (token, message) => api('guest_chat.php', { headers: { 'X-Guest-Token': token }, json: { message } });
const pendingBell = (id) => one("SELECT COUNT(*) AS c FROM notifications WHERE type = 'inquiry' AND metadata_value = ? AND status = 'Pending'", [`inquiry:chat-${id}`]).then((r) => r.c);

beforeAll(async () => {
  admin = await loginAs('admin');
  adminId = (await one("SELECT id FROM users WHERE role = 'admin' AND is_archived = 0 ORDER BY id LIMIT 1")).id;
});

describe('admin inbox unread count', () => {
  it('counts unread guest messages per thread and clears when the admin opens it', async () => {
    const t = await addGuestThread([['guest', 'hello', false], ['guest', 'anyone there?', false], ['admin', 'hi', true], ['guest', 'old', true]]);
    const list = await api('get_guest_conversations.php', { token: admin });
    expect(list.status).toBe(200);
    expect(Number(list.body.conversations.find((c) => Number(c.thread_id) === t.id).unread_count)).toBe(2);

    await api('guest_chat.php', { token: admin, query: { thread_id: t.id } });
    const after = await api('get_guest_conversations.php', { token: admin });
    expect(Number(after.body.conversations.find((c) => Number(c.thread_id) === t.id).unread_count)).toBe(0);
  });

  it('is admin only', async () => {
    const res = await api('get_guest_conversations.php', { token: await loginAs('maria') });
    expect(res.status).toBe(403);
  });
});

describe('admin bell for guest messages', () => {
  it('queues one entry per thread however many messages the guest sends', async () => {
    const t = await addGuestThread([['guest', 'first', true]]);
    expect((await guestSend(t.token, 'one')).status).toBe(200);
    expect((await guestSend(t.token, 'two')).status).toBe(200);
    expect(await pendingBell(t.id)).toBe(1);
  });

  it('clears when an admin opens the thread, and a new guest message queues it again', async () => {
    const t = await addGuestThread([['guest', 'first', true]]);
    await guestSend(t.token, 'one');
    await api('guest_chat.php', { token: admin, query: { thread_id: t.id } });
    expect(await pendingBell(t.id)).toBe(0);
    await guestSend(t.token, 'again');
    expect(await pendingBell(t.id)).toBe(1);
  });

  it('is not queued by the admin\'s own reply', async () => {
    const t = await addGuestThread([['guest', 'first', true]]);
    const res = await api('guest_chat.php', { token: admin, json: { thread_id: t.id, message: 'reply' } });
    expect(res.status).toBe(200);
    expect(await pendingBell(t.id)).toBe(0);
  });
});

describe('guest token stays out of the URL', () => {
  it('ignores a token in the query string but accepts the header', async () => {
    const t = await addGuestThread([['guest', 'hi', true]]);
    const inUrl = await api('guest_chat.php', { query: { guest_token: t.token } });
    expect(inUrl.status).toBe(401);
    const inHeader = await api('guest_chat.php', { headers: { 'X-Guest-Token': t.token } });
    expect(inHeader.status).toBe(200);
    expect(inHeader.body.messages).toHaveLength(1);
  });
});

describe('guest chat follows the account at login', () => {
  const loginWith = (who, guest_token) => api('login.php', { json: { email_address: ACCOUNTS[who][0], password: ACCOUNTS[who][1], guest_token } });
  const chatCount = async (userId) => (await one('SELECT COUNT(*) AS c FROM messages WHERE sender_id = ? OR receiver_id = ?', [userId, userId])).c;

  it('moves the thread into messages, keeping order, authors, replies and read state', async () => {
    const t = await addGuestThread([['guest', 'question', true], ['admin', 'answer', false]]);
    const [first] = await q('SELECT id FROM guest_messages WHERE inquiry_id = ? ORDER BY id', [t.id]);
    await q("INSERT INTO guest_messages (inquiry_id, sender_role, message, reply_to_id, is_read) VALUES (?, 'guest', 'thanks', ?, 0)", [t.id, first.id]);
    const before = await chatCount(2);

    const res = await loginWith('maria', t.token);
    expect(res.body.valid).toBe(true);

    expect(await chatCount(2)).toBe(before + 3);
    const rows = await q('SELECT m.*, r.message AS reply_text FROM messages m LEFT JOIN messages r ON r.id = m.reply_to_id WHERE m.sender_id = 2 OR m.receiver_id = 2 ORDER BY m.id DESC LIMIT 3');
    const [thanks, answer, question] = rows;
    expect(question).toMatchObject({ message: 'question', sender_id: 2, is_read: 1 });
    expect(answer).toMatchObject({ message: 'answer', sender_id: adminId, receiver_id: 2, is_read: 0 });
    expect(thanks).toMatchObject({ message: 'thanks', sender_id: 2, reply_text: 'question' });

    const thread = await one('SELECT user_id, thread_type, guest_token FROM inquiries WHERE id = ?', [t.id]);
    expect(thread).toMatchObject({ user_id: 2, thread_type: 'registered', guest_token: null });
    expect((await one('SELECT COUNT(*) AS c FROM guest_messages WHERE inquiry_id = ?', [t.id])).c).toBe(0);
    expect((await api('guest_chat.php', { headers: { 'X-Guest-Token': t.token } })).status).toBe(404);
  });

  it('does not copy twice on a second login with the same token', async () => {
    const t = await addGuestThread([['guest', 'only once', true]]);
    await loginWith('jose', t.token);
    const after = await chatCount(3);
    await loginWith('jose', t.token);
    expect(await chatCount(3)).toBe(after);
  });

  it('ignores a wrong or malformed token and still signs in', async () => {
    const t = await addGuestThread([['guest', 'stays', true]]);
    const before = await chatCount(5);
    for (const bad of ['nope', 'f'.repeat(64)]) {
      const res = await loginWith('rosa', bad);
      expect(res.body.valid).toBe(true);
    }
    expect(await chatCount(5)).toBe(before);
    expect((await one('SELECT thread_type FROM inquiries WHERE id = ?', [t.id])).thread_type).toBe('guest');
  });

  it('never adopts a thread for an admin account', async () => {
    const t = await addGuestThread([['guest', 'admin login', true]]);
    const res = await loginWith('admin', t.token);
    expect(res.body.valid).toBe(true);
    expect((await one('SELECT thread_type FROM inquiries WHERE id = ?', [t.id])).thread_type).toBe('guest');
  });

  it('leaves a thread with no messages alone', async () => {
    const t = await addGuestThread([]);
    await loginWith('mark', t.token);
    expect((await one('SELECT thread_type FROM inquiries WHERE id = ?', [t.id])).thread_type).toBe('guest');
  });
});
