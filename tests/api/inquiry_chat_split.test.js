// Inquiry chats stay on the Inquiries page (2026-11-23): get_conversations.php marks
// an account holder who never applied as is_prospect (the admin chat widget leaves
// them out, like guest threads), and the Dashboard / sidebar count
// inquiry_messages counts inquiries whose prospect wrote again and nobody read it:
// a guest thread, or a prospect account. A tenant's unread chat is not one of them
// (it counts on Messages). Opening the inquiry's chat reads it and takes it off.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, adminId, mariaId;
let seq = 0;

const inquiryMessages = async () =>
  Number((await api('dashboard_stats.php', { token: admin, query: { section: 'attention' } })).body.attention.inquiry_messages);

async function addProspect() {
  seq += 1;
  const res = await q(
    "INSERT INTO users (first_name, last_name, email_address, password, role) VALUES ('Split', ?, ?, 'x', 'user')",
    [`Prospect${seq}`, `split.prospect${seq}.${Date.now()}@demo.example`],
  );
  return res.insertId;
}
async function addInquiry({ guest = false, userId = null } = {}) {
  seq += 1;
  const token = guest ? (String(seq).padStart(4, '0') + 'ef'.repeat(30)).slice(0, 64) : null;
  const res = await q(
    `INSERT INTO inquiries (user_id, full_name, email, contact_no, message, source, status, thread_type, guest_token, guest_name, guest_email, guest_phone, created_at)
     VALUES (?, ?, ?, ?, 'Is the unit free?', 'web', 'Contacted', ?, ?, ?, ?, ?, NOW() - INTERVAL 1 HOUR)`,
    [userId, `Split ${seq}`, `split${seq}@demo.example`, `+6391790${String(seq).padStart(5, '0')}`,
      guest ? 'guest' : 'registered', token, guest ? `Split ${seq}` : null, guest ? `split${seq}@demo.example` : null, guest ? `+6391790${String(seq).padStart(5, '0')}` : null],
  );
  return res.insertId;
}
const messageAdmin = (fromId, text) =>
  q('INSERT INTO messages (sender_id, receiver_id, message, is_read) VALUES (?, ?, ?, 0)', [fromId, adminId, text]);

beforeAll(async () => {
  admin = await loginAs('admin');
  adminId = (await one("SELECT id FROM users WHERE role = 'admin' AND is_archived = 0 ORDER BY id LIMIT 1")).id;
  mariaId = (await one("SELECT u.id FROM users u JOIN rent_applications ra ON ra.user_id = u.id WHERE LOWER(ra.status) = 'active' ORDER BY u.id LIMIT 1")).id;
});

describe('get_conversations.php is_prospect', () => {
  it('is true for an account that never applied and false for a tenant', async () => {
    const prospect = await addProspect();
    await messageAdmin(prospect, 'Hi, I sent an inquiry about Unit J');
    await messageAdmin(mariaId, 'Hello po');
    const res = await api('get_conversations.php', { token: admin });
    expect(res.status).toBe(200);
    const rows = res.body.conversations;
    expect(rows.find((r) => r.other_user_id === prospect)).toMatchObject({ is_prospect: true });
    expect(rows.find((r) => r.other_user_id === mariaId)).toMatchObject({ is_prospect: false });
  });
});

describe('dashboard_stats.php inquiry_messages', () => {
  it('counts a guest thread with an unread guest message, once, until the chat is opened', async () => {
    const before = await inquiryMessages();
    const id = await addInquiry({ guest: true });
    await q("INSERT INTO guest_messages (inquiry_id, sender_role, message) VALUES (?, 'guest', 'Hello again'), (?, 'guest', 'Still free?')", [id, id]);
    expect(await inquiryMessages()).toBe(before + 1); // two messages, one inquiry

    expect((await api('inquiry_thread.php', { token: admin, query: { id } })).status).toBe(200);
    expect(await inquiryMessages()).toBe(before);
  });

  it("counts a prospect account's new message, not a tenant's", async () => {
    const prospect = await addProspect();
    const inquiryId = await addInquiry({ userId: prospect });
    const rowUnread = async () => (await api('get_inquiries.php', { token: admin })).body.inquiries.find((i) => Number(i.id) === inquiryId).unreadCount;
    const before = await inquiryMessages();
    await messageAdmin(prospect, 'Is the viewing still on?');
    expect(await inquiryMessages()).toBe(before + 1);
    expect(await rowUnread()).toBe(1); // the red count on the Inquiries row

    await messageAdmin(mariaId, 'Unrelated tenant question');
    expect(await inquiryMessages()).toBe(before + 1);

    // Once they apply they are an applicant: their chat is a tenant chat, not an inquiry.
    await q(
      `INSERT INTO rent_applications (user_id, first_name, last_name, contact_no, email, gender, occupants, months_of_rent, room_name, monthly_rent, status)
       VALUES (?, 'Split', 'Prospect', '+639170000000', 'split.applicant@demo.example', 'Female', 1, 12, 'J', 3500, 'Pending Review')`,
      [prospect],
    );
    expect(await inquiryMessages()).toBe(before);
    expect(await rowUnread()).toBe(0);
  });
});
