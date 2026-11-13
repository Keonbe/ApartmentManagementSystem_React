# ISO/IEC 25010 Evidence Map (AI-assisted)

**Date:** 2026-11-10
**Companion to:** [2026-11-10_ui_ux_heuristic_audit.md](2026-11-10_ui_ux_heuristic_audit.md) (covers items 9-11 in depth).
**Method:** AI-assisted read of the code and docs, plus one measured run (section 3). Each item of the evaluator survey gets a status:

- **Evidenced**: code, docs and/or tests directly support the statement.
- **Partly evidenced**: the design supports it, but there is no measurement, test or proof for the full claim.
- **Not evidenced**: nothing in the repo supports it yet.

> **Disclosure.** This is not survey data and not a respondent's answers. It shows which survey statements your repo can back up, and what a real run would need to show. Counts are grep estimates. Statuses are the auditor's judgement. Only the test run in section 3 was actually executed.

## 1. Summary

| Status | Items |
|---|---|
| Evidenced | 1, 3, 8, 19 (backend toggles), 20 (backend tests), 21 |
| Partly evidenced | 2, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17, 22, 23 |
| Not evidenced | 13, 18 |

Strongest area: money handling. There is one settlement path with row locks, charges can't post twice, webhooks are signed and must match to the centavo, refunds can't be sent twice, and deposit deductions are itemized with a tenant review step.

Access control is solid. Identity comes only from the server session, and role checks are central.

Critical: the chat socket server has no authentication. Any client can join any user's room and send as anyone (websocket-server/server.js:41-60).

High: the admin login is the weakest login. admin123 is still seeded and admins skip the device code (login.php:140).

High (policy): a shortfall the deposit doesn't cover is only a number. No balance invoice is created (SPRINT #73).

High (finance): a paid desk payment can't be voided. Also, a late PayMongo webhook on a bill already paid at the desk is acknowledged silently, so the double charge is never flagged.

Critical for the panel: there is no user acceptance evidence. No survey responses, SUS score or sample size exist.

Scale and operations: only the activity log is paginated. There has been no load test, backups are a written procedure nothing schedules, there are no failure alerts, and everything runs on one server.

The docs disagree with each other. Test, endpoint and table counts differ across about six docs. security_audit.md still marks four fixed items as open, and the checklist shows Security 5/5 while CH-1 and A-1 are open.

Smallest worthwhile set before the defense:

fix the 2 ESLint errors;
add authentication to the chat socket;
force the admin password change and remove the admin device-code bypass;
make the counts agree across the docs;
add a consent checkbox at registration;
run one SUS session and one backup-and-restore drill.
Defend everything else with Part B.

Weakest areas: sustained-use and capacity (4-6, 13), reusability for other properties (18), and the open security findings (CH-1 unauthenticated chat socket, default admin password).

## 2. Item by item

### Functional suitability
| # | Statement (short) | Status | Evidence | What would back it in a real run |
|---|---|---|---|---|
| 1 | Functions cover all tasks | Evidenced | `panelist_feature_checklist.md`: 100 features, 95 done, 4 partial, 1 designed. Partial: SMS go-live, email still on dry-run, 2 chat items. | Evaluators walk each role's task list (admin, tenant) and tick tasks completed. The checklist is self-reported, so an independent walkthrough is needed. |
| 2 | Accurate, correct results | Partly | One cents-based helper `invoice_balance_cents()` (`config.php:1661`) used across payment endpoints; tests `balance_rules`, `partial_payments`, `invoice_adjustments`, `deposit_deductions`, `webhook`. Open: SPRINT #78 (advance invoice shown overdue to tenant), no proration (#73), some amounts bound as floats. | Cross-check a month of invoices, payments and reports against a hand calculation; fix #78 first. |
| 3 | Streamlines tasks | Evidenced | Daily sweep `run_notification_sweep()` drives reminders, overdue/late fees, parking billing; `generate_due_rent_invoices()` (`config.php:2138`) issues recurring rent invoices; admin attention queue and "Remind all". | Time a task (e.g. month-end billing) with and without the system. |

### Performance efficiency
| # | Statement | Status | Evidence | Real-run test |
|---|---|---|---|---|
| 4 | Fast response times | Partly | Indexes on invoices, visitors, logs; `get_activity_logs` capped at 100. Gaps: no index on `invoices.status` / `due_date`, `maintenance_requests` only has the user FK; list endpoints probably unpaginated. No timings recorded in the repo (`qa_gap_audit.md` §3G: not done). **Measured now (§3.3):** pages ready in 0.85-1.7 s on a tiny seed; `get_invoices`, `get_maintenance_requests` and `get_visitors` have no `LIMIT`/paging (confirmed in code), so they return every row. | Time key endpoints with 1,000+ seeded rows; `EXPLAIN` the list queries. |
| 5 | Pages load without delay | Partly | **Measured (§3.2-3.3):** nearly every page is a lazy chunk (101 JS chunks); entry bundle 584 KB raw / 173 KB gzip; DOM ready 51-157 ms and network idle under 1.7 s on 39 pages (small seed, local server). No `build` tuning in `vite.config.js`; Vite warns about the 500 kB entry. Skeleton loaders on about 69 files help perceived speed. | Lighthouse on login, dashboard, invoices; record `vite build` chunk sizes. |
| 6 | Many concurrent users | Partly | Correctness under races is tested (`concurrency_races.test.js`, `FOR UPDATE` in about 20 endpoints). Capacity is not: no load test, single-node Socket.IO, chat polls every 3-6 s. | k6/JMeter, 50-200 virtual users on login, lists and payment; watch DB connections and Apache workers. |

### Compatibility
| # | Statement | Status | Evidence | Real-run test |
|---|---|---|---|---|
| 7 | Works alongside other apps | Partly | Ports and URLs configurable (`.env*`, `VITE_CHAT_SOCKET_URL`); the test harness runs isolated on :8091 with its own DB. The API base path `/ApartmentManagementSystem_React/` is hardcoded in env defaults. | Run with the XAMPP stack plus other typical apps open; run on a non-default port. |
| 8 | Modules exchange data consistently | Evidenced | Shared helpers: `post_invoice_charge` / `reverse_invoice_charge`, `log_activity`, `notify_admins_queue`, `invoice_balance_cents`, `get_active_tenancy`; `charge_posting.test.js`. One known mismatch (#78). | Create a service request, check the same amount in billing, tenant view, dashboard and report. |

### Usability
| # | Statement | Status | Evidence | Real-run test |
|---|---|---|---|---|
| 9 | Easy to learn | Partly | See UI/UX audit: predictable navigation, but no onboarding, breadcrumbs or progress in the rent application. | First-time-user task test with 5 users per role; record time and errors. |
| 10 | Easy to use | Partly | Good dialog/keyboard handling; weak tables and inconsistent confirmations. | Same task test; SUS questionnaire. |
| 11 | Prompts help avoid errors | Partly | Strong inline validation (`useFieldErrors`), but form modals lose input and eviction flag has no confirm. | Error-injection tasks (bad dates, duplicate entries) and count recoveries. |

### Reliability
| # | Statement | Status | Evidence | Real-run test |
|---|---|---|---|---|
| 12 | Reliable in normal activity | Partly | Idempotent daily sweep, unique keys (`uq_invoice_rent_period`), transactions, webhook "already recorded" path. **Measured (§3.1):** 76 API test files, 1,693 of 1,696 tests passed (the 3 skipped belong to one file whose fixture collides with seed data today). **But dev login returned 500 for every account** because a committed migration was never applied to dev (§3.3). No frontend tests. | Run the suite; run the sweep twice and confirm no duplicates; a week of pilot use. |
| 13 | Stable during continuous use | Not evidenced | Polling timers are cleaned up in `useInvoiceWatch`, but other `setInterval` sites are unchecked, no log rotation for `queue_drain.log`, no soak test. | 24-72 h soak with a headless browser; track JS heap, PHP/Node memory, DB connections, log size. |
| 14 | Recovers data after failure | Partly | `backup_and_restore.md` has a procedure and restore drill, but marks itself "procedure only": no scheduled backup, no recorded drill. Soft-delete and restore for tenants/rooms, activity log, idempotent webhook. | Dump, restore into a scratch DB, run the API suite against it; record date, size, time. Kill PHP mid-payment and check for partial state. |

### Security
| # | Statement | Status | Evidence | Real-run test |
|---|---|---|---|---|
| 15 | Data secured, authorized access only | Partly | `password_verify`, 32-byte session tokens with 7-day expiry, sessions revoked on password change, device OTP, login rate limits, `config.env.php` gitignored. Open in `security_audit.md`: A-1 default `admin@gmail.com / admin123`, A-2/A-3 DB root, D-7, L-1 logs web-readable, CH-1 unauthenticated chat socket. | Brute-force 6 bad logins; replay a token after password change; fetch `/backend/logs/` unauthenticated. |
| 16 | Unauthorized users can't access or change records | Partly | 159 endpoint files; 38 lack `require_*` but most use `verify_admin()` or are intentionally public (login, webhook, rooms). 0 raw-SQL interpolation hits, 0 `dangerouslySetInnerHTML`. **Swept now (§3.4):** 152 endpoints with no token and a tenant token on a scratch server: no 5xx; 8 intended-public endpoints answered; `expire_contracts.php` and `expire_reservations.php` change data with no login (by design, documented cron targets); no admin-only endpoint accepted a tenant token. Empty-body calls can hide endpoints that validate before authenticating, so it is not proof. | Repeat with realistic request bodies per endpoint; add the cross-tenant IDOR test (guide §7). |
| 17 | Role permissions enforced correctly | Partly | `require_admin/user/owner_or_admin`; tenant reads scoped to session user (`get_invoices.php`, `my_room.php`). Chat (CH-1, CH-3) is the exception; no cross-tenant test result in the repo (not verified). | Tenant A requests tenant B's invoice, proof, contract and document; expect 403/404. |

### Maintainability
| # | Statement | Status | Evidence | Real-run test |
|---|---|---|---|---|
| 18 | Reusable in other properties | Not evidenced | No multi-property or building concept; peso symbol and +63 phone format hardcoded in `i18n.js`. Many values are admin settings (fees, parking, services). By design a single-building PH system (15-100 units). | Install a second instance with different name, currency and rooms and note what needs code edits. |
| 19 | Toggle service modules without defects | Evidenced (backend), gap | Eight `service_*_active` toggles; `service_request.php:57` refuses bookings when off; `ServiceRouteGuard` on the frontend. Gap: `get_service_catalog.php:19` filters only by `is_active`, not by the category toggle, so a disabled category's items can still be listed. No toggle-off test for cleaning/laundry. | Switch cleaning off, then check catalog, menu, booking and API; add a test. |
| 20 | Easy to test after changes | Evidenced (backend only) | 76 API test files over a real PHP server and a scratch DB; CI runs lint, build, PHPStan and schema/seed validation. The API suite is not run in CI (CI only validates schema and seeds on MariaDB; confirmed in `ci.yml`); no frontend tests. `api_testing.md` counts ("732 tests, 49 files") are stale: the real figure is 76 files and 1,696 tests, about 9 minutes. One fixture is date-dependent and fails today (§3.1). | Done: see §3.1. |

### Portability
| # | Statement | Status | Evidence | Real-run test |
|---|---|---|---|---|
| 21 | Adapts to different environments | Evidenced | `config.php` reads `config.env.php`, then env vars, then defaults (DB, `APP_URL`, `APP_ENV`, timezone); `build:local` / `build:selfhosted`; `dual-deployment-environment-plan.md`. | Deploy to a second host, run `cron/check_environment.php`, confirm login, CORS and file URLs. |
| 22 | Install and uninstall | Partly | README install steps, `SetupDB.sql`, seeds, `migrate.php`. **Observed:** a scratch DB built from `SetupDB.sql` + seed came up in seconds (50 tables, 16 users) and the app ran on it. Caveats: the plain `mysql < file` import corrupts the peso sign (§3.5), and dev drifted behind the committed migrations (§3.3). No uninstall procedure documented. | Fresh install on an empty DB, run `migrate.php` twice, then a documented teardown. |
| 23 | Can replace another product | Partly | CSV export in `AdminReports.jsx`, report endpoints, contract editor, print helper `utils/print.js` (no PDF library found). No bulk import of tenants, contracts or balances. | Onboard 10 existing tenants by hand from a spreadsheet and time it; export each report. |

## 3. What was actually run (2026-11-10)

All runs used the scratch database or a read-only browser pass, never live data. Dev `ams_db` was snapshotted first and ended unchanged except for one test row I removed.

### 3.1 API test suite (`cd tests/api && npm test`)
| Result | Value |
|---|---|
| Test files | 76 (75 passed, 1 failed in setup) |
| Tests | 1,696 total: 1,693 passed, 3 skipped, 0 failed assertions |
| Duration | about 540 s (9 min), not the 4 min the docs say |
| Failing file | `followup_remind_all.test.js`: `Duplicate entry '2-2026-10-01' for key 'uq_invoice_rent_period'` in its `beforeAll` fixture. It inserts an invoice dated "today minus 40 days"; today (Nov 10) minus 40 days is 2026-10-01, a rent period the seed already has. It is a date-dependent test fixture, not an app bug, and it will fail again on days that land on a seeded month start. |
| Noise | 49 PHP warnings "Array to string conversion" across about 21 endpoints (`registration.php` 8, `create_refund_request.php` 4, `release_checkout_session.php`, `house_rules.php`, `create_notification.php`, `create_announcement.php` 3 each, plus 14 more). They come from the input-validation tests sending arrays where a string is expected. The endpoints answer cleanly, but should reject arrays explicitly. |

### 3.2 Production-build size (`vite build --mode development` into a scratch folder)
Entry bundle 584 KB raw / 173 KB gzip; `i18n` chunk 134 KB; 101 JS chunks in total (about 2.5 MB raw JS, 421 KB CSS). Almost every page is its own lazy chunk (largest page chunk `AdminReports` 131 KB). Vite warns that one chunk is over 500 kB (the entry).

### 3.3 Browser pass (Playwright, scratch backend + seed)
| What | Admin (23 pages, 1366 then 375 px) | Tenant (16 pages, 390 px) |
|---|---|---|
| Console errors | 0 | 0 |
| HTTP 4xx/5xx during load | 0 | 0 |
| DOM ready | 51-114 ms | 56-157 ms |
| Network idle ("ready") | 0.87-1.67 s (slowest: Notifications 1.67 s, Reports 1.47 s, Services 1.44 s) | 0.85-1.41 s |
| Page-level horizontal overflow at phone width | none | none |
| Buttons/links with no accessible name | 0 | 0 |
| Images without `alt` | 0 | 0 |
| Form fields without a label | 1 (`admin-other-settings`) | 0 |
| `<main>` landmark | present on all | present on all |
| Heading issues | 2 `<h1>` on Reports and Other Settings | none, except `view-contract` has no `<h1>` |
| Small touch targets | under 32 px: Users 66, Units 33, Tenants 29, Contracts 25, Services 24 | under 44 px: 3-6 per page, Notifications 17, Announcements 8 |

Timings are on a tiny seed (about 16 users) with a local server, so they say the pages are not slow by design, not that they stay fast at 1,000+ invoices.

Also observed:
- **Login error is not announced.** The "email or password incorrect" message has no `role="alert"`/`aria-live`, and focus falls to `<body>` after the failed submit. The wording is clear.
- **Payment Options warned "leave page?" without any edit (fixed, see §3.6).** Cause: the browser's password manager autofilled the signed-in admin's saved login into the settings form (`admin123` into the PayMongo secret key, `admin@gmail.com` into QR slot 3's account number), which marks the form as edited and, if saved, would have stored those credentials as payment settings.
- **Tenant keyboard focus:** tabbing through My Room and Pay Bills (14 stops each), every control had a visible focus indicator. One stop landed on `<body>` on Pay Bills.
- **Dev login was broken (fixed 2026-11-11, §3.6).** `login.php` returns 500 for every account on the dev `ams_db` because the committed migration `2026_11_workstream.sql` was never applied there (`Unknown column 'last_login_at'`; dev also has no `schema_migrations` table). Same error on PHP 8.0, so it is schema drift, not the PHP version. Apply the migration to dev (AGENTS.md "Apply every schema change to dev ams_db").
- **Runtime mismatch:** Apache answers as PHP 8.5.12 while the CLI and the docs say 8.0 (CI uses 8.2).

### 3.4 Endpoint authorization sweep (152 endpoints, scratch server)
Each endpoint was called with GET and `POST {}` three ways: no token, tenant token, admin token. CLI-only tools were skipped.

- **No endpoint returned a 5xx.**
- **Answered 200 with no token (10):** `login`, `logout`, `get_rooms`, `get_service_catalog`, `get_service_categories`, `house_rules`, `get_system_settings`, `auth_email`, `expire_contracts`, `expire_reservations`. The first eight are public by design. `expire_contracts.php` and `expire_reservations.php` change data with no login, **by design**: they are documented cron targets (`module_verification_guide.md` M9-11; listed as intentional in `role_matrix.test.js`) and only expire rows whose date has already passed. Low risk; a cron secret would be optional hardening, not a defect. They were gated to admin-only on 2026-11-11 anyway (§3.6), because nothing scheduled calls them and the same sweeps run elsewhere. (My first draft called this a finding; that was overstated.)
- **`get_system_settings.php` without a token** returns about 90 keys, including `smtp_host`/`smtp_port`, `email_driver`, notification dispatch settings, last-run timestamps and the payment `account_name`/`account_number` fields (empty in the seed). **Fixed 2026-11-11 (§3.6):** visitors now get only a public allowlist and tenants lose the operational keys.
- **Tenant token accepted (18 read/self endpoints):** all scoped to the tenant. Example: `get_contracts` returned 1.7 KB for the tenant against 9.7 KB for admin; visitors and utility readings were also smaller. No admin-only endpoint accepted the tenant token.
- **Limit of this sweep:** it only proves an endpoint is *protected* if it refuses an empty request. An endpoint that validates input before checking the session could look protected and not be; and it did not try tenant A reading tenant B's specific IDs. So items 16 and 17 stay "partly evidenced" until the targeted IDOR test in the test guide §7 is done.

### 3.5 Data-handling issue found
The peso sign stored in `system_settings.currency_symbol` is corrupted ("Ôé▒", bytes `C394C3A9E29692`) in both dev and scratch databases, although `SetupDB.sql` has it correctly (`E282B1`). The plain `mysql < file` import used for local rebuilds does not set `--default-character-set=utf8mb4` (the backup doc does). Nothing reads that setting today, so users don't see it, but a restore done the plain way would corrupt peso signs and Filipino text. Add the flag to the import steps in README/AGENTS and the `db-snapshot` script.

### 3.6 Fixed on 2026-11-10 and 2026-11-11 (verified on a scratch stack; committed as 840fdcc, 7feef87, 47a247d, 6efdb82 and 034c9d3)
| Finding | Fix | Verified |
|---|---|---|
| Login error not announced; focus dropped to `<body>` | `role="alert"` on the message and focus returned to the password field after a failed sign-in (`Login.jsx`) | Wrong password: message inside `[role=alert]`, `document.activeElement.id === 'login-password'`, Tab moves on; correct admin login still reaches the dashboard |
| Payment Options "leave page?" on load | Admin password-manager autofill: password fields set to `autoComplete="new-password"` (Chrome ignores `off` on password fields) and the three QR slot text inputs to `autoComplete="off"`; same change for the Semaphore API key (`PaymentsPanel.jsx`, `NotificationsPanel.jsx`) | With a saved login in the browser: fresh load not dirty, secret key and slot account numbers empty, a real edit still warns |
| Flaky `followup_remind_all.test.js` | Fixture walks back from "40 days ago" to the first rent period the tenant does not already have | Passes today (3/3), the date it failed |
| Peso sign corrupted on import | `--default-character-set=utf8mb4` in `db-snapshot/snapshot.sh`, README and AGENTS.md import steps | Fresh scratch DB stores `E282B1` |
| Dev `ams_db` behind the schema (login 500, Parking broken) | After a snapshot, applied `2026_11_workstream`, `login_otp_controls`, `guest_chat_end`, `guest_chat_resolution` and `parking_slots` (its data steps: 3 slots from `max_parking_slots`, `monthly_fee` on 3 reservations, two old settings removed); inserted four settings keys that no migration creates (`language_switch_enabled`, `email_verification_enabled`, `inquiry_move_in_max_months`, `included_occupants`, with the `SetupDB.sql` defaults); repaired `currency_symbol` | Schema diff of dev against a fresh `SetupDB.sql` build is empty (tables, columns, indexes, settings); dev login 200; Parking endpoints 200; peso sign `E282B1` |
| `expire_contracts.php` / `expire_reservations.php` answered anyone | `require_admin` (401 without a token, 403 for a tenant) | `reservations_waitlist` 34/34 and `role_matrix` 299/299 |
| `get_system_settings.php` returned about 90 keys to anyone | Three tiers: visitor allowlist, tenant without operational keys, admin everything with credentials masked (`PUBLIC_SETTING_KEYS`, `ADMIN_ONLY_SETTING_KEYS` in `config.php`) | New `settings_visibility.test.js` 11/11 (5 fail against the old endpoint); full API suite 1,726 tests green after one test was given a token (`contract_end`); browser pass over 5 logged-out, 6 tenant and 5 admin pages: no errors, content intact |

Not changed: the PHP array-input warnings; two lint errors in other files (`AdminInquiries.jsx`, `UserAnnouncements.jsx`). **New:** the four settings keys above exist only in `SetupDB.sql`, with no migration, so prod and any database built before them may lack them (the code falls back to defaults, so nothing breaks, but they are not stored until an admin saves that tab).

## 4. Fix first (changes the likely survey ratings)

0. ~~**Now:** apply `2026_11_workstream.sql` (and check the other 2026_11 migrations) to dev `ams_db`; login on dev is returning 500.~~ Done 2026-11-11 (§3.6).
1. Security: change the seeded admin password (A-1), authenticate the Socket.IO server (CH-1), block `backend/logs/` (L-1). ~~Decide what `get_system_settings.php` may show without login~~ Done 2026-11-11 (§3.6).
2. Add `invoices.status` / `due_date` and `maintenance_requests` indexes; paginate the unbounded list endpoints; record Lighthouse and endpoint timings.
3. Make `get_service_catalog.php` respect the category toggle and add a toggle-off test.
4. Fix SPRINT #78 (advance invoice shown overdue).
5. Document uninstall; take and record one backup and restore drill.
6. Run the API suite in CI (MariaDB service) and refresh `api_testing.md` counts; make `followup_remind_all.test.js` pick a date that cannot collide with seeded rent periods.
7. UI: ~~`role="alert"` on the login error and keep focus on the form~~ (done, §3.6); ~~fix the false "leave page?" warning on Payment Options~~ (done, §3.6); reject array input with a 400 instead of PHP warnings; ~~add `--default-character-set=utf8mb4` to local import steps~~ (done, §3.6).
8. Lint: `npm run lint` reports 2 errors that CI would fail on (`AdminInquiries.jsx:51` unused `setView`; `UserAnnouncements.jsx:131` setState in an effect). Not touched here.

## 5. Checked since the first draft, and what is still open

Checked by reading the code:
- `get_invoices.php`, `get_maintenance_requests.php`, `get_visitors.php`: no `LIMIT`/paging (the only `LIMIT` hits are inside subqueries), so they return every row.
- Server-built email HTML: every value goes through `esc()` (`services/email_templates.php`, 50 uses).
- Chat endpoints: `config.php` replaces any client-sent `X-User-Id`/`X-Admin-Id` with the verified session's ID (and removes them when there is no session); `get_chat_history.php` only returns messages between the signed-in user and the named person.
- `setInterval`: every file that sets an interval also clears one (counts match or exceed), including `useInvoiceWatch`, the chat widget and `TopBar`. A grep, not a leak test.
- Corrections to the first draft: recurring rent invoices are automated (`generate_due_rent_invoices()`), and the test suite is 76 files (not 80+).

Still not done:
- No load, soak, penetration test or screen-reader run (see the test guide).
- Browser pass covered 23 admin and 16 tenant pages on seed data only: no form submission, modal or error-state flows, and the admin pages were not tabbed through by keyboard.
- Central PHP error logging is unverified (the PHP log file was empty on this machine).

**Limits carried into Chapter 4 (added 2026-11-13, from the panel audit):** the usability, performance and reliability ratings rest on code review and seed-data runs, not a user population or production load (limitation LI-13 in [`2026-11-12_panel_policy_gap_audit.md`](2026-11-12_panel_policy_gap_audit.md) §B.2). Evidence still to collect: one SUS session (SPRINT 148), the load test in `2026-11-10_real_world_test_guide.md` §2 (SPRINT 153), and the production PHP error-log path and socket-server timezone (R-07, D-07). The other delimitations and limitations are listed in `docs/features/panelist_feature_checklist.md` ("Delimitations, Limitations and Defended Gaps").
