// pay_bill.php payment methods: the In-Person Payment channel declares a cash
// payment (no proof), stored as 'Cash on Hand'; a non-cash method still needs
// a proof the server stored itself. Track Application's move-in payment uses it.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { addInvoice, invoice } from './lib/fixtures.js';
import { one } from './lib/db.js';

let maria;
beforeAll(async () => { maria = await loginAs('maria'); });

const pay = (invoiceId, paymentMethod) => api('pay_bill.php', { token: maria, json: { invoiceId, paymentMethod } });
const declaredCash = async (id) => (await one("SELECT COUNT(*) AS c FROM notifications WHERE type = 'cash_payment_declared' AND message LIKE ?", [`%${id}%`])).c;

describe('In-Person Payment channel', () => {
  beforeAll(() => addInvoice('INV-TEST-INP', { status: 'pending' }));

  it("'In-Person Payment' is a cash declaration: accepted without a proof, stored as Cash on Hand", async () => {
    const res = await pay('INV-TEST-INP', 'In-Person Payment');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const inv = await invoice('INV-TEST-INP');
    expect(inv.payment_method).toBe('Cash on Hand');
    expect(inv.status).toBe('pending');
  });
});

describe('a non-cash method still needs a stored proof', () => {
  beforeAll(() => addInvoice('INV-TEST-GC', { status: 'pending' }));

  it('GCash (Manual) with no proof on the bill → 422, nothing changed', async () => {
    const res = await pay('INV-TEST-GC', 'GCash (Manual)');
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Upload a payment proof/);
    expect((await invoice('INV-TEST-GC')).status).toBe('pending');
  });

  it('a made-up method name is not cash either (422)', async () => {
    const res = await pay('INV-TEST-GC', 'Cash');
    expect(res.status).toBe(422);
  });
});

describe('another tenant cannot declare cash on this bill', () => {
  beforeAll(() => addInvoice('INV-TEST-OTH', { userId: 3, appId: 2, status: 'pending' }));

  it("Maria's In-Person declaration on Jose's bill changes nothing (409)", async () => {
    const res = await pay('INV-TEST-OTH', 'In-Person Payment');
    expect(res.status).toBe(409);
    expect((await invoice('INV-TEST-OTH')).payment_method).toBeNull();
    expect(await declaredCash('INV-TEST-OTH')).toBe(0);
  });
});
