// A rejected payment proof keeps its file for the admin (invoices.rejected_proof_path).
// The live proof_of_payment_path is still cleared, because pay_bill.php treats a
// non-empty path as "a proof is on file" and would otherwise skip asking for a new one.
// Uploads land in backend/uploads/ (gitignored); anything this file adds is deleted afterwards.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, loginAs } from './lib/api.js';
import { one } from './lib/db.js';
import { addInvoice } from './lib/fixtures.js';
import { ROOT } from './lib/env.js';

const UPLOADS = path.join(ROOT, 'backend/uploads');
const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let admin, maria, before;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
  before = new Set(walk(UPLOADS));
});
afterAll(() => {
  for (const f of walk(UPLOADS)) if (!before.has(f)) fs.unlinkSync(f);
});

const ID = 'INV-TEST-REJPROOF';
const row = () => one('SELECT status, proof_of_payment_path AS live, rejected_proof_path AS rejected, proof_rejection_reason AS reason FROM invoices WHERE id = ?', [ID]);
const proofForm = (method = 'GCash') => {
  const f = new FormData();
  f.append('invoice_id', ID);
  f.append('payment_method', method);
  f.append('reference_number', '1234567890123');
  f.append('amount', '1500');
  f.append('proof', new Blob([PNG], { type: 'image/png' }), 'proof.png');
  return f;
};

describe('reject_payment_proof.php keeps the file', () => {
  it('copies the path to rejected_proof_path and clears the live proof', async () => {
    await addInvoice(ID, { status: 'pending' });
    const up = await api('upload_payment_proof.php', { token: maria, form: proofForm() });
    expect(up.status).toBe(200);
    const sent = await row();
    expect(sent.live).toBeTruthy();
    expect(sent.rejected).toBeNull();

    const res = await api('reject_payment_proof.php', { token: admin, json: { invoiceId: ID, reason: 'The receipt is unreadable.' } });
    expect(res.status).toBe(200);
    const after = await row();
    expect(after.live).toBeNull();
    expect(after.rejected).toBe(sent.live);
    expect(after.reason).toBe('The receipt is unreadable.');
    expect(fs.existsSync(path.join(ROOT, 'backend', sent.live))).toBe(true);
  });

  it('the admin sees the rejected file in get_invoices.php; the tenant does not', async () => {
    const adminView = await api('get_invoices.php', { token: admin, query: { userId: 2 } });
    const tenantView = await api('get_invoices.php', { token: maria, query: { userId: 2 } });
    const a = adminView.body.invoices.find((i) => i.id === ID);
    const t = tenantView.body.invoices.find((i) => i.id === ID);
    expect(a.rejected_proof_path).toBeTruthy();
    expect(t.rejected_proof_path).toBeNull();
    expect(a.proof_of_payment_path).toBeNull();
  });

  it('the owner and an admin can open the file; another tenant cannot', async () => {
    const { rejected } = await row();
    const stored = rejected.replace(/^\.\.\//, '');
    const jose = await loginAs('jose');
    expect((await api('download_file.php', { token: admin, query: { path: stored } })).status).toBe(200);
    expect((await api('download_file.php', { token: maria, query: { path: stored } })).status).toBe(200);
    expect((await api('download_file.php', { token: jose, query: { path: stored } })).status).toBe(403);
  });

  it('a new proof is still required and replaces the live one; the old file stays on record', async () => {
    const { rejected } = await row();
    const up = await api('upload_payment_proof.php', { token: maria, form: proofForm() });
    expect(up.status).toBe(200);
    const now = await row();
    expect(now.live).toBeTruthy();
    expect(now.live).not.toBe(rejected);
    expect(now.rejected).toBe(rejected);
  });

  it('rejecting twice keeps the latest rejected file', async () => {
    const { live } = await row();
    expect((await api('reject_payment_proof.php', { token: admin, json: { invoiceId: ID, reason: 'Wrong amount shown.' } })).status).toBe(200);
    const after = await row();
    expect(after.live).toBeNull();
    expect(after.rejected).toBe(live);
  });
});
