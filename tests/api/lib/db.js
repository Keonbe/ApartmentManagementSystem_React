// Direct DB access for fixtures and for checking what an endpoint wrote.
import mysql from 'mysql2/promise';
import { DB } from './env.js';

let pool;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({ ...DB, dateStrings: true, connectionLimit: 2 });
    // Same strict mode as CI's MariaDB 10.11 (local XAMPP is looser), so a fixture
    // that omits a NOT NULL column fails here and not only on GitHub.
    pool.pool.on('connection', (c) => c.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'"));
  }
  return pool;
}

export async function q(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

export async function one(sql, params = []) {
  return (await q(sql, params))[0] ?? null;
}

export async function setting(key) {
  return (await one('SELECT setting_value FROM system_settings WHERE setting_key = ?', [key]))?.setting_value ?? null;
}

export async function setSetting(key, value) {
  await q('INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [key, String(value)]);
}

export async function closeDb() {
  await pool?.end();
  pool = undefined;
}
