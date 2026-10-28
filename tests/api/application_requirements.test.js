// Admin-defined application documents (Settings -> Application Requirements):
// manage_application_requirements.php validation, rent_application.php
// uploads per requirement (doc_<id>) plus the previous address, the approval
// gate in update_tenant_status.php and the follow-up sweep.
// Uploads land in backend/uploads/applications/ (gitignored); anything this
// file adds there is deleted afterwards.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, login, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';
import { ROOT } from './lib/env.js';

const UPLOADS = path.join(ROOT, 'backend/uploads/applications');
const listUploads = () => (fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS) : []);
// Stored paths are relative to backend/api ("../uploads/applications/x.png").
const onDisk = (stored) => fs.existsSync(path.join(ROOT, 'backend/api', stored));

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const TEXT = Buffer.from('this is not an image');

let admin, tenant, liza, ramon, uploadsBefore;
const FRONT = 1;
const BACK = 2;
let barangayId, incomeId, retiredId;

const manage = (body, token = admin) => api('manage_application_requirements.php', { token, json: body });
const activeCount = async () => (await one('SELECT COUNT(*) AS c FROM application_requirements WHERE is_active = 1')).c;

// A complete application for room J; `docs` maps requirement id -> file bytes.
// previousAddress: null leaves the field out.
function applicationForm({ docs = {}, previousAddress = 'Blk 4 Lot 2, Brgy. Biga, Silang, Cavite', appId, extra = {} } = {}) {
  const form = new FormData();
  const fields = {
    firstName: 'Liza', lastName: 'Navarro', contactNo: '+639171234515', email: 'liza.navarro@gmail.com',
    gender: 'Female', occupants: '1', monthsOfRent: '6', roomName: 'J', monthlyRent: '3500', agreeTerms: 'true',
    preferredMoveInDate: '', isAsap: '1', ...extra,
  };
  if (previousAddress !== null) fields.previousAddress = previousAddress;
  if (appId) fields.appId = String(appId);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const [id, data] of Object.entries(docs)) form.append(`doc_${id}`, new Blob([data], { type: 'image/png' }), `doc${id}.png`);
  return form;
}
const submit = (token, opts) => api('rent_application.php', { token, form: applicationForm(opts) });
const appCount = async (userId) => (await one('SELECT COUNT(*) AS c FROM rent_applications WHERE user_id = ?', [userId])).c;

beforeAll(async () => {
  [admin, tenant, liza, ramon] = await Promise.all([
    loginAs('admin'), loginAs('maria'),
    login('liza.navarro@gmail.com', 'tenant123'), // user 17, app 15 Cancelled: may apply again
    login('ramon.aquino@gmail.com', 'tenant123'), // user 16, app 14 Rejected: may resubmit
  ]);
  uploadsBefore = new Set(listUploads());
});
afterAll(() => {
  for (const f of listUploads()) if (!uploadsBefore.has(f)) fs.unlinkSync(path.join(UPLOADS, f));
});

describe('get_application_requirements.php', () => {
  it('lists the seeded Valid ID front/back, both required, and no NBI', async () => {
    const res = await api('get_application_requirements.php', { token: tenant });
    expect(res.status).toBe(200);
    expect(res.body.requirements.map((r) => [r.id, r.label, r.is_required])).toEqual([
      [FRONT, 'Valid ID (front)', true], [BACK, 'Valid ID (back)', true],
    ]);
  });

  it('needs a session', async () => {
    expect((await api('get_application_requirements.php')).status).toBe(401);
  });
});

describe('manage_application_requirements.php', () => {
  it('is admin only', async () => {
    const res = await manage({ action: 'create', label: 'Proof of income' }, tenant);
    expect(res.status).toBe(403);
    expect(await one("SELECT id FROM application_requirements WHERE label = 'Proof of income'")).toBeNull();
  });

  it('adds an optional requirement and logs it', async () => {
    const res = await manage({ action: 'create', label: '  Proof of income ', label_fil: 'Patunay ng kita', is_required: false });
    expect(res.status).toBe(200);
    const row = await one("SELECT id, label, label_fil, is_required, is_active FROM application_requirements WHERE label = 'Proof of income'");
    expect(row).toMatchObject({ label: 'Proof of income', label_fil: 'Patunay ng kita', is_required: 0, is_active: 1 });
    incomeId = row.id;
    expect(await one("SELECT id FROM activity_logs WHERE action = 'Added Application Requirement' AND details LIKE '%Proof of income%'")).not.toBeNull();
  });

  it('adds a required requirement', async () => {
    const res = await manage({ action: 'create', label: 'Barangay clearance', is_required: true });
    expect(res.status).toBe(200);
    barangayId = (await one("SELECT id FROM application_requirements WHERE label = 'Barangay clearance'")).id;
  });

  it.each([
    ['a one-character label', { label: 'A' }, /2 to 60/],
    ['a whitespace-only label', { label: '    ' }, /2 to 60/],
    ['a 61-character label', { label: 'x'.repeat(61) }, /2 to 60/],
    ['a label that is not text', { label: 12345 }, /document name/i],
    ['a 61-character Filipino name', { label: 'Lease form', label_fil: 'x'.repeat(61) }, /Filipino/],
    ['a duplicate name in another case', { label: 'valid id (FRONT)' }, /already exists/],
    ['is_required as a string', { label: 'Lease form', is_required: 'yes' }, /true or false/],
    ['is_required as 2', { label: 'Lease form', is_required: 2 }, /true or false/],
    ['is_active as null', { label: 'Lease form', is_active: null }, /true or false/],
    ['sort_order above 999', { label: 'Lease form', sort_order: 1000 }, /0 to 999/],
    ['a negative sort_order', { label: 'Lease form', sort_order: -1 }, /0 to 999/],
    ['a fractional sort_order', { label: 'Lease form', sort_order: 1.5 }, /0 to 999/],
  ])('refuses %s with 422 and writes nothing', async (_name, body, message) => {
    const before = (await one('SELECT COUNT(*) AS c FROM application_requirements')).c;
    const res = await manage({ action: 'create', ...body });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(message);
    expect((await one('SELECT COUNT(*) AS c FROM application_requirements')).c).toBe(before);
  });

  it('refuses an unknown action, and there is no delete', async () => {
    const res = await manage({ action: 'delete', id: incomeId });
    expect(res.status).toBe(422);
    expect(await one('SELECT id FROM application_requirements WHERE id = ?', [incomeId])).not.toBeNull();
  });

  it('refuses an unknown or malformed id', async () => {
    expect((await manage({ action: 'update', id: 99999, label: 'Anything' })).status).toBe(404);
    expect((await manage({ action: 'update', id: '1', label: 'Anything' })).status).toBe(422);
    expect((await manage({ action: 'deactivate', id: 0 })).status).toBe(422);
  });

  it('renames and toggles required on an existing row; a rename to another active name is refused', async () => {
    const ok = await manage({ action: 'update', id: incomeId, label: 'Proof of income (payslip)', is_required: false });
    expect(ok.status).toBe(200);
    expect((await one('SELECT label FROM application_requirements WHERE id = ?', [incomeId])).label).toBe('Proof of income (payslip)');
    const dup = await manage({ action: 'update', id: incomeId, label: 'Barangay Clearance' });
    expect(dup.status).toBe(422);
    expect((await one('SELECT label FROM application_requirements WHERE id = ?', [incomeId])).label).toBe('Proof of income (payslip)');
  });

  it('reorders; a duplicated or unknown id in the list is refused', async () => {
    expect((await manage({ action: 'reorder', ids: [FRONT, FRONT, BACK] })).status).toBe(422);
    expect((await manage({ action: 'reorder', ids: [FRONT, 99999] })).status).toBe(404);
    const res = await manage({ action: 'reorder', ids: [barangayId, FRONT, BACK, incomeId] });
    expect(res.status).toBe(200);
    expect(res.body.requirements.map((r) => r.id)).toEqual([barangayId, FRONT, BACK, incomeId]);
  });

  it('deactivates and activates; repeating either is a 409', async () => {
    await manage({ action: 'create', label: 'Old form', is_required: true });
    retiredId = (await one("SELECT id FROM application_requirements WHERE label = 'Old form'")).id;
    expect((await manage({ action: 'deactivate', id: retiredId })).status).toBe(200);
    expect((await manage({ action: 'deactivate', id: retiredId })).status).toBe(409);
    expect((await manage({ action: 'activate', id: retiredId })).status).toBe(200);
    expect((await manage({ action: 'activate', id: retiredId })).status).toBe(409);
    expect((await manage({ action: 'deactivate', id: retiredId })).status).toBe(200);
  });

  it('allows at most 12 active requirements (create and activate)', async () => {
    const free = 12 - (await activeCount());
    for (let i = 1; i <= free; i++) await q('INSERT INTO application_requirements (label, is_required, is_active) VALUES (?, 0, 1)', [`Filler ${i}`]);
    expect(await activeCount()).toBe(12);
    const create = await manage({ action: 'create', label: 'Thirteenth', is_required: false });
    expect(create.status).toBe(422);
    expect(create.body.message).toMatch(/At most 12/);
    expect((await manage({ action: 'activate', id: retiredId })).status).toBe(422);
    expect(await activeCount()).toBe(12);
    await q("DELETE FROM application_requirements WHERE label LIKE 'Filler %'");
  });
});

describe('rent_application.php documents and previous address', () => {
  // Active now: Barangay clearance (required), Valid ID front/back (required),
  // Proof of income (optional). Old form is inactive.
  const allRequired = () => ({ [FRONT]: PNG, [BACK]: PNG, [barangayId]: PNG });

  it('refuses a missing required custom document (422, nothing saved)', async () => {
    const res = await submit(liza, { docs: { [FRONT]: PNG, [BACK]: PNG } });
    expect(res.status).toBe(422);
    expect(res.body.field).toBe(`doc_${barangayId}`);
    expect(res.body.message).toMatch(/Barangay clearance/);
    expect(await appCount(17)).toBe(1);
  });

  it.each([
    ['missing', null, /enter your previous address/],
    ['blank', '   ', /enter your previous address/],
    ['too short', 'Abc', /5 to 255/],
    ['too long', 'x'.repeat(256), /5 to 255/],
  ])('refuses a %s previous address', async (_name, previousAddress, message) => {
    const res = await submit(liza, { docs: allRequired(), previousAddress });
    expect(res.status).toBe(422);
    expect(res.body.field).toBe('previousAddress');
    expect(res.body.message).toMatch(message);
    expect(await appCount(17)).toBe(1);
  });

  it('refuses a file whose content is not an image or PDF', async () => {
    const before = listUploads().length;
    const res = await submit(liza, { docs: { ...allRequired(), [BACK]: TEXT } });
    expect(res.status).toBe(422);
    expect(res.body.field).toBe(`doc_${BACK}`);
    expect(await appCount(17)).toBe(1);
    expect(listUploads().length).toBe(before);
  });

  it('accepts the application without the optional document; stray keys are ignored', async () => {
    const res = await submit(liza, { docs: { ...allRequired(), [retiredId]: PNG, 99999: PNG } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const app = await one("SELECT id, previous_address FROM rent_applications WHERE user_id = 17 AND status = 'Pending Review'");
    expect(app.previous_address).toBe('Blk 4 Lot 2, Brgy. Biga, Silang, Cavite');
    const docs = await q('SELECT requirement_id, label_snapshot, file_path FROM application_documents WHERE rent_application_id = ? ORDER BY requirement_id', [app.id]);
    expect(docs.map((d) => d.requirement_id).sort((a, b) => a - b)).toEqual([FRONT, BACK, barangayId].sort((a, b) => a - b));
    for (const d of docs) {
      expect(d.file_path).toMatch(/^\.\.\/uploads\/applications\/[0-9a-f]{32}\.png$/);
      expect(onDisk(d.file_path)).toBe(true);
    }
    // The tenant reads them back through get_documents.php.
    const mine = await api('get_documents.php', { token: liza });
    expect(mine.body.documents).toHaveLength(3);
    expect(mine.body.missing_documents).toEqual([]);
  });
});

describe('resubmission keeps the files already on the application', () => {
  it('a rejected application with nothing on file still needs every required document', async () => {
    const res = await submit(ramon, { appId: 14, docs: { [FRONT]: PNG } });
    expect(res.status).toBe(422);
    expect((await one('SELECT status FROM rent_applications WHERE id = 14')).status).toBe('Rejected');
  });

  it('replaces only the requirement that got a new file', async () => {
    await q(`INSERT INTO application_documents (rent_application_id, requirement_id, label_snapshot, file_path) VALUES
      (14, ?, 'Valid ID (front)', '../uploads/applications/old-front.png'),
      (14, ?, 'Valid ID (back)', '../uploads/applications/old-back.png'),
      (14, ?, 'Barangay clearance', '../uploads/applications/old-brgy.png')`, [FRONT, BACK, barangayId]);
    const res = await submit(ramon, { appId: 14, docs: { [FRONT]: PNG }, extra: { firstName: 'Ramon', lastName: 'Aquino', email: 'ramon.aquino@gmail.com', gender: 'Male', contactNo: '+639171234514' } });
    expect(res.status).toBe(200);
    expect((await one('SELECT status FROM rent_applications WHERE id = 14')).status).toBe('Pending Review');
    const docs = Object.fromEntries((await q('SELECT requirement_id, file_path FROM application_documents WHERE rent_application_id = 14')).map((d) => [d.requirement_id, d.file_path]));
    expect(docs[FRONT]).toMatch(/^\.\.\/uploads\/applications\/[0-9a-f]{32}\.png$/);
    expect(docs[BACK]).toBe('../uploads/applications/old-back.png');
    expect(docs[barangayId]).toBe('../uploads/applications/old-brgy.png');
    expect((await one('SELECT COUNT(*) AS c FROM application_documents WHERE rent_application_id = 14')).c).toBe(3);
  });

  it('cannot resubmit once it is back under review (stale tab)', async () => {
    const res = await submit(ramon, { appId: 14, docs: { [FRONT]: PNG } });
    expect(res.status).toBe(409);
  });
});

describe('approval gate (update_tenant_status.php) and follow-up sweep', () => {
  // Gloria: app 6, Pending Review, room N, no documents in the seed.
  const approve = () => api('update_tenant_status.php', { token: admin, json: { id: 6, status: 'Approved' } });

  it('refuses approval while a required document is missing', async () => {
    await q('UPDATE rent_applications SET terms_agreed_at = NOW() WHERE id = 6');
    await q(`INSERT INTO application_documents (rent_application_id, requirement_id, label_snapshot, file_path) VALUES
      (6, ?, 'Valid ID (front)', 'uploads/applications/g-front.png'), (6, ?, 'Valid ID (back)', 'uploads/applications/g-back.png')`, [FRONT, BACK]);
    const res = await approve();
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/missing a required document/);
    expect((await one('SELECT status FROM rent_applications WHERE id = 6')).status).toBe('Pending Review');
  });

  it('the admin list shows what is missing', async () => {
    const res = await api('get_applications.php', { token: admin });
    const gloria = res.body.data.find((a) => Number(a.id) === 6);
    expect(gloria.documents.map((d) => d.label)).toEqual(['Valid ID (front)', 'Valid ID (back)']);
    expect(gloria.missing_documents).toEqual(['Barangay clearance']);
  });

  it('approves once the requirement is deactivated (only active + required count)', async () => {
    expect((await manage({ action: 'deactivate', id: barangayId })).status).toBe(200);
    const res = await approve();
    expect(res.body.success).toBe(true);
    expect((await one('SELECT status FROM rent_applications WHERE id = 6')).status).toBe('Approved');
  });

  it('flags an approved application with a missing document, but not one verified in person', async () => {
    // Lita (app 5, Approved) has no files but was verified in person; give her terms.
    await q('UPDATE rent_applications SET terms_agreed_at = NOW() WHERE id = 5');
    let res = await api('monitor_followups.php', { token: admin });
    const flagged = () => res.body.documents.filter((d) => d.issue === 'Missing documents').map((d) => d.id);
    expect(flagged()).not.toContain(5);
    expect(flagged()).not.toContain(6);
    // Making the custom requirement active and required again flags Gloria.
    expect((await manage({ action: 'activate', id: barangayId })).status).toBe(200);
    res = await api('monitor_followups.php', { token: admin });
    expect(flagged()).toContain(6);
    expect(flagged()).not.toContain(5);
  });
});
