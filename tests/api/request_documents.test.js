// request_application_documents.php: an admin asks an open application's owner for
// more documents; the applicant gets a notice, nothing else changes.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { one, q } from './lib/db.js';

let admin, maria;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

const ask = (token, json) => api('request_application_documents.php', { token, json });
const pending = () => one("SELECT id, user_id FROM rent_applications WHERE status IN ('Pending Review', 'Approved') ORDER BY id LIMIT 1");

describe('request_application_documents.php', () => {
  it('is admin only and needs a session', async () => {
    expect((await ask(undefined, { id: 1, message: 'Send your NBI clearance.' })).status).toBe(401);
    expect((await ask(maria, { id: 1, message: 'Send your NBI clearance.' })).status).toBe(403);
  });

  it.each([
    ['no application', { message: 'Send your NBI clearance.' }, 'id'],
    ['a short message', { id: 1, message: 'abc' }, 'message'],
    ['an over-long message', { id: 1, message: 'x'.repeat(501) }, 'message'],
    ['an array message', { id: 1, message: ['x'] }, null],
  ])('refuses %s', async (_l, body, field) => {
    const res = await ask(admin, body);
    expect([400, 422]).toContain(res.status);
    if (field) expect(Object.keys(res.body.errors)).toContain(field);
  });

  it('404 for an unknown application', async () => {
    expect((await ask(admin, { id: 999999, message: 'Send your NBI clearance.' })).status).toBe(404);
  });

  it('409 for an application that is not open (moved in)', async () => {
    const active = await one("SELECT id FROM rent_applications WHERE status = 'active' LIMIT 1");
    expect((await ask(admin, { id: active.id, message: 'Send your NBI clearance.' })).status).toBe(409);
  });

  it('notifies the applicant, logs it and leaves the application as it was', async () => {
    const app = await pending();
    await q("UPDATE rent_applications SET status = 'Pending Review' WHERE id = ?", [app.id]);
    const res = await ask(admin, { id: app.id, message: 'Please send a clear photo of your NBI clearance.' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const n = await one("SELECT type, message FROM notifications WHERE user_id = ? AND title = 'More documents needed' ORDER BY id DESC LIMIT 1", [app.user_id]);
    expect(n.type).toBe('application_update');
    expect(n.message).toContain('NBI clearance');
    expect((await one('SELECT status FROM rent_applications WHERE id = ?', [app.id])).status).toBe('Pending Review');
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Requested Application Documents'")).n).toBe(1);
  });
});
