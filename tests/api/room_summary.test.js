// my_room.php?summary=1: the latest application's status only (App.jsx's room
// check picks the TopBar links and the start page from it). Never applied =
// status null, so the TopBar hides Track Application.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

const HASH = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy'; // tenant123
const summary = (token, query = {}) => api('my_room.php', { token, query: { summary: 1, ...query } });

let maria, newcomer;

beforeAll(async () => {
  // Verified: login.php refuses an address that has not been confirmed.
  await q(`INSERT INTO users (id, first_name, last_name, contact_no, gender, email_address, password, role, email_verified_at)
           VALUES (90, 'Nina', 'Newcomer', '+63 9171234590', 'Female', 'nina.newcomer@gmail.com', ?, 'user', NOW())`, [HASH]);
  [maria, newcomer] = await Promise.all([loginAs('maria'), login('nina.newcomer@gmail.com', 'tenant123')]);
});

describe('my_room.php summary', () => {
  it("gives a tenant's status and nothing else", async () => {
    const res = await summary(maria);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status: 'active' });
  });

  it('gives null for a user who never applied', async () => {
    expect((await summary(newcomer)).body).toEqual({ success: true, status: null });
  });

  it("is the caller's own: another user's id or email is ignored", async () => {
    expect((await summary(newcomer, { userId: 2 })).body.status).toBeNull();
    expect((await summary(newcomer, { email: 'maria.santos@demo.example' })).body.status).toBeNull();
  });

  it('needs a session', async () => {
    expect((await summary(undefined)).status).toBe(401);
  });

  it('takes the newest application, even a closed one', async () => {
    await q(`INSERT INTO rent_applications (user_id, first_name, last_name, contact_no, email, gender, occupants, months_of_rent, room_name, monthly_rent, status, created_at)
             VALUES (90, 'Nina', 'Newcomer', '+63 9171234590', 'nina.newcomer@gmail.com', 'Female', 1, 6, 'A', 4000, 'Rejected', NOW())`);
    expect((await summary(newcomer)).body.status).toBe('Rejected');
    const app = await one('SELECT COUNT(*) AS n FROM rent_applications WHERE user_id = 90');
    expect(Number(app.n)).toBe(1);
  });
});
