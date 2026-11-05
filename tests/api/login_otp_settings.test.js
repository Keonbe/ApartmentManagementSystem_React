// Sign-in codes on new devices (Admin → Other Settings → Sign-in Codes):
// login_otp_settings.php and the rule in services/login_otp_policy.php that
// login.php applies. The suite's demo accounts skip codes by domain
// (DEVICE_OTP_BYPASS_DOMAINS), so these tests use an account on another domain
// and send a cookie that is not a trusted device.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { q, one, setting, setSetting } from './lib/db.js';

const HASH = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy'; // tenant123
const EMAIL = 'otp.rules@otp-test.example';
let admin, userId;

const settings = (query = {}) => api('login_otp_settings.php', { token: admin, query });
const post = (json, token = admin) => api('login_otp_settings.php', { token, json });
// A sign-in from a browser with no trusted-device cookie.
const signIn = () => api('login.php', { json: { email_address: EMAIL, password: 'tenant123' }, headers: { Cookie: 'unrelated=1' } });
const asksForCode = async () => (await signIn()).body?.status === 'device_verification_required';

beforeAll(async () => {
  admin = await login('admin@gmail.com', 'admin123');
  await q(
    `INSERT INTO users (first_name, last_name, email_address, password, role, email_verified_at)
     VALUES ('Otto', 'Rules', ?, ?, 'user', NOW())`, [EMAIL, HASH],
  );
  userId = (await one('SELECT id FROM users WHERE email_address = ?', [EMAIL])).id;
});

afterAll(async () => {
  await setSetting('login_otp_enabled', '1');
});

describe('who gets a sign-in code', () => {
  it('on by default: a new device is asked for a code', async () => {
    expect(await setting('login_otp_enabled')).toBe('1');
    expect(await asksForCode()).toBe(true);
  });

  it('turned off for everyone: signs straight in', async () => {
    expect((await post({ action: 'set_global', enabled: false })).body).toMatchObject({ success: true, enabled: false });
    expect(await setting('login_otp_enabled')).toBe('0');
    const res = await signIn();
    expect(res.body).toMatchObject({ valid: true, role: 'user' });
    expect(res.body.sessionToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('an account set to "on" is still asked while the default is off', async () => {
    await post({ action: 'set_user', user_id: userId, mode: 'on' });
    expect(await asksForCode()).toBe(true);
  });

  it('an account set to "off" is not asked while the default is on', async () => {
    await post({ action: 'set_global', enabled: true });
    await post({ action: 'set_user', user_id: userId, mode: 'off' });
    expect(await asksForCode()).toBe(false);
  });

  it('back to "default" follows the switch again', async () => {
    await post({ action: 'set_user', user_id: userId, mode: 'default' });
    expect(await asksForCode()).toBe(true);
  });

  it('each change is logged', async () => {
    const row = await one("SELECT COUNT(*) AS c FROM activity_logs WHERE category = 'auth' AND action IN ('Updated Sign-in Code Setting', 'Updated Account Sign-in Code')");
    expect(row.c).toBeGreaterThanOrEqual(4);
  });
});

describe('the account list', () => {
  it('counts add up and every filter lists only its group', async () => {
    const res = await settings();
    expect(res.status).toBe(200);
    const { counts } = res.body;
    expect(counts.all).toBe(counts.active + counts.past + counts.non_tenant);
    expect(counts.active).toBeGreaterThan(0);
    for (const group of ['active', 'past', 'non_tenant']) {
      const list = (await settings({ filter: group })).body;
      expect(list.total).toBe(counts[group]);
      for (const u of list.users) expect(u.group).toBe(group);
    }
  });

  it('lists tenant accounts only (no admin)', async () => {
    const all = await settings({ q: 'admin@gmail.com' });
    expect(all.body.users).toHaveLength(0);
  });

  it('search finds by name, email or unit, and the counts follow it', async () => {
    const byName = (await settings({ q: 'Otto Rules' })).body;
    expect(byName.users.map((u) => u.email)).toEqual([EMAIL]);
    expect(byName.counts.all).toBe(1);
    expect(byName.counts.non_tenant).toBe(1);
    const byEmail = (await settings({ q: 'otp-test.example' })).body;
    expect(byEmail.users[0]).toMatchObject({ id: userId, group: 'non_tenant', mode: 'default' });
    const maria = (await settings({ q: 'maria.santos' })).body.users[0];
    expect(maria.group).toBe('active');
    const byUnit = (await settings({ q: maria.unit, filter: 'active' })).body;
    expect(byUnit.users.some((u) => u.id === maria.id)).toBe(true);
  });

  it('a % in the search is literal, not a wildcard', async () => {
    expect((await settings({ q: '%' })).body.counts.all).toBe(0);
  });

  it('"custom" lists the accounts not following the default; clearing resets them', async () => {
    await post({ action: 'set_user', user_id: userId, mode: 'off' });
    const custom = (await settings({ filter: 'custom' })).body;
    expect(custom.users.map((u) => u.id)).toContain(userId);
    expect((await post({ action: 'clear_overrides' })).body.cleared).toBeGreaterThanOrEqual(1);
    expect((await settings({ filter: 'custom' })).body.total).toBe(0);
    expect((await one('SELECT login_otp_mode FROM users WHERE id = ?', [userId])).login_otp_mode).toBe('default');
  });

  it('pages of 20', async () => {
    const first = (await settings({ page: 1 })).body;
    expect(first.per_page).toBe(20);
    expect(first.users.length).toBe(Math.min(20, first.total));
    const beyond = (await settings({ page: 99 })).body;
    expect(beyond.users).toHaveLength(0);
  });
});

describe('refusals', () => {
  it('is admin only', async () => {
    const tenant = await loginAs('maria');
    expect([401, 403]).toContain((await api('login_otp_settings.php', { token: tenant })).status);
    expect([401, 403]).toContain((await post({ action: 'set_global', enabled: false }, tenant)).status);
    expect(await setting('login_otp_enabled')).toBe('1');
  });

  it('refuses bad input', async () => {
    for (const json of [
      { action: 'set_global', enabled: 'false' },
      { action: 'set_global' },
      { action: 'set_user', user_id: userId, mode: 'sometimes' },
      { action: 'set_user', user_id: String(userId), mode: 'on' },
      { action: 'nope' },
    ]) {
      expect((await post(json)).status, JSON.stringify(json)).toBe(422);
    }
    for (const query of [{ filter: 'everyone' }, { page: '0' }, { page: 'x' }, { q: 'x'.repeat(101) }]) {
      expect((await settings(query)).status, JSON.stringify(query)).toBe(422);
    }
  });

  it('an admin or unknown account cannot be changed', async () => {
    expect((await post({ action: 'set_user', user_id: 999999, mode: 'off' })).status).toBe(404);
    const adminRow = await one("SELECT id FROM users WHERE email_address = 'admin@gmail.com'");
    expect((await post({ action: 'set_user', user_id: adminRow.id, mode: 'on' })).status).toBe(404);
  });
});

describe('a server without the column', () => {
  it('keeps asking as before instead of failing the sign-in', async () => {
    await q('ALTER TABLE users DROP COLUMN login_otp_mode');
    try {
      expect(await asksForCode()).toBe(true);
    } finally {
      await q("ALTER TABLE users ADD COLUMN login_otp_mode enum('default','on','off') NOT NULL DEFAULT 'default'");
    }
  });
});
