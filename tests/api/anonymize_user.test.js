// Erasure of a former tenant's personal data (SPRINT 177, RA 10173):
// manage_users.php action=anonymize, anonymize_user() in config.php, the refusals,
// and TERMS_VERSION (stamped at registration and on a rent application).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HASH = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy'; // tenant123
const ID = 8801;       // erased in the happy path
const OPEN_ID = 8802;  // archived, still owes a bill
const LIVE_ID = 8803;  // not archived
const ADMIN_ID_ROW = 8804; // an archived admin
const EMAIL = 'erase.me@demo.example';
const UPLOAD_DIR = path.join(ROOT, 'backend/uploads/documents');
const FILE = 'anon-test-doc.pdf';

let admin, maria;
const anonymize = (token, user_id, confirm = 'ANONYMIZE') => api('manage_users.php', { token, json: { action: 'anonymize', user_id, confirm } });

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
  for (const [id, email, role, archived] of [
    [ID, EMAIL, 'user', 1], [OPEN_ID, 'erase.owes@demo.example', 'user', 1],
    [LIVE_ID, 'erase.live@demo.example', 'user', 0], [ADMIN_ID_ROW, 'erase.admin@demo.example', 'admin', 1],
  ]) {
    await q(`INSERT INTO users (id, first_name, last_name, contact_no, gender, email_address, password, role, email_verified_at, is_archived, emergency_name, emergency_phone)
             VALUES (?, 'Erin', 'Eraseme', '+63 9171234888', 'Female', ?, ?, ?, NOW(), ?, 'Mom Eraseme', '+63 9171234889')`, [id, email, HASH, role, archived]);
  }
  // A closed application with a document, an invoice paid in full, a message and a session.
  const room = (await one('SELECT id FROM rooms ORDER BY id LIMIT 1')).id;
  await q(`INSERT INTO rent_applications (id, user_id, first_name, last_name, contact_no, email, gender, occupants, months_of_rent, room_name, monthly_rent, status, previous_address, created_at)
           VALUES (88011, ?, 'Erin', 'Eraseme', '+63 9171234888', ?, 'Female', 1, 6, ?, 5000, 'moved-out', '12 Old Street', NOW())`, [ID, EMAIL, room]);
  await q(`INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date)
           VALUES ('INV-ANON-1', ?, 88011, 5000, 5000, 5000, 'Monthly', 'paid', CURDATE() - INTERVAL 30 DAY)`, [ID]);
  await q(`INSERT INTO invoices (id, user_id, base_rent, total_amount, amount_paid, billing_period, status, due_date)
           VALUES ('INV-ANON-2', ?, 3000, 3000, 0, 'Monthly', 'scheduled', CURDATE() + INTERVAL 5 DAY)`, [OPEN_ID]);
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, FILE), 'x');
  await q(`INSERT INTO application_documents (rent_application_id, requirement_id, label_snapshot, file_path) VALUES (88011, (SELECT id FROM application_requirements LIMIT 1), 'Valid ID', ?)`, [`uploads/documents/${FILE}`]);
  const adminId = (await one("SELECT id FROM users WHERE email_address = 'admin@gmail.com'")).id;
  await q("INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, 'My phone is 0917 123 4888')", [ID, adminId]);
  await q("INSERT INTO sessions (user_id, role, token, expires_at) VALUES (?, 'user', REPEAT('b', 64), NOW() + INTERVAL 1 DAY)", [ID]);
});

afterAll(() => { fs.rmSync(path.join(UPLOAD_DIR, FILE), { force: true }); });

describe('manage_users.php action=anonymize: refusals', () => {
  it('is for the admin only', async () => {
    expect((await anonymize(maria, ID)).status).toBe(403);
    expect((await anonymize(undefined, ID)).status).toBe(401);
    expect((await one('SELECT anonymized_at FROM users WHERE id = ?', [ID])).anonymized_at).toBeNull();
  });

  it('needs the typed confirmation', async () => {
    expect((await anonymize(admin, ID, '')).status).toBe(422);
    expect((await anonymize(admin, ID, 'anonymize')).status).toBe(422);
  });

  it.each([
    ['an account that is not archived', LIVE_ID, /Archive the account first/],
    ['an admin account', ADMIN_ID_ROW, /Admin accounts/],
    ['an account that still owes a bill', OPEN_ID, /bill still owed/],
  ])('refuses %s with 409 and changes nothing', async (_l, id, msg) => {
    const res = await anonymize(admin, id);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(msg);
    expect((await one('SELECT first_name, anonymized_at FROM users WHERE id = ?', [id]))).toEqual({ first_name: 'Erin', anonymized_at: null });
  });
});

describe('manage_users.php action=anonymize: erasure', () => {
  it('erases the personal data and keeps the billing records', async () => {
    const res = await anonymize(admin, ID);
    expect(res.status).toBe(200);

    const u = await one('SELECT first_name, last_name, contact_no, email_address, emergency_name, emergency_phone, is_archived, anonymized_at FROM users WHERE id = ?', [ID]);
    expect(u).toMatchObject({ first_name: 'Former', last_name: `Tenant #${ID}`, contact_no: null, email_address: `anonymized-${ID}@invalid.local`, emergency_name: null, emergency_phone: null, is_archived: 1 });
    expect(u.anonymized_at).not.toBeNull();

    const app = await one('SELECT first_name, last_name, email, previous_address FROM rent_applications WHERE id = 88011');
    expect(app).toEqual({ first_name: 'Former', last_name: 'Tenant', email: `anonymized-${ID}@invalid.local`, previous_address: null });
    expect((await one('SELECT COUNT(*) AS c FROM application_documents WHERE rent_application_id = 88011')).c).toBe(0);
    expect(fs.existsSync(path.join(UPLOAD_DIR, FILE))).toBe(false);
    expect((await one('SELECT message FROM messages WHERE sender_id = ?', [ID])).message).toBe('[removed]');
    expect((await one('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?', [ID])).c).toBe(0);

    // Kept: the invoice and the application row.
    expect(await one("SELECT total_amount, amount_paid, status FROM invoices WHERE id = 'INV-ANON-1'")).toEqual({ total_amount: '5000.00', amount_paid: '5000.00', status: 'paid' });

    // The activity log names the account id and no personal data.
    const log = await one("SELECT details FROM activity_logs WHERE action = 'Anonymized User' ORDER BY id DESC LIMIT 1");
    expect(log.details).toContain(`User ID ${ID}`);
    expect(log.details).not.toContain('Erin');
    expect(log.details).not.toContain(EMAIL);
  });

  it('cannot sign in with the old email, and a second call is refused', async () => {
    const signIn = await api('login.php', { json: { email_address: EMAIL, password: 'tenant123' } });
    expect(signIn.body.sessionToken).toBeUndefined();
    const again = await anonymize(admin, ID);
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already anonymized/);
  });

  it('cannot be restored, from the user list or as a tenant', async () => {
    const un = await api('manage_users.php', { token: admin, json: { action: 'unarchive', user_id: ID } });
    expect(un.status).toBe(409);
    expect(un.body.message).toMatch(/anonymized/);
    const rt = await api('restore_tenant.php', { token: admin, json: { id: 88011 } });
    expect(rt.status).toBe(409);
    expect((await one('SELECT is_archived FROM users WHERE id = ?', [ID])).is_archived).toBe(1);
  });

  it('the user list marks the account as anonymized', async () => {
    const list = await api('manage_users.php', { token: admin });
    const row = (list.body.users ?? list.body.data ?? []).find((x) => Number(x.id) === ID);
    expect(row?.is_anonymized).toBe(true);
  });
});

describe('TERMS_VERSION', () => {
  const stamp = async () => (await one("SELECT terms_version FROM users WHERE email_address = 'terms.stamp@demo.example'")).terms_version;

  it('registration stamps it, and it matches the "Last updated" date of the Terms', async () => {
    const res = await api('registration.php', { json: {
      first_name: 'Tess', last_name: 'Stamp', email_address: 'terms.stamp@demo.example', password: 'Tenant#1234', conPassword: 'Tenant#1234', agree_terms: true,
    } });
    expect(res.status).toBeLessThan(300);
    const version = await stamp();
    expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const src = fs.readFileSync(path.join(ROOT, 'ams-react/src/config/legalContent.js'), 'utf8');
    const m = src.match(/UPDATED_EN = 'Last updated: (\w+) (\d+), (\d{4})'/);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const shown = `${m[3]}-${String(months.indexOf(m[1]) + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
    expect(version).toBe(shown);
  });
});
