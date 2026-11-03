// Footage the admin hands to the tenant on an Approved CCTV request: a stored clip
// (attach_cctv_footage.php) or a private https link. Only the requesting tenant
// and admins can open it (download_file.php / open_cctv_footage.php), tenant
// opens are logged, and it expires after cctv_footage_days.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { api, loginAs } from './lib/api.js';
import { BASE } from './lib/env.js';
import { one, q, setSetting } from './lib/db.js';

const BACKEND = fileURLToPath(new URL('../../backend/', import.meta.url));
let admin, maria, jose;
const created = [];
beforeAll(async () => { admin = await loginAs('admin'); maria = await loginAs('maria'); jose = await loginAs('jose'); });
afterEach(async () => { await q("DELETE FROM system_settings WHERE setting_key = 'cctv_footage_days'"); });
afterAll(async () => {
  for (const p of (await q("SELECT footage_path FROM cctv_requests WHERE footage_path IS NOT NULL")).map((r) => r.footage_path)) {
    const full = BACKEND + p;
    if (existsSync(full)) unlinkSync(full);
  }
  for (const f of created) if (existsSync(f)) unlinkSync(f);
});

// A tiny file that really is an MP4 to finfo (ftyp box).
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(4), Buffer.from('mp42isom'), Buffer.alloc(64)]);
const formWith = (id, { file, name = 'clip.mp4', type = 'video/mp4', url } = {}) => {
  const f = new FormData();
  f.set('id', String(id));
  if (file) f.set('file', new Blob([file], { type }), name);
  if (url !== undefined) f.set('url', url);
  return f;
};
const attach = (id, opts, token = admin) => api('attach_cctv_footage.php', { token, form: formWith(id, opts) });

const approved = async () => {
  const d = (await one("SELECT DATE_FORMAT(CURDATE() - INTERVAL 1 DAY, '%Y-%m-%d') AS d")).d;
  const filed = await api('cctv_request.php', { token: maria, json: {
    incidentDate: d, incidentTime: '08:00 PM - 12:00 AM', locationDetails: '1st Floor',
    incidentType: 'theft', reasonRequest: 'My bicycle was taken from the hallway.', privacyConsent: true,
  } });
  await api('update_cctv_status.php', { token: admin, json: { id: filed.body.id, status: 'Approved', note: 'Footage will be attached here.' } });
  return filed.body.id;
};
const pending = async () => {
  const d = (await one("SELECT DATE_FORMAT(CURDATE() - INTERVAL 1 DAY, '%Y-%m-%d') AS d")).d;
  return (await api('cctv_request.php', { token: maria, json: {
    incidentDate: d, incidentTime: '08:00 PM - 12:00 AM', locationDetails: '1st Floor',
    incidentType: 'theft', reasonRequest: 'My bicycle was taken from the hallway.', privacyConsent: true,
  } })).body.id;
};
const row = (id) => one('SELECT * FROM cctv_requests WHERE id = ?', [id]);
const viewLogs = async (id) => (await one("SELECT COUNT(*) AS c FROM activity_logs WHERE action = 'Viewed CCTV Footage' AND details LIKE ?", [`CCTV Request ID: ${id} %`])).c;
const download = (path, token) => api('download_file.php', { token, query: { path } });

describe('attach_cctv_footage.php', () => {
  it('attaches a real clip → stored, expiry set from the setting, tenant notified', async () => {
    const id = await approved();
    const res = await attach(id, { file: MP4 });
    expect(res.body).toMatchObject({ success: true, footageKind: 'file' });
    const r = await row(id);
    expect(r.footage_path).toMatch(/^uploads\/cctv\/[\w.-]+\.mp4$/);
    expect(existsSync(BACKEND + r.footage_path)).toBe(true);
    expect(r.footage_url).toBeNull();
    const days = (await one('SELECT DATEDIFF(footage_expires_at, footage_attached_at) AS d FROM cctv_requests WHERE id = ?', [id])).d;
    expect(days).toBe(14);
    const notif = await one("SELECT message FROM notifications WHERE user_id = 2 AND type = 'cctv_request' ORDER BY id DESC LIMIT 1");
    expect(notif.message).toContain('footage');
  });

  it('attaches a link and follows cctv_footage_days', async () => {
    await setSetting('cctv_footage_days', 3);
    const id = await approved();
    const res = await attach(id, { url: 'https://drive.example.com/clip/abc' });
    expect(res.body).toMatchObject({ success: true, footageKind: 'link' });
    const r = await row(id);
    expect(r.footage_url).toBe('https://drive.example.com/clip/abc');
    expect(r.footage_path).toBeNull();
    expect((await one('SELECT DATEDIFF(footage_expires_at, footage_attached_at) AS d FROM cctv_requests WHERE id = ?', [id])).d).toBe(3);
  });

  it.each([
    ['both a file and a link', (id) => attach(id, { file: MP4, url: 'https://a.example.com/x' })],
    ['neither', (id) => attach(id, {})],
    ['an http link', (id) => attach(id, { url: 'http://a.example.com/x' })],
    ['a javascript link', (id) => attach(id, { url: 'javascript:alert(1)' })],
    ['a link with credentials', (id) => attach(id, { url: 'https://user:pw@a.example.com/x' })],
    ['a link over 500 characters', (id) => attach(id, { url: 'https://a.example.com/' + 'x'.repeat(500) })],
    ['a disallowed extension', (id) => attach(id, { file: MP4, name: 'clip.exe' })],
    ['text pretending to be an mp4', (id) => attach(id, { file: Buffer.from('not a video at all'), name: 'clip.mp4' })],
  ])('%s → 422 and nothing saved', async (_, send) => {
    const id = await approved();
    const res = await send(id);
    expect(res.status).toBe(422);
    const r = await row(id);
    expect([r.footage_path, r.footage_url, r.footage_expires_at]).toEqual([null, null, null]);
  });

  it('a file over 25 MB is refused and nothing is saved', async () => {
    const id = await approved();
    const res = await attach(id, { file: Buffer.concat([MP4, Buffer.alloc(26 * 1024 * 1024)]) });
    expect([413, 422]).toContain(res.status);
    expect((await row(id)).footage_path).toBeNull();
  });

  it('a pending request → 409; unknown id → 404; tenant → 403', async () => {
    const p = await pending();
    expect((await attach(p, { url: 'https://a.example.com/x' })).status).toBe(409);
    expect((await attach(999999, { url: 'https://a.example.com/x' })).status).toBe(404);
    const id = await approved();
    expect((await attach(id, { url: 'https://a.example.com/x' }, maria)).status).toBe(403);
    expect((await row(id)).footage_url).toBeNull();
  });

  it('replacing deletes the old file and restarts the expiry', async () => {
    const id = await approved();
    await attach(id, { file: MP4 });
    const first = await row(id);
    await q('UPDATE cctv_requests SET footage_expires_at = NOW() + INTERVAL 1 DAY WHERE id = ?', [id]);
    const res = await attach(id, { url: 'https://a.example.com/long-clip' });
    expect(res.body).toMatchObject({ success: true, footageKind: 'link' });
    expect(existsSync(BACKEND + first.footage_path)).toBe(false);
    const r = await row(id);
    expect(r.footage_path).toBeNull();
    expect((await one('SELECT DATEDIFF(footage_expires_at, NOW()) AS d FROM cctv_requests WHERE id = ?', [id])).d).toBeGreaterThanOrEqual(13);
  });
});

describe('opening a footage file', () => {
  it('owner and admin can open it; another tenant and a logged-out caller cannot', async () => {
    const id = await approved();
    await attach(id, { file: MP4 });
    const { footage_path } = await row(id);
    expect((await download(footage_path, maria)).status).toBe(200);
    expect((await download(footage_path, admin)).status).toBe(200);
    expect((await download(footage_path, jose)).status).toBe(403);
    expect((await download(footage_path)).status).toBe(401);
  });

  it('a tenant open is logged once per minute, an admin open is not', async () => {
    const id = await approved();
    await attach(id, { file: MP4 });
    const { footage_path } = await row(id);
    await download(footage_path, admin);
    expect(await viewLogs(id)).toBe(0);
    await download(footage_path, maria);
    await download(footage_path, maria);
    expect(await viewLogs(id)).toBe(1);
  });

  it('after expiry → 410 even though the file is still on disk', async () => {
    const id = await approved();
    await attach(id, { file: MP4 });
    const { footage_path } = await row(id);
    await q('UPDATE cctv_requests SET footage_expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?', [id]);
    expect((await download(footage_path, maria)).status).toBe(410);
  });
});

describe('open_cctv_footage.php (link)', () => {
  const open = (id, token) => fetch(`${BASE}/open_cctv_footage.php?id=${id}`, { redirect: 'manual', headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it('redirects the owner to the link and logs it; the link is not in My Requests', async () => {
    const id = await approved();
    await attach(id, { url: 'https://drive.example.com/clip/secret-token' });
    const res = await open(id, maria);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://drive.example.com/clip/secret-token');
    expect(await viewLogs(id)).toBe(1);

    const mine = await api('get_my_requests.php', { token: maria });
    const item = mine.body.requests.find((r) => r.type === 'CCTV' && Number(r.id) === Number(id));
    expect(item.footage_kind).toBe('link');
    expect(JSON.stringify(mine.body)).not.toContain('secret-token');
  });

  it('another tenant 403, logged-out 401, expired 410, admin allowed and not logged', async () => {
    const id = await approved();
    await attach(id, { url: 'https://drive.example.com/clip/x' });
    expect((await open(id, jose)).status).toBe(403);
    expect((await open(id)).status).toBe(401);
    expect((await open(id, admin)).status).toBe(302);
    expect(await viewLogs(id)).toBe(0);
    await q('UPDATE cctv_requests SET footage_expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?', [id]);
    expect((await open(id, maria)).status).toBe(410);
  });
});

describe('remove_cctv_footage.php and the expiry purge', () => {
  it('admin removes footage → file gone, My Requests reports it unavailable; second remove 404; tenant 403', async () => {
    const id = await approved();
    await attach(id, { file: MP4 });
    const { footage_path } = await row(id);
    expect((await api('remove_cctv_footage.php', { token: maria, json: { id } })).status).toBe(403);
    expect((await api('remove_cctv_footage.php', { token: admin, json: { id } })).body).toMatchObject({ success: true });
    expect(existsSync(BACKEND + footage_path)).toBe(false);
    const mine = await api('get_my_requests.php', { token: maria });
    const item = mine.body.requests.find((r) => r.type === 'CCTV' && Number(r.id) === Number(id));
    expect(item.footage_kind).toBeNull();
    expect(Number(item.footage_expired)).toBe(1);
    expect((await api('remove_cctv_footage.php', { token: admin, json: { id } })).status).toBe(404);
  });

  it('the purge deletes expired footage only, and is idempotent', async () => {
    const old = await approved();
    const fresh = await approved();
    await attach(old, { file: MP4 });
    await attach(fresh, { file: MP4 });
    const oldPath = (await row(old)).footage_path;
    const freshPath = (await row(fresh)).footage_path;
    await q('UPDATE cctv_requests SET footage_expires_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?', [old]);

    // get_notifications.php runs the purge on its throttled poll; force it past the throttle.
    await q("DELETE FROM system_settings WHERE setting_key = 'poll_checks_last_run'");
    await api('get_notifications.php', { token: maria });
    await q("DELETE FROM system_settings WHERE setting_key = 'poll_checks_last_run'");
    await api('get_notifications.php', { token: maria });

    const o = await row(old);
    expect([o.footage_path, o.footage_url]).toEqual([null, null]);
    expect(o.footage_expires_at).not.toBeNull();
    expect(existsSync(BACKEND + oldPath)).toBe(false);
    expect((await row(fresh)).footage_path).toBe(freshPath);
    expect(existsSync(BACKEND + freshPath)).toBe(true);
  });
});

describe('cctv_footage_days setting', () => {
  it.each([[0, 422], [91, 422], [1, 200], [90, 200]])('%s days → %s', async (days, status) => {
    const res = await api('update_system_settings.php', { token: admin, json: { cctv_footage_days: days } });
    expect(res.status).toBe(status);
    if (status === 200) {
      const got = await api('get_system_settings.php', { token: admin });
      expect(got.body.settings.cctv_footage_days).toBe(days);
    }
  });

  it('defaults to 14 and a tenant cannot change it', async () => {
    const got = await api('get_system_settings.php', { token: maria });
    expect(got.body.settings.cctv_footage_days).toBe(14);
    expect((await api('update_system_settings.php', { token: maria, json: { cctv_footage_days: 5 } })).status).toBe(403);
  });
});
