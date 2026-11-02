// Settings -> CCTV: the camera locations, incident types, footage window and
// shortest reason are admin-editable (update_system_settings.php), read back by
// get_system_settings.php, and enforced by cctv_request.php.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { one, q } from './lib/db.js';

let admin;
let maria;
beforeAll(async () => {
  admin = await loginAs('admin');
  maria = await loginAs('maria');
});

const TYPES = [
  { key: 'theft', label: 'Theft or missing item' },
  { key: 'other', label: 'Other incident (describe below)' },
];
const save = (json) => api('update_system_settings.php', { token: admin, json });
const read = async () => (await api('get_system_settings.php', { token: admin })).body.settings;
const daysAgo = async (n) => (await one("SELECT DATE_FORMAT(CURDATE() - INTERVAL ? DAY, '%Y-%m-%d') AS d", [n])).d;
const body = async (extra = {}) => ({
  incidentDate: await daysAgo(1), incidentTime: '08:00 PM - 12:00 AM', locationDetails: '1st Floor',
  incidentType: 'theft', reasonRequest: 'My bicycle was taken from the hallway.', privacyConsent: true, ...extra,
});
const file = async (extra) => api('cctv_request.php', { token: maria, json: await body(extra) });

// Every test starts from the shipped defaults.
afterEach(async () => {
  await q("DELETE FROM system_settings WHERE setting_key LIKE 'cctv\\_%'");
});

describe('defaults', () => {
  it('a database that never saved the keys reads the shipped choices', async () => {
    const s = await read();
    expect(s.cctv_locations).toEqual(['1st Floor', '2nd Floor', '3rd Floor', 'All Floors']);
    expect(s.cctv_incident_types.map((t) => t.key)).toEqual(['theft', 'vandalism', 'accident_injury', 'property_damage', 'security_concern', 'other']);
    expect(s.cctv_lookback_days).toBe(60);
    expect(s.cctv_min_reason_length).toBe(10);
  });

  it('a garbled stored list falls back to the defaults', async () => {
    await q("INSERT INTO system_settings (setting_key, setting_value) VALUES ('cctv_locations', 'not json'), ('cctv_incident_types', '[{\"key\":\"theft\",\"label\":\"x\"}]'), ('cctv_lookback_days', 'abc')");
    const s = await read();
    expect(s.cctv_locations).toHaveLength(4);
    expect(s.cctv_incident_types).toHaveLength(6); // no "other" last: not usable
    expect(s.cctv_lookback_days).toBe(60);
  });
});

describe('saving', () => {
  it('admin saves and the values read back (new type gets a key, Other stays last)', async () => {
    const res = await save({
      cctv_locations: ['Lobby', ' Parking   Area '],
      cctv_incident_types: [{ key: 'theft', label: 'Theft or missing item' }, { label: 'Noise complaint' }, { key: 'other', label: 'Other incident (describe below)' }],
      cctv_lookback_days: '30', cctv_min_reason_length: '15',
    });
    expect(res.body).toMatchObject({ success: true });
    const s = await read();
    expect(s.cctv_locations).toEqual(['Lobby', 'Parking Area']);
    expect(s.cctv_incident_types).toEqual([
      { key: 'theft', label: 'Theft or missing item' },
      { key: 'noise_complaint', label: 'Noise complaint' },
      { key: 'other', label: 'Other incident (describe below)' },
    ]);
    expect(s.cctv_lookback_days).toBe(30);
    expect(s.cctv_min_reason_length).toBe(15);
  });

  it('a tenant cannot save', async () => {
    const res = await api('update_system_settings.php', { token: maria, json: { cctv_lookback_days: '30' } });
    expect(res.status).toBe(403);
  });

  it.each([
    ['an empty location list', { cctv_locations: [] }, 'cctvLocations'],
    ['13 locations', { cctv_locations: Array.from({ length: 13 }, (_, i) => `Cam ${i}`) }, 'cctvLocations'],
    ['a blank location', { cctv_locations: ['Lobby', '  '] }, 'cctvLocations'],
    ['a location over 50 characters', { cctv_locations: ['x'.repeat(51)] }, 'cctvLocations'],
    ['a duplicate location (any case)', { cctv_locations: ['Lobby', 'lobby'] }, 'cctvLocations'],
    ['no Other type', { cctv_incident_types: [{ key: 'theft', label: 'Theft' }, { key: 'vandalism', label: 'Vandalism' }] }, 'cctvIncidentTypes'],
    ['Other not last', { cctv_incident_types: [{ key: 'other', label: 'Other' }, { key: 'theft', label: 'Theft' }] }, 'cctvIncidentTypes'],
    ['only Other', { cctv_incident_types: [{ key: 'other', label: 'Other' }] }, 'cctvIncidentTypes'],
    ['a duplicate type name', { cctv_incident_types: [{ key: 'theft', label: 'Theft' }, { label: 'theft' }, { key: 'other', label: 'Other' }] }, 'cctvIncidentTypes'],
    ['a duplicate type key', { cctv_incident_types: [{ key: 'theft', label: 'Theft' }, { key: 'theft', label: 'Robbery' }, { key: 'other', label: 'Other' }] }, 'cctvIncidentTypes'],
    ['a window of 0 days', { cctv_lookback_days: '0' }, 'cctvLookbackDays'],
    ['a window of 366 days', { cctv_lookback_days: '366' }, 'cctvLookbackDays'],
    ['a shortest reason of 4', { cctv_min_reason_length: '4' }, 'cctvMinReasonLength'],
    ['a shortest reason of 201', { cctv_min_reason_length: '201' }, 'cctvMinReasonLength'],
  ])('refuses %s with 422 on %s and saves nothing from the request', async (_, json, field) => {
    const res = await save({ cctv_lookback_days: '10', ...json });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.errors ?? {})).toContain(field);
    const row = await one("SELECT COUNT(*) AS c FROM system_settings WHERE setting_key LIKE 'cctv\\_%'");
    expect(row.c).toBe(0);
  });

  it('the edges are accepted: 1 and 365 days, 5 and 200 characters, one location, 12 locations', async () => {
    expect((await save({ cctv_lookback_days: '1', cctv_min_reason_length: '5', cctv_locations: ['Lobby'] })).body.success).toBe(true);
    expect((await save({ cctv_lookback_days: '365', cctv_min_reason_length: '200', cctv_locations: Array.from({ length: 12 }, (_, i) => `Cam ${i}`) })).body.success).toBe(true);
  });
});

describe('cctv_request.php follows the settings', () => {
  it('a new location and a new type are accepted; a removed location and type are refused', async () => {
    await save({ cctv_locations: ['Lobby'], cctv_incident_types: TYPES });
    expect((await file({ locationDetails: 'Lobby' })).body).toMatchObject({ success: true });

    const removedLocation = await file({ locationDetails: '1st Floor' });
    expect(removedLocation.status).toBe(422);
    expect(removedLocation.body.field).toBe('locationDetails');

    const removedType = await file({ incidentType: 'vandalism', locationDetails: 'Lobby' });
    expect(removedType.status).toBe(422);
    expect(removedType.body.field).toBe('incidentType');
  });

  it('the footage window applies: day 30 passes, day 31 is refused with the configured number', async () => {
    await save({ cctv_lookback_days: '30' });
    expect((await file({ incidentDate: await daysAgo(30) })).body).toMatchObject({ success: true });
    const late = await file({ incidentDate: await daysAgo(31) });
    expect(late.status).toBe(422);
    expect(late.body.field).toBe('incidentDate');
    expect(late.body.message).toMatch(/30 days/);
  });

  it('the shortest reason is enforced on the server', async () => {
    await save({ cctv_min_reason_length: '30' });
    const short = await file({ reasonRequest: 'My bicycle was moved.' });
    expect(short.status).toBe(422);
    expect(short.body.field).toBe('reasonRequest');
    expect((await file({ reasonRequest: 'My bicycle was taken from the hallway last night.' })).body).toMatchObject({ success: true });
  });

  it('a request filed under a type that was later removed is still listed', async () => {
    const filed = await file({ incidentType: 'vandalism' });
    expect(filed.body).toMatchObject({ success: true });
    await save({ cctv_incident_types: TYPES });
    const list = await api('get_cctv_requests.php', { token: admin });
    const row = list.body.requests.find((r) => Number(r.id) === Number(filed.body.id));
    expect(row.incidentType).toBe('vandalism');
  });
});
