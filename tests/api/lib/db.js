// Direct DB access for fixtures and for checking what an endpoint wrote.
import mysql from 'mysql2/promise';
import { DB } from './env.js';

let pool;
function getPool() {
  pool ??= mysql.createPool({ ...DB, dateStrings: true, connectionLimit: 2 });
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
