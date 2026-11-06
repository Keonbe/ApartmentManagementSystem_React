// send_message.php (and its alias save_message.php), get_chat_history.php, get_conversations.php.
// The chat endpoints read X-User-Id, which config.php rewrites from the session, so the identity is the
// bearer token's. QA guide: chat section (C10).
import { describe, it, expect, beforeAll } from 'vitest';
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

describe('send_message.php', () => {
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
