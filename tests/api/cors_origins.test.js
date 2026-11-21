// CORS allowlist (SPRINT 175, panel S-10): backend/cors.php honours ALLOWED_ORIGINS,
// keeps local origins out of production, and falls back to the built-in hosts.
// An OPTIONS request is answered by cors.php before any database access, so each
// case starts its own small `php -S` with the environment under test.
import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { ROOT, PHP_BIN } from './lib/env.js';

const servers = [];
let nextPort = 8140;

async function startServer(env) {
  const port = nextPort++;
  const child = spawn(PHP_BIN, ['-S', `127.0.0.1:${port}`, '-t', ROOT], {
    cwd: ROOT,
    env: { ...process.env, AMS_TEST_MODE: '1', DB_NAME: 'ams_test', ...env },
    stdio: 'ignore',
  });
  servers.push(child);
  const base = `http://127.0.0.1:${port}/backend/api/get_rooms.php`;
  for (let i = 0; i < 50; i++) {
    try { await fetch(base, { method: 'OPTIONS' }); return base; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('php -S did not start');
}

// The Access-Control-Allow-Origin header a preflight from `origin` gets (null = none).
const allowedFor = async (base, origin) => (await fetch(base, { method: 'OPTIONS', headers: { Origin: origin } })).headers.get('access-control-allow-origin');

afterAll(() => { for (const s of servers) s.kill(); });

describe('cors.php allowlist', () => {
  it('uses ALLOWED_ORIGINS exactly: a listed origin is echoed, local and other origins are not', async () => {
    const base = await startServer({ APP_ENV: 'production', ALLOWED_ORIGINS: 'https://ams.example.org/, https://app.example.org' });
    expect(await allowedFor(base, 'https://ams.example.org')).toBe('https://ams.example.org'); // trailing slash in the setting is dropped
    expect(await allowedFor(base, 'https://app.example.org')).toBe('https://app.example.org');
    expect(await allowedFor(base, 'http://localhost:5173')).toBeNull();
    expect(await allowedFor(base, 'https://angcanan-ams.com')).toBeNull(); // the built-in list is not added on top
    expect(await allowedFor(base, 'https://evil.example')).toBeNull();
  });

  it('ignores a wildcard and falls back to the built-in hosts in production, without local origins', async () => {
    const base = await startServer({ APP_ENV: 'production', ALLOWED_ORIGINS: '*' });
    expect(await allowedFor(base, 'https://angcanan-ams.com')).toBe('https://angcanan-ams.com');
    expect(await allowedFor(base, 'http://localhost:5173')).toBeNull();
    expect(await allowedFor(base, 'http://localhost:5174')).toBeNull();
    expect(await allowedFor(base, 'https://evil.example')).toBeNull();
  });

  it('outside production the local dev origins are allowed as well', async () => {
    const base = await startServer({ APP_ENV: 'development' });
    expect(await allowedFor(base, 'http://localhost:5173')).toBe('http://localhost:5173');
    expect(await allowedFor(base, 'http://localhost:8080')).toBe('http://localhost:8080');
    expect(await allowedFor(base, 'https://angcanan-ams.com')).toBe('https://angcanan-ams.com');
    expect(await allowedFor(base, 'https://evil.example')).toBeNull();
  });

  it('an unset APP_ENV is production, and credentials are only sent with an allowed origin', async () => {
    const base = await startServer({ APP_ENV: '', ALLOWED_ORIGINS: '' });
    expect(await allowedFor(base, 'http://localhost:5173')).toBeNull();
    const ok = await fetch(base, { method: 'OPTIONS', headers: { Origin: 'https://www.angcanan-ams.com' } });
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
    const no = await fetch(base, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    expect(no.headers.get('access-control-allow-credentials')).toBeNull();
    expect(no.headers.get('vary')).toMatch(/Origin/i);
  });
});
