// Send an Inquiry (submit_inquiry.php): number of occupants up to Settings →
// Rental → Maximum Occupants per Unit, preferred move-in date from today up to
// inquiry_move_in_max_months (default 6) ahead. Errors are keyed by field (422).
import { describe, it, expect, beforeEach } from 'vitest';
import { api } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

// Local YYYY-MM-DD n days / months from today, like PHP's strtotime (month overflow included).
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromToday = ({ days = 0, months = 0 } = {}) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return ymd(d);
};

let n = 0;
const send = (extra) => api('submit_inquiry.php', {
  json: { full_name: 'Limit Probe', email: `limitprobe${++n}@demo.example`, contact_no: '09171234500', ...extra },
});
const saved = (email) => one('SELECT occupants, preferred_move_in FROM inquiries WHERE email = ?', [email]);

beforeEach(async () => {
  // The 3-a-day limit counts the IP too; every request here comes from the test server's.
  await q('UPDATE inquiries SET ip_address = NULL');
  await setSetting('max_occupants_per_unit', '4');
  await setSetting('inquiry_move_in_max_months', '6');
});

describe('submit_inquiry.php limits', () => {
  it('accepts occupants up to the per-unit maximum and refuses above it', async () => {
    const ok = await send({ occupants: 4 });
    expect(ok.status).toBe(200);
    expect((await saved(`limitprobe${n}@demo.example`)).occupants).toBe(4);

    const over = await send({ occupants: 5 });
    expect(over.status).toBe(422);
    expect(over.body.errors.occupants).toMatch(/1 to 4/);
  });

  it('follows the setting when the admin changes it', async () => {
    await setSetting('max_occupants_per_unit', '2');
    expect((await send({ occupants: 3 })).status).toBe(422);
  });

  it('refuses non-numbers that used to be cast (abc, 1e3, 2.5, 0, true)', async () => {
    for (const occupants of ['abc', '1e3', '2.5', 0, '0', true, -1]) {
      const res = await send({ occupants });
      expect(res.status, String(occupants)).toBe(422);
      expect(res.body.errors, String(occupants)).toHaveProperty('occupants');
    }
  });

  it('accepts a move-in date on the last allowed day and refuses the day after', async () => {
    const last = fromToday({ months: 6 });
    const ok = await send({ preferred_move_in: last });
    expect(ok.status).toBe(200);
    expect(String((await saved(`limitprobe${n}@demo.example`)).preferred_move_in).slice(0, 10)).toBe(last);

    const after = await send({ preferred_move_in: fromToday({ months: 6, days: 1 }) });
    expect(after.status).toBe(422);
    expect(after.body.errors.preferred_move_in).toMatch(/6 months/);
  });

  it('refuses a far-future year, a past date and an impossible date', async () => {
    for (const preferred_move_in of ['2030-01-01', fromToday({ days: -1 }), '2027-02-30']) {
      const res = await send({ preferred_move_in });
      expect(res.status, preferred_move_in).toBe(422);
      expect(res.body.errors, preferred_move_in).toHaveProperty('preferred_move_in');
    }
  });

  it('a shorter limit set by the admin applies, and a garbled one falls back to 6 months', async () => {
    await setSetting('inquiry_move_in_max_months', '1');
    expect((await send({ preferred_move_in: fromToday({ months: 2 }) })).status).toBe(422);
    await setSetting('inquiry_move_in_max_months', 'lots');
    expect((await send({ preferred_move_in: fromToday({ months: 5 }) })).status).toBe(200);
  });

  it('reports several bad fields together, each under its own name', async () => {
    const res = await api('submit_inquiry.php', { json: { full_name: '', email: 'nope', contact_no: '123', occupants: 99, preferred_move_in: '2099-01-01' } });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.errors).sort()).toEqual(['contact_no', 'email', 'full_name', 'occupants', 'preferred_move_in']);
  });
});

describe('inquiry_move_in_max_months setting', () => {
  it('is readable without signing in and saved by the admin within 1-24', async () => {
    const { loginAs } = await import('./lib/api.js');
    const admin = await loginAs('admin');
    expect((await api('get_system_settings.php')).body.settings.inquiry_move_in_max_months).toBe('6');
    expect((await api('update_system_settings.php', { token: admin, json: { inquiry_move_in_max_months: '3' } })).status).toBe(200);
    expect((await api('update_system_settings.php', { token: admin, json: { inquiry_move_in_max_months: '25' } })).status).toBe(422);
    expect((await api('update_system_settings.php', { token: admin, json: { inquiry_move_in_max_months: '0' } })).status).toBe(422);
  });
});
