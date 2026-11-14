// websocket-server/server.js: the real-time chat relay must be as strict as the
// REST endpoints (audit S-11 / security_audit CH-1). A connection needs a live
// session token, the sender is the session's user whatever the payload claims,
// and a message passes the same checks as send_message.php.
// The server runs as its own Node process against the scratch ams_test.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { io } from 'socket.io-client';
import { loginAs, api } from './lib/api.js';
import { q, one } from './lib/db.js';
import { ROOT, DB } from './lib/env.js';

const SOCKET_PORT = Number(process.env.TEST_SOCKET_PORT || 3091);
const URL = `http://127.0.0.1:${SOCKET_PORT}`;
const MARIA = 2;
const JOSE = 3;

let server, admin, maria, jose, adminId;
const clients = [];

function connect(token, { wait = true } = {}) {
  const socket = io(URL, { transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true });
  clients.push(socket);
  if (!wait) return socket;
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}
const next = (socket, event, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no "${event}" within ${ms} ms`)), ms);
  socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
});
const silent = (socket, event, ms = 600) => new Promise((resolve) => {
  let got = false;
  socket.once(event, () => { got = true; });
  setTimeout(() => resolve(!got), ms);
});
const send = (socket, payload) => new Promise((resolve) => socket.emit('send_message', payload, resolve));
const countMessages = async () => (await one('SELECT COUNT(*) AS c FROM messages')).c;

beforeAll(async () => {
  server = spawn(process.execPath, [path.join(ROOT, 'websocket-server/server.js')], {
    cwd: path.join(ROOT, 'websocket-server'),
    env: {
      ...process.env,
      PORT: String(SOCKET_PORT),
      DB_HOST: DB.host, DB_PORT: String(DB.port), DB_USER: DB.user, DB_PASSWORD: DB.password, DB_NAME: DB.database,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (c) => { log += c; });
  server.stderr.on('data', (c) => { log += c; });
  for (let i = 0; i < 100 && !log.includes('running on port'); i++) await new Promise((r) => setTimeout(r, 100));
  if (!log.includes('running on port')) throw new Error(`chat server did not start:\n${log}`);
  server.output = () => log;

  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
  adminId = (await one("SELECT id FROM users WHERE email_address = 'admin@gmail.com'")).id;
});

afterAll(() => {
  clients.forEach((s) => s.close());
  server?.kill();
});

describe('connecting', () => {
  it('refuses a connection with no token, a malformed one, or one that is not a session', async () => {
    await expect(connect(undefined)).rejects.toThrow('unauthorized');
    await expect(connect('not-a-token')).rejects.toThrow('unauthorized');
    await expect(connect('a'.repeat(64))).rejects.toThrow('unauthorized');
  });

  it('refuses an expired session and an archived user', async () => {
    await q("UPDATE sessions SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE token = ?", [jose]);
    await expect(connect(jose)).rejects.toThrow('unauthorized');
    const fresh = await loginAs('jose');
    await q("UPDATE users SET is_archived = 1 WHERE id = ?", [JOSE]);
    await expect(connect(fresh)).rejects.toThrow('unauthorized');
    await q("UPDATE users SET is_archived = 0 WHERE id = ?", [JOSE]);
    jose = fresh;
  });

  it('accepts a live session', async () => {
    const socket = await connect(maria);
    expect(socket.connected).toBe(true);
  });
});

describe('sending', () => {
  it('stores the message from the session user, whatever sender_id the payload claims', async () => {
    const [mariaSock, joseSock] = await Promise.all([connect(maria), connect(jose)]);
    const incoming = next(joseSock, 'receive_message');
    const ack = await send(mariaSock, { sender_id: JOSE, receiver_id: JOSE, message: ' hello from maria ' });
    expect(ack.ok).toBe(true);

    const got = await incoming;
    expect(got).toMatchObject({ sender_id: MARIA, receiver_id: JOSE, message: 'hello from maria' });
    const row = await one('SELECT sender_id, receiver_id, message FROM messages WHERE id = ?', [got.id]);
    expect(row).toEqual({ sender_id: MARIA, receiver_id: JOSE, message: 'hello from maria' });

    const log = await one("SELECT performed_by, category, details FROM activity_logs WHERE action = 'send_message' ORDER BY id DESC LIMIT 1");
    expect(log).toEqual({ performed_by: MARIA, category: 'system', details: `Messaged user ${JOSE}` });
  });

  it('a third user never receives it, and cannot join someone else\'s room', async () => {
    const [mariaSock, adminSock] = await Promise.all([connect(maria), connect(admin)]);
    adminSock.emit('join', JOSE); // the old trusting handshake: the id is ignored now
    const quiet = silent(adminSock, 'receive_message');
    const ack = await send(mariaSock, { receiver_id: JOSE, message: 'private to jose' });
    expect(ack.ok).toBe(true);
    expect(await quiet).toBe(true);
  });

  it('a typing signal carries the session user, not a claimed id', async () => {
    const [mariaSock, joseSock] = await Promise.all([connect(maria), connect(jose)]);
    const typing = next(joseSock, 'user_typing');
    mariaSock.emit('typing', { sender_id: adminId, receiver_id: JOSE, is_typing: true });
    expect(await typing).toEqual({ sender_id: MARIA });
  });

  it('refuses what send_message.php refuses, and stores nothing', async () => {
    const socket = await connect(maria);
    const before = await countMessages();
    const cases = [
      [{ receiver_id: JOSE, message: '   ' }, /Missing required fields/],
      [{ receiver_id: MARIA, message: 'to myself' }, /yourself/],
      [{ receiver_id: 999999, message: 'nobody' }, /User not found/],
      [{ receiver_id: JOSE, message: 'x'.repeat(2001) }, /2000 characters/],
      [{ receiver_id: JOSE, message: 'reply', reply_to_id: 999999 }, /Reply target/],
    ];
    for (const [payload, message] of cases) {
      const ack = await send(socket, payload);
      expect(ack.ok).toBe(false);
      expect(ack.error).toMatch(message);
    }
    expect(await countMessages()).toBe(before);

    // Exactly the limit is fine.
    expect((await send(socket, { receiver_id: JOSE, message: 'y'.repeat(2000) })).ok).toBe(true);
  });

  it('replies only inside the same conversation', async () => {
    const [mariaSock, joseSock] = await Promise.all([connect(maria), connect(jose)]);
    const first = await send(mariaSock, { receiver_id: JOSE, message: 'question' });
    expect((await send(joseSock, { receiver_id: MARIA, message: 'answer', reply_to_id: first.message.id })).ok).toBe(true);
    // The admin has no part in that conversation.
    const adminSock = await connect(admin);
    expect((await send(adminSock, { receiver_id: MARIA, message: 'sneaky', reply_to_id: first.message.id })).ok).toBe(false);
  });

  it('a session that ends stops the sender: the next message is refused and the socket closed', async () => {
    const token = await loginAs('maria');
    const socket = await connect(token);
    expect((await send(socket, { receiver_id: JOSE, message: 'still signed in' })).ok).toBe(true);

    await api('logout.php', { token });
    const closed = new Promise((resolve) => socket.once('disconnect', resolve));
    const before = await countMessages();
    const ack = await send(socket, { receiver_id: JOSE, message: 'after logout' });
    expect(ack).toMatchObject({ ok: false, code: 'unauthorized' });
    await closed;
    expect(await countMessages()).toBe(before);
  });

  it('slows a flood: more than 20 messages in a few seconds are refused', async () => {
    const socket = await connect(await loginAs('maria'));
    const acks = [];
    for (let i = 0; i < 24; i++) acks.push(await send(socket, { receiver_id: JOSE, message: `flood ${i}` }));
    expect(acks.filter((a) => a.ok).length).toBeLessThanOrEqual(20);
    expect(acks.some((a) => a.code === 'rate_limited')).toBe(true);
  });

  it('keeps message bodies out of the server log', async () => {
    const socket = await connect(await loginAs('maria'));
    await send(socket, { receiver_id: JOSE, message: 'a-secret-body-1234' });
    expect(server.output()).not.toContain('a-secret-body-1234');
  });
});

describe('complaints over the socket (SPRINT 189)', () => {
  it('a message between a tenant and the office follows the tenant\'s open complaint; others do not', async () => {
    const filed = await api('file_complaint.php', { token: maria, json: { category: 'Noise', message: 'Loud music from the unit above' } });
    const complaintId = filed.body.complaint.id;
    const [mariaSock, joseSock] = await Promise.all([connect(maria), connect(jose)]);

    const toOffice = await send(mariaSock, { receiver_id: adminId, message: 'It happened again tonight' });
    expect(toOffice.message.complaint_id).toBe(complaintId);
    expect((await one('SELECT complaint_id FROM messages WHERE id = ?', [toOffice.message.id])).complaint_id).toBe(complaintId);

    // To another tenant, or from a tenant with no complaint: ordinary chat.
    const toNeighbour = await send(mariaSock, { receiver_id: JOSE, message: 'Hi Jose' });
    expect(toNeighbour.message.complaint_id).toBeNull();
    const other = await send(joseSock, { receiver_id: adminId, message: 'A question about my bill' });
    expect(other.message.complaint_id).toBeNull();

    // Once resolved the thread is ordinary chat again.
    const admin2 = await loginAs('admin');
    await api('update_complaint_status.php', { token: admin2, json: { complaintId, status: 'Resolved' } });
    const after = await send(mariaSock, { receiver_id: adminId, message: 'Thank you' });
    expect(after.message.complaint_id).toBeNull();
  });
});
