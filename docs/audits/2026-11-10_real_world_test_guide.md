# Real-World Test Guide (things only people and real runs can do)

**Date:** 2026-11-10
**Purpose:** step-by-step procedures for the checks the AI-assisted audits could not do. Each one maps to survey items in [2026-11-10_iso25010_evidence_map.md](2026-11-10_iso25010_evidence_map.md). Record the result of each run (date, who, numbers) so the thesis can cite it.

**Rules for every test below**
- Run against a **scratch or staging copy**, never the live production site or your dev `ams_db`. Snapshot first (`/db-snapshot`, or `mysqldump` into `.db-snapshots/`).
- Use `@demo.example` accounts only, never real tenants' data (see AGENTS.md).
- Security testing only on a system you own and have permission to test.
- Write results down as you go. A test without a recorded result does not count as evidence.

---

## 1. Usability test with real users (items 9, 10, 11)

**Who and how many:** 5 per role (5 admin/staff, 5 tenants) finds most problems. They should be new to the system, not the developers.

**Before:** seeded scratch DB, accounts ready, screen recording or an observer with a timer, a consent line ("we test the system, not you").

**Tasks (read one at a time, do not help):**

| Role | Task | Success = |
|---|---|---|
| Tenant | Log in, find your next bill and pay it (upload proof) | Proof submitted |
| Tenant | Submit a maintenance request with a photo | Request visible in "My requests" |
| Tenant | Register a visitor | Visitor in the list |
| Tenant | Book a cleaning service | Booking confirmed |
| Admin | Approve a rental application and create the contract | Contract exists |
| Admin | Record a cash payment for an invoice | Invoice marked Paid |
| Admin | Handle a maintenance request to Done | Status Done, tenant notified |
| Admin | Run the monthly report and export CSV | File opens in Excel |
| Admin | Enter a wrong value on purpose (bad date, duplicate) and recover | Error understood, fixed unaided |

**Record per task:** completed (yes/no/with help), seconds taken, number of wrong clicks, quote of any confusion.

**After:** the System Usability Scale (SUS), 10 statements, each 1-5:
1. I think I would like to use this system frequently.
2. I found it unnecessarily complex.
3. I thought it was easy to use.
4. I would need the support of a technical person to use it.
5. The functions were well integrated.
6. There was too much inconsistency.
7. Most people would learn it very quickly.
8. I found it very cumbersome to use.
9. I felt very confident using it.
10. I needed to learn a lot before I could get going.

**SUS score:** for odd items subtract 1 from the answer; for even items subtract the answer from 5; add all ten values and multiply by 2.5. Score range 0-100; about 68 is average, 80+ is good.

**Evidence to keep:** task table, SUS sheets, top 5 problems. Compare problems with the High list in the UI/UX audit.

---

## 2. Load test (items 4, 5, 6)

**Tool:** [k6](https://k6.io) (free). Install, then run from a terminal.
**Target:** a scratch server (for example `php -S 127.0.0.1:8091` with `AMS_TEST_MODE=1` on `ams_test`, as the API tests do), not production. Raise `max_connections` for the test if needed.

**Steps**
1. Seed realistic volume: about 100 tenants, 2,000 invoices, 1,000 maintenance requests (insert with SQL on the scratch DB).
2. Get a token: `POST /backend/api/login.php` with `{"email_address":"admin@gmail.com","password":"admin123"}` (scratch only), copy `sessionToken`.
3. Save as `load.js`:
```js
import http from 'k6/http';
import { check, sleep } from 'k6';
const BASE = __ENV.BASE;           // e.g. http://127.0.0.1:8091/backend/api
const TOKEN = __ENV.TOKEN;
export const options = {
  stages: [
    { duration: '1m', target: 25 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],      // under 1% errors
    http_req_duration: ['p(95)<1000'],   // 95% under 1 s
  },
};
export default function () {
  const h = { headers: { Authorization: `Bearer ${TOKEN}` } };
  for (const ep of ['get_invoices.php', 'get_maintenance_requests.php', 'get_visitors.php', 'dashboard_stats.php']) {
    const r = http.get(`${BASE}/${ep}`, h);
    check(r, { [`${ep} 200`]: (x) => x.status === 200 });
  }
  sleep(1);
}
```
4. Run: `k6 run -e BASE=http://127.0.0.1:8091/backend/api -e TOKEN=<token> load.js`
5. Watch while it runs: MariaDB `SHOW STATUS LIKE 'Threads_connected'`, `SHOW GLOBAL STATUS LIKE 'Slow_queries'`, Task Manager for PHP/MySQL CPU and memory.
6. Repeat at 200 users and for the payment path (`submit_split_payment.php`) with unique invoices per virtual user.

**Pass (suggested for this scale, 15-100 units):** p95 under 1 s, errors under 1%, no DB connection errors at 100 virtual users. Write down the numbers even if they fail; the fix list is the useful output.

**Chat:** open about 200-500 Socket.IO connections with a small `socket.io-client` script against `websocket-server` and watch memory.

**Page speed:** Chrome DevTools → Lighthouse (Mobile and Desktop) on login, admin dashboard, invoices, tenant My Room. Record Performance, Accessibility and the LCP time.

---

## 3. Soak test (item 13)

1. Start the app on a scratch machine with the real config (production build).
2. Open a headless browser (Playwright script or a spare PC) logged in on the admin dashboard and one tenant page, left open for 24-72 hours.
3. Every hour record: PHP and Node process memory (Task Manager or `tasklist`), `Threads_connected`, size of `backend/logs/`, the browser's JS heap (DevTools → Memory) and any console errors.
4. Let the daily sweep run at least twice (`php backend/cron/daily_sweep.php`) and confirm no duplicate invoices or notifications.
5. **Pass:** memory flat or slowly rising within limits, no growth in connections, no errors.

---

## 4. Backup and restore drill (item 14)

Follow `docs/deployment/backup_and_restore.md` §5. Short version:
1. Backup: `mysqldump -u root --single-transaction ams_db > backup_YYYYMMDD.sql`; copy `uploads/`, `room_images/`, `site_assets/`, `config.env.php`.
2. Restore into a scratch DB: `mysql -u root -e "CREATE DATABASE ams_restore_drill"` then `mysql -u root ams_restore_drill < backup_YYYYMMDD.sql`.
3. Check counts match: `SELECT COUNT(*) FROM users, invoices, maintenance_requests` on both.
4. Point a scratch server at the restored DB and log in, open an invoice, open a tenant.
5. Failure case: start a payment, kill PHP (`taskkill /IM php.exe /F` on the scratch server) mid-request, then check the invoice is not half-paid; replay the same PayMongo webhook twice and confirm it records once.
6. Record: date, backup size, minutes to restore, who did it. Fill the "last tested" line in the doc.

---

## 5. Second environment, install and uninstall (items 21, 22)

**Install on a clean machine or VM:**
1. Install XAMPP (or Apache + PHP 8 + MariaDB). Clone the repo.
2. Create DB, import `backend/api/migrations/SetupDB.sql` (then the seed for a demo).
3. Copy `backend/config.env.example.php` to `config.env.php`, set DB, `APP_URL`, timezone.
4. `cd ams-react && npm ci && npm run build:selfhosted` (needs `.env.selfhosted`).
5. `php backend/cron/migrate.php` twice. Second run must change nothing.
6. `php backend/cron/check_environment.php`; fix anything it flags.
7. Log in as admin and tenant; open an upload; check CORS (no browser console errors).

**Uninstall (write this up as you do it, since it isn't documented yet):** stop Apache and the Node chat server, remove scheduled tasks, `DROP DATABASE`, delete the vhost entry, delete `uploads/`, `room_images/`, `site_assets/`, `dist/`, then confirm the port is free.

---

## 6. Accessibility with a screen reader (items 9-11, UI/UX audit)

1. Install NVDA (free) on Windows. Use Firefox or Chrome.
2. Without the mouse, complete: log in (check the error is announced), open the menu, create a maintenance request, open and close a modal (focus should return to the opener), pay a bill.
3. Note: unlabeled buttons ("button" with no name), silent toasts/errors, focus lost after closing a dialog, tables read in the wrong order.
4. Tools: axe DevTools extension and Lighthouse Accessibility on 6 key pages; fix Critical/Serious items first.
5. Check contrast of status badges with the WebAIM contrast checker for `amber-500` text.

---

## 7. Security test on your own scratch server (items 15-17)

Only on `127.0.0.1` with a scratch DB.
1. **Unauthenticated sweep:** for each file in `backend/api/*.php`, send a request with no token; expect 401/403 except the intended public ones (login, registration, forgot/reset password, get_rooms, get_service_catalog, house_rules, submit_inquiry, webhook, public_file, guest chat).
2. **Tenant token on admin endpoints:** log in as a tenant, call `get_users.php`, `get_tenants.php`, `update_system_settings.php`, `get_activity_logs.php`; expect 403.
3. **Cross-tenant (IDOR):** as tenant A, request tenant B's invoice id, maintenance request, contract, payment proof and file; expect 403/404.
4. **Brute force:** 6 wrong passwords for one account → expect lockout (429).
5. **Session:** log in, change the password, replay the old token → 401.
6. **Exposure:** open `/backend/logs/`, `/backend/config.env.php`, `/uploads/<private doc>` without logging in → expect 403/404. Open `/backend/api/migrations/SetupDB.sql` → expect blocked.
7. **Upload:** upload a `.php` file renamed `.jpg`, an oversized file, and an SVG with a script; expect rejection or safe handling.
8. **Injection:** send `'` and `" OR 1=1 --` in search and filter fields; expect no SQL error. Enter `<script>alert(1)</script>` in a name and a maintenance description and check it is shown as text everywhere, including the email.
9. **Chat socket (CH-1):** connect a `socket.io-client` without auth and `emit('join', <other user id>)`; if you receive their messages the finding is confirmed.
10. **Defaults:** confirm `admin@gmail.com / admin123` fails on the deployed system.

Record each as pass/fail with the HTTP status.

---

## 8. Replacing another system (item 23) and reuse (item 18)

- **Onboarding trial:** take 10 real-looking tenants from a spreadsheet and enter them (room, contract, deposit, starting balance). Time it and note every field you could not map.
- **Reports:** export each report to CSV and open in Excel; compare totals against the spreadsheet.
- **Reuse:** install a second instance, change the building name, currency and units through Settings only, and list everything that still needed a code change.

---

## 9. Running the evaluator survey properly (all 23 items)

1. **Brief the evaluators** (10-15 min) and let them use the system with a task list for their role before answering. They should answer from what they saw, not from a presentation.
2. **Sample:** note each evaluator's role (landlord, tenant, IT expert) and count. Report the count in Chapter 4.
3. **Collect** the paper or form answers as they are. Never edit or fill in responses for anyone.
4. **Score:** mean per item and per characteristic on the 4-point scale. Common verbal interpretation: 3.26-4.00 Strongly Agree, 2.51-3.25 Agree, 1.76-2.50 Disagree, 1.00-1.75 Strongly Disagree (confirm the ranges your adviser uses).
5. **Report** the evidence from sections 1-8 next to the scores, and state what was not tested.
