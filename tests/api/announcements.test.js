// create_announcement.php drafts: the attachment is kept, replaced or removed,
// and sending a draft turns the same row into the sent announcement.
// Uploads land in backend/uploads/notifications/ (gitignored); anything this
// file adds there is deleted afterwards.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';
import { ROOT } from './lib/env.js';

const UPLOADS = path.join(ROOT, 'backend/uploads/notifications');
const listUploads = () => (fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS) : []);
const onDisk = (rel) => fs.existsSync(path.join(ROOT, 'backend', rel));

// Smallest real files, so the server's content sniffing (finfo) sees the type.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff', 'binary');

let admin, uploadsBefore;
function post(fields, file) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  if (file) form.append('attachment', new Blob([file.data], { type: file.type }), file.name);
  return api('create_announcement.php', { token: admin, form });
}
const base = { tag: 'General', title: 'Water interruption', body: 'Water is off on Saturday 9-12.', sendTo: 'All tenants', channels: ['in-app'] };
const announcement = (id) => one('SELECT id, status, title, attachment_path FROM announcements WHERE id = ?', [id]);

beforeAll(async () => {
  admin = await loginAs('admin');
  uploadsBefore = new Set(listUploads());
});
afterAll(() => {
  for (const f of listUploads()) if (!uploadsBefore.has(f)) fs.unlinkSync(path.join(UPLOADS, f));
});

describe('refused drafts', () => {
  it('KB-B17 blank title or body → 422', async () => {
    const res = await post({ ...base, title: '  ', draft: 'true' });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Title and body are required.');
  });

  it('KB-B18 an .exe → 422 and no file left on disk', async () => {
    const res = await post({ ...base, draft: 'true' }, { data: EXE, type: 'image/png', name: 'notes.png' });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Attach a JPG, PNG, or PDF.');
    expect(listUploads()).toEqual([...uploadsBefore]);
  });

  it('KB-B19 "Specific unit" without a unit → 422', async () => {
    const res = await post({ ...base, sendTo: 'Specific unit', draft: 'true' });
    expect(res.status).toBe(422);
  });

  it('KB-E04 a tenant cannot post announcements', async () => {
    const form = new FormData();
    form.append('title', 'x'); form.append('body', 'y');
    const res = await api('create_announcement.php', { token: await loginAs('maria'), form });
    expect(res.status).toBe(403);
  });
});

describe('draft lifecycle', () => {
  let draftId, firstFile, secondFile;

  it('KB-A10 a draft keeps its attachment', async () => {
    const res = await post({ ...base, draft: 'true' }, { data: PNG, type: 'image/png', name: 'a<b>.png' });
    expect(res.body).toMatchObject({ success: true, draft: true });
    const row = await one("SELECT id, attachment_path FROM announcements WHERE status = 'draft' ORDER BY id DESC LIMIT 1");
    draftId = row.id;
    firstFile = row.attachment_path;
    // KB-B27 stored under a random server name, not the uploaded one.
    expect(firstFile).toMatch(/^uploads\/notifications\/[0-9a-f]{32}\.png$/);
    expect(onDisk(firstFile)).toBe(true);
  });

  it('KB-A12 saving with a new file replaces it and deletes the old one', async () => {
    const res = await post({ ...base, draft: 'true', draftId: String(draftId) }, { data: PDF, type: 'application/pdf', name: 'notice.pdf' });
    expect(res.body.success).toBe(true);
    secondFile = (await announcement(draftId)).attachment_path;
    expect(secondFile).toMatch(/\.pdf$/);
    expect(onDisk(secondFile)).toBe(true);
    expect(onDisk(firstFile)).toBe(false);
  });

  it('saving again without a file keeps the current one', async () => {
    await post({ ...base, title: 'Water interruption (updated)', draft: 'true', draftId: String(draftId) });
    expect(await announcement(draftId)).toMatchObject({ status: 'draft', title: 'Water interruption (updated)', attachment_path: secondFile });
  });

  it('KB-A13 removeAttachment clears the path and deletes the file', async () => {
    await post({ ...base, draft: 'true', draftId: String(draftId), removeAttachment: 'true' });
    expect((await announcement(draftId)).attachment_path).toBeNull();
    expect(onDisk(secondFile)).toBe(false);
  });

  it('KB-A11 sending the draft turns the same row into the sent announcement; notifications carry the file', async () => {
    await post({ ...base, draft: 'true', draftId: String(draftId) }, { data: PNG, type: 'image/png', name: 'map.png' });
    const file = (await announcement(draftId)).attachment_path;
    const draftsBefore = (await one('SELECT COUNT(*) AS c FROM announcements')).c;

    const res = await post({ ...base, draft: 'false', draftId: String(draftId) });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await announcement(draftId)).toMatchObject({ status: 'sent', attachment_path: file });
    expect((await one('SELECT COUNT(*) AS c FROM announcements')).c).toBe(draftsBefore);
    const notified = await one('SELECT COUNT(*) AS c FROM notifications WHERE attachment_path = ?', [file]);
    expect(notified.c).toBeGreaterThan(0);
    expect(onDisk(file)).toBe(true);
  });

  it('KB-B20 / KB-B21 sending it again → 422, row untouched', async () => {
    const before = await announcement(draftId);
    const res = await post({ ...base, title: 'Changed', draft: 'false', draftId: String(draftId) });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('This draft no longer exists or was already sent.');
    expect(await announcement(draftId)).toEqual(before);
  });

  it('KB-B29 saving a draft that was already sent → 422; its file stays, no orphan upload', async () => {
    const before = await announcement(draftId);
    const files = listUploads().length;
    const res = await post({ ...base, draft: 'true', draftId: String(draftId) }, { data: PDF, type: 'application/pdf', name: 'late.pdf' });
    expect(res.status).toBe(422);
    expect(await announcement(draftId)).toEqual(before);
    expect(onDisk(before.attachment_path)).toBe(true);
    expect(listUploads().length).toBe(files);
  });
});

describe('KB-B24 markup is stored as text', () => {
  it('a script tag in the title is saved verbatim', async () => {
    const title = '<script>alert(1)</script> "quotes" 🚰';
    await post({ ...base, title, draft: 'true' });
    const row = await one("SELECT title FROM announcements WHERE status = 'draft' ORDER BY id DESC LIMIT 1");
    expect(row.title).toBe(title);
    await q("DELETE FROM announcements WHERE status = 'draft' AND title = ?", [title]);
  });
});
