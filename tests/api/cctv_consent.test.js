// cctv_request.php: the Data Privacy consent ticked on the form must be sent,
// and when it was given is stored (cctv_requests.privacy_consent_at).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { one } from './lib/db.js';

let maria;
beforeAll(async () => { maria = await loginAs('maria'); });

const yesterday = async () => (await one("SELECT DATE_FORMAT(CURDATE() - INTERVAL 1 DAY, '%Y-%m-%d') AS d")).d;
const body = async (extra = {}) => ({
  incidentDate: await yesterday(), incidentTime: '8:00 PM', locationDetails: 'Parking area', reasonRequest: 'My bicycle was moved.', ...extra,
});
const requestCount = async () => (await one('SELECT COUNT(*) AS c FROM cctv_requests WHERE user_id = 2')).c;

describe('cctv_request.php privacy consent', () => {
  it.each([
    ['missing', {}],
    ['false', { privacyConsent: false }],
    ['the string "true"', { privacyConsent: 'true' }],
    ['1', { privacyConsent: 1 }],
  ])('consent %s → 422 with field privacyConsent, nothing saved', async (_, extra) => {
    const before = await requestCount();
    const res = await api('cctv_request.php', { token: maria, json: await body(extra) });
    expect(res.status).toBe(422);
    expect(res.body.field).toBe('privacyConsent');
    expect(await requestCount()).toBe(before);
  });

  it('a missing field is still refused first (422 "All fields are required")', async () => {
    const res = await api('cctv_request.php', { token: maria, json: await body({ locationDetails: '', privacyConsent: true }) });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/All fields are required/);
  });

  it('consent true → saved with privacy_consent_at set', async () => {
    const res = await api('cctv_request.php', { token: maria, json: await body({ privacyConsent: true }) });
    expect(res.body).toMatchObject({ success: true });
    const row = await one('SELECT privacy_consent_at FROM cctv_requests WHERE id = ?', [res.body.id]);
    expect(row.privacy_consent_at).not.toBeNull();
  });
});
