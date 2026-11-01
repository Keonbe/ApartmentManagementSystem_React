// Other Settings → Contract End and → Preview Page:
// - extension_deadline_days: my_room.php / extend_lease.php refuse a tenant's
//   request after the deadline (config.php extension_deadline_reason()).
// - upcoming rooms: get_rooms.php availableFrom for guests (upcoming_room_dates()).
// - the rent-end reminder switches (send_lease_end_reminders()).
// - preview_hero settings and upload_preview_image.php.
// Dates are relative to today, so the suite doesn't depend on the seed's date.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { api, loginAs } from './lib/api.js';
import { q, one, setting, setSetting } from './lib/db.js';
import { ROOT } from './lib/env.js';

let admin, maria, rosa;
const save = (json, token = admin) => api('update_system_settings.php', { token, json });
const myExtension = async (token) => (await api('my_room.php', { token })).body.data.extension;
const guestRooms = async () => Object.fromEntries((await api('get_rooms.php')).body.rooms.map((r) => [r.id, r]));
const ymd = (daysFromToday) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Rent end for an application, days from today (contract + room).
async function setRentEndDays(appId, room, days) {
  await q('UPDATE lease_contracts SET lease_end = DATE_ADD(CURDATE(), INTERVAL ? DAY), renewal_reminder_sent_at = NULL WHERE rent_application_id = ?', [days, appId]);
  await q('UPDATE rooms SET lease_end = DATE_ADD(CURDATE(), INTERVAL ? DAY) WHERE id = ?', [days, room]);
}
const leaseEnd = async (appId) => {
  const row = await one('SELECT DATE_FORMAT(lease_end, "%Y-%m-%d") AS d FROM lease_contracts WHERE rent_application_id = ?', [appId]);
  return row.d;
};

beforeAll(async () => {
  [admin, maria, rosa] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('rosa')]);
  await setSetting('min_lease_duration', 3);
  await setSetting('max_rent_ahead_months', 12);
});

describe('Contract End settings', () => {
  it('ship with no deadline, reminders on, upcoming rooms on', async () => {
    const s = (await api('get_system_settings.php')).body.settings;
    expect(s).toMatchObject({
      extension_deadline_days: 0,
      lease_end_reminders_enabled: '1',
      lease_end_reminder_email: '1',
      lease_end_reminder_sms: '1',
      upcoming_rooms_enabled: '1',
    });
  });

  it('switches are stored as 1 / 0; anything else is refused', async () => {
    expect((await save({ lease_end_reminder_sms: false, upcoming_rooms_enabled: 'true' })).status).toBe(200);
    expect(await setting('lease_end_reminder_sms')).toBe('0');
    expect(await setting('upcoming_rooms_enabled')).toBe('1');
    expect((await save({ lease_end_reminder_email: 'yes' })).status).toBe(422);
    await setSetting('lease_end_reminder_sms', '1');
  });

  it.each(['91', '-1', '7.5', 'x', ''])('deadline %j → 422', async (v) => {
    const res = await save({ extension_deadline_days: v });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty('extensionDeadlineDays');
  });

  it('the reminder must go out before requests close', async () => {
    let res = await save({ extension_deadline_days: '30', lease_end_reminder_days: '30' });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty('leaseEndReminderDays');
    expect(await setting('extension_deadline_days')).toBe('0');

    expect((await save({ extension_deadline_days: '14', lease_end_reminder_days: '30' })).status).toBe(200);
    // Lowering only the reminder below the stored deadline is caught too.
    expect((await save({ lease_end_reminder_days: '10' })).status).toBe(422);
    expect(await setting('lease_end_reminder_days')).toBe('30');
    expect((await save({ extension_deadline_days: '90', lease_end_reminder_days: '120' })).status).toBe(200);
    await save({ extension_deadline_days: '0', lease_end_reminder_days: '30' });
  });

  it('a tenant cannot change them', async () => {
    expect((await save({ extension_deadline_days: '5' }, maria)).status).toBe(403);
  });
});

describe('extension deadline (Maria, app 1, room A)', () => {
  afterAll(() => setSetting('extension_deadline_days', '0'));

  it('before the deadline: allowed, and My Room names the last day', async () => {
    await setSetting('extension_deadline_days', '14');
    await setRentEndDays(1, 'A', 40);
    const ext = await myExtension(maria);
    expect(ext.allowed).toBe(true);
    expect(ext.deadline).toBe(ymd(26));
  });

  it('after the deadline: My Room says why, and the request is refused', async () => {
    await setRentEndDays(1, 'A', 10);
    const ext = await myExtension(maria);
    expect(ext.allowed).toBe(false);
    expect(ext.reason).toMatch(/Extension requests closed on .*14 days before your rent ends/);
    const res = await api('extend_lease.php', { token: maria, json: { additionalMonths: 3 } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Extension requests closed on/);
    expect((await one("SELECT COUNT(*) AS c FROM notifications WHERE user_id = 2 AND type = 'lease_extension_request'")).c).toBe(0);
  });

  it('the deadline day itself is still open', async () => {
    await setRentEndDays(1, 'A', 14);
    expect((await myExtension(maria)).allowed).toBe(true);
  });

  it('with no deadline (0) a tenant can ask until the last day', async () => {
    await setSetting('extension_deadline_days', '0');
    await setRentEndDays(1, 'A', 3);
    const ext = await myExtension(maria);
    expect(ext.deadline).toBeNull();
    expect(ext.reason ?? '').not.toMatch(/Extension requests closed/);
  });
});

describe('upcoming rooms on Preview (get_rooms.php availableFrom)', () => {
  beforeAll(async () => {
    await setSetting('extension_deadline_days', '14');
    await setSetting('upcoming_rooms_enabled', '1');
    await setRentEndDays(1, 'A', 10); // past Maria's deadline
    await q("UPDATE rent_applications SET requested_move_out_date = DATE_ADD(CURDATE(), INTERVAL 20 DAY) WHERE id = 11"); // Mark, room L
    await q("UPDATE rooms SET status = 'occupied' WHERE id = 'L'");
  });
  afterAll(() => setSetting('extension_deadline_days', '0'));

  it('lists a unit past its deadline and a scheduled move-out, with the date only', async () => {
    const rooms = await guestRooms();
    expect(rooms.A.availableFrom).toBe(await leaseEnd(1));
    expect(rooms.L.availableFrom).toBe(ymd(20));
    expect(rooms.A).not.toHaveProperty('tenantName');
    expect(rooms.A).not.toHaveProperty('tenant_name');
  });

  it('a unit still inside its deadline is not listed', async () => {
    await setRentEndDays(1, 'A', 30);
    expect((await guestRooms()).A.availableFrom).toBeNull();
    await setRentEndDays(1, 'A', 10);
  });

  it('an open extension request keeps the unit off the list', async () => {
    await q("INSERT INTO notifications (user_id, type, title, message, metadata_value, status, is_read) VALUES (2, 'lease_extension_request', 'Rent Extension Request', 'test', '3', 'Pending', 0)");
    expect((await guestRooms()).A.availableFrom).toBeNull();
    await q("DELETE FROM notifications WHERE user_id = 2 AND type = 'lease_extension_request'");
    expect((await guestRooms()).A.availableFrom).toBe(await leaseEnd(1));
  });

  it('with no deadline only scheduled move-outs are listed', async () => {
    await setSetting('extension_deadline_days', '0');
    const rooms = await guestRooms();
    expect(rooms.A.availableFrom).toBeNull();
    expect(rooms.L.availableFrom).toBe(ymd(20));
    await setSetting('extension_deadline_days', '14');
  });

  it('switched off, nothing is listed', async () => {
    await setSetting('upcoming_rooms_enabled', '0');
    expect(Object.values(await guestRooms()).filter((r) => r.availableFrom)).toEqual([]);
    await setSetting('upcoming_rooms_enabled', '1');
  });
});

describe('rent-end reminder switches (Rosa, app 3)', () => {
  const sweep = () => api('check_due_date_reminders.php', { token: admin, json: {} });
  const reminders = () => one("SELECT COUNT(*) AS c, MAX(message) AS m FROM notifications WHERE user_id = 5 AND title = 'Rent Approaching End'");
  const claimed = async () => (await one('SELECT renewal_reminder_sent_at AS t FROM lease_contracts WHERE rent_application_id = 3')).t;

  beforeAll(async () => {
    await q("DELETE FROM notifications WHERE user_id = 5 AND title = 'Rent Approaching End'");
    await setRentEndDays(3, 'C', 20);
    await setSetting('lease_end_reminder_days', '30');
  });

  it('switched off: no reminder, and nothing is claimed for later', async () => {
    await setSetting('lease_end_reminders_enabled', '0');
    expect((await sweep()).status).toBe(200);
    expect((await reminders()).c).toBe(0);
    expect(await claimed()).toBeNull();
  });

  it('switched on with a deadline: one reminder that names the last day to ask', async () => {
    await setSetting('lease_end_reminders_enabled', '1');
    await setSetting('extension_deadline_days', '7');
    await setSetting('lease_end_reminder_email', '0');
    await setSetting('lease_end_reminder_sms', '0');
    expect((await sweep()).status).toBe(200);
    const r = await reminders();
    expect(r.c).toBe(1);
    expect(r.m).toMatch(/Request an extension in My Room by /);
    expect(await claimed()).not.toBeNull();
    // Email and SMS were off: nothing queued or logged for it.
    expect((await one("SELECT COUNT(*) AS c FROM notification_queue WHERE user_id = 5 AND event_type = 'contract_update'")).c).toBe(0);
    expect((await one("SELECT COUNT(*) AS c FROM notification_log WHERE user_id = 5 AND event_type = 'contract_update' AND channel <> 'in-app'")).c).toBe(0);

    expect((await sweep()).status).toBe(200);
    expect((await reminders()).c).toBe(1); // claimed: never twice
    await setSetting('extension_deadline_days', '0');
    await setSetting('lease_end_reminder_email', '1');
    await setSetting('lease_end_reminder_sms', '1');
  });
});

// ── Preview page hero ──

function png(width, height) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, 128)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const HERO_PATTERN = /^site_assets\/preview_hero_[0-9]+_[a-f0-9]{8}\.png$/;
const assetPath = (rel) => path.join(ROOT, 'backend', rel);
const uploaded = [];
const upload = (data, token = admin) => {
  const form = new FormData();
  if (data) form.append('image', new Blob([data], { type: 'image/png' }), 'hero.png');
  return api('upload_preview_image.php', { token, form });
};
const uploadOk = async () => {
  const res = await upload(png(800, 20));
  expect(res.status).toBe(200);
  uploaded.push(res.body.image_path);
  return res.body.image_path;
};
afterAll(() => {
  for (const rel of uploaded) fs.rmSync(assetPath(rel), { force: true });
});

const T = (en = '', fil = '', show = true) => ({ show, en, fil });
const DEFAULT_HERO = {
  image: '',
  badge: T(), title: T(), location: T(),
  features: [
    { en: 'Motorcycle Parking', fil: 'Paradahan ng Motor' },
    { en: 'Bathroom per Room', fil: 'Banyo sa Bawat Kwarto' },
  ],
};

describe('preview_hero', () => {
  it('ships with the built-in wording and the two features, readable by anyone', async () => {
    expect((await api('get_system_settings.php')).body.settings.preview_hero).toEqual(DEFAULT_HERO);
  });

  it('an unchanged form changes nothing', async () => {
    const res = await save({ preview_hero: DEFAULT_HERO });
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(0);
  });

  it('saves text and features, tidied to one line; unknown keys dropped', async () => {
    const res = await save({
      preview_hero: {
        ...DEFAULT_HERO,
        badge: T('', '', false),
        title: T('  Rooms\nin Silang ', ''),
        features: [{ en: 'Free Wi-Fi', fil: '' }, { en: '<b>CCTV</b>', fil: 'CCTV' }],
        evil: 'x',
      },
    });
    expect(res.status).toBe(200);
    const stored = JSON.parse(await setting('preview_hero'));
    expect(Object.keys(stored)).toEqual(['image', 'badge', 'title', 'location', 'features']);
    expect(stored.badge.show).toBe(false);
    expect(stored.title.en).toBe('Rooms in Silang');
    expect(stored.features).toEqual([{ en: 'Free Wi-Fi', fil: '' }, { en: '<b>CCTV</b>', fil: 'CCTV' }]);
    expect((await save({ preview_hero: { ...DEFAULT_HERO, features: [] } })).status).toBe(200);
    expect(JSON.parse(await setting('preview_hero')).features).toEqual([]);
  });

  it.each([
    ['seven features', { features: Array.from({ length: 7 }, (_, i) => ({ en: `F${i}`, fil: '' })) }],
    ['a feature without English', { features: [{ en: '  ', fil: 'Libre' }] }],
    ['a feature over 40 characters', { features: [{ en: 'x'.repeat(41), fil: '' }] }],
    ['features that are not a list', { features: { a: { en: 'x' } } }],
    ['a title over 60 characters', { title: T('t'.repeat(61)) }],
    ['a show that is not true/false', { badge: { show: 'no', en: '', fil: '' } }],
    ['an image outside the uploads', { image: '../config.php' }],
    ['an image of the right shape that is missing', { image: 'site_assets/preview_hero_1_deadbeef.png' }],
    ['a Glass photo used as the hero', { image: 'site_assets/glass_bg_1_deadbeef.png' }],
  ])('%s → 422, nothing saved', async (_, patch) => {
    const before = await setting('preview_hero');
    const res = await save({ preview_hero: { ...DEFAULT_HERO, ...patch } });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty('previewHero');
    expect(await setting('preview_hero')).toBe(before);
  });

  it('a garbled stored value reads as the defaults', async () => {
    await setSetting('preview_hero', '{nope');
    expect((await api('get_system_settings.php')).body.settings.preview_hero).toEqual(DEFAULT_HERO);
  });

  it('upload needs an admin and a real image', async () => {
    expect((await upload(png(800, 20), maria)).status).toBe(403);
    expect((await upload(png(800, 20), null)).status).toBe(401);
    expect((await upload(null)).status).toBe(422);
    expect((await upload(png(40, 40))).status).toBe(422);
  });

  const recent = (kind, token = admin) => api('get_glass_backgrounds.php', { token, query: { kind } });
  const remove = (p, kind, token = admin) => api('delete_glass_background.php', { token, json: { path: p, kind } });

  it('an upload goes live on save, is served publicly, and the one it replaced stays in the recent list', async () => {
    const first = await uploadOk();
    expect(first).toMatch(HERO_PATTERN);
    // Not live until saved.
    expect((await api('get_system_settings.php')).body.settings.preview_hero.image).toBe('');

    expect((await save({ preview_hero: { ...DEFAULT_HERO, image: first } })).status).toBe(200);
    expect((await api('get_system_settings.php')).body.settings.preview_hero.image).toBe(first);
    const served = await api('public_file.php', { query: { path: first } });
    expect(served.status).toBe(200);

    const second = await uploadOk();
    expect((await save({ preview_hero: { ...DEFAULT_HERO, image: second } })).status).toBe(200);
    expect(fs.existsSync(assetPath(first))).toBe(true);

    const list = await recent('preview');
    expect(list.status).toBe(200);
    const paths = list.body.backgrounds.map((b) => b.path);
    expect(paths.indexOf(second)).toBeLessThan(paths.indexOf(first));
    expect(list.body.backgrounds.find((b) => b.path === second).live).toBe(true);
    // The Glass list never shows Preview photos.
    expect((await recent('glass')).body.backgrounds.map((b) => b.path)).not.toContain(second);

    // Back to the built-in photo: both uploads stay to switch back to.
    expect((await save({ preview_hero: DEFAULT_HERO })).status).toBe(200);
    expect(fs.existsSync(assetPath(second))).toBe(true);
  });

  it('keeps only the last 6 Preview photos, never the live one, and leaves Glass photos alone', async () => {
    const live = await uploadOk();
    expect((await save({ preview_hero: { ...DEFAULT_HERO, image: live } })).status).toBe(200);
    const later = [];
    for (let i = 0; i < 7; i++) later.push(await uploadOk());
    const paths = (await recent('preview')).body.backgrounds.map((b) => b.path);
    expect(paths).toEqual([...later.slice(-5).reverse(), live]);
    expect(fs.existsSync(assetPath(later[0]))).toBe(false);
    expect(fs.existsSync(assetPath(live))).toBe(true);
  });

  it('removing: the live photo is refused, a Glass name in the Preview list is refused, another is deleted', async () => {
    const live = (await api('get_system_settings.php')).body.settings.preview_hero.image;
    expect((await remove(live, 'preview')).status).toBe(409);
    expect((await remove('site_assets/glass_bg_1_deadbeef.png', 'preview')).status).toBe(422);
    expect((await remove(live, 'unknown')).status).toBe(422);
    expect((await recent('unknown')).status).toBe(422);
    expect((await recent('preview', rosa)).status).toBe(403);

    const extra = await uploadOk();
    const res = await remove(extra, 'preview');
    expect(res.status).toBe(200);
    expect(fs.existsSync(assetPath(extra))).toBe(false);
    expect(res.body.backgrounds.map((b) => b.path)).not.toContain(extra);
  });

  it('a tenant cannot change it', async () => {
    const before = await setting('preview_hero');
    expect((await save({ preview_hero: DEFAULT_HERO }, rosa)).status).toBe(403);
    expect(await setting('preview_hero')).toBe(before);
  });
});

// ── Applying for an upcoming unit ──
// rent_application.php / resubmit_date.php: a unit that is still occupied can
// be applied for once it is upcoming, moving in no earlier than the day it is
// free ("any time" means that day). Approval waits until it is vacant.
describe('applying for an upcoming unit', () => {
  const UPLOADS = path.join(ROOT, 'backend/uploads/applications');
  const listUploads = () => (fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS) : []);
  let liza, uploadsBefore, freeOn;
  const apply = (room, extra = {}) => {
    const form = new FormData();
    const fields = {
      firstName: 'Liza', lastName: 'Navarro', contactNo: '+639171234515', email: 'liza.navarro@gmail.com',
      gender: 'Female', occupants: '1', monthsOfRent: '6', roomName: room, monthlyRent: '4000', agreeTerms: 'true',
      previousAddress: 'Blk 4 Lot 2, Brgy. Biga, Silang, Cavite', preferredMoveInDate: '', isAsap: '1', ...extra,
    };
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const id of [1, 2]) form.append(`doc_${id}`, new Blob([png(800, 20)], { type: 'image/png' }), `doc${id}.png`);
    return api('rent_application.php', { token: liza, form });
  };
  const lizaApp = () => one("SELECT id, status, DATE_FORMAT(preferred_move_in_date, '%Y-%m-%d') AS d FROM rent_applications WHERE user_id = 17 ORDER BY id DESC LIMIT 1");

  beforeAll(async () => {
    liza = (await api('login.php', { json: { email_address: 'liza.navarro@gmail.com', password: 'tenant123' } })).body.sessionToken;
    uploadsBefore = new Set(listUploads());
    await setSetting('extension_deadline_days', '14');
    await setSetting('upcoming_rooms_enabled', '1');
    await setRentEndDays(1, 'A', 10); // Maria's room A frees up in 10 days
    freeOn = await leaseEnd(1);
  });
  afterAll(async () => {
    for (const f of listUploads()) if (!uploadsBefore.has(f)) fs.unlinkSync(path.join(UPLOADS, f));
    await setSetting('extension_deadline_days', '0');
  });

  it('an occupied unit that is not freeing up is refused (409 on roomName)', async () => {
    const res = await apply('B');
    expect(res.status).toBe(409);
    expect(res.body.field).toBe('roomName');
  });

  it('a move-in date before the unit is free is refused', async () => {
    const res = await apply('A', { isAsap: '0', preferredMoveInDate: ymd(9) });
    expect(res.status).toBe(422);
    expect(res.body.field).toBe('preferredMoveInDate');
    expect(res.body.message).toMatch(/available from/);
  });

  it('"any time" is stored as the day the unit is free', async () => {
    const res = await apply('A');
    expect(res.body).toMatchObject({ success: true });
    const app = await lizaApp();
    expect(app.d).toBe(freeOn);
    expect(app.status).toBe('Pending Review');
  });

  it('a new move-in date (resubmit_date.php) cannot be before it either', async () => {
    const app = await lizaApp();
    await q("UPDATE rent_applications SET status = 'Action Required' WHERE id = ?", [app.id]);
    const early = await api('resubmit_date.php', { token: liza, json: { id: app.id, preferred_move_in_date: ymd(5) } });
    expect(early.status).toBe(422);
    expect(early.body.message).toMatch(/available from/);
    const ok = await api('resubmit_date.php', { token: liza, json: { id: app.id, preferred_move_in_date: ymd(12) } });
    expect(ok.body).toMatchObject({ success: true });
  });

  it('approval waits until the current tenant has moved out', async () => {
    const app = await lizaApp();
    await q('UPDATE rent_applications SET documents_verified_at = NOW() WHERE id = ?', [app.id]);
    const res = await api('update_tenant_status.php', { token: admin, json: { id: app.id, status: 'Approved' } });
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/still has a tenant/);
    expect((await one("SELECT status FROM rooms WHERE id = 'A'")).status).toBe('occupied');
  });
});
