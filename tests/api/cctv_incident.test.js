// cctv_request.php: footage is released for incidents only. The request must name
// an incident type from a fixed list, "other" needs a real description, and the
// incident must fall inside the ~60-day window footage is kept.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { one } from './lib/db.js';

let maria;
beforeAll(async () => { maria = await loginAs('maria'); });

const daysAgo = async (n) => (await one("SELECT DATE_FORMAT(CURDATE() - INTERVAL ? DAY, '%Y-%m-%d') AS d", [n])).d;
const body = async (extra = {}) => ({
  incidentDate: await daysAgo(1), incidentTime: '08:00 PM - 12:00 AM', locationDetails: '1st Floor',
  incidentType: 'theft', reasonRequest: 'My bicycle was taken from the hallway.', privacyConsent: true, ...extra,
});
const requestCount = async () => (await one('SELECT COUNT(*) AS c FROM cctv_requests WHERE user_id = 2')).c;

describe('cctv_request.php incident-only restriction', () => {
  it.each([
    ['missing', undefined],
    ['unknown', 'curiosity'],
    ['empty', ''],
    ['not a string', 5],
  ])('incident type %s → 422 with field incidentType, nothing saved', async (_, incidentType) => {
    const before = await requestCount();
    const res = await api('cctv_request.php', { token: maria, json: await body({ incidentType }) });
    expect(res.status).toBe(422);
    expect(res.body.field).toBe('incidentType');
    expect(await requestCount()).toBe(before);
  });

  it('"other" with a short description → 422 on reasonRequest', async () => {
    const res = await api('cctv_request.php', { token: maria, json: await body({ incidentType: 'other', reasonRequest: 'Just checking.' }) });
    expect(res.status).toBe(422);
    expect(res.body.field).toBe('reasonRequest');
  });

  it('"other" with a full description → saved', async () => {
    const res = await api('cctv_request.php', { token: maria, json: await body({ incidentType: 'other', reasonRequest: 'A stranger was tailgating residents at the entrance.' }) });
    expect(res.body).toMatchObject({ success: true });
  });

  it('an incident older than the footage window → 422 on incidentDate', async () => {
    const before = await requestCount();
    const res = await api('cctv_request.php', { token: maria, json: await body({ incidentDate: await daysAgo(61) }) });
    expect(res.status).toBe(422);
    expect(res.body.field).toBe('incidentDate');
    expect(await requestCount()).toBe(before);
  });

  it('an incident exactly on the edge of the window → saved', async () => {
    const res = await api('cctv_request.php', { token: maria, json: await body({ incidentDate: await daysAgo(60) }) });
    expect(res.body).toMatchObject({ success: true });
  });

  it('a valid request stores the incident type', async () => {
    const res = await api('cctv_request.php', { token: maria, json: await body({ incidentType: 'vandalism' }) });
    expect(res.body).toMatchObject({ success: true });
    const row = await one('SELECT incident_type FROM cctv_requests WHERE id = ?', [res.body.id]);
    expect(row.incident_type).toBe('vandalism');
  });
});
