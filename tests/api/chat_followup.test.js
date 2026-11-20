// Follow-ups in the chat (SPRINT 226, backend/followups.php, chat_followup.php):
// "Is it resolved?" in an account chat for an inquiry or a problem report, the
// answer finishing it, a tenant marking their own report fixed, a guest's
// "Problem resolved" resolving the inquiry, the office setting Resolved, and the
// sweeps that close quiet inquiries / resolve answered reports.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria, jose, adminId;
let seq = 0;

async function addInquiry({ userId = null, status = 'New', guest = false, seen = true, ageDays = 0 } = {}) {
  seq += 1;
  const token = guest ? (String(seq).padStart(4, '0') + 'ef'.repeat(30)).slice(0, 64) : null;
  const res = await q(
    `INSERT INTO inquiries (user_id, full_name, email, contact_no, message, source, status, thread_type, guest_token, guest_name, admin_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Question', 'web', ?, ?, SHA2(?, 256), ?, ?, NOW() - INTERVAL ? DAY, NOW() - INTERVAL ? DAY)`,
    [userId, `Lead ${seq}`, `lead${seq}@demo.example`, `+6391790${String(seq).padStart(5, '0')}`, status,
      guest ? 'guest' : 'registered', token, guest ? `Lead ${seq}` : null, seen ? new Date() : null, ageDays, ageDays],
  );
  return { id: res.insertId, token };
}
async function addComplaint(userId, status = 'Open') {
  await q("UPDATE complaints SET status = 'Resolved', resolved_at = NOW() WHERE user_id = ? AND status IN ('Open', 'In Review')", [userId]);
  const res = await q('INSERT INTO complaints (user_id, category, status) VALUES (?, ?, ?)', [userId, 'Maintenance', status]);
  return res.insertId;
}
const adminSays = (to, text, extra = {}) => q('INSERT INTO messages (sender_id, receiver_id, message, created_at, complaint_id) VALUES (?, ?, ?, ?, ?)',
  [adminId, to, text, extra.at ?? new Date(), extra.complaintId ?? null]);
const ask = (topic, id, token = admin) => api('chat_followup.php', { token, json: { action: 'ask', topic, id } });
const answer = (token, messageId, ans) => api('chat_followup.php', { token, json: { action: 'answer', message_id: messageId, answer: ans } });
const inquiryStatus = async (id) => (await one('SELECT status, closed_reason FROM inquiries WHERE id = ?', [id]));
const complaintStatus = async (id) => (await one('SELECT status FROM complaints WHERE id = ?', [id])).status;

beforeAll(async () => {
  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
  adminId = (await one("SELECT id FROM users WHERE role = 'admin' AND is_archived = 0 ORDER BY id LIMIT 1")).id;
});

describe('ask if resolved (account chat)', () => {
  it('only the office asks, after answering, one open question at a time', async () => {
    const { id } = await addInquiry({ userId: 2 });
    expect((await ask('inquiry', id, maria)).status).toBe(403);
    expect((await api('chat_followup.php', { json: { action: 'ask', topic: 'inquiry', id } })).status).toBe(401);
    expect((await ask('nope', id)).status).toBe(422);
    expect((await ask('inquiry', id)).status).toBe(422); // nothing answered yet
    await adminSays(2, 'Yes, Unit I is free.');
    const first = await ask('inquiry', id);
    expect(first.status).toBe(200);
    expect(first.body.message).toEqual(expect.objectContaining({ kind: 'resolution_check', inquiry_id: id }));
    expect((await ask('inquiry', id)).status).toBe(409);
  });

  it('"Resolved" finishes the inquiry; answering twice or someone else\'s question is refused', async () => {
    const { id } = await addInquiry({ userId: 2 });
    await adminSays(2, 'It is available.');
    const mid = (await ask('inquiry', id)).body.message.id;
    expect((await answer(jose, mid, 'resolved')).status).toBe(404);
    expect((await answer(maria, mid, 'maybe')).status).toBe(422);
    expect((await answer(maria, mid, 'resolved')).status).toBe(200);
    expect((await inquiryStatus(id)).status).toBe('Resolved');
    expect((await answer(maria, mid, 'not_yet')).status).toBe(409);
    expect((await ask('inquiry', id)).status).toBe(409); // already finished
  });

  it('"Not yet" keeps the report open and puts it back in the admin queue', async () => {
    const cid = await addComplaint(3);
    await adminSays(3, 'A plumber is coming.', { complaintId: cid });
    const mid = (await ask('complaint', cid)).body.message.id;
    expect((await answer(jose, mid, 'not_yet')).status).toBe(200);
    expect(await complaintStatus(cid)).toBe('Open');
    const queued = await one("SELECT COUNT(*) AS c FROM notifications WHERE type = 'complaint' AND metadata_value = ? AND status = 'Pending'", [`complaint:still-${cid}`]);
    expect(Number(queued.c)).toBe(1);
    // Asked again later, "Resolved" closes it and clears that queue entry.
    await adminSays(3, 'Fixed now?', { complaintId: cid });
    const again = (await ask('complaint', cid)).body.message.id;
    await answer(jose, again, 'resolved');
    expect(await complaintStatus(cid)).toBe('Resolved');
  });

  it('get_chat_history.php and get_conversations.php carry the question and the topics', async () => {
    const { id } = await addInquiry({ userId: 2 });
    await adminSays(2, 'Here is the info.');
    await ask('inquiry', id);
    const hist = (await api('get_chat_history.php', { token: maria, query: { other_user_id: adminId } })).body.messages;
    expect(hist.at(-1)).toEqual(expect.objectContaining({ kind: 'resolution_check', inquiry_id: id, resolution_answer: null }));
    const convs = (await api('get_conversations.php', { token: admin })).body.conversations;
    const withMaria = convs.find((c) => Number(c.other_user_id) === 2);
    expect(withMaria.inquiry).toEqual(expect.objectContaining({ id, status: 'New', awaitingAnswer: true }));
    const mine = (await api('get_conversations.php', { token: maria })).body.conversations.find((c) => c.is_admin);
    expect(mine.inquiry).toEqual(expect.objectContaining({ id }));
  });
});

describe('finishing without a question', () => {
  it('a tenant marks their own report fixed; not someone else\'s', async () => {
    const cid = await addComplaint(2, 'In Review');
    expect((await api('chat_followup.php', { token: jose, json: { action: 'resolve_report', complaint_id: cid } })).status).toBe(404);
    expect((await api('chat_followup.php', { token: admin, json: { action: 'resolve_report', complaint_id: cid } })).status).toBe(403);
    expect((await api('chat_followup.php', { token: maria, json: { action: 'resolve_report', complaint_id: cid } })).status).toBe(200);
    expect(await complaintStatus(cid)).toBe('Resolved');
    expect((await api('chat_followup.php', { token: maria, json: { action: 'resolve_report', complaint_id: cid } })).status).toBe(409);
  });

  it('the office can set an inquiry Resolved', async () => {
    const { id } = await addInquiry();
    const res = await api('update_inquiry_status.php', { token: admin, json: { id, status: 'Resolved', closed_reason: 'Question answered' } });
    expect(res.status).toBe(200);
    expect(await inquiryStatus(id)).toEqual(expect.objectContaining({ status: 'Resolved', closed_reason: 'Question answered' }));
  });

  it('a guest answering "Problem resolved" resolves their inquiry', async () => {
    const { id, token } = await addInquiry({ guest: true });
    await q("INSERT INTO guest_messages (inquiry_id, sender_role, sender_id, message) VALUES (?, 'admin', ?, 'Yes it is free')", [id, adminId]);
    const check = await api('guest_chat.php', { token: admin, json: { thread_id: id, action: 'resolution_check' } });
    expect(check.status).toBe(200);
    const res = await api('guest_chat.php', { headers: { 'X-Guest-Token': token }, json: { action: 'resolution_answer', message_id: check.body.message.id, answer: 'resolved' } });
    expect(res.status).toBe(200);
    expect((await inquiryStatus(id)).status).toBe('Resolved');
  });
});

describe('the follow-up sweep (get_inquiries.php)', () => {
  it('closes a quiet opened inquiry, keeps a never-opened one and a recent one', async () => {
    await q("UPDATE system_settings SET setting_value = '30' WHERE setting_key = 'inquiry_auto_close_days'");
    const quiet = await addInquiry({ status: 'Contacted', ageDays: 40 });
    const unseen = await addInquiry({ seen: false, ageDays: 40 });
    const recent = await addInquiry({ status: 'Contacted', ageDays: 5 });
    const scheduled = await addInquiry({ status: 'Scheduled', ageDays: 40 });
    await api('get_inquiries.php', { token: admin });
    expect(await inquiryStatus(quiet.id)).toEqual(expect.objectContaining({ status: 'Closed', closed_reason: expect.stringMatching(/30 days/) }));
    expect((await inquiryStatus(unseen.id)).status).toBe('New');
    expect((await inquiryStatus(recent.id)).status).toBe('Contacted');
    expect((await inquiryStatus(scheduled.id)).status).toBe('Scheduled');
  });

  it('a recent chat message keeps an old inquiry open; 0 days turns it off', async () => {
    const chatty = await addInquiry({ userId: 2, status: 'Contacted', ageDays: 40 });
    await q('UPDATE inquiries SET created_at = NOW() - INTERVAL 40 DAY, updated_at = NOW() - INTERVAL 40 DAY WHERE id = ?', [chatty.id]);
    await q('INSERT INTO messages (sender_id, receiver_id, message) VALUES (2, ?, ?)', [adminId, 'Still interested!']);
    await api('get_inquiries.php', { token: admin });
    expect((await inquiryStatus(chatty.id)).status).toBe('Contacted');

    await q("UPDATE system_settings SET setting_value = '0' WHERE setting_key = 'inquiry_auto_close_days'");
    const off = await addInquiry({ status: 'Contacted', ageDays: 400 });
    await api('get_inquiries.php', { token: admin });
    expect((await inquiryStatus(off.id)).status).toBe('Contacted');
    await q("UPDATE system_settings SET setting_value = '30' WHERE setting_key = 'inquiry_auto_close_days'");
  });

  it('resolves a report the office answered last; not one waiting on the office', async () => {
    await q("UPDATE system_settings SET setting_value = '14' WHERE setting_key = 'complaint_auto_resolve_days'");
    const answered = await addComplaint(5);
    await adminSays(5, 'Fixed it yesterday.', { complaintId: answered, at: new Date(Date.now() - 20 * 86400000) });
    const waiting = await addComplaint(13);
    await q('INSERT INTO messages (sender_id, receiver_id, message, complaint_id, created_at) VALUES (13, ?, ?, ?, NOW() - INTERVAL 20 DAY)', [adminId, 'Still broken', waiting]);
    await api('get_inquiries.php', { token: admin });
    expect(await complaintStatus(answered)).toBe('Resolved');
    expect(await complaintStatus(waiting)).toBe('Open');
  });
});

describe('settings', () => {
  it('saves 0 to 365 days and refuses the rest', async () => {
    const ok = await api('update_system_settings.php', { token: admin, json: { inquiry_auto_close_days: '45', complaint_auto_resolve_days: '0' } });
    expect(ok.status).toBe(200);
    const bad = await api('update_system_settings.php', { token: admin, json: { inquiry_auto_close_days: '366' } });
    expect(bad.status).toBe(422);
    expect((await api('update_system_settings.php', { token: maria, json: { inquiry_auto_close_days: '5' } })).status).toBe(403);
    await q("UPDATE system_settings SET setting_value = '30' WHERE setting_key = 'inquiry_auto_close_days'");
    await q("UPDATE system_settings SET setting_value = '14' WHERE setting_key = 'complaint_auto_resolve_days'");
  });
});
