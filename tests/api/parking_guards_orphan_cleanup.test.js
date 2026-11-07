// 2026_10_parking_slot_guards_orphan_cleanup.sql: the parking guard columns refuse
// overbooking, and the cleanup removes only rows whose invoice is gone.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { DB } from './lib/env.js';
import { q, one } from './lib/db.js';

const migration = readFileSync(
  new URL('../../backend/api/migrations/2026_10_parking_slot_guards_orphan_cleanup.sql', import.meta.url),
  'utf8',
);

describe('parking_reservations guard columns', () => {
  const ids = [];
  let userA, userB;
  const reserve = async (userId, status, slot) => {
    const res = await q(
      "INSERT INTO parking_reservations (user_id, vehicle_type, vehicle_model, plate_number, status, slot_number, transmission, duration_months, total_cost, document_path) VALUES (?, 'Car', 'Test', 'GUARD1', ?, ?, 'Manual', 1, 0, 'x')",
      [userId, status, slot],
    );
    ids.push(res.insertId);
    return res.insertId;
  };

  beforeAll(async () => {
    const users = await q("SELECT id FROM users WHERE role = 'user' AND id NOT IN (SELECT user_id FROM parking_reservations WHERE user_id IS NOT NULL AND status IN ('Pending','Assigned')) LIMIT 2");
    [userA, userB] = users.map((u) => u.id);
  });
  afterAll(async () => {
    if (ids.length) await q('DELETE FROM parking_reservations WHERE id IN (?)', [ids]);
  });

  it('refuses two Assigned reservations on one slot', async () => {
    await reserve(userA, 'Assigned', 9901);
    await expect(reserve(userB, 'Assigned', 9901)).rejects.toThrow(/Duplicate entry/);
  });

  // A tenant may now hold several open reservations (parking_max_per_tenant,
  // checked in parking_reservation.php), so the database no longer refuses one.
  it('a tenant may hold a second open reservation at the database level', async () => {
    await expect(reserve(userA, 'Pending', null)).resolves.toBeTruthy();
  });

  it('a released reservation frees the slot and the tenant', async () => {
    await q("UPDATE parking_reservations SET status = 'Released' WHERE id = ?", [ids[0]]);
    await expect(reserve(userB, 'Assigned', 9901)).resolves.toBeTruthy();
  });
});

describe('orphan cleanup', () => {
  let conn;
  beforeAll(async () => {
    conn = await mysql.createConnection({ ...DB, multipleStatements: true });
  });
  afterAll(async () => {
    await conn?.end();
  });

  it('removes ledger rows of a missing invoice, keeps rows of an existing one, and re-runs cleanly', async () => {
    const real = await one('SELECT id FROM invoices LIMIT 1');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query("INSERT INTO payment_transactions (invoice_id, amount, payment_method) VALUES ('INV-ORPHAN-T', 1, 'cash'), (?, 1, 'cash')", [real.id]);
    await conn.query("INSERT INTO payment_proof_parts (payment_key, method, amount) VALUES ('INV-ORPHAN-T', 'cash', 1)");
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    const before = await one('SELECT COUNT(*) AS n FROM payment_transactions WHERE invoice_id = ?', [real.id]);

    await conn.query(migration);
    await conn.query(migration);

    const orphan = await one("SELECT (SELECT COUNT(*) FROM payment_transactions WHERE invoice_id = 'INV-ORPHAN-T') AS pt, (SELECT COUNT(*) FROM payment_proof_parts WHERE payment_key = 'INV-ORPHAN-T') AS pp");
    expect(Number(orphan.pt)).toBe(0);
    expect(Number(orphan.pp)).toBe(0);
    const after = await one('SELECT COUNT(*) AS n FROM payment_transactions WHERE invoice_id = ?', [real.id]);
    expect(after.n).toBe(before.n);

    await q('DELETE FROM payment_transactions WHERE invoice_id = ? AND amount = 1 AND payment_method = ? ORDER BY id DESC LIMIT 1', [real.id, 'cash']);
  });
});
