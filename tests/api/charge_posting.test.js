// Service, maintenance and parking charges all go through post_invoice_charge() /
// reverse_invoice_charge() (backend/config.php): claim first, land on the
// tenant's adjustable invoice for the month, back out exactly what was posted.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

let admin;
const now = new Date();
const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const label = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
const BASE = 1000;
const INV = 'INV-TEST-CHG';

// One tenant (Maria: user 2, application 1) with one open invoice for this month.
async function freshInvoice({ status = 'pending', paid = 0 } = {}) {
  await q("UPDATE invoices SET status = 'cancelled' WHERE user_id = 2 AND billing_period IN (?, ?) AND status <> 'paid'", [label, ym]);
  await q("DELETE FROM invoices WHERE id = ?", [INV]);
  await q(
    `INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, amount_paid, billing_period, status, due_date)
     VALUES (?, 2, 1, ?, ?, ?, ?, ?, CURDATE() + INTERVAL 5 DAY)`,
    [INV, BASE, BASE, paid, label, status],
  );
}
const inv = async (id = INV) => {
  const r = await one('SELECT services, maintenance, parking, total_amount, status FROM invoices WHERE id = ?', [id]);
  return { services: Number(r.services), maintenance: Number(r.maintenance), parking: Number(r.parking), total: Number(r.total_amount), status: r.status };
};

// Source rows, one per kind. Each returns the endpoints for posting and reversing.
const KINDS = {
  service: {
    column: 'services',
    async create(cost) {
      const r = await q(
        "INSERT INTO service_requests (user_id, service_name, preferred_date, preferred_time_slot, status, total_cost) VALUES (2, 'Charge test', CURDATE(), '9-10', 'Completed', ?)", [cost],
      );
      return r.insertId;
    },
    post: (id) => api('sync_service_to_invoice.php', { token: admin, json: { id } }),
    reverse: (id) => api('update_service_status.php', { token: admin, json: { id, status: 'Cancelled', adminNotes: 'test reversal' } }),
    row: (id) => one('SELECT is_invoiced, invoice_id, invoiced_amount FROM service_requests WHERE id = ?', [id]),
    setCost: (id, cost) => q('UPDATE service_requests SET total_cost = ? WHERE id = ?', [cost, id]),
  },
  maintenance: {
    column: 'maintenance',
    async create(cost) {
      const r = await q(
        `INSERT INTO maintenance_requests (user_id, issue_category, urgency, preferred_date, preferred_time, description, status, tenant_responsible, estimated_cost, actual_cost)
         VALUES (2, 'General Maintenance', 'Low', CURDATE(), '9-10', 'Charge test', 'Completed', 1, ?, ?)`, [cost, cost],
      );
      return r.insertId;
    },
    post: (id) => api('sync_maintenance_to_invoice.php', { token: admin, json: { id } }),
    reverse: (id) => api('update_maintenance_status.php', { token: admin, json: { id, tenantResponsible: false } }),
    row: (id) => one('SELECT is_invoiced, invoice_id, invoiced_amount FROM maintenance_requests WHERE id = ?', [id]),
    setCost: (id, cost) => q('UPDATE maintenance_requests SET actual_cost = ? WHERE id = ?', [cost, id]),
  },
  parking: {
    column: 'parking',
    async create() {
      await q("DELETE FROM parking_reservations WHERE user_id = 2");
      const r = await q(
        `INSERT INTO parking_reservations (user_id, vehicle_type, vehicle_model, plate_number, status, slot_number, assigned_at, transmission, duration_months, total_cost, document_path)
         VALUES (2, 'Car', 'Test', 'CHG001', 'Assigned', 9950, NOW(), 'Manual', 3, 0, 'x')`,
      );
      return r.insertId;
    },
    post: (id) => api('sync_parking_to_invoice.php', { token: admin, json: { reservation_id: id, period: ym } }),
    reverse: (id) => api('sync_parking_to_invoice.php', { token: admin, json: { reservation_id: id, period: ym, action: 'reverse' } }),
    row: (id) => one('SELECT invoice_id, amount AS invoiced_amount FROM parking_charges WHERE reservation_id = ? AND billing_period = ?', [id, ym]),
  },
};

beforeAll(async () => {
  admin = await loginAs('admin');
});

describe.each(Object.keys(KINDS))('%s charge', (kind) => {
  const K = KINDS[kind];
  let sourceId;
  let amount;
  beforeEach(async () => {
    await freshInvoice();
    sourceId = await K.create(kind === 'parking' ? 0 : 200);
    amount = kind === 'parking' ? Number((await one("SELECT setting_value AS v FROM system_settings WHERE setting_key = 'parking_monthly_fee'"))?.v ?? 300) : 200;
  });

  it('posts onto the open invoice for the month, in its own column and the total', async () => {
    const res = await K.post(sourceId);
    expect(res.body.success).toBe(true);
    const row = await inv();
    expect(row[K.column]).toBe(amount);
    expect(row.total).toBe(BASE + amount);
    expect((await K.row(sourceId)).invoice_id).toBe(INV);
  });

  it('a second post is refused and bills nothing more', async () => {
    await K.post(sourceId);
    const again = await K.post(sourceId);
    expect(again.body.success).toBe(false);
    expect((await inv()).total).toBe(BASE + amount);
  });

  it('an invoice already being paid is left alone: the charge goes on a new invoice', async () => {
    await q("UPDATE invoices SET status = 'processing' WHERE id = ?", [INV]);
    const res = await K.post(sourceId);
    expect(res.body.success).toBe(true);
    expect((await inv()).total).toBe(BASE);
    const landed = (await K.row(sourceId)).invoice_id;
    expect(landed).not.toBe(INV);
    expect((await inv(landed)).total).toBe(amount);
  });

  it('reversing backs out the invoice to what it was and frees the source for billing again', async () => {
    await K.post(sourceId);
    const res = await K.reverse(sourceId);
    expect(res.body.success).toBe(true);
    const row = await inv();
    expect(row[K.column]).toBe(0);
    expect(row.total).toBe(BASE);
    const after = await K.row(sourceId);
    expect(!after || Number(after.is_invoiced) === 0).toBe(true);
  });

  it('reversing is refused when payments already received exceed the reduced total', async () => {
    await K.post(sourceId);
    await q('UPDATE invoices SET amount_paid = ? WHERE id = ?', [BASE + 50, INV]);
    const res = await K.reverse(sourceId);
    expect(res.body.success).toBe(false);
    const row = await inv();
    expect(row.total).toBe(BASE + amount);
    expect(row[K.column]).toBe(amount);
  });
});

describe.each(['service', 'maintenance'])('%s reversal', (kind) => {
  const K = KINDS[kind];
  it('backs out the amount that was posted, even if the cost was edited afterwards', async () => {
    await freshInvoice();
    const id = await K.create(200);
    await K.post(id);
    expect(Number((await K.row(id)).invoiced_amount)).toBe(200);
    await K.setCost(id, 500);
    const res = await K.reverse(id);
    expect(res.body.success).toBe(true);
    const row = await inv();
    expect(row.total).toBe(BASE);
    expect(row[K.column]).toBe(0);
  });

  it('a charge on an already-paid invoice is detached and a refund request is raised', async () => {
    await freshInvoice();
    const id = await K.create(200);
    await K.post(id);
    await q("UPDATE invoices SET status = 'paid', amount_paid = total_amount WHERE id = ?", [INV]);
    const res = await K.reverse(id);
    expect(res.body.success).toBe(true);
    const refund = await one("SELECT amount FROM refund_requests WHERE invoice_id = ? AND type = 'rejected_charge'", [INV]);
    expect(Number(refund.amount)).toBe(200);
    expect((await K.row(id)).is_invoiced).toBe(0);
    expect((await inv()).total).toBe(BASE + 200);
  });
});

describe('maintenance status change and charge reversal share one transaction', () => {
  it('a refused reversal leaves the ticket Completed', async () => {
    const K = KINDS.maintenance;
    await freshInvoice();
    const id = await K.create(200);
    await K.post(id);
    await q("UPDATE invoices SET status = 'processing' WHERE id = ?", [INV]);
    const res = await api('update_maintenance_status.php', { token: admin, json: { id, status: 'In Progress' } });
    expect(res.status).toBe(409);
    expect((await one('SELECT status FROM maintenance_requests WHERE id = ?', [id])).status).toBe('Completed');
    expect((await K.row(id)).is_invoiced).toBe(1);
  });
});
