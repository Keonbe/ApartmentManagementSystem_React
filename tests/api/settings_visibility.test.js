// get_system_settings.php answers by caller: a logged-out visitor gets only the
// allowlist the public pages read (PUBLIC_SETTING_KEYS), a tenant gets everything
// except the operational keys (ADMIN_ONLY_SETTING_KEYS), an admin gets all of it
// with the credentials masked. A key nobody classified stays hidden from visitors.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q } from './lib/db.js';

const QR = JSON.stringify([{ slot: 1, label: 'Slot 1', image_path: '', account_name: 'Test Owner', account_number: '0917-000-0000' }]);
const SEED = {
  smtp_host: 'smtp.example.test',
  email_driver: 'log',
  sms_provider: 'log',
  login_otp_enabled: '1',
  notification_sweep_last_run: '2026-01-01 00:00:00',
  smtp_password: 'secret-pass-1234',
  payment_window_days: '3',
  qrph_slots: QR,
  zz_unclassified_setting: 'x',
};

let admin, maria;
const read = async (opts = {}) => (await api('get_system_settings.php', opts)).body.settings;
const OPERATIONAL = ['smtp_host', 'smtp_from_email', 'email_driver', 'sms_provider', 'login_otp_enabled', 'notification_sweep_last_run'];

beforeAll(async () => {
  for (const [k, v] of Object.entries(SEED)) {
    await q('INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [k, v]);
  }
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

describe('logged out', () => {
  it('gets the public allowlist: branding, home and preview content, theme, inquiry limits', async () => {
    const s = await read();
    for (const key of ['system_name', 'home_content', 'preview_hero', 'language_switch_enabled', 'glass_blur', 'floor_rates', 'age_categories', 'inquiry_move_in_max_months', 'included_occupants', 'move_in_min_days']) {
      expect(s, key).toHaveProperty(key);
    }
  });

  it('never gets mail, SMS or schedule settings', async () => {
    const s = await read();
    for (const key of OPERATIONAL) expect(s, key).not.toHaveProperty(key);
  });

  it('never gets payment details, services, parking or CCTV settings (tenant-only)', async () => {
    const s = await read();
    for (const key of ['payment_window_days', 'qrph_slots', 'qrph_active_slot', 'cctv_locations', 'cctv_footage_days', 'late_fee_value', 'parking_monthly_fee']) {
      expect(s, key).not.toHaveProperty(key);
    }
  });

  it('never gets credentials', async () => {
    const s = await read();
    for (const key of ['smtp_password', 'smtp_username', 'sms_api_key', 'paymongo_secret_key', 'paymongo_webhook_secret']) {
      expect(s, key).not.toHaveProperty(key);
    }
  });

  it('a setting nobody classified is hidden from a visitor', async () => {
    expect(await read()).not.toHaveProperty('zz_unclassified_setting');
  });

  it('a forged admin header or a garbage token does not widen it', async () => {
    for (const opts of [{ headers: { 'X-Admin-Id': '1', 'X-User-Id': '1' } }, { token: 'garbage' }, { token: 'a'.repeat(64) }]) {
      const s = await read(opts);
      for (const key of [...OPERATIONAL, 'qrph_slots', 'payment_window_days']) expect(s, key).not.toHaveProperty(key);
    }
  });

  it('every setting a public page reads is in the answer (no page loses its data)', async () => {
    const s = await read();
    expect(s.home_content).toBeTypeOf('object');
    expect(s.preview_hero).toBeTypeOf('object');
    expect(Number(s.inquiry_move_in_max_months)).toBeGreaterThan(0);
  });
});

describe('tenant', () => {
  it('gets payment, service, parking and CCTV settings, and the QR payment accounts', async () => {
    const s = await read({ token: maria });
    expect(s.payment_window_days).toBe(3);
    expect(s.qrph_slots[0].account_number).toBe('0917-000-0000');
    expect(s).toHaveProperty('cctv_locations');
    expect(s).toHaveProperty('system_name');
  });

  it('does not get mail, SMS or schedule settings, or credentials', async () => {
    const s = await read({ token: maria });
    for (const key of [...OPERATIONAL, 'smtp_password', 'sms_api_key', 'paymongo_secret_key', 'maintenance_monthly_budget', 'landlord_name']) {
      expect(s, key).not.toHaveProperty(key);
    }
  });

  it('gets a setting nobody classified (only visitors are limited by the allowlist)', async () => {
    expect((await read({ token: maria })).zz_unclassified_setting).toBe('x');
  });
});

describe('admin', () => {
  it('gets everything, with credentials masked to the last four characters', async () => {
    const s = await read({ token: admin });
    for (const key of ['smtp_host', 'email_driver', 'login_otp_enabled', 'notification_sweep_last_run', 'payment_window_days', 'qrph_slots', 'zz_unclassified_setting']) {
      expect(s, key).toHaveProperty(key);
    }
    expect(s.smtp_password).toBe('••••1234');
  });
});
