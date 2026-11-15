// My Room layout (Other Settings -> My Room): the order of the tenant's My Room
// sections and which show, in the my_room_layout setting. Stored canonical by
// update_system_settings.php: every known section once, the room tag shown.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { setting } from './lib/db.js';

const IDS = ['important', 'room', 'garbage', 'household', 'manageRent', 'houseRules'];

let admin, maria;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

const save = (layout, token = admin) => api('update_system_settings.php', { token, json: { my_room_layout: layout } });
const stored = async () => JSON.parse(await setting('my_room_layout'));

describe('saving the layout', () => {
  it('keeps the order and the switches', async () => {
    const sections = [...IDS].reverse().map((id) => ({ id, show: id !== 'garbage' }));
    expect((await save({ sections })).status).toBe(200);
    expect(await stored()).toEqual({ sections });
  });

  it('appends a section left out, shown', async () => {
    expect((await save({ sections: [{ id: 'houseRules', show: false }, { id: 'room', show: true }] })).status).toBe(200);
    const { sections } = await stored();
    expect(sections.map((s) => s.id)).toEqual(['houseRules', 'room', 'important', 'garbage', 'household', 'manageRent']);
    expect(sections.map((s) => s.show)).toEqual([false, true, true, true, true, true]);
  });

  it('always shows the room tag', async () => {
    expect((await save({ sections: [{ id: 'room', show: false }] })).status).toBe(200);
    expect((await stored()).sections.find((s) => s.id === 'room').show).toBe(true);
  });

  it('accepts the layout as JSON text', async () => {
    expect((await save(JSON.stringify({ sections: [{ id: 'garbage', show: false }] }))).status).toBe(200);
    expect((await stored()).sections[0]).toEqual({ id: 'garbage', show: false });
  });

  it.each([
    ['not JSON', 'top to bottom'],
    ['a list instead of an object', [{ id: 'room', show: true }]],
    ['sections that are not a list', { sections: { room: true } }],
    ['an unknown section', { sections: [{ id: 'parking', show: true }] }],
    ['a section twice', { sections: [{ id: 'garbage', show: true }, { id: 'garbage', show: false }] }],
    ['a show that is not true or false', { sections: [{ id: 'garbage', show: 'no' }] }],
  ])('refuses %s with 422 and keeps the old layout', async (_l, layout) => {
    const before = { sections: IDS.map((id) => ({ id, show: true })) };
    await save(before);
    const res = await save(layout);
    expect(res.status).toBe(422);
    expect(await stored()).toEqual(before);
  });

  it('is admin only', async () => {
    expect((await save({ sections: [] }, maria)).status).toBe(403);
  });
});

describe('who can read it', () => {
  it('a signed-in tenant sees the layout', async () => {
    const res = await api('get_system_settings.php', { token: maria });
    expect(JSON.parse(res.body.settings.my_room_layout).sections).toHaveLength(IDS.length);
  });

  it('a logged-out visitor does not', async () => {
    const res = await api('get_system_settings.php');
    expect(res.body.settings.my_room_layout).toBeUndefined();
  });
});
