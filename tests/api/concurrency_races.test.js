// Same-row races (QA manual 3E "Concurrency", CLAUDE.md "two tabs/admins, double submit"): fire two
// identical requests at once and assert that exactly one takes effect. Each case also stands for the
// real-world double click or second admin tab. QA guide rows Q3-11, Q5-03, Q9-xx, Q11-16.
//
// Limit: the test server is `php -S`, which handles one request at a time (PHP_CLI_SERVER_WORKERS is not
// available on Windows), so the two requests run back to back, not interleaved. These cases prove the
// duplicate and stale-state guards. They do NOT prove `FOR UPDATE` row locking under true overlap; that
// needs Apache or a worker-enabled server (see qa_testing_guide.md, Manual rows).
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';
import { addInvoice } from './lib/fixtures.js';

const HASH = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy';
const ymd = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const both = (fn) => Promise.all([fn(), fn()]);

let admin, maria;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

describe('payments', () => {
  it('recording the same payment twice settles the invoice once', async () => {
    await addInvoice('INV-RACE-PAY', { status: 'scheduled', amount: 1500 });
    const rs = await both(() => api('record_payment_admin.php', { token: admin, json: { invoiceId: 'INV-RACE-PAY', payments: [{ method: 'cash', amount: 1500 }] } }));
    expect(rs.filter((r) => r.status === 200).length).toBe(1);
    expect((await one('SELECT COUNT(*) AS n FROM payment_transactions WHERE invoice_id = ?', ['INV-RACE-PAY'])).n).toBe(1);
    expect(Number((await one('SELECT amount_paid FROM invoices WHERE id = ?', ['INV-RACE-PAY'])).amount_paid)).toBe(1500);
  });
});

describe('billing creation', () => {
  it('two rent invoices for the same tenant and month leave one', async () => {
    const body = { userId: 2, baseRent: 5000, billingPeriod: 'May 2031', dueDate: ymd(20) };
    const rs = await both(() => api('create_invoice.php', { token: admin, json: body }));
    expect(rs.filter((r) => r.status === 200).length).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM invoices WHERE user_id = 2 AND billing_period = 'May 2031' AND base_rent > 0")).n).toBe(1);
  });

  it('two contracts for the same application leave one', async () => {
    await q('DELETE FROM lease_contracts WHERE rent_application_id = 3');
    const body = { rentApplicationId: 3, depositAmount: 4500, leaseStart: ymd(-5), leaseEnd: ymd(300) };
    const rs = await both(() => api('create_contract.php', { token: admin, json: body }));
    expect(rs.filter((r) => r.status === 200).length).toBe(1);
    expect((await one('SELECT COUNT(*) AS n FROM lease_contracts WHERE rent_application_id = 3')).n).toBe(1);
  });
});

describe('refunds', () => {
  it('two requests for the same advance credit hold it once', async () => {
    await addInvoice('ADV-RACE-1', { userId: 2, appId: 1, amount: 4000, status: 'paid' });
    await q("INSERT INTO advance_credits (advance_invoice_id, user_id, period_start, amount, status) VALUES ('ADV-RACE-1', 2, ?, 4000, 'available')", [ymd(70)]);
    const rs = await both(() => api('create_refund_request.php', { token: maria, json: { type: 'advance', amount: 4000, reason: 'race' } }));
    expect(rs.filter((r) => r.status === 200).length).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM refund_requests WHERE user_id = 2 AND reason = 'race'")).n).toBe(1);
  });
});

describe('accounts', () => {
  it('two promotions at once cannot push the admin count past three', async () => {
    for (const id of [151, 152, 153]) {
      await q(`INSERT INTO users (id, first_name, last_name, contact_no, gender, email_address, password, role, email_verified_at)
               VALUES (?, 'Race', 'User', ?, 'Male', ?, ?, 'user', NOW())`, [id, `+63 91712341${id}`, `race${id}@demo.example`, HASH]);
    }
    await q("UPDATE users SET role = 'user' WHERE role = 'admin' AND email_address <> 'admin@gmail.com'");
    await q("UPDATE users SET role = 'admin' WHERE id = 151"); // two admins now: the seed one and 151
    const rs = await Promise.all([152, 153].map((id) => api('manage_users.php', { token: admin, json: { action: 'set_role', user_id: id, role: 'admin' } })));
    expect(rs.filter((r) => r.status === 200).length).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_archived = 0")).n).toBe(3);
  });
});

describe('tenant actions', () => {
  it('two move-out notices at once record one request in the admin queue', async () => {
    const jose = await loginAs('jose');
    const rs = await both(() => api('record_move_out.php', { token: jose, json: { move_out_date: ymd(20) } }));
    expect(rs.filter((r) => r.body?.success === true).length).toBe(1);
    const app = (await one("SELECT id FROM rent_applications WHERE user_id = 3 AND status = 'pending-move-out'")).id;
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE type = 'move_out_request' AND metadata_value = ?", [`move_out_request:${app}`])).n).toBe(1);
  });

  it('two occupancy requests at once file one', async () => {
    const rosa = await loginAs('rosa');
    const current = (await one("SELECT occupants FROM rent_applications WHERE user_id = 5 AND status IN ('Approved','active') LIMIT 1")).occupants;
    const next = current < 2 ? current + 1 : current - 1;
    const rs = await both(() => api('update_occupants.php', { token: rosa, json: { occupants: next } }));
    expect(rs.filter((r) => r.body?.success === true).length).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 5 AND type = 'occupancy_request' AND status = 'Pending'")).n).toBe(1);
  });
});

describe('reservations', () => {
  it('two holds on one vacant unit leave one', async () => {
    await q("INSERT INTO rooms (id, type, floor, monthly_rent, status, occupants) VALUES ('RACE1', 'Studio', '9F', 3000, 'vacant', 0)");
    const rs = await both(() => api('create_reservation.php', { token: admin, json: { room_name: 'RACE1', reserved_for_name: 'Racer' } }));
    expect(rs.filter((r) => r.body?.success === true).length).toBe(1);
    expect((await one("SELECT COUNT(*) AS n FROM unit_reservations WHERE room_name = 'RACE1' AND status = 'Active'")).n).toBe(1);
  });

  it('removing a unit while holding it cannot do both', async () => {
    await q("INSERT INTO rooms (id, type, floor, monthly_rent, status, occupants) VALUES ('RACE2', 'Studio', '9F', 3000, 'vacant', 0)");
    const [hold, remove] = await Promise.all([
      api('create_reservation.php', { token: admin, json: { room_name: 'RACE2', reserved_for_name: 'Racer' } }),
      api('archive_room.php', { token: admin, json: { id: 'RACE2' } }),
    ]);
    const held = (await one("SELECT COUNT(*) AS n FROM unit_reservations WHERE room_name = 'RACE2' AND status = 'Active'")).n;
    const archived = (await one("SELECT archived_at FROM rooms WHERE id = 'RACE2'")).archived_at !== null;
    expect(held > 0 && archived, `hold=${hold.status}/${hold.body?.success} remove=${remove.status}`).toBe(false);
  });
});
