// update_cctv_status.php: every decision carries a note for the tenant (pickup
// instructions when approved, the reason when rejected). It is stored, listed for
// the admin, shown in My Requests and put in the tenant's notification.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { one } from './lib/db.js';

let admin, maria;
beforeAll(async () => { admin = await loginAs('admin'); maria = await loginAs('maria'); });

const fileRequest = async () => {
  const d = (await one("SELECT DATE_FORMAT(CURDATE() - INTERVAL 1 DAY, '%Y-%m-%d') AS d")).d;
  const res = await api('cctv_request.php', { token: maria, json: {
    incidentDate: d, incidentTime: '08:00 PM - 12:00 AM', locationDetails: '1st Floor',
    incidentType: 'theft', reasonRequest: 'My bicycle was taken from the hallway.', privacyConsent: true,
  } });
  return res.body.id;
};
const decide = (id, status, note, token = admin) => api('update_cctv_status.php', { token, json: { id, status, note } });
const stored = (id) => one('SELECT status, decision_note FROM cctv_requests WHERE id = ?', [id]);

describe('update_cctv_status.php decision note', () => {
  it('approve with pickup instructions → stored, listed, in My Requests and the notification', async () => {
    const id = await fileRequest();
    const note = 'Collect at the admin office, weekdays 9 AM to 5 PM. Bring a valid ID.';
    const res = await decide(id, 'Approved', `  ${note}  `);
    expect(res.body).toMatchObject({ success: true });
    expect(await stored(id)).toMatchObject({ status: 'Approved', decision_note: note });

    const list = await api('get_cctv_requests.php', { token: admin });
    expect(list.body.requests.find((r) => Number(r.id) === Number(id)).decisionNote).toBe(note);

    const mine = await api('get_my_requests.php', { token: maria });
    const row = mine.body.requests.find((r) => r.type === 'CCTV' && Number(r.id) === Number(id));
    expect(row.rejection_reason).toBe(note);

    const notif = await one("SELECT message FROM notifications WHERE user_id = 2 AND type = 'cctv_request' ORDER BY id DESC LIMIT 1");
    expect(notif.message).toContain(note);
  });

  it('reject with a reason → stored on the rejected request', async () => {
    const id = await fileRequest();
    const res = await decide(id, 'Rejected', 'No camera covers that hallway.');
    expect(res.body).toMatchObject({ success: true });
    expect(await stored(id)).toMatchObject({ status: 'Rejected', decision_note: 'No camera covers that hallway.' });
  });

  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['over 500 characters', 'x'.repeat(501)],
  ])('note %s → 422 with field note, request stays Pending', async (_, note) => {
    const id = await fileRequest();
    const res = await decide(id, 'Approved', note);
    expect(res.status).toBe(422);
    expect(res.body.field).toBe('note');
    expect(await stored(id)).toMatchObject({ status: 'Pending', decision_note: null });
  });

  it('a note of exactly 500 characters → accepted', async () => {
    const id = await fileRequest();
    const res = await decide(id, 'Approved', 'x'.repeat(500));
    expect(res.body).toMatchObject({ success: true });
  });

  it('deciding twice → 409 and the first note is kept', async () => {
    const id = await fileRequest();
    await decide(id, 'Approved', 'First note.');
    const res = await decide(id, 'Rejected', 'Second note.');
    expect(res.status).toBe(409);
    expect(await stored(id)).toMatchObject({ status: 'Approved', decision_note: 'First note.' });
  });

  it('a tenant cannot decide → 403', async () => {
    const id = await fileRequest();
    const res = await decide(id, 'Approved', 'Sneaky.', maria);
    expect(res.status).toBe(403);
    expect((await stored(id)).status).toBe('Pending');
  });
});
