// update_refund_request.php mark_refunded by hand (SPRINT 182, panel audit P-13):
// the payout method comes from a fixed list, anything but cash needs a reference
// and a proof file, the file is saved only when the payout really is recorded,
// and the tenant it was paid to (or an admin) can open it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';
import { payoutForm, PNG_BYTES } from './lib/fixtures.js';
import { ROOT } from './lib/env.js';

let admin, maria, jose;
const MARIA = 2;
const REFUNDS_DIR = path.join(ROOT, 'backend/uploads/refunds');
const files = () => (fs.existsSync(REFUNDS_DIR) ? fs.readdirSync(REFUNDS_DIR) : []);

async function approvedRefund(userId = MARIA) {
  const r = await q("INSERT INTO refund_requests (user_id, type, amount, reason, status, raised_by_role) VALUES (?, 'overpayment', 500, 'test', 'Approved', 'admin')", [userId]);
  return r.insertId;
}
const payout = (id, opts, token = admin) => api('update_refund_request.php', { token, form: payoutForm(id, opts) });
const row = (id) => one('SELECT status, payout_method, payout_reference, payout_proof_path FROM refund_requests WHERE id = ?', [id]);

// Proofs go to the real backend/uploads/refunds (the test server shares it): remove the
// ones this file created, and leave anything that was already there.
let filesBefore = new Set();
beforeAll(async () => {
  filesBefore = new Set(files());
  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
});
afterAll(() => {
  for (const name of files()) {
    if (!filesBefore.has(name)) fs.rmSync(path.join(REFUNDS_DIR, name), { force: true });
  }
});

describe('the payout method and what it needs', () => {
  it('refuses a method outside the list, and a non-cash payout without a reference or a proof', async () => {
    const id = await approvedRefund();
    const before = files().length;
    expect((await payout(id, { method: 'Carrier pigeon', reference: 'X-1' })).status).toBe(400);
    expect((await payout(id, { method: '', reference: 'X-1' })).status).toBe(400);
    expect((await payout(id, { method: 'GCash', reference: '' })).status).toBe(400);
    const noProof = await payout(id, { method: 'GCash', reference: '9000000000900', proof: null });
    expect(noProof.status).toBe(422);
    expect(noProof.body.message).toMatch(/proof/i);
    expect((await row(id)).status).toBe('Approved');
    expect(files().length).toBe(before);
  });

  it('refuses a proof that is not a JPG, PNG, WEBP or PDF, whatever its name says', async () => {
    const id = await approvedRefund();
    const res = await payout(id, { method: 'Bank transfer', reference: 'X-2', proof: { bytes: Buffer.from('<?php echo 1;'), type: 'image/png', name: 'proof.png' } });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/JPG, PNG, WEBP or PDF/);
    expect((await row(id)).status).toBe('Approved');
  });

  it('cash needs neither a reference nor a proof', async () => {
    const id = await approvedRefund();
    const res = await payout(id, { method: 'cash', proof: null });
    expect(res.body.success).toBe(true);
    expect(await row(id)).toMatchObject({ status: 'Refunded', payout_method: 'Cash', payout_reference: null, payout_proof_path: null });
  });

  it('JSON still works for cash (the old request shape)', async () => {
    const id = await approvedRefund();
    const res = await api('update_refund_request.php', { token: admin, json: { id, action: 'mark_refunded', payout_method: 'Cash', payout_reference: 'OR-9' } });
    expect(res.body.success).toBe(true);
    expect((await row(id)).payout_reference).toBe('OR-9');
  });
});

describe('the proof file', () => {
  it('is stored under a random name, recorded on the request and noted in its trail', async () => {
    const id = await approvedRefund();
    const res = await payout(id, { method: 'GCash', reference: '9000 000 000100', message: 'Sent this morning' });
    expect(res.body.success).toBe(true);
    const r = await row(id);
    expect(r).toMatchObject({ status: 'Refunded', payout_method: 'GCash', payout_reference: '9000000000100' });
    expect(r.payout_proof_path).toMatch(/^uploads\/refunds\/payout_[0-9a-f]{32}\.png$/);
    expect(fs.existsSync(path.join(ROOT, 'backend', r.payout_proof_path))).toBe(true);
    const ev = await one("SELECT message FROM refund_request_events WHERE refund_request_id = ? AND action = 'mark_refunded'", [id]);
    expect(ev.message).toContain('GCash');
    expect(ev.message).toContain('with proof');
    expect((await api('get_refund_requests.php', { token: admin })).body.requests.find((x) => x.id === id).payoutProofPath).toBe(r.payout_proof_path);
  });

  it('is opened by an admin and by the tenant it was paid to, not by another tenant', async () => {
    const id = await approvedRefund();
    await payout(id, { method: 'Bank transfer', reference: 'BT-7' });
    const p = (await row(id)).payout_proof_path;
    const open = (token) => api('download_file.php', { token, query: { path: p } });
    expect((await open(admin)).status).toBe(200);
    expect((await open(maria)).status).toBe(200);
    expect((await open(jose)).status).toBe(403);
    expect((await open(undefined)).status).toBe(401);
  });

  it('a second payout of the same request is refused and saves no second file', async () => {
    const id = await approvedRefund();
    expect((await payout(id, { method: 'Maya', reference: 'MY-1' })).body.success).toBe(true);
    const count = files().length;
    const again = await payout(id, { method: 'Maya', reference: 'MY-2' });
    expect(again.status).toBe(409);
    expect(files().length).toBe(count);
    expect((await row(id)).payout_reference).toBe('MY-1');
  });

  it('an unapproved request cannot be paid out, and no file is kept', async () => {
    const r = await q("INSERT INTO refund_requests (user_id, type, amount, reason, status, raised_by_role) VALUES (?, 'overpayment', 500, 'test', 'Pending Review', 'admin')", [MARIA]);
    const count = files().length;
    expect((await payout(r.insertId, { method: 'GCash', reference: '9000000000001' })).status).toBe(409);
    expect(files().length).toBe(count);
  });

  it('only an admin can record a payout', async () => {
    const id = await approvedRefund();
    expect((await payout(id, { method: 'Cash', proof: null }, maria)).status).toBe(403);
    expect((await row(id)).status).toBe('Approved');
  });
});

describe('PNG sanity', () => {
  it('the fixture is a real PNG', () => {
    expect(PNG_BYTES.subarray(1, 4).toString()).toBe('PNG');
  });
});
