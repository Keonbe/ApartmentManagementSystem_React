// send_message.php (and its alias save_message.php), get_chat_history.php, get_conversations.php.
// The chat endpoints read X-User-Id, which config.php rewrites from the session, so the identity is the
// bearer token's. QA guide: chat section (C10).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';
import { ROOT } from './lib/env.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MESSAGES_DIR = path.join(ROOT, 'backend/uploads/messages');
const files = () => (fs.existsSync(MESSAGES_DIR) ? fs.readdirSync(MESSAGES_DIR) : []);
const MARIA = 2;
const JOSE = 3;
let admin, adminId, maria, jose;

const send = (token, body) => api('send_message.php', { token, json: body });
const history = (token, otherId, extra = {}) => api('get_chat_history.php', { token, query: { other_user_id: otherId, ...extra } });
const bodies = (res) => res.body.messages.map((m) => m.message);

beforeAll(async () => {
  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
  adminId = (await one("SELECT id FROM users WHERE email_address = 'admin@gmail.com'")).id;
});

// A message counts toward the sender's 20-per-10-seconds cap, so earlier messages
// are aged out and the cap is not carried from one test into the next.
beforeEach(async () => {
  await q('UPDATE messages SET created_at = created_at - INTERVAL 2 MINUTE');
});

describe('send_message.php', () => {
  it('is chat between a tenant and the office only (CH-3): no tenant to tenant, no admin to admin', async () => {
    const before = (await one('SELECT COUNT(*) AS c FROM messages')).c;
    const toTenant = await send(maria, { receiver_id: JOSE, message: 'hello neighbour' });
    expect(toTenant.status).toBe(403);
    expect(toTenant.body.message).toMatch(/management office/);

    const created = await q("INSERT INTO users (first_name, last_name, email_address, password, role) VALUES ('Second', 'Admin', 'second.admin@demo.example', 'x', 'admin')");
    const toAdmin = await send(admin, { receiver_id: created.insertId, message: 'staff chat' });
    await q('DELETE FROM users WHERE id = ?', [created.insertId]);
    expect(toAdmin.status).toBe(403);

    expect((await one('SELECT COUNT(*) AS c FROM messages')).c).toBe(before);
    // The office can still write to a tenant, and a tenant to the office.
    expect((await send(admin, { receiver_id: MARIA, message: 'office to tenant' })).body.success).toBe(true);
  });

  it('refuses a message to an archived account', async () => {
    await q('UPDATE users SET is_archived = 1 WHERE id = ?', [JOSE]);
    const res = await send(admin, { receiver_id: JOSE, message: 'are you there' });
    await q('UPDATE users SET is_archived = 0 WHERE id = ?', [JOSE]);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/no longer active/);
  });

  it('stops a flood: the 21st message within 10 seconds is a 429, and other accounts are not slowed', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await send(maria, { receiver_id: adminId, message: `burst ${i}` })).status).toBe(200);
    }
    const refused = await send(maria, { receiver_id: adminId, message: 'one too many' });
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ success: false, code: 'rate_limited' });
    expect(await one("SELECT id FROM messages WHERE message = 'one too many'")).toBeNull();

    expect((await send(jose, { receiver_id: adminId, message: 'jose is fine' })).body.success).toBe(true);
  });

  it('needs a session; a forged identity header does not stand in for one', async () => {
    expect((await send(undefined, { receiver_id: adminId, message: 'hi' })).status).toBe(400);
    expect((await api('send_message.php', { headers: { 'X-User-Id': String(MARIA) }, json: { receiver_id: adminId, message: 'forged' } })).status).toBe(400);
    expect((await one("SELECT COUNT(*) AS n FROM messages WHERE message = 'forged'")).n).toBe(0);
  });

  it.each([
    ['no receiver', { message: 'hi' }],
    ['empty message and no attachment', { receiver_id: 1, message: '   ' }],
    ['message to oneself', { receiver_id: MARIA, message: 'hi me' }],
  ])('rejects %s with 400', async (_n, body) => {
    expect((await send(maria, body)).status).toBe(400);
  });

  it('404s an unknown receiver', async () => {
    expect((await send(maria, { receiver_id: 99999, message: 'anyone?' })).status).toBe(404);
  });

  it('stores the message from the signed-in sender, whatever sender id the body claims', async () => {
    const res = await send(maria, { receiver_id: adminId, message: 'Hello admin', sender_id: JOSE });
    expect(res.body.success).toBe(true);
    const stored = await one('SELECT sender_id, receiver_id, is_read FROM messages WHERE id = ?', [res.body.message.id]);
    expect(stored).toEqual({ sender_id: MARIA, receiver_id: adminId, is_read: 0 });
  });

  it('keeps unicode, apostrophes and markup as plain text', async () => {
    const text = "Zoë 李 😀 O'Brien <img src=x onerror=alert(1)>";
    const res = await send(maria, { receiver_id: adminId, message: text });
    expect(res.body.message.message).toBe(text);
    expect((await one('SELECT message FROM messages WHERE id = ?', [res.body.message.id])).message).toBe(text);
  });

  it('replies only to a message in the same conversation', async () => {
    const first = (await send(maria, { receiver_id: adminId, message: 'question' })).body.message.id;
    expect((await send(admin, { receiver_id: MARIA, message: 'answer', reply_to_id: first })).body.success).toBe(true);
    const other = (await send(jose, { receiver_id: adminId, message: 'jose says' })).body.message.id;
    expect((await send(admin, { receiver_id: MARIA, message: 'wrong thread', reply_to_id: other })).status).toBe(400);
  });

  it('save_message.php is the same endpoint', async () => {
    const res = await api('save_message.php', { token: maria, json: { receiver_id: adminId, message: 'via alias' } });
    expect(res.body.success).toBe(true);
  });

  describe('attachments', () => {
    const upload = (token, receiver, bytes, type, name) => {
      const form = new FormData();
      form.append('receiver_id', String(receiver));
      form.append('message', '');
      form.append('attachment', new Blob([bytes], { type }), name);
      return api('send_message.php', { token, form });
    };

    it('accepts a real image and stores it under a random name', async () => {
      const res = await upload(maria, adminId, PNG, 'image/png', 'pic.png');
      expect(res.body.success).toBe(true);
      expect(res.body.message.attachment_path).toMatch(/^uploads\/messages\/[0-9a-f]{32}\.png$/);
    });

    it('refuses a file whose content is not an allowed image or video, whatever its name says', async () => {
      const before = files().length;
      expect((await upload(maria, adminId, Buffer.from('<?php echo 1; ?>'), 'image/png', 'shell.php.png')).status).toBe(415);
      expect((await upload(maria, adminId, Buffer.from('MZ evil'), 'video/mp4', 'x.mp4')).status).toBe(415);
      expect(files().length).toBe(before);
    });

    it('leaves no file behind when the receiver does not exist', async () => {
      const before = files().length;
      expect((await upload(maria, 99999, PNG, 'image/png', 'pic.png')).status).toBe(404);
      expect(files().length).toBe(before);
    });
  });
});

describe('get_chat_history.php', () => {
  it('needs a session and an other_user_id', async () => {
    expect((await history(undefined, adminId)).status).toBe(401);
    expect((await api('get_chat_history.php', { token: maria })).status).toBe(400);
  });

  it('shows a conversation to its two members only', async () => {
    await send(maria, { receiver_id: adminId, message: 'private to maria and admin' });
    expect(bodies(await history(maria, adminId))).toContain('private to maria and admin');
    expect(bodies(await history(admin, MARIA))).toContain('private to maria and admin');
    // Jose asking for the same pair sees his own thread with Maria/admin, never theirs.
    expect(bodies(await history(jose, MARIA))).not.toContain('private to maria and admin');
    expect(bodies(await history(jose, adminId))).not.toContain('private to maria and admin');
  });

  it('ignores a forged identity header when a real token is sent', async () => {
    const res = await api('get_chat_history.php', { token: jose, query: { other_user_id: adminId }, headers: { 'X-User-Id': String(MARIA) } });
    expect(bodies(res)).not.toContain('private to maria and admin');
  });

  it('marks only the caller\'s incoming messages as read, and only when asked', async () => {
    const sent = (await send(admin, { receiver_id: MARIA, message: 'unread for maria' })).body.message.id;
    await history(maria, adminId); // no mark_as_read
    expect((await one('SELECT is_read FROM messages WHERE id = ?', [sent])).is_read).toBe(0);
    await history(jose, adminId, { mark_as_read: 1 }); // someone else's mark does not touch it
    expect((await one('SELECT is_read FROM messages WHERE id = ?', [sent])).is_read).toBe(0);
    await history(maria, adminId, { mark_as_read: 1 });
    expect((await one('SELECT is_read FROM messages WHERE id = ?', [sent])).is_read).toBe(1);
  });
});

describe('get_conversations.php', () => {
  it('needs a session', async () => {
    expect((await api('get_conversations.php')).status).toBe(401);
  });

  it('lists the caller\'s own conversations and no one else\'s', async () => {
    await send(jose, { receiver_id: adminId, message: 'jose only thread' });
    const asMaria = await api('get_conversations.php', { token: maria });
    expect(asMaria.body.success).toBe(true);
    expect(JSON.stringify(asMaria.body)).not.toContain('jose only thread');
    const asJose = await api('get_conversations.php', { token: jose });
    expect(JSON.stringify(asJose.body)).toContain('jose only thread');
  });

  it('search finds the caller\'s own text and treats SQL wildcards and quotes as plain text', async () => {
    const hit = await api('get_conversations.php', { token: maria, query: { search: 'private to maria' } });
    expect(JSON.stringify(hit.body)).toContain('private to maria');
    for (const search of ["' OR '1'='1", '%', '_', '\\']) {
      const res = await api('get_conversations.php', { token: maria, query: { search } });
      expect(res.status, search).toBe(200);
      expect(JSON.stringify(res.body), search).not.toContain('jose only thread');
    }
  });
});

// SPRINT 206: the list is now built from the caller's messages in one ranked pass (two
// composite indexes, no per-user subqueries). These pin the values the page shows.
describe('get_conversations.php (SPRINT 206: one pass over the caller\'s messages)', () => {
  const list = async (token, query = {}) => (await api('get_conversations.php', { token, query })).body.conversations;
  const row = (rows, id) => rows.find((r) => r.other_user_id === id);

  it('last message, its sender and time, and the unread count come from the right message', async () => {
    await q('DELETE FROM messages');
    const a = (await send(maria, { receiver_id: adminId, message: 'first from maria' })).body.message.id;
    const b = (await send(admin, { receiver_id: MARIA, message: 'reply one' })).body.message.id;
    const c = (await send(admin, { receiver_id: MARIA, message: 'reply two' })).body.message.id;
    // Same second: the newer id is the last message.
    await q('UPDATE messages SET created_at = NOW() WHERE id IN (?, ?, ?)', [a, b, c]);

    const asMaria = row(await list(maria), adminId);
    expect(asMaria).toMatchObject({ last_message: 'reply two', last_message_sender_id: adminId, unread_count: 2, is_admin: true });
    const asAdmin = row(await list(admin), MARIA);
    expect(asAdmin).toMatchObject({ last_message: 'reply two', last_message_sender_id: adminId, unread_count: 1, matched_message: null, matched_message_id: null });
    // Reading the thread clears the caller's unread count only.
    await history(maria, adminId, { mark_as_read: 1 });
    expect(row(await list(maria), adminId).unread_count).toBe(0);
    expect(row(await list(admin), MARIA).unread_count).toBe(1);
  });

  it('threads are newest first, one row per person, and a message to oneself is no thread', async () => {
    await q('DELETE FROM messages');
    const old = (await send(maria, { receiver_id: adminId, message: 'older thread' })).body.message.id;
    const recent = (await send(jose, { receiver_id: adminId, message: 'newer thread' })).body.message.id;
    await q("UPDATE messages SET created_at = NOW() - INTERVAL 2 DAY WHERE id = ?", [old]);
    await q("UPDATE messages SET created_at = NOW() - INTERVAL 1 DAY WHERE id = ?", [recent]);
    await q('INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)', [adminId, adminId, 'note to self']);

    const rows = await list(admin);
    expect(rows.map((r) => r.other_user_id)).toEqual([JOSE, MARIA]);
    expect(rows.every((r) => r.other_user_id !== adminId)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('a search keeps a thread by person or by any message, and names the newest matching message', async () => {
    await q('DELETE FROM messages');
    const oldHit = (await send(maria, { receiver_id: adminId, message: 'about the broken faucet' })).body.message.id;
    const newHit = (await send(maria, { receiver_id: adminId, message: 'the faucet is still broken' })).body.message.id;
    const last = (await send(maria, { receiver_id: adminId, message: 'thank you' })).body.message.id;
    await send(jose, { receiver_id: adminId, message: 'unrelated question' });
    await q('UPDATE messages SET created_at = NOW() - INTERVAL 3 HOUR WHERE id = ?', [oldHit]);
    await q('UPDATE messages SET created_at = NOW() - INTERVAL 2 HOUR WHERE id = ?', [newHit]);
    await q('UPDATE messages SET created_at = NOW() - INTERVAL 1 HOUR WHERE id = ?', [last]);

    const byText = await list(admin, { search: 'faucet' });
    expect(byText).toHaveLength(1);
    expect(byText[0]).toMatchObject({ other_user_id: MARIA, last_message: 'thank you', matched_message: 'the faucet is still broken', matched_message_id: newHit });

    // By the person's name (no message needs to match).
    const byName = await list(admin, { search: 'jose' });
    expect(byName.map((r) => r.other_user_id)).toEqual([JOSE]);
    expect(byName[0].matched_message).toBeNull();
    expect(await list(admin, { search: 'zzz-nothing-matches' })).toEqual([]);
  });

  it('keeps the attachment of the last message and the archived flag for a quiet non-tenant', async () => {
    await q('DELETE FROM messages');
    const id = (await send(maria, { receiver_id: adminId, message: 'has a file' })).body.message.id;
    await q("UPDATE messages SET attachment_path = 'uploads/messages/x.png' WHERE id = ?", [id]);
    expect(row(await list(admin), MARIA).last_message_attachment_path).toBe('uploads/messages/x.png');
    expect(row(await list(admin), MARIA).archived).toBe(false); // an active tenant is never archived
  });
});
