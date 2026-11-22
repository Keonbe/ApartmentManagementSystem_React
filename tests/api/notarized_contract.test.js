// The notarized rent contract handed in person (backend/signed_contract.php,
// notarized_contract.php) and the contract_require_notarized setting.
// Lita (user 7) owns application 5 (Approved, not moved in) with draft contract LC-0005.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const LITA = 7;

let admin, lita, maria, contractId;
const send = (token, json) => api('notarized_contract.php', { token, json });
const row = () => one('SELECT notarized_ready_at, notarized_at, notarized_by FROM lease_contracts WHERE id = ?', [contractId]);
const pendingQueue = async () => (await one("SELECT COUNT(*) AS c FROM notifications WHERE type = 'notarized_contract' AND status = 'Pending' AND metadata_value = ?", [`notarized_contract:${contractId}`])).c;
const attention = async () => (await api('dashboard_stats.php', { token: admin, query: { section: 'attention' } })).body.attention;
const setRequired = (on) => api('update_system_settings.php', { token: admin, json: { contract_require_notarized: on ? '1' : '0' } });

beforeAll(async () => {
  [admin, maria, lita] = await Promise.all([loginAs('admin'), loginAs('maria'), login('lita.ramos@demo.example', 'tenant123')]);
  contractId = (await one('SELECT id FROM lease_contracts WHERE rent_application_id = 5')).id;
  await q("UPDATE lease_contracts SET status = 'draft', signed_lease_path = NULL, signed_lease_review = NULL, notarized_lease_path = NULL, notarized_ready_at = NULL, notarized_at = NULL WHERE id = ?", [contractId]);
});

describe('the tenant says the contract is notarized', () => {
  it('needs a valid action, the tenant themself, and a signed copy first', async () => {
    expect((await send(lita, { contractId, action: 'maybe' })).status).toBe(422);
    expect((await send(undefined, { contractId, action: 'ready' })).status).toBe(401);
    expect((await send(admin, { contractId, action: 'ready' })).status).toBe(403);
    expect((await send(maria, { contractId, action: 'ready' })).status).toBe(404);
    const early = await send(lita, { contractId, action: 'ready' });
    expect(early.status).toBe(409);
    expect((await row()).notarized_ready_at).toBeNull();
  });

  it('after the signed copy is uploaded, the office is alerted once', async () => {
    const form = new FormData();
    form.append('rentApplicationId', '5');
    form.append('docType', 'signedLease');
    form.append('file', new Blob([JPG], { type: 'image/jpeg' }), 'signed.jpg');
    expect((await api('upload_lease_document.php', { token: lita, form })).status).toBe(200);

    const res = await send(lita, { contractId, action: 'ready' });
    expect(res.status).toBe(200);
    expect((await row()).notarized_ready_at).not.toBeNull();
    expect(await pendingQueue()).toBe(1);
    // Double submit: refused, still one alert.
    expect((await send(lita, { contractId, action: 'ready' })).status).toBe(409);
    expect(await pendingQueue()).toBe(1);
  });

  it('Contracts, the Dashboard and My Room show it', async () => {
    const list = await api('get_contracts.php', { token: admin });
    expect(list.body.contracts.find((c) => c.id === contractId).notarized_ready_at).toBeTruthy();
    const a = await attention();
    expect(Number(a.notarized_contracts_to_collect)).toBeGreaterThanOrEqual(1);
    expect(a.undated_keys).toContain('notarized_contracts_to_collect');
    const mine = await api('my_room.php', { token: lita, query: { email: 'lita.ramos@demo.example' } });
    expect(mine.body.data).toMatchObject({ notarized_required: true, notarized: false });
    expect(mine.body.data.notarized_ready_at).toBeTruthy();
  });
});

describe('the office marks it received', () => {
  it('only an admin; clears the alert and tells the tenant; a second mark is refused', async () => {
    expect((await send(lita, { contractId, action: 'mark' })).status).toBe(403);
    const res = await send(admin, { contractId, action: 'mark' });
    expect(res.status).toBe(200);
    const r = await row();
    expect(r.notarized_at).not.toBeNull();
    expect(Number(r.notarized_by)).toBeGreaterThan(0);
    expect(await pendingQueue()).toBe(0);
    expect((await one("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND title = 'Notarized contract received'", [LITA])).c).toBe(1);
    expect((await send(admin, { contractId, action: 'mark' })).status).toBe(409);
    // Once notarized the tenant has nothing left to say.
    expect((await send(lita, { contractId, action: 'ready' })).status).toBe(409);
    const mine = await api('my_room.php', { token: lita, query: { email: 'lita.ramos@demo.example' } });
    expect(mine.body.data.notarized).toBe(true);
  });

  it('undo clears the mark and brings the alert back (the tenant had said it was ready)', async () => {
    const res = await send(admin, { contractId, action: 'unmark' });
    expect(res.status).toBe(200);
    expect((await row()).notarized_at).toBeNull();
    expect(await pendingQueue()).toBe(1);
    expect((await send(admin, { contractId, action: 'unmark' })).status).toBe(409);
  });
});

describe('the contract_require_notarized setting', () => {
  it('off: tenants are not asked and a signed contract no longer counts as missing documents', async () => {
    const before = Number((await attention()).contracts_missing_docs);
    expect((await setRequired(false)).status).toBe(200);
    expect((await one("SELECT setting_value AS v FROM system_settings WHERE setting_key = 'contract_require_notarized'")).v).toBe('0');

    await q('UPDATE lease_contracts SET notarized_ready_at = NULL WHERE id = ?', [contractId]);
    expect((await send(lita, { contractId, action: 'ready' })).status).toBe(409);
    const mine = await api('my_room.php', { token: lita, query: { email: 'lita.ramos@demo.example' } });
    expect(mine.body.data.notarized_required).toBe(false);
    expect(Number((await attention()).contracts_missing_docs)).toBeLessThan(before);

    expect((await setRequired(true)).status).toBe(200);
    expect((await one("SELECT setting_value AS v FROM system_settings WHERE setting_key = 'contract_require_notarized'")).v).toBe('1');
  });

  it('refuses a value that is not on or off', async () => {
    const res = await api('update_system_settings.php', { token: admin, json: { contract_require_notarized: 'maybe' } });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
