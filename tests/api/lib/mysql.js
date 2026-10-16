// Runs the mysql / mysqldump command-line clients against the scratch DB.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DB, MYSQL_BIN, DUMP_FILE } from './env.js';

function credentials() {
  const args = ['-h', DB.host, '-P', String(DB.port), '-u', DB.user];
  if (DB.password) args.push(`-p${DB.password}`);
  return args;
}

function run(bin, args, input) {
  const res = spawnSync(path.join(MYSQL_BIN, bin), [...credentials(), ...args], {
    input, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${bin} ${args.join(' ')} failed:\n${res.stderr}`);
  return res.stdout;
}

export const mysql = (sql, database) => run('mysql', database ? [database] : [], sql);

// SetupDB.sql and the seeds hardcode `USE ams_db`; rewrite the name exactly
// like the db-snapshot skill's `scratch` action does.
export function importRenamed(file) {
  const sql = fs.readFileSync(file, 'utf8').replace(/\bams_db\b/g, DB.database);
  if (/\bams_db\b/.test(sql)) throw new Error(`ams_db still named in ${file}`);
  mysql(sql);
}

export function dumpScratch() {
  fs.writeFileSync(DUMP_FILE, run('mysqldump', ['--routines', '--triggers', '--single-transaction', DB.database]));
}

export function restoreScratch() {
  mysql(fs.readFileSync(DUMP_FILE, 'utf8'), DB.database);
}
