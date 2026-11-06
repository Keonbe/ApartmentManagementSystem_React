// Free-text round trip (INP-03, INP-09 .. INP-13): accents, CJK, RTL, emoji, apostrophes, backslashes,
// percent signs, markup and SQL fragments must come back exactly as sent, on the tenant- and
// guest-facing text fields. QA guide rows Q1-07, Q4-03.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

const PAYLOADS = {
  accents_cjk_emoji: 'Zoë 李雷 😀',
  rtl: 'مرحبا שלום',
  apostrophe_backslash_percent: "O'Brien a\\b 100%",
  markup: '<img src=x onerror=alert(1)><script>alert(2)</script>',
  sql: "'; DROP TABLE users;-- ' OR '1'='1",
  template: '{{7*7}} ${7*7} %s %d',
};
const ALL = Object.entries(PAYLOADS);

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

let maria, admin;
beforeAll(async () => {
  [maria, admin] = await Promise.all([loginAs('maria'), loginAs('admin')]);
});
const usersAlive = async () => (await one('SELECT COUNT(*) AS n FROM users')).n > 5;

describe('maintenance request description', () => {
  it.each(ALL)('keeps %s exactly', async (_name, text) => {
    const form = new FormData();
    form.append('issueType', 'Plumbing');
    form.append('preferredDate', day(2));
    form.append('preferredTime', 'morning');
    form.append('description', text);
    const res = await api('maintenance_request.php', { token: maria, form });
    expect(res.status).toBe(200);
    const stored = await one('SELECT description FROM maintenance_requests WHERE id = ?', [res.body.id ?? res.body.request_id ?? (await one('SELECT MAX(id) AS id FROM maintenance_requests')).id]);
    expect(stored.description).toBe(text);
    expect(await usersAlive()).toBe(true);
  });

  it('refuses a description that is only whitespace, tabs and newlines (INP-05)', async () => {
    const form = new FormData();
    form.append('issueType', 'Plumbing');
    form.append('preferredDate', day(2));
    form.append('preferredTime', 'morning');
    form.append('description', ' \t\n  ');
    expect((await api('maintenance_request.php', { token: maria, form })).status).toBe(422);
  });
});

describe('visitor pre-registration', () => {
  const register = (over) => api('check_in_visitor.php', {
    token: maria,
    json: {
      visitorName: 'Guest', contactNumber: '09171234567', purpose: 'Family visit', idType: 'National ID', idNumber: 'N-123',
      expectedAt: local(new Date(Date.now() + 3600e3)), expectedCheckOutAt: local(new Date(Date.now() + 5 * 3600e3)),
      ...over,
    },
  });

  it.each(ALL)('keeps %s exactly in name and purpose', async (_name, text) => {
    const res = await register({ visitorName: text.slice(0, 100), purpose: text });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    const stored = await one('SELECT visitor_name, purpose FROM visitor_logs ORDER BY id DESC LIMIT 1');
    expect(stored).toEqual({ visitor_name: text.slice(0, 100), purpose: text });
    expect(await usersAlive()).toBe(true);
  });

  it.each([
    ['blank name', { visitorName: '   ' }],
    ['name over 150 characters', { visitorName: 'x'.repeat(151) }],
    ['purpose over 255 characters', { purpose: 'x'.repeat(256) }],
    ['letters in the phone number', { contactNumber: '12-ab' }],
    ['unknown ID type', { idType: 'Library card' }],
  ])('rejects %s', async (_n, over) => {
    const res = await register(over);
    expect(res.status).toBe(422);
  });

  it('accepts a name of exactly 150 characters, counted in characters not bytes', async () => {
    const name = '李'.repeat(150); // 450 bytes
    expect((await register({ visitorName: name })).status).toBe(200);
    expect((await one('SELECT visitor_name FROM visitor_logs ORDER BY id DESC LIMIT 1')).visitor_name).toBe(name);
  });
});

describe('guest inquiry', () => {
  let n = 0;
  const inquire = (over) => api('submit_inquiry.php', {
    // each call is its own guest so the per-email and per-IP limits stay out of the way
    json: { full_name: 'Guest', email: `unicode.guest${++n}@demo.example`, contact_no: '09171234500', message: 'Hello', ...over },
    headers: { 'X-Forwarded-For': `10.0.0.${n}` },
  });

  it.each(ALL.slice(0, 3))('keeps %s exactly in name and message', async (_name, text) => {
    // the per-IP limit is 3 per day, so each case checks the response then the row
    await q("UPDATE inquiries SET ip_address = NULL");
    const res = await inquire({ full_name: text.slice(0, 100), message: text });
    expect(res.body.success, res.text.slice(0, 200)).toBe(true);
    const stored = await one("SELECT full_name, message FROM inquiries WHERE email LIKE 'unicode.guest%' ORDER BY id DESC LIMIT 1");
    expect(stored).toEqual({ full_name: text.slice(0, 100), message: text });
  });

  it('keeps markup and SQL text inert', async () => {
    for (const [, text] of ALL.slice(3, 6)) {
      await q('UPDATE inquiries SET ip_address = NULL');
      const res = await inquire({ message: text });
      expect(res.body.success).toBe(true);
      expect((await one("SELECT message FROM inquiries WHERE email LIKE 'unicode.guest%' ORDER BY id DESC LIMIT 1")).message).toBe(text);
    }
    expect(await usersAlive()).toBe(true);
  });

  it.each([
    ['blank name', { full_name: '   ' }],
    ['email missing the domain', { email: 'guest@' }],
    ['email with a space', { email: 'gu est@demo.example' }],
    ['non-mobile number', { contact_no: '12-ab' }],
    ['0 occupants', { occupants: 0 }],
    ['21 occupants', { occupants: 21 }],
    ['malformed move-in date', { preferred_move_in: '12/31/2031' }],
  ])('rejects %s without saving', async (_n, over) => {
    await q('UPDATE inquiries SET ip_address = NULL');
    const before = (await one('SELECT COUNT(*) AS n FROM inquiries')).n;
    const res = await inquire(over);
    expect(res.body.success).toBe(false);
    expect((await one('SELECT COUNT(*) AS n FROM inquiries')).n).toBe(before);
  });

  it('the honeypot field gets a success reply and saves nothing', async () => {
    const before = (await one('SELECT COUNT(*) AS n FROM inquiries')).n;
    const res = await inquire({ website: 'http://spam.example' });
    expect(res.body.success).toBe(true);
    expect((await one('SELECT COUNT(*) AS n FROM inquiries')).n).toBe(before);
  });
});

describe('what the admin sees back', () => {
  it('returns stored markup as JSON text, never as an executable response', async () => {
    const res = await api('get_inquiries.php', { token: admin });
    expect(res.status).toBe(200);
    expect(String(res.text)).toContain('onerror=alert(1)'); // present as data
    expect(res.text.trimStart().startsWith('{')).toBe(true); // a JSON body, not HTML
  });
});
