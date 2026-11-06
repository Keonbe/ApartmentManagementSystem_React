// Guest inquiry chat, "Did this answer your question?": the admin asks once they
// have replied (guest_chat.php action=resolution_check); the guest answers
// Problem resolved / Not yet (action=resolution_answer). thread.resolved tells
// the widget to offer "End chat on this device".
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin;
let adminId;
let seq = 0;

async function addGuestThread(messages = []) {
  const token = (String(++seq).padStart(2, '0') + 'cd'.repeat(31)).slice(0, 64);
  const phone = '+63918' + String(1000000 + seq);
  const res = await q(
    "INSERT INTO inquiries (full_name, email, contact_no, status, thread_type, guest_token, guest_name, guest_email, guest_phone) VALUES (?, ?, ?, 'New', 'guest', ?, ?, ?, ?)",
    [`Asker ${seq}`, `asker${seq}@demo.example`, phone, token, `Asker ${seq}`, `asker${seq}@demo.example`, phone],
  );
  for (const [role, text] of messages) {
    await q('INSERT INTO guest_messages (inquiry_id, sender_role, sender_id, message, is_read) VALUES (?, ?, ?, ?, 1)',
      [res.insertId, role, role === 'admin' ? adminId : null, text]);
  }
  return { id: res.insertId, token };
}

const ask = (id, token = admin) => api('guest_chat.php', { token, json: { thread_id: id, action: 'resolution_check' } });
const answer = (t, messageId, value) => api('guest_chat.php', { headers: { 'X-Guest-Token': t.token }, json: { action: 'resolution_answer', message_id: messageId, answer: value } });
const guestView = (t) => api('guest_chat.php', { headers: { 'X-Guest-Token': t.token } });
const pendingBell = (id) => one("SELECT COUNT(*) AS c FROM notifications WHERE type = 'inquiry' AND metadata_value = ? AND status = 'Pending'", [`inquiry:chat-${id}`]).then((r) => r.c);

beforeAll(async () => {
  admin = await loginAs('admin');
  adminId = (await one("SELECT id FROM users WHERE role = 'admin' AND is_archived = 0 ORDER BY id LIMIT 1")).id;
});

describe('asking', () => {
  it('needs an admin reply first', async () => {
    const t = await addGuestThread([['guest', 'Is room J free?']]);
    const res = await ask(t.id);
    expect(res.status).toBe(422);
    expect((await guestView(t)).body.thread).toMatchObject({ resolved: false, awaiting_answer: false });
  });

  it('adds one question; a second while it is unanswered is refused', async () => {
    const t = await addGuestThread([['guest', 'Is room J free?'], ['admin', 'Yes, from today.']]);
    const first = await ask(t.id);
    expect(first.status).toBe(200);
    expect(first.body.message.kind).toBe('resolution_check');
    expect((await ask(t.id)).status).toBe(409);
    const view = (await guestView(t)).body;
    expect(view.thread).toMatchObject({ resolved: false, awaiting_answer: true });
    expect(view.messages.at(-1)).toMatchObject({ kind: 'resolution_check', resolution_answer: null });
  });

  it('two at the same time still add only one', async () => {
    const t = await addGuestThread([['guest', 'Parking?'], ['admin', 'One slot left.']]);
    const results = await Promise.all([ask(t.id), ask(t.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await one("SELECT COUNT(*) AS c FROM guest_messages WHERE inquiry_id = ? AND kind = 'resolution_check'", [t.id])).c).toBe(1);
  });

  it('a guest or a tenant cannot ask', async () => {
    const t = await addGuestThread([['guest', 'Hi'], ['admin', 'Hello']]);
    const asGuest = await api('guest_chat.php', { headers: { 'X-Guest-Token': t.token }, json: { action: 'resolution_check' } });
    expect(asGuest.status).toBe(403);
    const tenant = await loginAs('maria');
    expect((await ask(t.id, tenant)).status).not.toBe(200);
  });
});

describe('answering', () => {
  it('resolved: thread.resolved turns on and the question cannot be answered again', async () => {
    const t = await addGuestThread([['guest', 'Pets?'], ['admin', 'No pets, sorry.']]);
    const check = (await ask(t.id)).body.message;
    const res = await answer(t, check.id, 'resolved');
    expect(res.status).toBe(200);
    expect((await guestView(t)).body.thread).toMatchObject({ resolved: true, awaiting_answer: false });
    expect((await answer(t, check.id, 'not_yet')).status).toBe(409);
    expect((await one('SELECT resolution_answer FROM guest_messages WHERE id = ?', [check.id])).resolution_answer).toBe('resolved');
  });

  it('not yet: the admin is alerted and can ask again later', async () => {
    const t = await addGuestThread([['guest', 'Wifi?'], ['admin', 'Fiber in every room.']]);
    const check = (await ask(t.id)).body.message;
    expect(await pendingBell(t.id)).toBe(0);
    expect((await answer(t, check.id, 'not_yet')).status).toBe(200);
    expect(await pendingBell(t.id)).toBe(1);
    expect((await guestView(t)).body.thread.resolved).toBe(false);
    expect((await ask(t.id)).status).toBe(200);
  });

  it('refuses a bad answer, another thread\'s question and an admin answering', async () => {
    const a = await addGuestThread([['guest', 'A'], ['admin', 'a']]);
    const b = await addGuestThread([['guest', 'B'], ['admin', 'b']]);
    const checkA = (await ask(a.id)).body.message;
    expect((await answer(a, checkA.id, 'maybe')).status).toBe(422);
    expect((await answer(b, checkA.id, 'resolved')).status).toBe(404);
    const asAdmin = await api('guest_chat.php', { token: admin, json: { thread_id: a.id, action: 'resolution_answer', message_id: checkA.id, answer: 'resolved' } });
    expect(asAdmin.status).toBe(403);
    expect((await one('SELECT resolution_answer FROM guest_messages WHERE id = ?', [checkA.id])).resolution_answer).toBeNull();
  });

  it('a later question decides: resolved then a new unanswered one is not resolved', async () => {
    const t = await addGuestThread([['guest', 'Q1'], ['admin', 'A1']]);
    await answer(t, (await ask(t.id)).body.message.id, 'resolved');
    expect((await ask(t.id)).status).toBe(200);
    expect((await guestView(t)).body.thread).toMatchObject({ resolved: false, awaiting_answer: true });
  });
});
