// The owner's e-signature on the contract template (Edit Contract → Details):
// upload_contract_signature.php stores it, save_contract_template.php accepts
// only a stored file, and download_file.php serves the one in force to any
// signed-in user, so a tenant's printed contract carries it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, loginAs } from './lib/api.js';
import { one } from './lib/db.js';
import { PNG_BYTES } from './lib/fixtures.js';
import { ROOT } from './lib/env.js';

let admin, maria, uploaded, spare;

const upload = (token, bytes = PNG_BYTES, type = 'image/png', name = 'signature.png') => {
  const form = new FormData();
  if (bytes) form.append('file', new Blob([bytes], { type }), name);
  return api('upload_contract_signature.php', { token, form });
};
const current = async () => (await api('get_contract_template.php', { token: admin })).body;
const save = async (signature) => {
  const cur = await current();
  const template = { ...cur.template, details: { ...cur.template.details, owner_signature: signature } };
  return api('save_contract_template.php', { token: admin, json: { template, base_version: cur.version, note: 'signature test' } });
};
const download = (token, path) => api('download_file.php', { query: { path, ...(token ? { token } : {}) } });

// PNG_BYTES is 1 x 1; the endpoint wants at least 20 x 10, so build a 40 x 20 PNG.
async function pngOfSize(w, h) {
  const zlib = await import('node:zlib');
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});
// The test server writes into the real backend/uploads folder: leave nothing behind.
afterAll(() => {
  [uploaded, spare].filter(Boolean).forEach((p) => fs.rmSync(path.join(ROOT, 'backend', p), { force: true }));
});

describe('uploading the owner e-signature', () => {
  it('is admin only and takes a PNG or JPG of a sensible size', async () => {
    const png = await pngOfSize(40, 20);
    expect((await upload(undefined, png)).status).toBe(401);
    expect((await upload(maria, png)).status).toBe(403);
    expect((await upload(admin, null)).status).toBe(422);
    expect((await upload(admin, Buffer.from('%PDF-1.4 not an image'), 'application/pdf', 'sig.pdf')).status).toBe(422);
    // A PNG name on other content is refused by its content.
    expect((await upload(admin, Buffer.from('plain text'), 'image/png', 'sig.png')).status).toBe(422);
    expect((await upload(admin, PNG_BYTES)).status).toBe(422); // 1 x 1 px

    const ok = await upload(admin, png);
    expect(ok.status).toBe(200);
    expect(ok.body.path).toMatch(/^uploads\/contract_signatures\/[a-f0-9]{32}\.png$/);
    uploaded = ok.body.path;
    spare = (await upload(admin, png)).body.path;
  });
});

describe('putting it on the contract template', () => {
  it('refuses a path that is not a stored signature', async () => {
    expect((await save('uploads/documents/someone_else.png')).status).toBe(422);
    expect((await save('uploads/contract_signatures/' + 'a'.repeat(32) + '.png')).status).toBe(422);
  });

  it('saves a stored one; every reader of the template gets it', async () => {
    const res = await save(uploaded);
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(true);
    expect((await current()).template.details.owner_signature).toBe(uploaded);
    const asTenant = await api('get_contract_template.php', { token: maria });
    expect(asTenant.body.template.details.owner_signature).toBe(uploaded);
    const log = await one("SELECT details FROM activity_logs WHERE action = 'Updated Contract Template' ORDER BY id DESC LIMIT 1");
    expect(log.details).toMatch(/owner e-signature/);
  });

  it('is served to any signed-in user while in force, and only then', async () => {
    const tenant = await download(maria, uploaded);
    expect(tenant.status).toBe(200);
    expect((await download(undefined, uploaded)).status).toBe(401);
    // Uploaded but never saved on the template: not served to a tenant,
    // but the admin can preview it in the editor before saving.
    expect((await download(maria, spare)).status).toBe(404);
    expect((await download(admin, spare)).status).toBe(200);
  });

  it('removing it from the template stops serving it', async () => {
    expect((await save('')).status).toBe(200);
    expect((await current()).template.details.owner_signature).toBe('');
    expect((await download(maria, uploaded)).status).toBe(404);
  });
});
