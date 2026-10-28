// seed_demo_full.sql / seed_demo_reset.sql: the demo set loads on a live-style database,
// every workflow state shows up through the real endpoints, and the reset removes it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { DB } from './lib/env.js';
import { api, login, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';

const read = (name) => readFileSync(new URL(`../../backend/api/migrations/seeds/${name}`, import.meta.url), 'utf8');
const seed = read('seed_demo_full.sql');
const reset = read('seed_demo_reset.sql');

let conn, admin, angela;

beforeAll(async () => {
  conn = await mysql.createConnection({ ...DB, multipleStatements: true });
  // Prod runs MySQL 8 in strict mode: an explicit NULL for a NOT NULL column is an error there.
  await conn.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ZERO_DATE,NO_ZERO_IN_DATE,NO_ENGINE_SUBSTITUTION'");
  // The mock data fills most rooms; free them so the seed's vacant-room guard passes.
  await q("UPDATE rooms SET status = 'vacant', tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0");
  await q('DELETE FROM utility_readings');
  await q('DELETE FROM parking_charges');
  await q('DELETE FROM parking_reservations');
  await conn.query(seed);
  admin = await loginAs('admin');
  angela = await login('angela.dizon@demo.example.com', 'tenant123');
});
afterAll(async () => {
  await conn?.end();
});

describe('seed_demo_full.sql', () => {
  it('refuses a second load and writes nothing', async () => {
    const before = await one("SELECT COUNT(*) AS n FROM users WHERE email_address LIKE '%@demo.example.com'");
    await expect(conn.query(seed)).rejects.toThrow(/Duplicate entry/);
    const after = await one("SELECT COUNT(*) AS n FROM users WHERE email_address LIKE '%@demo.example.com'");
    expect(after.n).toBe(before.n);
  });

  it('covers every invoice status the payments desk handles', async () => {
    const rows = await q("SELECT DISTINCT status FROM invoices WHERE id LIKE 'INV-DEMO-%'");
    const got = new Set(rows.map((r) => r.status));
    for (const s of ['paid', 'pending', 'overdue', 'pending-verification', 'scheduled', 'processing', 'payment-failed']) {
      expect(got.has(s), s).toBe(true);
    }
  });

  it('has no payment, charge or credit pointing at a missing invoice', async () => {
    const o = await one(`SELECT
      (SELECT COUNT(*) FROM payment_transactions p LEFT JOIN invoices i ON i.id = p.invoice_id WHERE i.id IS NULL) AS pt,
      (SELECT COUNT(*) FROM parking_charges p LEFT JOIN invoices i ON i.id = p.invoice_id WHERE p.invoice_id IS NOT NULL AND i.id IS NULL) AS pc,
      (SELECT COUNT(*) FROM payment_proof_parts p LEFT JOIN invoices i ON i.id = p.payment_key WHERE i.id IS NULL) AS pp,
      (SELECT COUNT(*) FROM advance_credits a LEFT JOIN invoices i ON i.id = a.advance_invoice_id WHERE i.id IS NULL) AS ac`);
    expect([o.pt, o.pc, o.pp, o.ac].map(Number)).toEqual([0, 0, 0, 0]);
  });

  it('every paid bill is covered by its payments', async () => {
    const bad = await one(`SELECT COUNT(*) AS n FROM invoices i
      WHERE i.id LIKE 'INV-DEMO-%' AND i.status = 'paid' AND i.payment_method <> 'Advance credit'
        AND ABS(i.total_amount - COALESCE((SELECT SUM(amount) FROM payment_transactions p WHERE p.invoice_id = i.id), 0)) > 0.005`);
    expect(Number(bad.n)).toBe(0);
  });

  it('the payments desk lists demo bills in the review states, with a split proof and a reused reference', async () => {
    const { status, body } = await api('get_invoices.php', { token: admin });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    const demo = body.invoices.filter((i) => i.id.startsWith('INV-DEMO-'));
    expect(demo.length).toBeGreaterThan(80);
    const split = demo.find((i) => i.status === 'pending-verification' && i.split_parts.length === 2);
    expect(split).toBeTruthy();
    expect(demo.some((i) => i.status === 'pending-verification' && i.reference_reuse)).toBe(true);
    expect(demo.some((i) => i.adjustments?.length > 0)).toBe(true);
  });

  it('the tenant sees their own bills, advance credits and an unread message', async () => {
    const { body } = await api('get_invoices.php', { token: angela, query: { userId: (await one("SELECT id FROM users WHERE email_address = 'angela.dizon@demo.example.com'")).id } });
    expect(body.success).toBe(true);
    expect(body.invoices.some((i) => i.id === 'INV-DEMO-ADV-ANA')).toBe(true);
    const unread = await one("SELECT COUNT(*) AS n FROM messages m JOIN users u ON u.id = m.receiver_id WHERE u.email_address = 'angela.dizon@demo.example.com' AND m.is_read = 0");
    expect(Number(unread.n)).toBeGreaterThan(0);
  });

  it('covers the other modules with data', async () => {
    for (const [table, where] of [
      ['rent_applications', "status = 'Action Required'"], ['rent_applications', "status = 'Pending Review'"],
      ['lease_contracts', "status = 'eviction-pending'"], ['lease_contracts', "status = 'draft'"],
      ['parking_reservations', "status = 'Assigned'"], ['parking_reservations', "status = 'Pending'"],
      ['maintenance_requests', "status = 'In Progress'"], ['service_requests', "status = 'Completed'"],
      ['visitor_logs', "status = 'overstayed'"], ['refund_requests', "status = 'Info Requested'"],
      ['deposit_deductions', '1 = 1'], ['utility_reading_items', '1 = 1'], ['household_members', "status = 'Pending'"],
      ['guest_messages', '1 = 1'], ['unit_reservations', "status = 'Active'"], ['unit_waitlist', '1 = 1'],
      ['expenses', '1 = 1'], ['cctv_requests', "status = 'Pending'"],
    ]) {
      const r = await one(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`);
      expect(Number(r.n), `${table} ${where}`).toBeGreaterThan(0);
    }
  });
});

describe('seed_demo_reset.sql', () => {
  it('removes every demo row, leaves the real accounts, and the seed can load again', async () => {
    const real = await one("SELECT COUNT(*) AS n FROM users WHERE email_address NOT LIKE '%@demo.example.com'");
    await conn.query(reset);
    const left = await one(`SELECT
      (SELECT COUNT(*) FROM users WHERE email_address LIKE '%@demo.example.com') AS u,
      (SELECT COUNT(*) FROM invoices WHERE id LIKE 'INV-DEMO-%') AS i,
      (SELECT COUNT(*) FROM lease_contracts WHERE id LIKE 'CTR-DEMO-%') AS c,
      (SELECT COUNT(*) FROM notifications WHERE metadata_value = 'demo:overdue') AS n`);
    expect([left.u, left.i, left.c, left.n].map(Number)).toEqual([0, 0, 0, 0]);
    const after = await one("SELECT COUNT(*) AS n FROM users WHERE email_address NOT LIKE '%@demo.example.com'");
    expect(after.n).toBe(real.n);
    await conn.query(seed);
    const again = await one("SELECT COUNT(*) AS n FROM users WHERE email_address LIKE '%@demo.example.com'");
    expect(Number(again.n)).toBe(16);
  });
});
