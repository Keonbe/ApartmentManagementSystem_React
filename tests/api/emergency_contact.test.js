// Emergency contact (SPRINT 186): who to call if something happens to a tenant.
// Required on every rent application (name, relationship, a Philippine mobile
// that is not the applicant's own), kept on users and on the application, editable
// in Profile Settings, and shown to the admin.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, login, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';
import { EMERGENCY_FIELDS } from './lib/fixtures.js';
import { ROOT } from './lib/env.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const UPLOADS = path.join(ROOT, 'backend/uploads/applications');
const listUploads = () => (fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS) : []);

let liza, maria, admin, uploadsBefore;
beforeAll(async () => {
  [maria, admin] = await Promise.all([loginAs('maria'), loginAs('admin')]);
  liza = await login('liza.navarro@demo.example', 'tenant123'); // user 17, app 15 Cancelled: may apply again
  uploadsBefore = new Set(listUploads());
});
afterAll(() => {
  for (const f of listUploads()) if (!uploadsBefore.has(f)) fs.unlinkSync(path.join(UPLOADS, f));
});

function applicationForm(extra = {}) {
  const f = new FormData();
  const fields = {
    firstName: 'Liza', lastName: 'Navarro', contactNo: '+639171234515', email: 'liza.navarro@demo.example',
    gender: 'Female', occupants: '1', monthsOfRent: '6', roomName: 'J', monthlyRent: '3500', agreeTerms: 'true',
    previousAddress: 'Blk 4 Lot 2, Brgy. Biga, Silang, Cavite', preferredMoveInDate: '', isAsap: '1', ...EMERGENCY_FIELDS, ...extra,
  };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) f.append(k, v);
  for (const id of [1, 2]) f.append(`doc_${id}`, new Blob([PNG], { type: 'image/png' }), `doc${id}.png`);
  return f;
}
const apply = (extra) => api('rent_application.php', { token: liza, form: applicationForm(extra) });
const lizaApps = async () => (await one('SELECT COUNT(*) AS c FROM rent_applications WHERE user_id = 17')).c;

describe('rent_application.php emergency contact', () => {
  it('is required: each missing field is named, nothing is saved', async () => {
    const before = await lizaApps();
    const res = await apply({ emergencyName: undefined, emergencyRelationship: undefined, emergencyPhone: undefined });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.errors)).toEqual(expect.arrayContaining(['emergencyName', 'emergencyRelationship', 'emergencyPhone']));
    expect(await lizaApps()).toBe(before);
  });

  it.each([
    ['a name over 100 characters', { emergencyName: 'x'.repeat(101) }, 'emergencyName'],
    ['an unknown relationship', { emergencyRelationship: 'Landlord' }, 'emergencyRelationship'],
    ['a roommate (not someone who can speak for the tenant)', { emergencyRelationship: 'Roommate' }, 'emergencyRelationship'],
    ['a landline number', { emergencyPhone: '028123456' }, 'emergencyPhone'],
    ['letters as the number', { emergencyPhone: 'call mom' }, 'emergencyPhone'],
    ['the applicant\'s own number (any format)', { emergencyPhone: '0917 123 4515' }, 'emergencyPhone'],
  ])('refuses %s', async (_label, extra, field) => {
    const before = await lizaApps();
    const res = await apply(extra);
    expect(res.status).toBe(422);
    expect(res.body.errors[field]).toBeTruthy();
    expect(await lizaApps()).toBe(before);
  });

  it('refuses an array sent where one value is expected', async () => {
    const f = applicationForm();
    f.append('emergencyName[]', 'Another');
    const res = await api('rent_application.php', { token: liza, form: f });
    expect(res.status).toBe(400);
  });

  it('stores the contact (number normalized) on the application and on the account', async () => {
    const res = await apply({ emergencyName: '  Lorna Navarro ', emergencyPhone: '09189876543' });
    expect(res.body.success).toBe(true);
    const app = await one('SELECT emergency_name, emergency_relationship, emergency_phone FROM rent_applications WHERE user_id = 17 ORDER BY id DESC LIMIT 1');
    expect(app).toEqual({ emergency_name: 'Lorna Navarro', emergency_relationship: 'Parent', emergency_phone: '+639189876543' });
    const user = await one('SELECT emergency_name, emergency_relationship, emergency_phone FROM users WHERE id = 17');
    expect(user).toEqual(app);
  });

  it('the admin list shows the contact given on that application', async () => {
    const res = await api('get_applications.php', { token: admin });
    const mine = res.body.data.find((a) => a.email === 'liza.navarro@demo.example' && a.emergency_contact);
    expect(mine.emergency_contact).toEqual({ name: 'Lorna Navarro', relationship: 'Parent', phone: '+639189876543' });
    // Applications from before the field existed carry null, not an error.
    expect(res.body.data.some((a) => a.emergency_contact === null)).toBe(true);
  });
});

describe('profile.php emergency contact', () => {
  const profile = async (token) => (await api('profile.php', { token })).body.data;
  const save = async (token, extra) => {
    const p = await profile(token);
    const email = (await one('SELECT email_address FROM users WHERE id = (SELECT user_id FROM sessions WHERE token = ?)', [token])).email_address;
    return api('profile.php', { token, json: {
      email, firstName: p.first_name, middleName: p.middle_name || '', lastName: p.last_name, suffix: p.suffix || '',
      contactNo: p.contact_no || '', gender: p.gender || '', ...extra,
    } });
  };

  it('a profile saved without the fields leaves the contact alone', async () => {
    await q("UPDATE users SET emergency_name = 'Pedro Santos', emergency_relationship = 'Sibling', emergency_phone = '+639201112233' WHERE id = 2");
    expect((await save(maria, {})).body.success).toBe(true);
    expect(await profile(maria)).toMatchObject({ emergency_name: 'Pedro Santos', emergency_relationship: 'Sibling', emergency_phone: '+639201112233' });
  });

  it('updates the contact and logs that it changed (names only, never the values)', async () => {
    const res = await save(maria, { emergencyName: 'Ana Santos', emergencyRelationship: 'Spouse/Partner', emergencyPhone: '0921 000 1111' });
    expect(res.body.success).toBe(true);
    expect(await profile(maria)).toMatchObject({ emergency_name: 'Ana Santos', emergency_relationship: 'Spouse/Partner', emergency_phone: '+639210001111' });
    const log = await one("SELECT details FROM activity_logs WHERE action = 'Updated Profile' AND performed_by = 2 ORDER BY id DESC LIMIT 1");
    expect(log.details).toMatch(/emergency_name/);
    expect(log.details).not.toMatch(/Ana Santos|0001111/);
  });

  it.each([
    ['only some of the three', { emergencyName: 'Ana Santos', emergencyRelationship: '', emergencyPhone: '' }, 'emergencyRelationship'],
    ['their own number', { emergencyName: 'Ana', emergencyRelationship: 'Friend', emergencyPhone: '__OWN__' }, 'emergencyPhone'],
    ['an invalid relationship', { emergencyName: 'Ana', emergencyRelationship: 'Boss', emergencyPhone: '+639210001111' }, 'emergencyRelationship'],
  ])('refuses %s and keeps the saved contact', async (_label, extra, field) => {
    if (extra.emergencyPhone === '__OWN__') extra = { ...extra, emergencyPhone: (await profile(maria)).contact_no };
    const res = await save(maria, extra);
    expect(res.status).toBe(422);
    expect(res.body.errors[field]).toBeTruthy();
    expect(await profile(maria)).toMatchObject({ emergency_name: 'Ana Santos', emergency_phone: '+639210001111' });
  });

  it('sending all three empty clears it', async () => {
    const res = await save(maria, { emergencyName: '', emergencyRelationship: '', emergencyPhone: '' });
    expect(res.body.success).toBe(true);
    expect(await profile(maria)).toMatchObject({ emergency_name: null, emergency_relationship: null, emergency_phone: null });
  });

  it('a tenant can only ever change their own contact', async () => {
    await save(maria, { emergencyName: 'Ana Santos', emergencyRelationship: 'Friend', emergencyPhone: '+639210001111' });
    expect(await one('SELECT emergency_name FROM users WHERE id = 3')).toEqual({ emergency_name: null });
  });
});

describe('get_tenants.php emergency contact', () => {
  it('shows the tenant\'s current contact (from their profile), or null when none was ever given', async () => {
    await q("UPDATE users SET emergency_name = 'Ana Santos', emergency_relationship = 'Friend', emergency_phone = '+639210001111' WHERE id = 2");
    const res = await api('get_tenants.php', { token: admin });
    const maria = res.body.data.find((t) => t.email === 'maria.santos@demo.example');
    expect(maria.emergencyContact).toEqual({ name: 'Ana Santos', relationship: 'Friend', phone: '+639210001111' });
    expect(res.body.data.some((t) => t.emergencyContact === null)).toBe(true);
  });
});
