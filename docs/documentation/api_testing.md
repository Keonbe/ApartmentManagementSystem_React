# AMS — API test suite

Automated regression tests for the PHP endpoints. Vitest (in Node) calls the real endpoints over HTTP and checks the database directly. Added 2026-10-15 so that fixes verified by hand with curl stay verified.

Manual, browser and module-by-module procedures stay in [module_verification_guide.md](module_verification_guide.md). This suite automates a subset of those checks; it does not replace the UI checks.

## 1. Run it

```bash
cd tests/api
npm install        # first time only
npm test           # ~90 s, 452 tests (29 files)
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
| `settings.test.js` | 33 | Atomic save (one bad key saves nothing), bounds for `min_lease_duration`, `payment_window_days`, `max_rent_ahead_months`, `max_parking_slots`, injection value; move-in window: shipped 0 / 365, a pair saves together, earliest 61 / -1 / 1.5 / text and latest 0 / 366 / empty → 422, latest below the earliest (same request or stored) → 422, 0 allowed, numbers in `get_system_settings.php` |
| `public_file.test.js` | 16 | Public images through the API folder: an image in `room_images/`, `qr_codes/` and `site_assets/` served without a session (`image/*`, nosniff, public cache, ETag → 304), stored `../` prefix accepted; other folders (including private `uploads/`), traversal, subfolders, `.htaccess`, non-image extensions, upper-case folder → 400; missing file or a non-image named `.png` → 404; POST → 400 |
| `appearance_settings.test.js` | 45 | Glass theme backdrop: shipped defaults readable by guests (numbers as numbers); overlay 0-95, blur 0-20, tint `#rrggbb` (stored lower-case) with bad values → 422; `glass_bg_image` only accepts an uploaded `site_assets/glass_bg_*` file (traversal, other folders, URLs, markup, a missing file → 422, nothing saved), but an unchanged stored path never blocks other settings; tenant refused. `upload_glass_background.php`: tenant 403, no session 401, no file / non-image named `.png` / under 640 px → 422; a real image gets a generated name and is not live until saved; saving another or resetting keeps the previous one in the recent list (newest first, live flagged); only the last 6 are kept and the live one is never pruned. `get_glass_backgrounds.php` / `delete_glass_background.php`: tenant 403, no session 401; removing the live photo → 409, a non-upload path → 422, a missing upload → 404, another photo is deleted. `home_content` (Home page text): defaults all shown and empty; show switches and text saved, tidied to one line, unknown items dropped, markup kept as plain text; an unchanged form changes nothing; over-length text (60/80/80/400), non-boolean or missing `show`, non-string text, non-object → 422, nothing saved; a garbled stored value reads as the defaults; tenant refused |
| `extension.test.js` | 20 | Extension range (min shrinks to what fits), request, pending/overdue/move-out blocks, `extensionRange` for admin only, admin Extend Rent and `lease_renewals` |
| `visitors.test.js` | 6 | Pre-registrations dated by expected arrival, `checked_in` vs `overstayed` at the 24 h boundary, tenant scoping, SQL-injection search |
| `dashboard_attention.test.js` | 7 | Dashboard `attention` counts (`dashboard_stats.php`): admin only, existing stats kept, proofs / overdue bills / overdue tenants move by one while an advance-rent invoice adds nothing, pending CCTV only, seeded move-out request, one failing count (table renamed) leaves a 200 with `attention.incomplete` and the other groups, a 0-day rent-end reminder reads as 0 not 30 |
| `webhook.test.js` | 15 | Signature and replay window, `payment.failed` matched by intent, superseded events, replay, old invoices without an intent |
| `payments.test.js` | 5 | Paid event settles once, replay, session mismatch, failed-after-paid, amount mismatch → `pending-verification` |
| `split_payment.test.js` | 15 | Tenant split submit (cash + GCash), sum / one-portion / cash-only / missing proof / bad GCash ref, cash visit date and slot rules (none needed without cash), other tenant and admin refused, admin list returns portions, confirm must match, confirm settles and clears, reject clears, single proof replaces a split |
| `child_floor_rule.test.js` | 23 | Defaults (3F, under 5, no building minimum), `childFloorRule` on the roster, age 3 / 0 refused on 3F, 5 on 3F and 3 on 1F allowed, approval re-check after the rule was switched back on (422, request stays open), settings negatives (non-array, object, unknown floor, duplicates, number, ages 18 / -1 / text / 4.5), empty list lifts it, visitor rule hidden from tenants and guests while Visitor Management is off but listed for the admin |
| `utility_bill.test.js` | 20 | `entry_mode: 'bill'`: amounts stored as typed (rounded), rates and readings NULL, 409 on a second bill, one bill only, optional reading gives consumption, every negative (both zero/missing, negative, over 1,000,000, non-numeric amount or reading, negative reading, reading below previous, long note, unknown mode, vacant unit, tenant), merge sync puts exactly the bill amounts on the invoice, double sync refused, meter chain skips bill rows without a reading |
| `deposit_deductions.test.js` | 23 | Itemized clearance: every validation negative (not a list, object, > 20 lines, category, reason missing/blank/> 255, amount 0/negative/text/NaN/boolean/> 1,000,000, error names the line), no move-out notice → 409, tenant refused, lines stored with contract id and admin, contract totals derived, notification lists the lines, `get_invoices.php` deposit items, double clearance refused, restore removes the lines, legacy two-field payload |
| `record_payment_gate.test.js` | 5 | Desk refuses `pending` / `overdue` bills (409), clears `scheduled`, `pending-verification` and `payment-failed` ones |
| `announcements.test.js` | 12 | Draft keeps/replaces/removes its file, send in place, double send, send of a stale draft, bad file type, markup stored as text |
| `application_requirements.test.js` | 37 | Settings → Application Requirements: seeded Valid ID front/back (no NBI), admin only, create/rename/required toggle/reorder/deactivate/activate, every 422 rule (label 2-60 after trim, Filipino name ≤ 60, case-insensitive duplicate, strict booleans, `sort_order` 0-999 integer, 13th active, malformed/unknown id, no delete). `rent_application.php`: missing required custom document, previous address missing/blank/short/long, bad file content, optional document may be left out, unknown and inactive `doc_<id>` keys ignored, legacy columns stay NULL; resubmission needs every required file, replaces only the re-uploaded one and refuses a second (stale) resubmit. Approval gate refuses a missing required document and passes once it is deactivated; the follow-up sweep flags it again when reactivated and never flags an in-person-verified record |
| `cctv_consent.test.js` | 6 | `cctv_request.php` Data Privacy consent: missing, `false`, the string `"true"` and `1` → 422 with `field: privacyConsent` and nothing saved; a missing field is still refused first; `true` saves the request with `privacy_consent_at` set |
| `cctv_incident.test.js` | 9 | `cctv_request.php` incident-only rule: missing, unknown, empty and non-string incident type → 422 `incidentType`; "Other" needs a 20+ character description; the footage window (default 60 days) accepts the last day and refuses the day after; the type is stored |
| `cctv_decision.test.js` | 8 | `update_cctv_status.php` decision note: approve (pickup instructions) and reject (reason) store `decision_note`, list it for the admin, return it in My Requests and put it in the tenant notification; missing / blank / 501-character note → 422 `note` and the request stays Pending; exactly 500 accepted; second decision 409 keeps the first note; tenant 403 |
| `cctv_settings.test.js` | 23 | Settings → CCTV (`cctv_locations`, `cctv_incident_types`, `cctv_lookback_days`, `cctv_min_reason_length`): shipped defaults and garbled rows fall back; admin save reads back normalised (new type gets a key, Other stays last); tenant 403; every 422 rule (empty/13 locations, blank/long/duplicate location, Other missing / not last / alone, duplicate type name or key, window 0 / 366, reason 4 / 201) saves nothing; edges 1 / 365 days, 5 / 200 characters, 1 and 12 locations; `cctv_request.php` follows the settings (new location and type accepted, removed ones refused, window and shortest reason enforced); a request under a later-removed type is still listed |
| `pay_bill_methods.test.js` | 4 | `pay_bill.php` methods: the In-Person Payment channel is a cash declaration (no proof, stored as `Cash on Hand`); GCash (Manual) without a stored proof and a made-up `Cash` method → 422 with the bill unchanged; another tenant's bill → 409, no cash notice |
| `partial_payments.test.js` | 32 | Installments: two desk parts settle once (ledger keeps both, one receipt); part 0 / negative / text / 3 decimals / balance + ₱0.01, short amount without `partial` (or `partial: "true"`), grouped / advance bill, part after a settle (stale); a part waiting on a held row lock re-reads the balance (real `FOR UPDATE` test); double submit; tenant proof and split with `amount` (0 / text / above balance / other tenant's bill), admin must confirm the declared amount, reject keeps earlier parts; move-in invoice: a part does not pass `schedule_move_in.php`, the payment-window sweep keeps the application, `my_room.php` balance, `cancel_application.php` 409, final part → deposit `Held` + one move-in cue; `adjust_invoice.php` total ≤ paid refused; `get_invoices.php` fields and constant query count; combined payment (BND-) totals and settles balances; dashboard monthly revenue counts a part when received (deposit share left out, two-month bill split, ledger-less paid bill unchanged) |
| `invoice_adjustments.test.js` | 15 | `adjust_invoice.php` reason: missing / blank / 4 chars / 256 chars / not a string → 422 with nothing written, 5 chars after trim accepted; one history row with only the changed lines (`{line: [old, new]}`, due date included) and old/new totals; tenant notice and activity log quote the reason; nothing changed → 422; two identical requests → one row; invoice under verification → 409 and a tenant → 403 with no row; `get_invoices.php` `adjustments[]` for admin (list and `?userId=`), absent for the tenant |
| `reference_reuse.test.js` | 42 | `duplicate_reference_policy`: ships `warn`, bad values (`maybe`, empty, boolean, number, array) → 422, `block` round-trips; warn accepts a reused reference, logs it and flags both pending invoices for the admin (`reference_reuse` with tenant name), never for the tenant; block refuses a tenant proof (no tenant named, bill unchanged), a split part (no portions stored) and the desk (invoice and tenant named), ledger references count; not duplicates: re-proof after rejection, a `BND-` group, same digits on GCash / BDO / BPI, empty references; normalization (spaces, dashes, case); double submit refused in both modes for a proof, a split and a desk part; one reference sent by two tenants at once → one 200 (serial on `php -S`, so a stale second request); same bill: a second installment with the same reference is flagged (warn) or refused with the generic message (block, proof and split), while the desk confirming the tenant's own proof, a re-proof after rejection, a combined payment recorded on each bill and a settled sibling's ledger row are not; split resubmission: an unchanged portion next to a corrected one is accepted (both modes), a portion equal to a part the desk just recorded is refused, two identical splits at once leave one split and one queue row; `reference_norm` equals `normalize_payment_reference()` for spaces, tabs, line breaks, dashes, case and Unicode, and follows inserts and updates |
| `guest_chat.test.js` | 11 | Admin inbox unread count per guest thread (admin only, cleared on open); one admin-bell queue row per thread, cleared on open and re-queued by a new guest message, not by the admin's reply; guest token accepted from the header, ignored in the query string; at login the guest thread moves into the account's messages (order, authors, replies, read state), not twice, not for a wrong/malformed token, never for an admin, an empty thread left alone |
| `house_rules.test.js` | 4 | `scope=all` returns every scope in order (house, children and pets, parking) without inactive rules; a single scope still returns only that scope; an unknown scope is refused |
| `move_in_date.test.js` | 17 | Preferred move-in date (`move_in_date_error()`, window from `move_in_min_days` / `move_in_max_days`, shipped 0 / 365): with the earliest at 3 and the latest at 30 days, today and +31 are refused (messages name the first / last day) and +3 / +30 accepted; garbled stored values fall back to 0 / 365. At the defaults, `resubmit_date.php` refuses 2023-02-01, yesterday, malformed dates (2026-02-31, `01/02/2027`, text) and +366 days (message names the last allowed day) with the application unchanged, accepts +364, +365 and today (back to Pending Review), a stale second submit → 400; `rent_application.php` refuses a past date with `field: preferredMoveInDate` and saves nothing, ASAP sends no date |
| `release_checkout.test.js` | 5 | `release_checkout_session.php` (what a typed `?status=cancelled` URL calls): another tenant's checkout, a bill not in `processing` and an unknown id are no-ops (`released: false`); the owner's release puts a past-due bill back to `overdue`; a second cancel releases nothing |
| `room_gallery.test.js` | 6 | A legacy string gallery reads as items with defaults; the admin saves a description and display option that guests then see; a tenant or no session is refused; bad display option, too-long description or unknown photo rejected; an empty description clears it; delete on a mixed legacy/new gallery keeps the other photo's details |

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
- A gateway payment is recorded on the invoice itself (`status`, `paid_at`, `payment_method`) plus an "Online Payment Received" activity entry. It writes **no** `payment_transactions` row; those exist only for itemised desk payments, and readers fall back to the invoice total. Exception: a gateway payment that clears a part-paid bill appends its final part, so the ledger adds up to the total.
- `php -S` on Windows serves one request at a time, so `Promise.all` requests run one after the other: they test a stale second request, not a lock. To test a `FOR UPDATE` lock, hold it from a separate `mysql2` connection while the request runs (see `partial_payments.test.js`).

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
