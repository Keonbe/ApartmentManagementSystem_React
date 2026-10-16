// Runs once per `npm test`: builds ams_test from SetupDB.sql + the mock seed,
// dumps it for fast per-file resets, and starts a PHP server wired to it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CACHE_DIR, DB, PHP_BIN, PORT, BASE, WEBHOOK_SECRET } from '../lib/env.js';
import { mysql, importRenamed, dumpScratch } from '../lib/mysql.js';

const MIGRATIONS = path.join(ROOT, 'backend/api/migrations');

async function ping() {
  try {
    await fetch(`${BASE}/login.php`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

export default async function setup() {
  try {
    mysql('SELECT 1');
  } catch (e) {
    throw new Error(`MySQL is not reachable. Start XAMPP MySQL first (C:\\xampp\\mysql_start.bat).\n${e.message}`);
  }
  if (await ping()) throw new Error(`Port ${PORT} is already in use. Stop that server or set TEST_PHP_PORT.`);

  const started = Date.now();
  mysql(`DROP DATABASE IF EXISTS ${DB.database};`);
  importRenamed(path.join(MIGRATIONS, 'SetupDB.sql'));
  importRenamed(path.join(MIGRATIONS, 'seeds/seed_mock_data.sql'));

  // Nothing may leave the machine, and the dev mock outbox stays clean:
  // channels off, and both providers must be the dry-run 'log' driver.
  mysql(`UPDATE system_settings SET setting_value = '0'
         WHERE setting_key IN ('notifications_sms_enabled', 'notifications_email_enabled');`, DB.database);
  const providers = mysql(`SELECT setting_key, setting_value FROM system_settings
         WHERE setting_key IN ('sms_provider', 'email_driver') AND setting_value <> 'log';`, DB.database);
  if (providers.trim()) throw new Error(`ams_test has a live SMS/email provider configured:\n${providers}`);

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  dumpScratch();
  console.log(`[api-tests] built ${DB.database} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const server = spawn(PHP_BIN, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], {
    cwd: ROOT,
    env: {
      ...process.env,
      AMS_TEST_MODE: '1',
      DB_HOST: DB.host,
      DB_PORT: String(DB.port),
      DB_USER: DB.user,
      DB_PASS: DB.password,
      DB_NAME: DB.database,
      APP_ENV: 'development',
      PAYMONGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  // php -S logs every request to stderr; keep only real PHP errors.
  server.stderr.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (/PHP (Fatal|Warning|Notice|Deprecated|Parse)/.test(line)) console.error(`[php] ${line}`);
    }
  });

  for (let i = 0; i < 50 && !(await ping()); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await ping())) {
    server.kill();
    throw new Error(`PHP test server did not start on port ${PORT}`);
  }

  return async function teardown() {
    server.kill();
    if (process.env.KEEP_TEST_DB === '1') {
      console.log(`[api-tests] kept ${DB.database} (KEEP_TEST_DB=1)`);
    } else {
      mysql(`DROP DATABASE IF EXISTS ${DB.database};`);
    }
  };
}
