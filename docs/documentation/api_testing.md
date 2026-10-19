# AMS — API test suite

Automated regression tests for the PHP endpoints. Vitest (in Node) calls the real endpoints over HTTP and checks the database directly. Added 2026-10-15 so that fixes verified by hand with curl stay verified.

Manual, browser and module-by-module procedures stay in [module_verification_guide.md](module_verification_guide.md). This suite automates a subset of those checks; it does not replace the UI checks.

## 1. Run it

```bash
cd tests/api
npm install        # first time only
npm test           # ~40 s, 87 tests
npx vitest run webhook.test.js   # one file
```

Needs XAMPP **MySQL** running. Apache is not used.

| Variable | Effect |
|---|---|
| `KEEP_TEST_DB=1` | Keep `ams_test` after the run, for inspecting a failure |
| `TEST_PHP_PORT` | Test server port (default 8091) |
| `TEST_DB_HOST` / `TEST_DB_PORT` / `TEST_DB_USER` / `TEST_DB_PASS` | MySQL connection (default `127.0.0.1:3306`, `root`, no password) |
| `MYSQL_BIN_DIR`, `PHP_BIN` | Paths to the MySQL tools and `php.exe` (defaults are the XAMPP paths) |

## 2. How it works

```
npm test
  └─ setup/global.js (once)
       1. DROP/CREATE ams_test from SetupDB.sql + seed_mock_data.sql (name rewritten)
       2. SMS/email channels off; refuse to start if a provider isn't the dry-run "log"
       3. mysqldump ams_test → .test-cache/ams_test.sql
       4. php -S 127.0.0.1:8091 with AMS_TEST_MODE=1, DB_NAME=ams_test
  └─ per test file: setup/reset.js reloads the dump, so files never depend on each other
  └─ teardown: stop PHP, DROP ams_test
```

Files run one at a time against the one shared scratch database. Tests inside a file run in order and may build on each other.

### Safety

- **`ams_db` is never touched.** `backend/config.php` and `backend/cors.php` skip `config.env.php` when `AMS_TEST_MODE=1` (its constants would otherwise pin the dev database), and `config.php` answers 500 unless `DB_NAME` ends in `_test`. Apache and production never set `AMS_TEST_MODE`.
- The test config itself refuses a database name that does not end in `_test`.
- Nothing is sent: `notifications_sms_enabled` / `notifications_email_enabled` are set to `0` in `ams_test`, and the run aborts if `sms_provider` / `email_driver` is not `log`.
- Announcement tests upload real files to `backend/uploads/notifications/` (gitignored); the file deletes whatever it added.

## 3. Layout

```
tests/api/
  vitest.config.js      one file at a time, setup/reset hooks
  setup/global.js       build DB, start PHP, teardown
  setup/reset.js        reload the dump before each file
  lib/env.js            ports, DB settings, paths
  lib/mysql.js          mysql / mysqldump runner, name rewrite
  lib/db.js             q(), one(), setting(), setSetting() for fixtures and checks
  lib/api.js            api(endpoint, {token, json, form, query, headers}), loginAs('admin'|'maria'|...)
  lib/paymongo.js       sendWebhook(), signature(), failedEvent(), paidEvent()
  lib/fixtures.js       addInvoice(), invoice(), notificationCount()
  *.test.js             the suites
```

## 4. Writing a test

1. Call the endpoint through `api()`; log in with `loginAs('admin')` or a tenant (`maria` = user 2 / room A, `rosa` = 5 / C, `jose` = 3 / B with overdue bills, `mark` = 13 / L with a scheduled move-out). Seed accounts are in the verification guide §1.4.
2. Set up fixtures with SQL (`q()`), not through other endpoints, when that is simpler. **Express dates relative to today** (`CURDATE() + INTERVAL 5 DAY`, `NOW() - INTERVAL 100 HOUR`) so the test does not rot as the calendar moves past the seed data.
3. Assert on the HTTP status **and** on the database: a refused request must leave the rows unchanged.
4. Name tests with the spec ID where one exists (`KB-B05 …`), so a failure maps back to [known_bugs_test_spec](../audits/known_bugs_test_spec_2026-10-15.md) (local file).
5. Check that a new test can fail: break the rule in the PHP temporarily and confirm it goes red.
6. The response shape is part of the contract: assert on exact keys (`res.body.rooms`), not on fallbacks, and guard "every item …" checks with a length check so they cannot pass on an empty list.

Webhooks: `sendWebhook(event, opts)` signs with the test secret (`whsk_test_suite`, set through `PAYMONGO_WEBHOOK_SECRET`). Pass `{ header: null }` for no signature, `{ secret }` for a wrong one, `{ timestamp }` to test the 5-minute replay window.

## 5. What is covered

| File | Tests | Covers |
|---|---|---|
| `auth.test.js` | 8 | Login, wrong password, `email_address` field, 401/403 gates, forged `X-User-Id`, archived account and its old session |
| `settings.test.js` | 21 | Atomic save (one bad key saves nothing), bounds for `min_lease_duration`, `payment_window_days`, `max_rent_ahead_months`, `max_parking_slots`, injection value |
| `extension.test.js` | 20 | Extension range (min shrinks to what fits), request, pending/overdue/move-out blocks, `extensionRange` for admin only, admin Extend Rent and `lease_renewals` |
| `visitors.test.js` | 6 | Pre-registrations dated by expected arrival, `checked_in` vs `overstayed` at the 24 h boundary, tenant scoping, SQL-injection search |
| `webhook.test.js` | 15 | Signature and replay window, `payment.failed` matched by intent, superseded events, replay, old invoices without an intent |
| `payments.test.js` | 5 | Paid event settles once, replay, session mismatch, failed-after-paid, amount mismatch → `pending-verification` |
| `split_payment.test.js` | 15 | Tenant split submit (cash + GCash), sum / one-portion / cash-only / missing proof / bad GCash ref, cash visit date and slot rules (none needed without cash), other tenant and admin refused, admin list returns portions, confirm must match, confirm settles and clears, reject clears, single proof replaces a split |
| `record_payment_gate.test.js` | 5 | Desk refuses `pending` / `overdue` bills (409), clears `scheduled`, `pending-verification` and `payment-failed` ones |
| `announcements.test.js` | 12 | Draft keeps/replaces/removes its file, send in place, double send, send of a stale draft, bad file type, markup stored as text |

### Not covered

- Browser behaviour: Pay Bills notices, phone alert strip, composer state, two-tab races.
- The SMS/email pipeline (channels are off here; see [sms_email_mock_testing.md](../features/sms_email_mock_testing.md)).
- Real PayMongo payloads. The suite signs its own events; the `payment_intent_id` field name on `payment.failed` still needs one real sandbox event.
- Chat (Socket.IO sidecar), cron jobs.
- Most endpoints. Add tests with each fix rather than all at once.

## 6. Behaviour worth knowing (found while writing the tests)

- A failed login is HTTP **200** with `valid:false`, not 401.
- A webhook with **no** signature header is **400**; a wrong or stale signature is **401**.
- The lowest valid `max_parking_slots` in the seed is **2**, because slot #2 is assigned.
- A gateway payment is recorded on the invoice itself (`status`, `paid_at`, `payment_method`) plus an "Online Payment Received" activity entry. It writes **no** `payment_transactions` row; those exist only for itemised desk payments, and readers fall back to the invoice total.

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `MySQL is not reachable` | Start XAMPP MySQL (`C:\xampp\mysql_start.bat`) |
| `Port 8091 is already in use` | Another run or server is up; stop it or set `TEST_PHP_PORT` |
| `AMS_TEST_MODE requires a DB_NAME ending in _test` | Something started the PHP server with a non-test database |
| Tests fail only after a crashed run | A stale `ams_test` is harmless: the next run drops and rebuilds it |
| Failure you want to poke at | `KEEP_TEST_DB=1 npx vitest run <file>`, then query `ams_test` |
| New migration breaks the build step | The suite builds from `SetupDB.sql`; mirror the migration there (per CLAUDE.md) |

## 8. CI

Not wired into `.github/workflows` yet. It would need a MariaDB service and PHP 8.0 with mysqli on the runner, with `MYSQL_BIN_DIR` / `PHP_BIN` set. See [cicd_pipeline.md](../deployment/cicd_pipeline.md#adding-tests).

## 9. Next

KB-B22 (send rollback), KB-D01/D02 (parallel sends), KB-F06 (rooms query count), KB-E07 (attachment visibility); then React Testing Library for key components and a few Playwright flows if this suite proves worth keeping.
