// upload_lease_document.php: signed / notarized lease scans and the two signatures on a contract.
// QA guide rows Q9-xx (documents). Maria (user 2) owns application 1; Jose (user 3) owns application 2.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';
import { ROOT } from './lib/env.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const DOCS_DIR = path.join(ROOT, 'backend/uploads/documents');
const fileCount = () => (fs.existsSync(DOCS_DIR) ? fs.readdirSync(DOCS_DIR).length : 0);

let admin, maria, jose, mariaContract, joseContract, joseSigned, mariaSigned;
const col = { signedLease: 'signed_lease_path', notarizedLease: 'notarized_lease_path', tenantSignature: 'tenant_signature_path', ownerSignature: 'owner_signature_path' };
const stored = async (id, docType) => (await one(`SELECT ${col[docType]} AS p FROM lease_contracts WHERE id = ?`, [id])).p;

function send(token, fields, file) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) form.append(k, v);
  if (file) form.append('file', new Blob([file.bytes], { type: file.type }), file.name);
  return api('upload_lease_document.php', { token, form });
}
const pdf = { bytes: PDF, type: 'application/pdf', name: 'lease.pdf' };
const png = { bytes: PNG, type: 'image/png', name: 'sig.png' };

beforeAll(async () => {
  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
  mariaContract = (await one('SELECT id FROM lease_contracts WHERE rent_application_id = 1')).id;
  joseContract = (await one('SELECT id FROM lease_contracts WHERE rent_application_id = 2')).id;
  await q("UPDATE lease_contracts SET status = 'draft' WHERE id = ?", [mariaContract]);
  joseSigned = await stored(joseContract, 'signedLease'); // the seed stores a placeholder here
  mariaSigned = await stored(mariaContract, 'signedLease');
});

describe('who may upload', () => {
  it('needs a session and POST', async () => {
    expect((await send(undefined, { contractId: mariaContract, docType: 'signedLease' }, pdf)).status).toBe(401);
    expect((await api('upload_lease_document.php', { token: maria, method: 'GET' })).body.success).toBe(false);
  });

  it('a tenant cannot touch another tenant\'s contract, or name none', async () => {
    const before = fileCount();
    expect((await send(maria, { contractId: joseContract, docType: 'signedLease' }, pdf)).status).toBe(403);
    expect((await send(maria, { rentApplicationId: '2', docType: 'signedLease' }, pdf)).status).toBe(403);
    expect((await send(maria, { docType: 'signedLease' }, pdf)).status).toBe(403);
    expect((await send(maria, { contractId: 'CTR-NOPE', docType: 'signedLease' }, pdf)).status).toBe(403);
    expect(await stored(joseContract, 'signedLease')).toBe(joseSigned);
    expect(fileCount()).toBe(before);
  });

  it('a tenant cannot upload or remove the notarized copy or the owner\'s signature', async () => {
    for (const docType of ['notarizedLease', 'ownerSignature']) {
      expect((await send(maria, { contractId: mariaContract, docType }, docType === 'ownerSignature' ? png : pdf)).status, docType).toBe(403);
      expect((await send(maria, { contractId: mariaContract, docType, action: 'remove' })).status, `remove ${docType}`).toBe(403);
    }
  });
});

describe('what may be uploaded', () => {
  it('rejects an unknown docType and a missing file', async () => {
    expect((await send(maria, { contractId: mariaContract, docType: 'passport' }, pdf)).status).toBe(422);
    const none = await send(maria, { contractId: mariaContract, docType: 'signedLease' });
    expect(none.body.success).toBe(false);
  });

  it('rejects a bad extension, a file that is not what its name says, and a PDF as a signature', async () => {
    const before = fileCount();
    const cases = [
      [{ docType: 'signedLease' }, { bytes: PDF, type: 'application/pdf', name: 'lease.exe' }],
      [{ docType: 'signedLease' }, { bytes: Buffer.from('MZ not a pdf'), type: 'application/pdf', name: 'lease.pdf' }],
      [{ docType: 'signedLease' }, { bytes: Buffer.from('<?php echo 1; ?>'), type: 'image/png', name: 'shell.php.png' }],
      [{ docType: 'tenantSignature' }, pdf],
    ];
    for (const [fields, file] of cases) {
      expect((await send(maria, { contractId: mariaContract, ...fields }, file)).status, file.name).toBe(422);
    }
    expect(fileCount()).toBe(before);
    expect(await stored(mariaContract, 'signedLease')).toBe(mariaSigned);
  });

  it('rejects a file over 10 MB and accepts one just under', async () => {
    const big = { bytes: Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]), type: 'application/pdf', name: 'big.pdf' };
    expect((await send(maria, { contractId: mariaContract, docType: 'signedLease' }, big)).status).toBe(422);
    const near = { bytes: Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 - PDF.length - 1024)]), type: 'application/pdf', name: 'near.pdf' };
    expect((await send(maria, { contractId: mariaContract, docType: 'signedLease' }, near)).body.success).toBe(true);
  });
});

describe('uploading and removing', () => {
  it('stores the file under a random name, records it on the contract and logs it', async () => {
    const before = fileCount();
    const res = await send(maria, { contractId: mariaContract, docType: 'tenantSignature' }, png);
    expect(res.body.success).toBe(true);
    expect(res.body.filePath).toMatch(/uploads\/documents\/[0-9a-f]{32}\.png$/);
    expect(await stored(mariaContract, 'tenantSignature')).toBe(res.body.filePath);
    expect(fileCount()).toBe(before + 1);
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Uploaded Rent Document' AND details LIKE ?", [`%${mariaContract}%`])).n).toBeGreaterThanOrEqual(1);
  });

  it('finds the contract from the application id, and refuses an application without one', async () => {
    expect((await send(maria, { rentApplicationId: '1', docType: 'signedLease' }, pdf)).body.success).toBe(true);
    const pending = await one("SELECT id, user_id FROM rent_applications WHERE status = 'Pending Review' LIMIT 1");
    if (pending) {
      const asAdmin = await send(admin, { rentApplicationId: String(pending.id), docType: 'signedLease' }, pdf);
      expect(asAdmin.status).toBe(409);
    }
  });

  it('a tenant can remove their own document while the contract is a draft, then not once it is active', async () => {
    expect((await send(maria, { contractId: mariaContract, docType: 'tenantSignature', action: 'remove' })).body.success).toBe(true);
    expect(await stored(mariaContract, 'tenantSignature')).toBeNull();
    await q("UPDATE lease_contracts SET status = 'active' WHERE id = ?", [mariaContract]);
    expect((await send(maria, { contractId: mariaContract, docType: 'signedLease', action: 'remove' })).status).toBe(409);
    expect((await send(maria, { contractId: mariaContract, docType: 'signedLease' }, pdf)).status).toBe(409);
    expect(await stored(mariaContract, 'signedLease')).not.toBeNull();
  });

  it('an admin can replace and remove documents on an active contract, including the notarized copy', async () => {
    expect((await send(admin, { contractId: mariaContract, docType: 'notarizedLease' }, pdf)).body.success).toBe(true);
    expect(await stored(mariaContract, 'notarizedLease')).not.toBeNull();
    expect((await send(admin, { contractId: mariaContract, docType: 'notarizedLease', action: 'remove' })).body.success).toBe(true);
    expect(await stored(mariaContract, 'notarizedLease')).toBeNull();
  });

  it('an admin naming a contract that does not exist gets a 404 and no stray file', async () => {
    const before = fileCount();
    const up = await send(admin, { contractId: 'CTR-NOPE', docType: 'signedLease' }, pdf);
    expect(up.status).toBe(404);
    expect(up.body.success).toBe(false);
    expect(fileCount()).toBe(before);
    const rm = await send(admin, { contractId: 'CTR-NOPE', docType: 'signedLease', action: 'remove' });
    expect(rm.status).toBe(404);
  });
});
