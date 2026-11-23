// The office's check of a tenant's signed contract (backend/signed_contract.php,
// review_signed_contract.php, upload_lease_document.php docType signedLease).
// Lita (user 7) owns application 5 (Approved, not moved in) with draft contract LC-0005.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const photo = { bytes: JPG, type: 'image/jpeg', name: 'signed-page.jpg' };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const pdf = { bytes: PDF, type: 'application/pdf', name: 'signed.pdf' };

let admin, lita, maria, contractId;
const LITA = 7;

function upload(token, file, fields = {}) {
  const form = new FormData();
  form.append('rentApplicationId', '5');
  form.append('docType', 'signedLease');
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (file) form.append('file', new Blob([file.bytes], { type: file.type }), file.name);
  return api('upload_lease_document.php', { token, form });
}
const review = (token, json) => api('review_signed_contract.php', { token, json });
const row = () => one('SELECT signed_lease_path, signed_lease_review, signed_lease_review_note, signed_lease_uploaded_at, signed_lease_reviewed_at, status FROM lease_contracts WHERE id = ?', [contractId]);
const queueRows = async () => (await q("SELECT status FROM notifications WHERE type = 'signed_contract' AND metadata_value = ?", [`signed_contract:${contractId}`]));
const pendingQueue = async () => (await queueRows()).filter((r) => r.status === 'Pending').length;
const litaNotes = async (title) => (await one("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'application_update' AND title = ?", [LITA, title])).c;

beforeAll(async () => {
  [admin, maria, lita] = await Promise.all([loginAs('admin'), loginAs('maria'), login('lita.ramos@demo.example', 'tenant123')]);
  contractId = (await one('SELECT id FROM lease_contracts WHERE rent_application_id = 5')).id;
  await q("UPDATE lease_contracts SET status = 'draft', signed_lease_path = NULL, signed_lease_review = NULL WHERE id = ?", [contractId]);
});

describe('a tenant uploads the signed contract', () => {
  it('a photo is accepted and waits for the office, with one admin alert', async () => {
    const res = await upload(lita, photo);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, review: 'pending', contractId });
    const r = await row();
    expect(r.signed_lease_review).toBe('pending');
    expect(r.signed_lease_uploaded_at).not.toBeNull();
    expect(await pendingQueue()).toBe(1);
  });

  it('a second copy replaces the first and still leaves one alert', async () => {
    const before = (await row()).signed_lease_path;
    expect((await upload(lita, pdf)).body.review).toBe('pending');
    expect((await row()).signed_lease_path).not.toBe(before);
    expect(await pendingQueue()).toBe(1);
  });

  it('Applications, Contracts and the tenant see the copy and its state', async () => {
    const apps = await api('get_applications.php', { token: admin });
    const app = apps.body.data.find((a) => Number(a.id) === 5);
    expect(app.contract).toMatchObject({ id: contractId, status: 'draft', review: 'pending' });
    expect(app.contract.signedPath).toBeTruthy();

    const list = await api('get_contracts.php', { token: admin });
    const c = list.body.contracts.find((x) => x.id === contractId);
    expect(c).toMatchObject({ signed_lease_review: 'pending', application_status: 'Approved' });

    const mine = await api('my_room.php', { token: lita, query: { email: 'lita.ramos@demo.example' } });
    const data = mine.body.data || mine.body.application || mine.body;
    expect(JSON.stringify(data)).toContain('"signed_lease_review":"pending"');
  });

  it('the Dashboard counts it under "signed contracts to check"', async () => {
    const res = await api('dashboard_stats.php', { token: admin, query: { section: 'attention' } });
    expect(Number(res.body.attention.signed_contracts_to_review)).toBeGreaterThanOrEqual(1);
    expect(res.body.attention.undated_keys).toContain('signed_contracts_to_review');
  });
});

describe('the office checks it', () => {
  it('only an admin, with a valid decision and a note when sending it back', async () => {
    expect((await review(lita, { contractId, decision: 'accept' })).status).toBe(403);
    expect((await review(undefined, { contractId, decision: 'accept' })).status).toBe(401);
    expect((await review(admin, { contractId, decision: 'maybe' })).status).toBe(422);
    const noNote = await review(admin, { contractId, decision: 'reject', note: ' ' });
    expect(noNote.status).toBe(422);
    expect(noNote.body.errors.note).toBeTruthy();
    expect((await review(admin, { contractId: 'LC-NOPE', decision: 'accept' })).status).toBe(404);
    expect((await row()).signed_lease_review).toBe('pending');
  });

  it('refuses to accept a copy the admin did not see (a newer upload came in)', async () => {
    const res = await review(admin, { contractId, decision: 'accept', path: 'uploads/documents/an-older-copy.jpg' });
    expect(res.status).toBe(409);
    expect((await row()).signed_lease_review).toBe('pending');
  });

  it('sending it back stores the note, clears the alert and tells the tenant', async () => {
    const { signed_lease_path: path } = await row();
    const res = await review(admin, { contractId, decision: 'reject', note: 'The photo is blurry', path });
    expect(res.status).toBe(200);
    const r = await row();
    expect(r).toMatchObject({ signed_lease_review: 'rejected', signed_lease_review_note: 'The photo is blurry' });
    expect(r.signed_lease_reviewed_at).not.toBeNull();
    expect(await pendingQueue()).toBe(0);
    expect(await litaNotes('Please upload your signed contract again')).toBe(1);
    // Already decided: a second decision is refused.
    expect((await review(admin, { contractId, decision: 'accept', path })).status).toBe(409);
  });

  it('a copy sent back can be replaced even after the contract left draft', async () => {
    await q("UPDATE lease_contracts SET status = 'active' WHERE id = ?", [contractId]);
    const res = await upload(lita, photo);
    expect(res.status).toBe(200);
    expect((await row()).signed_lease_review).toBe('pending');
    expect(await pendingQueue()).toBe(1);
  });

  it('accepting clears the alert and tells the tenant; then an active contract cannot be replaced', async () => {
    const { signed_lease_path: path } = await row();
    const res = await review(admin, { contractId, decision: 'accept', path });
    expect(res.status).toBe(200);
    expect((await row()).signed_lease_review).toBe('accepted');
    expect(await pendingQueue()).toBe(0);
    expect(await litaNotes('Signed contract accepted')).toBe(1);
    expect((await upload(lita, photo)).status).toBe(409);
  });

  it('a tenant cannot review or upload for someone else', async () => {
    expect((await upload(maria, photo)).status).toBe(403);
  });
});

describe('the office\'s own copy', () => {
  it('an admin upload is accepted at once, and removing it clears the review', async () => {
    const res = await upload(admin, pdf, { contractId });
    expect(res.status).toBe(200);
    expect(res.body.review).toBe('accepted');
    expect((await row()).signed_lease_review).toBe('accepted');

    const removed = await api('upload_lease_document.php', { token: admin, form: (() => { const f = new FormData(); f.append('contractId', contractId); f.append('docType', 'signedLease'); f.append('action', 'remove'); return f; })() });
    expect(removed.body.success).toBe(true);
    expect(await row()).toMatchObject({ signed_lease_path: null, signed_lease_review: null, signed_lease_review_note: null, signed_lease_uploaded_at: null });
    expect((await review(admin, { contractId, decision: 'accept' })).status).toBe(409);
  });
});
