// Local load and volume check (audit X-01..X-05, SPRINT 153).
//
//   node tests/load/run.mjs            # from the repo root; needs MySQL running, not Apache
//
// Builds a scratch DB (ams_load_test, never ams_db), starts `php -S` on its own
// port, measures each key admin list endpoint on the seed data, adds realistic
// volume, measures again, prints a markdown table and drops everything.
//
// It measures latency and query count per request, one request at a time.
// `php -S` is single-threaded, so this is NOT a concurrency test: it shows how
// cost grows with data, which is what pagination would change.
//
// Env: LOAD_PORT (8093), LOAD_RUNS (15), LOAD_USERS (100), LOAD_INVOICES (2000),
// LOAD_MAINTENANCE (1000), LOAD_MESSAGES (5000), LOAD_LOGS (10000),
// KEEP_LOAD_DB=1 keeps the database, MYSQL_BIN_DIR, PHP_BIN.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MYSQL_BIN = process.env.MYSQL_BIN_DIR || 'C:/xampp/mysql/bin';
const PHP_BIN = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
const DB_NAME = 'ams_load_test';
const PORT = Number(process.env.LOAD_PORT || 8093);
const BASE = `http://127.0.0.1:${PORT}/backend/api`;
const RUNS = Number(process.env.LOAD_RUNS || 15);
const VOLUME = {
  users: Number(process.env.LOAD_USERS || 100),
  invoices: Number(process.env.LOAD_INVOICES || 2000),
  maintenance: Number(process.env.LOAD_MAINTENANCE || 1000),
  messages: Number(process.env.LOAD_MESSAGES || 5000),
  logs: Number(process.env.LOAD_LOGS || 10000),
};

if (!/_test$/.test(DB_NAME)) throw new Error('The scratch database name must end in _test');

const mysqlArgs = ['-h', '127.0.0.1', '-u', 'root', '--default-character-set=utf8mb4'];
function mysql(sql, db) {
  const res = spawnSync(path.join(MYSQL_BIN, 'mysql'), [...mysqlArgs, ...(db ? [db] : [])], {
    input: sql, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`mysql failed:\n${res.stderr}`);
  return res.stdout;
}
const scalar = (sql, db) => Number(mysql(sql, db).trim().split(/\r?\n/).pop());
const importRenamed = (file) => mysql(fs.readFileSync(file, 'utf8').replace(/\bams_db\b/g, DB_NAME));

const questions = () => scalar("SELECT VARIABLE_VALUE FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME = 'QUESTIONS'");
let overhead = 0;

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]; };

// Total number of rows an endpoint returned: the longest array in the body.
function rowCount(body) {
  let best = 0;
  const walk = (v, depth) => {
    if (Array.isArray(v)) best = Math.max(best, v.length);
    if (depth < 3 && v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, depth + 1));
  };
  walk(body, 0);
  return best;
}

const ENDPOINTS = [
  ['get_invoices.php'], ['get_tenants.php'], ['get_users.php'], ['get_applications.php'],
  ['get_maintenance_requests.php'], ['get_contracts.php'], ['get_visitors.php'], ['get_inquiries.php'],
  ['get_rooms.php'], ['get_notifications.php'], ['get_conversations.php'], ['dashboard_stats.php'],
  ['get_report_data.php'], ['get_activity_logs.php', { page: 1, limit: 50 }],
];

async function call(endpoint, query, token) {
  const url = new URL(`${BASE}/${endpoint}`);
  Object.entries(query || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const before = questions();
  const t0 = performance.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  const ms = performance.now() - t0;
  const after = questions();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  // The status read between the snapshots is itself counted; `overhead` is how
  // much two back-to-back reads differ (measured once in main()).
  return { status: res.status, ms, bytes: Buffer.byteLength(text), rows: rowCount(body), queries: Math.max(0, after - before - overhead) };
}

async function measure(token) {
  const out = {};
  for (const [endpoint, query] of ENDPOINTS) {
    await call(endpoint, query, token); // warm up
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await call(endpoint, query, token));
    out[endpoint] = {
      status: runs[0].status,
      rows: runs[0].rows,
      bytes: runs[0].bytes,
      median: median(runs.map((r) => r.ms)),
      p95: p95(runs.map((r) => r.ms)),
      queries: median(runs.map((r) => r.queries)),
    };
  }
  return out;
}

function seedVolume() {
  const first = `(SELECT MIN(id) FROM users WHERE email_address LIKE 'load.%')`;
  mysql(`
    INSERT INTO users (first_name, last_name, email_address, password, role, email_verified_at)
      SELECT 'Load', CONCAT('Tenant', seq), CONCAT('load.', seq, '@demo.example'), (SELECT password FROM users WHERE id = 2), 'user', NOW()
      FROM seq_1_to_${VOLUME.users};
    INSERT INTO invoices (id, user_id, rent_application_id, services, total_amount, billing_period, status, due_date)
      SELECT CONCAT('INV-LOAD-', seq), ${first} + (seq % ${VOLUME.users}), 1 + (seq % 10), 4000, 4000, CONCAT('Load bill ', seq),
             ELT(1 + (seq % 4), 'paid', 'pending', 'overdue', 'pending-verification'), CURDATE() - INTERVAL (seq % 400) DAY
      FROM seq_1_to_${VOLUME.invoices};
    INSERT INTO maintenance_requests (user_id, issue_category, urgency, preferred_date, preferred_time, description, status)
      SELECT ${first} + (seq % ${VOLUME.users}), 'Plumbing', 'Normal', CURDATE() + INTERVAL (seq % 30) DAY, 'Morning', CONCAT('Load request ', seq),
             ELT(1 + (seq % 4), 'Pending', 'In Progress', 'Completed', 'Rejected')
      FROM seq_1_to_${VOLUME.maintenance};
    INSERT INTO messages (sender_id, receiver_id, message)
      SELECT ${first} + (seq % ${VOLUME.users}), (SELECT id FROM users WHERE email_address = 'admin@gmail.com'), CONCAT('Load message ', seq) FROM seq_1_to_${VOLUME.messages};
    INSERT INTO activity_logs (category, action, details, created_at)
      SELECT 'billing', 'Load Entry', CONCAT('entry ', seq), NOW() - INTERVAL (seq % 365) DAY FROM seq_1_to_${VOLUME.logs};
  `, DB_NAME);
}

const counts = () => ({
  users: scalar('SELECT COUNT(*) FROM users', DB_NAME),
  invoices: scalar('SELECT COUNT(*) FROM invoices', DB_NAME),
  maintenance: scalar('SELECT COUNT(*) FROM maintenance_requests', DB_NAME),
  messages: scalar('SELECT COUNT(*) FROM messages', DB_NAME),
  logs: scalar('SELECT COUNT(*) FROM activity_logs', DB_NAME),
});

let server;
async function main() {
  mysql('SELECT 1');
  mysql(`DROP DATABASE IF EXISTS ${DB_NAME};`);
  importRenamed(path.join(ROOT, 'backend/api/migrations/SetupDB.sql'));
  importRenamed(path.join(ROOT, 'backend/api/migrations/seeds/seed_mock_data.sql'));
  mysql(`UPDATE system_settings SET setting_value = '0' WHERE setting_key IN ('notifications_sms_enabled', 'notifications_email_enabled');`, DB_NAME);

  server = spawn(PHP_BIN, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], {
    cwd: ROOT,
    env: {
      ...process.env, AMS_TEST_MODE: '1', DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_USER: 'root', DB_PASS: '', DB_NAME,
      APP_ENV: 'development', DEVICE_OTP_BYPASS_DOMAINS: 'demo.example',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${BASE}/login.php`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(1000) }); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }

  const login = await (await fetch(`${BASE}/login.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_address: 'admin@gmail.com', password: 'admin123' }),
  })).json();
  if (!login.sessionToken) throw new Error(`admin login failed: ${JSON.stringify(login)}`);

  // Two reads with nothing in between: their difference is the cost of reading.
  const r1 = questions();
  overhead = questions() - r1;

  const baseCounts = counts();
  console.error('Measuring the seed data...');
  const small = await measure(login.sessionToken);
  console.error('Adding volume...');
  seedVolume();
  const bigCounts = counts();
  console.error('Measuring with volume...');
  const big = await measure(login.sessionToken);

  const fmt = (n) => (n >= 100 ? Math.round(n) : n.toFixed(1));
  const lines = [];
  lines.push(`Load check, ${new Date().toISOString().slice(0, 10)}. ${RUNS} sequential calls per endpoint after one warm-up, php -S (single-threaded), MariaDB on the same machine.`);
  lines.push('');
  lines.push('| Data | users | invoices | maintenance | messages | activity log |');
  lines.push('|---|---|---|---|---|---|');
  const row = (label, c) => `| ${label} | ${c.users} | ${c.invoices} | ${c.maintenance} | ${c.messages} | ${c.logs} |`;
  lines.push(row('Seed', baseCounts), row('With volume', bigCounts), '');
  lines.push('| Endpoint | Rows seed → volume | Size seed → volume | Median ms seed → volume | p95 ms (volume) | Queries per call (seed → volume) |');
  lines.push('|---|---|---|---|---|---|');
  for (const [endpoint] of ENDPOINTS) {
    const a = small[endpoint]; const b = big[endpoint];
    const kb = (n) => (n / 1024).toFixed(0) + ' KB';
    lines.push(`| ${endpoint} | ${a.rows} → ${b.rows} | ${kb(a.bytes)} → ${kb(b.bytes)} | ${fmt(a.median)} → ${fmt(b.median)} | ${fmt(b.p95)} | ${a.queries} → ${b.queries}${b.status !== 200 ? ` (HTTP ${b.status})` : ''} |`);
  }
  lines.push('', 'Queries are the difference in the server-wide `Questions` counter around one call, so other activity on the same MySQL server can add to it; the median of the runs is shown.');
  console.log(lines.join('\n'));
}

try {
  await main();
} finally {
  server?.kill();
  if (process.env.KEEP_LOAD_DB !== '1') mysql(`DROP DATABASE IF EXISTS ${DB_NAME};`);
}
