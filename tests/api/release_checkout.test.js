// release_checkout_session.php: what /pay-bills?status=cancelled&invoice_id=…
// calls. Anyone can type that URL, so the endpoint must release only the
// caller's own bill and only while it is in 'processing'; otherwise it is a
// no-op that reports released: false (the page then shows no message).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let maria, jose;
const release = (token, invoice_id) => api('release_checkout_session.php', { token, json: { invoice_id } });
const statusOf = async (id) => (await one('SELECT status FROM invoices WHERE id = ?', [id])).status;

beforeAll(async () => {
  [maria, jose] = await Promise.all([loginAs('maria'), login('jose.reyes@demo.example', 'tenant123')]);
  // Jose's September bill (seeded overdue, due 2026-09-01) is mid-checkout.
  await q("UPDATE invoices SET status = 'processing', processing_since = NOW() WHERE id = 'INV-202609-3'");
});

describe('release_checkout_session.php', () => {
  it("another tenant cannot release Jose's checkout", async () => {
    const res = await release(maria, 'INV-202609-3');
    expect(res.body).toMatchObject({ success: true, released: false });
    expect(await statusOf('INV-202609-3')).toBe('processing');
  });

  it('a bill that is not in processing is left alone (typed URL)', async () => {
    const res = await release(jose, 'INV-202610-3');
    expect(res.body).toMatchObject({ success: true, released: false });
    expect(await statusOf('INV-202610-3')).toBe('overdue');
  });

  it('an unknown invoice id releases nothing', async () => {
    expect((await release(jose, 'INV-DOES-NOT-EXIST')).body).toMatchObject({ released: false });
  });

  it('the owner releases it; a past-due bill goes back to overdue, not pending', async () => {
    const res = await release(jose, 'INV-202609-3');
    expect(res.body).toMatchObject({ success: true, released: true });
    expect(await statusOf('INV-202609-3')).toBe('overdue');
  });

  it('a second cancel (two tabs) releases nothing more', async () => {
    expect((await release(jose, 'INV-202609-3')).body).toMatchObject({ released: false });
  });
});
