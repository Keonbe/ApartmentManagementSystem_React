// Housekeeping / garbage schedule: a JSON list in the garbage_schedule setting,
// validated on save (update_system_settings.php), readable by a signed-in tenant,
// not by a logged-out visitor.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { setting } from './lib/db.js';

let admin, maria;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

const save = (rows, token = admin) => api('update_system_settings.php', { token, json: { garbage_schedule: typeof rows === 'string' ? rows : JSON.stringify(rows) } });

describe('saving the schedule', () => {
  it('stores a clean list', async () => {
    const res = await save([{ day: 'Monday', what: '  Biodegradable  ', time: '6:00 AM' }, { day: 'Every day', what: 'Common area cleaning', time: '' }]);
    expect(res.status).toBe(200);
    expect(JSON.parse(await setting('garbage_schedule'))).toEqual([
      { day: 'Monday', what: 'Biodegradable', time: '6:00 AM' },
      { day: 'Every day', what: 'Common area cleaning', time: '' },
    ]);
  });

  it('can be emptied', async () => {
    expect((await save([])).status).toBe(200);
    expect(JSON.parse(await setting('garbage_schedule'))).toEqual([]);
  });

  it.each([
    ['not a list', '{"day":"Monday"}'],
    ['not JSON', 'Mondays'],
    ['an unknown day', [{ day: 'Funday', what: 'Trash', time: '' }]],
    ['no description', [{ day: 'Monday', what: '  ', time: '' }]],
    ['a description over 60 characters', [{ day: 'Monday', what: 'x'.repeat(61), time: '' }]],
    ['a time over 30 characters', [{ day: 'Monday', what: 'Trash', time: 'y'.repeat(31) }]],
    ['more than 14 rows', Array.from({ length: 15 }, () => ({ day: 'Monday', what: 'Trash', time: '' }))],
  ])('refuses %s with 422 and keeps the old list', async (_l, rows) => {
    await save([{ day: 'Friday', what: 'Residual', time: '' }]);
    const res = await save(rows);
    expect(res.status).toBe(422);
    expect(JSON.parse(await setting('garbage_schedule'))).toEqual([{ day: 'Friday', what: 'Residual', time: '' }]);
  });

  it('is admin only', async () => {
    expect((await save([{ day: 'Monday', what: 'Trash', time: '' }], maria)).status).toBe(403);
  });
});

describe('who can read it', () => {
  it('a signed-in tenant sees the schedule', async () => {
    const res = await api('get_system_settings.php', { token: maria });
    expect(JSON.parse(res.body.settings.garbage_schedule)).toEqual([{ day: 'Friday', what: 'Residual', time: '' }]);
  });

  it('a logged-out visitor does not', async () => {
    const res = await api('get_system_settings.php');
    expect(res.body.settings.garbage_schedule).toBeUndefined();
  });
});
