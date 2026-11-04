// pin_announcement.php: an admin pins up to three sent announcements to the top
// of the tenants' feed (get_announcements.php?public=1 sorts pinned first).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin, maria;
beforeAll(async () => { [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]); });
beforeEach(async () => { await q("DELETE FROM announcements WHERE title LIKE 'Pin %'"); });

const make = async (title, status = 'sent', ageMinutes = 0) => {
  await q(
    "INSERT INTO announcements (tag, title, body, send_to, channels, status, created_at) VALUES ('General', ?, 'Body', 'All Tenants', '[]', ?, NOW() - INTERVAL ? MINUTE)",
    [title, status, ageMinutes],
  );
  return (await one('SELECT id FROM announcements WHERE title = ?', [title])).id;
};
const pin = (id, pinned, token = admin) => api('pin_announcement.php', { token, json: { id, pinned } });
const feed = async () => (await api('get_announcements.php', { token: maria, query: { public: '1' } })).body.announcements;

describe('pinning', () => {
  it('pins to the top of the feed and unpins back into date order', async () => {
    const older = await make('Pin older', 'sent', 60);
    await make('Pin newer', 'sent', 1);
    const res = await pin(older, true);
    expect(res.body).toMatchObject({ success: true, pinned: true });
    const pinnedFeed = (await feed()).filter((a) => a.title.startsWith('Pin '));
    expect(pinnedFeed.map((a) => a.title)).toEqual(['Pin older', 'Pin newer']);
    expect(Number(pinnedFeed[0].is_pinned)).toBe(1);

    await pin(older, false);
    expect((await feed()).filter((a) => a.title.startsWith('Pin ')).map((a) => a.title)).toEqual(['Pin newer', 'Pin older']);
  });

  it('refuses a fourth pin (409) but still lets one be unpinned', async () => {
    const ids = [];
    for (const n of [1, 2, 3, 4]) ids.push(await make(`Pin ${n}`));
    await q('UPDATE announcements SET is_pinned = 0');
    for (const id of ids.slice(0, 3)) expect((await pin(id, true)).body.success).toBe(true);
    const res = await pin(ids[3], true);
    expect(res.status).toBe(409);
    expect((await one('SELECT is_pinned FROM announcements WHERE id = ?', [ids[3]])).is_pinned).toBe(0);
    // Pinning an already-pinned one is not a fourth pin.
    expect((await pin(ids[0], true)).body.success).toBe(true);
    expect((await pin(ids[0], false)).body.success).toBe(true);
  });

  it('only a sent announcement can be pinned', async () => {
    const draft = await make('Pin draft', 'draft');
    expect((await pin(draft, true)).status).toBe(404);
    expect((await pin(99999999, true)).status).toBe(404);
  });

  it('is admin only', async () => {
    const id = await make('Pin tenant');
    const res = await pin(id, true, maria);
    expect(res.status).toBe(403);
    expect((await one('SELECT is_pinned FROM announcements WHERE id = ?', [id])).is_pinned).toBe(0);
  });
});
