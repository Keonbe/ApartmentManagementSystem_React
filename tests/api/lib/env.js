// Shared settings for the API suite. Everything here points at the scratch
// database and the test PHP server, never at the dev ams_db or Apache.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const CACHE_DIR = path.join(ROOT, 'tests/api/.test-cache');
export const DUMP_FILE = path.join(CACHE_DIR, 'ams_test.sql');

export const MYSQL_BIN = process.env.MYSQL_BIN_DIR || 'C:/xampp/mysql/bin';
export const PHP_BIN = process.env.PHP_BIN || 'C:/xampp/php/php.exe';

export const DB = {
  host: process.env.TEST_DB_HOST || '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT || 3306),
  user: process.env.TEST_DB_USER || 'root',
  password: process.env.TEST_DB_PASS || '',
  database: 'ams_test',
};

export const PORT = Number(process.env.TEST_PHP_PORT || 8091);
export const BASE = `http://127.0.0.1:${PORT}/backend/api`;
export const WEBHOOK_SECRET = 'whsk_test_suite';

if (!/_test$/.test(DB.database)) throw new Error(`Refusing to run against ${DB.database}: the test DB name must end in _test`);
