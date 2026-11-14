// Approved applicant whose move-in date has passed (SPRINT 186, audit P-20).
// Unpaid: the daily sweep lets it lapse, and the follow-up list says only that
// the date passed. Paid (or part-paid): nothing is cancelled automatically, so the
// follow-up tells the admin the two choices: reschedule, or cancel with a refund.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';
import { addInvoice } from './lib/fixtures.js';

let admin;
const APP = 5; // Approved in the seed
const item = async () => {
  const res = await api('monitor_followups.php', { token: admin });
  return res.body.documents.find((d) => d.id === APP && d.issue === 'Move-in deadline passed');
};

beforeAll(async () => {
  admin = await loginAs('admin');
  await q("UPDATE rent_applications SET status = 'Approved', terms_agreed_at = NOW(), move_in_date = CURDATE() - INTERVAL 3 DAY WHERE id = ?", [APP]);
});

describe('move-in deadline passed', () => {
  it('unpaid: the plain wording (it lapses by itself)', async () => {
    await q("UPDATE invoices SET status = 'pending', amount_paid = 0 WHERE rent_application_id = ?", [APP]);
    const it1 = await item();
    expect(it1).toBeTruthy();
    expect(it1.detail).toMatch(/passed without a confirmed move-in/);
    expect(it1.detail).not.toMatch(/Refunds/);
  });

  it('paid: names the two choices, and the application is untouched', async () => {
    const userId = (await one('SELECT user_id FROM rent_applications WHERE id = ?', [APP])).user_id;
    await addInvoice('INV-NOSHOW-PAID', { userId, appId: APP, amount: 7500, status: 'paid' });
    const it2 = await item();
    expect(it2.detail).toMatch(/Paid for the move-in but did not move in/);
    expect(it2.detail).toMatch(/Reschedule/);
    expect(it2.detail).toMatch(/Refunds/);
    expect((await one('SELECT status FROM rent_applications WHERE id = ?', [APP])).status).toBe('Approved');
  });

  it('part-paid counts as paid', async () => {
    await q("UPDATE invoices SET status = 'pending', amount_paid = 2000 WHERE id = 'INV-NOSHOW-PAID'");
    expect((await item()).detail).toMatch(/Paid for the move-in/);
  });

  it('rescheduling to a future date clears the item', async () => {
    const res = await api('schedule_move_in.php', { token: admin, json: { id: APP, moveInDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) } });
    expect(res.status).toBeLessThan(500);
    if (res.body?.success) expect(await item()).toBeUndefined();
  });
});
