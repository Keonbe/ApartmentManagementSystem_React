// Guest inquiry chat (#25): a repeat inquiry never receives an existing
// conversation's token, one-time "continue" links (guest_chat_resume.php), and
// reply emails throttled to one per batch the guest has not seen.
import { createHash } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin;
let seq = 0;

// A guest thread built straight in the DB (submit_inquiry.php is limited to 3 per IP a day).
async function addGuestThread() {
  seq += 1;
  const token = (String(seq).padStart(2, '0') + 'cd'.repeat(31)).slice(0, 64);
  const email = `owner${seq}@example.com`;
  const phone = '+63918' + String(2000000 + seq);
  const res = await q(
    "INSERT INTO inquiries (full_name, email, contact_no, status, thread_type, guest_token, guest_name, guest_email, guest_phone) VALUES (?, ?, ?, 'New', 'guest', ?, ?, ?, ?)",
    [`Owner ${seq}`, email, phone, token, `Owner ${seq}`, email, phone],
  );
  await q("INSERT INTO guest_messages (inquiry_id, sender_role, message) VALUES (?, 'guest', 'private question')", [res.insertId]);
  return { id: res.insertId, token, email, phone };
}

// A link whose raw code the test knows (only the hash is stored).
async function addLink(threadId, { expired = false, used = false } = {}) {
  seq += 1;
  const code = (String(seq).padStart(4, '0') + 'ef'.repeat(30)).slice(0, 64);
  await q(
    `INSERT INTO guest_chat_links (inquiry_id, token_hash, expires_at, used_at) VALUES (?, ?, ${expired ? 'NOW() - INTERVAL 1 DAY' : 'NOW() + INTERVAL 7 DAY'}, ${used ? 'NOW()' : 'NULL'})`,
    [threadId, createHash('sha256').update(code).digest('hex')],
  );
  return code;
}

const inquire = (fields) => api('submit_inquiry.php', { json: { full_name: 'Someone Else', message: 'Can I see the chat?', ...fields } });
const resume = (json) => api('guest_chat_resume.php', { json });
const messageCount = async (id) => (await one('SELECT COUNT(*) AS c FROM guest_messages WHERE inquiry_id = ?', [id])).c;
const liveLinks = async (id) => (await one('SELECT COUNT(*) AS c FROM guest_chat_links WHERE inquiry_id = ? AND used_at IS NULL', [id])).c;

beforeAll(async () => {
  admin = await loginAs('admin');
});

describe('a repeat inquiry does not open someone else\'s conversation (token leak fix)', () => {
  it('same email: no token, nothing added to the thread, a link for the stored email', async () => {
    const owner = await addGuestThread();
    const res = await inquire({ email: owner.email, contact_no: '+639171230001' });
    expect(res.status).toBe(200);
    expect(res.body.guest_token).toBeNull();
    expect(res.body.existing_thread).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(owner.token);
    expect(await messageCount(owner.id)).toBe(1);
    const row = await one('SELECT thread_type, guest_token, matched_thread_id FROM inquiries WHERE id = ?', [res.body.inquiry_id]);
    expect(row).toMatchObject({ thread_type: 'registered', guest_token: null, matched_thread_id: owner.id });
    expect(await liveLinks(owner.id)).toBe(1);
  });

  it('same phone, different email: same result', async () => {
    const owner = await addGuestThread();
    const res = await inquire({ email: 'attacker@example.com', contact_no: owner.phone });
    expect(res.body.guest_token).toBeNull();
    expect(res.body.existing_thread).toBe(true);
    expect(await messageCount(owner.id)).toBe(1);
  });

  it('a new email and phone still get their own conversation and token', async () => {
    const res = await inquire({ email: 'brand.new@example.com', contact_no: '+639171239999' });
    expect(res.body.guest_token).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.existing_thread).toBe(false);
    expect(await messageCount(res.body.inquiry_id)).toBe(1);
  });
});

describe('guest_chat_resume.php request', () => {
  it('answers the same for a known and an unknown email; only the known one gets a link', async () => {
    const owner = await addGuestThread();
    const known = await resume({ action: 'request', email: owner.email.toUpperCase() });
    const unknown = await resume({ action: 'request', email: 'nobody.here@example.com' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(await liveLinks(owner.id)).toBe(1);
  });

  it('a new link cancels the older unused one', async () => {
    const owner = await addGuestThread();
    await resume({ action: 'request', email: owner.email });
    await resume({ action: 'request', email: owner.email });
    expect(await liveLinks(owner.id)).toBe(1);
  });

  it('limits requests per email (429 on the fourth within an hour)', async () => {
    const owner = await addGuestThread();
    for (let i = 0; i < 3; i += 1) expect((await resume({ action: 'request', email: owner.email })).status).toBe(200);
    expect((await resume({ action: 'request', email: owner.email })).status).toBe(429);
  });

  it('refuses a malformed email and an unknown action (422 with the field)', async () => {
    const bad = await resume({ action: 'request', email: 'not-an-email' });
    expect(bad.status).toBe(422);
    expect(bad.body.errors.email).toBeTruthy();
    expect((await resume({ action: 'steal' })).body.errors.action).toBeTruthy();
  });
});

describe('guest_chat_resume.php redeem', () => {
  it('a valid code returns the token once and marks the guest verified', async () => {
    const owner = await addGuestThread();
    const code = await addLink(owner.id);
    const first = await resume({ action: 'redeem', code });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ success: true, guest_token: owner.token, thread_id: owner.id });
    expect((await one('SELECT guest_verified_at FROM inquiries WHERE id = ?', [owner.id])).guest_verified_at).not.toBeNull();

    const again = await resume({ action: 'redeem', code });
    expect(again.status).toBe(410);
  });

  it('an expired or already used code is refused (410)', async () => {
    const owner = await addGuestThread();
    expect((await resume({ action: 'redeem', code: await addLink(owner.id, { expired: true }) })).status).toBe(410);
    expect((await resume({ action: 'redeem', code: await addLink(owner.id, { used: true }) })).status).toBe(410);
    expect((await resume({ action: 'redeem', code: 'f'.repeat(64) })).status).toBe(410);
  });

  it('a malformed code is a 422', async () => {
    expect((await resume({ action: 'redeem', code: 'abc' })).status).toBe(422);
  });
});

describe('reply emails', () => {
  const emailedAt = async (id) => (await one('SELECT guest_reply_emailed_at AS t FROM inquiries WHERE id = ?', [id])).t;
  const adminReply = (id, message) => api('guest_chat.php', { token: admin, json: { thread_id: id, message } });

  it('one email per batch of replies the guest has not seen', async () => {
    const owner = await addGuestThread();
    expect((await adminReply(owner.id, 'Hello, the unit is available.')).status).toBe(200);
    expect(await emailedAt(owner.id)).not.toBeNull();
    expect(await liveLinks(owner.id)).toBe(1);

    // A second reply before the guest opens the chat sends nothing new.
    await q('UPDATE guest_chat_links SET used_at = NOW() WHERE inquiry_id = ?', [owner.id]);
    await adminReply(owner.id, 'Also, parking is free.');
    expect(await liveLinks(owner.id)).toBe(0);

    // The guest opens the chat: the next reply emails again.
    expect((await api('guest_chat.php', { headers: { 'X-Guest-Token': owner.token } })).status).toBe(200);
    expect(await emailedAt(owner.id)).toBeNull();
    await adminReply(owner.id, 'See you Saturday.');
    expect(await emailedAt(owner.id)).not.toBeNull();
    expect(await liveLinks(owner.id)).toBe(1);
  });
});
