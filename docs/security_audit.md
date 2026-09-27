# Security Audit — ApartmentManagementSystem (AMS)

> **Last Updated:** 2026-09-24 (chat + SMS/email surface reviewed — see §6e; earlier: role-based access & activity log audit, §6d)
> **Stack:** React 19 (Vite 8 SPA) + Node.js Socket.IO chat server + PHP 8 + MySQL/MariaDB on XAMPP
> **Status:** Pre-production / Pilot Testing Review
> **Scope of this pass:** all 83 `backend/api/*.php` endpoints as of 2026-09-14 (104 today — the new chat and notification endpoints are covered by §6e) (auth gate, upload handling, SQL), `backend/config.php`, the frontend auth/routing/API-base code in `ams-react/src`, and `npm audit` on `ams-react`.

---

## Shield Pre-Production & Pilot Testing Security Checklist

Use this table before any deployment — capstone demo, pilot, or full production rollout.

### SECTION 1 — Authentication & Access Control

| # | Check | Risk if Missed | Status |
|---|---|---|---|
| A-1 | Change the default admin password in the database | Admin account takeover by anyone who knows the demo password (`admin@gmail.com` / `admin123`, seeded in `SetupDB.sql` and `clear_and_seed.sql`) | `[ ]` |
| A-2 | Change MySQL `root` password on the production server | Full database access with no credentials | `[ ]` |
| A-3 | Create a least-privilege DB user (`ams_user`) instead of `root` | A PHP breach exposes the entire DB server. Currently blocked by runtime `CREATE TABLE`/`ALTER TABLE` calls (see D-9) that need schema privileges | `[ ]` |
| A-4 | Verify every **admin-only** API endpoint gates on `require_admin($conn)` (or the hardened `verify_admin()`, which now checks the real session, not a client-supplied id) | Tenants can call admin-only APIs directly | `[x]` |
| A-5 | Rate-limit `login.php` | Unlimited brute-force login attempts | `[x]` per account (5) and per IP (20) per 15 minutes |
| A-6 | Remove dead `$_SESSION` code in `login.php` | Dead code creates false security assumptions | `[x]` |
| A-7 | Gate every **tenant-facing** endpoint on `require_user()`/`require_owner_or_admin()`, not on the client-supplied `X-User-Id` header or a `userId` body/query field | Any unauthenticated caller can read or act as any tenant (see Critical findings below) | `[x]` 2026-09-14 — see §6d |
| A-8 | Invalidate existing session tokens on password change/reset, role change, or archive | A stolen or just-changed-away-from password keeps working for up to 7 days after the tenant "secured" their account | `[x]` 2026-09-14 — `revoke_user_sessions()`; role and archive state also read live |
| A-9 | Rate-limit `forgot_password.php`, `reset_password.php`, and `change_password.php`, and make `login.php`'s limiter per-account as well as per-IP | Password guessing/reset abuse is unlimited on these three endpoints; the login limiter alone is bypassed by rotating source IPs or by one successful login clearing the counter | `[~]` `login.php` and `change_password.php` now share a per-account + per-IP limiter; `reset_password.php` needs a 256-bit token, so guessing is not practical. 2026-09-17: `forgot_password.php` now allows 3 requests per email and 10 per IP per hour (policy decided 2026-09-16 — see [todo.md › Account Management](todo.md#account-management)), and a new password must differ from the current one. Open: the lockout can still be triggered against any account from any IP (audit M13) |

### SECTION 2 — File Uploads

| # | Check | Risk if Missed | Status |
|---|---|---|---|
| B-1 | Validate file **extension** in `parking_reservation.php` (allow: jpg, jpeg, png, pdf) | Attacker uploads `.php` web shell - Remote Code Execution | `[x]` |
| B-2 | Validate file **extension** in `upload_lease_document.php` (allow: pdf, jpg, jpeg, png) | Same RCE risk | `[x]` |
| B-3 | Validate file **extension** in `upload_payment_proof.php` (allow: jpg, jpeg, png, webp, pdf) | Same RCE risk | `[x]` |
| B-4 | Switch all MIME detection to `finfo_file()` — never trust `$_FILES['type']` (client-supplied) | Spoofed MIME bypasses extension-based guards | `[x]` |
| B-5 | Add `backend/uploads/.htaccess` blocking PHP execution and directory listing | Even if PHP is uploaded, it can be executed from the URL | `[x]` |
| B-6 | Set upload directory permissions: `chown www-data` + `chmod 755` | World-writable uploads are a server foothold | `[~]` 2026-09-17 — every `mkdir()` for an upload directory now creates it `0755` (was `0777`) in `profile.php`, `rent_application.php`, `service_request.php`, `upload_lease_document.php`, `upload_payment_proof.php`, matching `parking_reservation.php`/`check_in_visitor.php`/`config.php`, which already did. `chown www-data` on the actual production filesystem is still a post-deploy action, same as A-1/A-2 |
| B-7 | Validate extension + MIME on `check_in_visitor.php`'s `idPhoto` upload | No check at all today — the client's extension is kept as-is, allowing `.html`/`.svg` (stored XSS) or other types not covered by the uploads `.htaccess` denylist | `[x]` 2026-09-14 — JPG/PNG/WEBP allowlist, `finfo_file()`, 5 MB, random filename |
| B-8 | Gate access to sensitive uploaded documents (gov-ID, NBI clearance, payment proofs, signed leases) behind an authenticated download endpoint instead of a static, guessable-path file URL | Filenames are `<Name>_<field>_<time>_<uniqid>.ext` — `uniqid()` is time-seeded and brute-forceable, so anyone who finds/guesses one URL can view another tenant's ID photos or bank proof | `[x]` 2026-09-17 — `backend/uploads/.htaccess` now denies every direct request (Apache 2.4 `Require all denied`, replacing the 2.2-only `Order`/`Deny`), the Docker image's vhost config does the same; every upload endpoint names files `bin2hex(random_bytes(16))` instead of `uniqid()`; a new `backend/api/download_file.php` resolves the owner of a requested path across `rent_applications`/`invoices`/`lease_contracts`/`users`/`service_requests`/`maintenance_requests`/`parking_reservations`/`visitor_logs` and gates the read with `require_owner_or_admin()` (visitor ID photos are admin-only, since the tenant isn't the document's owner); `fileUrl.js` now builds a `download_file.php?path=...&token=...` URL (the session token travels as a query param because `<img>`/`<a>` tags can't carry an Authorization header) instead of a raw static path. Verified live: direct `/uploads/...` access now 403s, owner and admin downloads succeed, a different tenant gets 403, no token gets 401, and a `../` path traversal attempt gets 400 |

### SECTION 3 — Network & Transport

| # | Check | Risk if Missed | Status |
|---|---|---|---|
| C-1 | Enable HTTPS via Let's Encrypt (`certbot --apache`) | Login credentials, session tokens, and uploaded documents transmitted in plain text | `[ ]` |
| C-2 | Redirect all HTTP to HTTPS in Apache vhost | Users who type `http://` bypass TLS entirely | `[ ]` |
| C-3 | Lock CORS from `*` to your exact domain in `config.php` | Re-rated **Medium**: auth is a bearer token in a custom header (not a cookie), so a foreign site can't silently ride a logged-in session via a simple cross-origin form/fetch — but the wildcard still widens the blast radius of every endpoint in A-7, and `get_available_parking_slots.php` also sends `Access-Control-Allow-Headers: *` | `[x]` 2026-09-16 — all endpoints include `backend/cors.php` (allowlist from `ALLOWED_ORIGINS`; production with no list sends no ACAO); the parking endpoint's `Allow-Headers: *` was already gone |
| C-4 | Add `Strict-Transport-Security` (HSTS) response header | Browsers allow HTTP downgrade even after first HTTPS visit | `[ ]` |

### SECTION 4 — Server & Configuration

| # | Check | Risk if Missed | Status |
|---|---|---|---|
| D-1 | Set `display_errors = Off` and `log_errors = On` in `php.ini` (`config.php` already forces this when `APP_ENV=production`) | Stack traces, file paths, and DB structure exposed in browser | `[ ]` — depends on D-7 |
| D-2 | Disable Apache directory listing (`Options -Indexes`) globally | Browsing to `/backend/uploads/` lists all tenant documents | `[x]` |
| D-3 | Move all credentials to `config.env.php` (not committed to Git) | Credentials in version history are permanently compromised | `[x]` |
| D-4 | Add `config.env.php` to `.gitignore` and verify with `git status` | Accidental push exposes DB password publicly on GitHub | `[x]` |
| D-5 | Remove all debug `var_dump()`, `print_r()`, and bare `echo` in PHP files | Internal data structures leaked to any user who triggers an error | `[x]` |
| D-6 | Set `php.ini` limits: `upload_max_filesize=10M`, `post_max_size=12M` | Uploads silently fail or exceed memory on production | `[x]` |
| D-7 | Set `APP_ENV=production` in the deployed `config.env.php` (the fallback default in `config.php` and the checked-in `config.env.example.php` are both `development`) | `forgot_password.php` returns the raw reset token (`dev_token`) in the JSON response whenever `APP_ENV !== 'production'` — anyone can reset any account, including the admin, without ever seeing an email | `[ ]` |
| D-8 | Stop returning `$stmt->error` / `$conn->error` / `$e->getMessage()` in API JSON responses (~30 occurrences) | Leaks table/column names and query structure to any client that triggers a DB error | `[ ]` |
| D-9 | Move the runtime `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` calls out of request-time PHP (`submit_inquiry.php`, `get_inquiries.php`, `send_payment_reminder.php`) and into `SetupDB.sql` — `get_utility_readings.php` and `login.php` (`login_attempts`) done September 2026 (`utility_readings` now in `SetupDB.sql` + `migrations/2026_09_utility_readings.sql`) | Requires the production DB user to hold schema-DDL privileges, which conflicts with the least-privilege goal in A-3 | `[ ]` |

### SECTION 5 — Frontend / React

| # | Check | Risk if Missed | Status |
|---|---|---|---|
| E-1 | Replace all hardcoded `http://localhost` / `http://localhost:8080` strings with `VITE_API_BASE_URL` env var (10 occurrences across `axiosConfig.js`, `TopBar.jsx`, `AdminPayments.jsx`, `AdminMaintainance.jsx`, `AdminParking.jsx`, `AdminServicePage.jsx`, `AdminVisitors.jsx`, `UserMyRequests.jsx`, `UserPaymentHistory.jsx`) | All API calls fail on production; app is broken | `[x]` 2026-09-16 — `axiosConfig.js` reads `VITE_API_BASE_URL` (`ams-react/.env.development` / `.env.production`); all file links use `src/api/fileUrl.js`. Only the XAMPP fallback in `axiosConfig.js` remains |
| E-2 | Add `X-Frame-Options: SAMEORIGIN` response header | App can be embedded in an iframe for clickjacking attacks | `[ ]` |
| E-3 | Add `X-Content-Type-Options: nosniff` response header | Browser MIME-sniffing can execute uploaded files as scripts | `[ ]` |
| E-4 | Add `Referrer-Policy: strict-origin-when-cross-origin` response header | Referrer headers leak internal URLs to third parties | `[ ]` |
| E-5 | Run `grep -r "localhost" ams-react/dist/` after build — must return nothing | Production bundle silently calls localhost instead of real API | `[x]` 2026-09-16 — the only remaining hits are react-router/axios internals using `http://localhost` as a URL-parsing base, not requests |
| E-6 | Confirm admin route guard: only `role === 'admin'` can reach admin pages | `AdminProtectedRoute` in `App.jsx` does this correctly — but it is a UX convenience only, since the real control has to live server-side (see A-7); a tenant who spoofs `X-Admin-Id` cannot get past `require_admin()`/hardened `verify_admin()`, only past endpoints that still skip that check | `[x]` (client-side guard confirmed; server-side is the binding control) |
| E-7 | Run `npm audit fix` in `ams-react` | 6 high + 1 moderate advisory in dependencies (direct: `react-router-dom`; transitive: `postcss`, `nanoid`, `brace-expansion`, `browserslist`, `react-router`) — all have fixes available | `[ ]` |

### SECTION 6 — Input Validation

| # | Check | Risk if Missed | Status |
|---|---|---|---|
| F-1 | Add backend format validation for `contact_no` in `profile.php` (PH mobile pattern) | Garbage data stored; client-only validation bypassed via direct API calls | `[x]` |
| F-2 | Add plate number length + alphanumeric check in `parking_reservation.php` | Raw untrusted strings stored directly in the DB | `[x]` |
| F-3 | Confirm all SQL queries use `bind_param` prepared statements — no string interpolation | SQL injection | `[x]` |
| F-4 | Client-side limits mirror the schema (`ams-react/src/utils/validation.js` `LIMITS`, `fileLimits.js`), 2026-09-25 | Silent truncation (MariaDB runs non-strict) and wasted uploads. **Convenience only**: a direct API call skips it. Second pass 2026-09-26: per-field errors with `aria-invalid`/`aria-describedby`, validation on blur and submit, trimming, textarea counters, blocked `e`/`+`/`-` in number fields, date-range `min`, submit buttons disabled in flight, and `apiFieldErrors()` ready for the 422 `{message, field}` contract | `[x]` |
| F-5 | Typed server-side validation on every write endpoint, one 422 contract, then strict SQL mode. Sweep of all 104 endpoints on 2026-09-25: worst are `update_room` (raw fields), `update_tenant_status` (negative deductions), `upload_payment_proof` (proof not required), `rent_application` (rent taken from client) | Bad data stored; invariants enforced only by the UI | `[ ]` deferred, see [backend plan](audits/input_validation_backend_plan.md) |

---

## Severity Summary (open items only)

| Severity | Count | Items |
|---|---|---|
| **Critical** (unauthenticated IDOR / account takeover) | 1 — A-7 resolved 2026-09-14 (§6d) | CH-1 unauthenticated chat socket server (§6e) |
| **High** | 6 | A-1, D-7, B-6 (partial — `chown` is a deploy action; 0777 regressed in `send_sms.php`), E-7, L-1 `backend/logs/` web-readable, CH-2 `websocket-server/.env` tracked in git (§6e) |
| **Moderate** | 7 | A-3, A-9 (partial — lockout abuse only), C-1, C-2, D-8, D-9 (now incl. chat endpoints), CH-3 unrestricted chat recipients / no rate limit (§6e) |
| **Low** (Hardening / Hygiene) | remaining `[ ]` items | A-2, B-6 (dup. of transport hardening), C-4, E-2, E-3, E-4, CH-4 chat CORS/preflight, CH-5 `get_chat_history.php` fatal, N-1 Semaphore key in query string (§6e) |

> All **Critical** items must be resolved before any external user (pilot or production) touches the system. **High** items must be done before public access.

---
---

## Detailed Findings

_Scanned: all 83 files in `backend/api/` (2026-09-14; the 21 added since are reviewed in §6e), `backend/config.php`, and the frontend auth/routing layer in `ams-react/src`._

---

## 1. Critical: Broken Access Control — Tenant Identity Trusted From the Client (A-7)

> ✅ **Resolved 2026-09-14.** Every endpoint in the table below now takes identity from the session. `config.php` also overwrites `X-User-Id` / `X-Admin-Id` from the session before any endpoint runs, so a forged header resolves to nothing anywhere, and the frontend no longer sends them. Details and the live tests are in §6d. The finding is kept below as a record.

`backend/config.php` was hardened so that **admin** identity can never be spoofed: `require_admin()`, `require_user()`, `require_owner_or_admin()`, and even the legacy `verify_admin()` wrapper all resolve identity from the bearer session token created at login (`create_session()` / `get_authenticated_user()`), never from a header.

That hardening was **not** applied to the non-admin branch of many endpoints. They still read the caller's identity from `$_SERVER['HTTP_X_USER_ID']` or a `userId` field in the request body/query — both of which are plain values the client sets itself (see `ams-react/src/api/axiosConfig.js`, which attaches `X-User-Id` from `sessionStorage`). Any HTTP client can send a different id and act as another tenant.

| Endpoint | Impact |
|---|---|
| [get_notifications.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_notifications.php) (tenant branch) | Unauthenticated: read any tenant's notifications by guessing `?userId=` |
| [mark_notification_read.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/mark_notification_read.php), [delete_notification.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/delete_notification.php) | Mark-read or delete any notification by id, or bulk-clear another tenant's notifications via `userId` |
| [create_notification.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/create_notification.php) | Fully unauthenticated: send an arbitrary title/message to any `user_id` (in-app phishing/spam) |
| [parking_reservation.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/parking_reservation.php) | File a parking reservation as any user |
| [rent_application.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/rent_application.php) | `X-User-Id` is trusted outright: overwrite another user's in-progress application via `appId`, and the handler syncs `contact_no`/`gender`/etc. back onto that user's `users` row |
| [get_contracts.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_contracts.php) (`?userId=` branch) | Ownership check compares `userId` against the spoofable `X-User-Id`, not the session — read any tenant's lease contract and contact details |
| [get_visitors.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_visitors.php), [update_visitor_status.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/update_visitor_status.php), [check_in_visitor.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/check_in_visitor.php) | Tenant branch trusts the header: read or modify another tenant's visitor log |
| [get_utility_readings.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_utility_readings.php) | ✅ **Fixed September 2026.** Was: tenant branch trusted the header, so anyone could read any tenant's utility readings, including name and email (confirmed live with no token). Now `require_user()`; tenant rows are scoped to the session id |
| [upload_lease_document.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/upload_lease_document.php) | Ownership check compares the resolved owner id against the header: upload — or **remove** — another tenant's signed/notarized lease |
| [change_password.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/change_password.php) | No session check at all; identity comes from an `email_address` field in the body. Also gives an attacker unlimited password-guessing attempts outside of `login.php`'s rate limiter |

**Root cause:** these endpoints predate the session-token migration (`5e6f308`) and were never revisited when `require_user()`/`require_owner_or_admin()` were added to `config.php`.

**Fix pattern** — replace the header/body read with a session call, exactly as already done in `profile.php`, `my_room.php`, `get_documents.php`, `update_occupants.php`, `extend_lease.php`, and `record_move_out.php`:
```php
// Before
$user_id = $_POST['userId'] ?? $_SERVER['HTTP_X_USER_ID'] ?? null;

// After
$auth = require_user($conn);
$user_id = $auth['id'];
```
For endpoints with an admin branch too, use `require_owner_or_admin($conn, $owner_id)` after resolving `$owner_id` from the row being accessed (see `upload_lease_document.php`'s existing `get_contract_owner()`/`get_rent_application_owner()` helpers as a model — they resolve ownership correctly, they just compare it to the wrong thing).

---

## 2. High: Insecure Default Environment Leaks Password-Reset Tokens (D-7)

`backend/config.php` defaults `APP_ENV` to `'development'` when no `config.env.php` constant is set, and the checked-in template (`config.env.example.php`) ships the same default. In this mode, [forgot_password.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/forgot_password.php) returns the raw reset token as `dev_token` in the JSON response instead of only emailing it:

```php
if (APP_ENV === 'development') {
    $response['dev_token'] = $token;
}
```

If a production deployment is copied from the example file (or the `APP_ENV` constant is simply forgotten), any visitor can request a reset for `admin@gmail.com` and receive a working token in the same response — full account takeover with no email access needed.

**Fix:** Set `APP_ENV=production` explicitly in the deployed `config.env.php`, and consider failing closed — i.e., only emit `dev_token` when a `localhost`/`127.0.0.1` request `Host` is also confirmed, not on `APP_ENV` alone.

---

## 3. High: Unrestricted Upload in Visitor Check-In (B-7)

> ✅ **Resolved 2026-09-14.** `check_in_visitor.php` now allows only JPG/PNG/WEBP up to 5 MB, checked by extension and `finfo_file()`, saved under a random name. (The endpoint also could not store the photo at all until then: `visitor_logs.id_photo_path` was missing from the schema.)

[check_in_visitor.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/check_in_visitor.php) accepts an `idPhoto` upload with **no extension or MIME validation** — the only other three unrestricted-upload endpoints from the previous audit (`parking_reservation.php`, `upload_lease_document.php`, `upload_payment_proof.php`) were fixed, but this one was added later and missed the same treatment:

```php
$ext = pathinfo($_FILES['idPhoto']['name'], PATHINFO_EXTENSION);
$filename = "visitor_id_" . time() . "_" . uniqid() . "." . strtolower($ext);
$target_file = $upload_dir . $filename;
move_uploaded_file($_FILES['idPhoto']['tmp_name'], $target_file);
```

`.html`/`.svg` uploads here give stored XSS when the file is opened directly from `uploads/visitors/`; the uploads `.htaccess` blocks PHP execution but not those types.

**Fix:** apply the same extension-allowlist + `finfo_file()` pattern used elsewhere (Section "Resolved" below), restricted to `['jpg', 'jpeg', 'png', 'pdf']`.

---

## 4. High: Sensitive Documents Served From Guessable Static Paths (B-8)

> ✅ **Resolved 2026-09-17.** `backend/uploads/.htaccess` denies every direct request now (Apache 2.4 `Require all denied`; the Docker vhost config mirrors it), every upload endpoint names files `bin2hex(random_bytes(16))` instead of `uniqid()`, and a new `backend/api/download_file.php` serves the bytes after resolving the requested path's owner across every table that stores one and calling `require_owner_or_admin()` (visitor ID photos are admin-only — the tenant they visited isn't the document's owner). `fileUrl.js` builds the new endpoint's URL, with the session token as a query parameter since `<img>`/`<a>` tags can't carry an Authorization header. See B-8 above for the verification notes. The finding is kept below as a record.

Government ID photos, NBI clearances, payment proofs, and signed leases are saved under `backend/uploads/` and referenced back to the frontend as plain relative paths (e.g. `uploads/applications/Juan_Delacruz_validIdFrontFile_1787932504_6a91af58ba3c8.jpg`), then served directly by Apache with no authentication. The uploads `.htaccess` only blocks script execution and directory listing — it does not gate reads.

The filename entropy comes from `uniqid()`, which is time-seeded (default 13 hex characters derived from microtime), not cryptographically random. Combined with the fact that the current timestamp is also embedded in the filename, the search space for a specific tenant's document is small enough to brute-force offline, and any URL that leaks (referrer, browser history, screenshare, support ticket) exposes the file to anyone forever.

**Fix:** Serve these through an authenticated PHP endpoint (`require_owner_or_admin()` + `readfile()`/`X-Sendfile`) instead of a static path, the same way `get_documents.php` already returns metadata but not raw file bytes. This is the same class of fix already applied to the billing/invoice endpoints in section 6b.

---

## 5. Moderate: Additional Findings

- **DB/exception details returned to clients (D-8).** 34 endpoint files (recounted 2026-09-24, including the chat endpoints) echo `$stmt->error`, `$conn->error`, or `$e->getMessage()` straight into the JSON response (e.g. [registration.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/registration.php), [cctv_request.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/cctv_request.php), [get_applications.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_applications.php)). `config.php`'s own connection failure also `die()`s with the raw `connect_error` outside of `APP_ENV=production`. Strip these from responses and log server-side instead.
- **Public data exposure.** [get_rooms.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_rooms.php) has no auth gate and returns current/past tenant full names, lease dates, monthly rent, move-out reasons, and maintenance history to anyone. ~~[get_announcements.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_announcements.php) without `?public=1` returns *all* announcements — including unsent drafts — with no auth check at all.~~ Fixed 2026-09-14: the full list requires an admin, and the tenant feed requires a session and returns sent announcements only.
- **Password-reset/account endpoints have no rate limiting (A-9).** *Partly fixed 2026-09-14:* `login.php` and `change_password.php` now share a limiter of 5 failures per account and 20 per IP per 15 minutes, and a successful login clears only that account's failures. `forgot_password.php` was throttled on 2026-09-17 (3 per email, 10 per IP per hour).
- **Account enumeration.** ~~[login.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/login.php) reveals "This account has been archived" before checking the password~~ — fixed 2026-09-14: the archived message is only shown after a correct password. [registration.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/registration.php) still confirms whether an email is already registered.
- ~~**Inconsistent password minimums.**~~ Fixed 2026-09-14: `PASSWORD_MIN_LENGTH` (8) applies to registration, change, reset and the admin reset. Since 2026-09-26 those four paths also require an uppercase and a lowercase letter, a number and a symbol, and cap passwords at 72 bytes (`password_policy_error()` in `config.php`); login is unaffected.
- ~~**Sessions are never revoked (A-8).**~~ Fixed 2026-09-14: `revoke_user_sessions()` runs on password change (other devices), password reset, role change and archive. `get_authenticated_user()` also reads the role and archive state live from `users`, so a stale session can no longer carry an old role.
- **Session tokens stored in plaintext.** The `sessions` table stores the raw bearer token rather than a hash of it, so a DB read (backup leak, injection elsewhere, careless export) hands out live session tokens directly, unlike `password_resets`, which correctly stores only a SHA-256 hash.
- **Runtime schema DDL (D-9).** `login.php`, `submit_inquiry.php`, `get_inquiries.php`, `send_payment_reminder.php` and — since the chat merge — `get_chat_history.php`, `get_conversations.php` and `send_message.php` (which create `messages`) run `CREATE TABLE IF NOT EXISTS`/`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on every request, which both wastes a round trip and requires the app's DB user to hold DDL privileges — directly at odds with the least-privilege goal in A-3.
- ~~**`get_available_parking_slots.php` includes a non-existent file**~~ — fixed 2026-09-14: loads `config.php` and requires a session.
- **Tokens readable by any JS on the page.** `sessionToken`/`loggedInUser` live in `sessionStorage`/`localStorage` (`axiosConfig.js`), so any future XSS anywhere in the SPA is a full session-token theft, not just a defacement.

---

## 6. Low / Hygiene

- ~~`create_maintenance_request_admin.php` validates the file extension but has no `finfo_file()` MIME check~~ — fixed 2026-09; see §6c.
- ~~Upload directories are created with `mkdir($dir, 0777, true)` throughout~~ — fixed 2026-09-17, see B-6. **Regressed:** `backend/api/services/send_sms.php` creates `backend/logs/` and `logs/notification_outbox/` with `0777` (2026-09-24).
- ~~`backend/uploads/.htaccess` uses Apache 2.2 `Order allow,deny` syntax ... and its `FilesMatch` denylist for executable extensions doesn't include `phar|pht|phtml|html|svg`~~ — fixed 2026-09-17, see B-8: now `Require all denied` on every direct request, with the wider extension denylist kept as a second layer. `X-Content-Type-Options: nosniff` is set per-response by `download_file.php` rather than globally in `.htaccess`.
- No security response headers are set anywhere yet (C-4, E-2, E-3, E-4).
- 10 hardcoded `http://localhost`/`http://localhost:8080` URLs remain in the frontend (E-1) — the API base and several inline document-viewer links use different ports/paths (`localhost` vs `localhost:8080`), which will also break inconsistently in production even after the main `axiosConfig.js` base URL is fixed.
- ~~`axiosConfig.js` still attaches `X-User-Id`/`X-Admin-Id` on every request~~ — removed 2026-09-14; only the `Authorization` header is sent, and a `401` now clears the stored session and redirects to `/login`.

---

## Resolved (verified fixed in this pass)

### R-1. File Upload Extension + MIME Validation (was Critical Finding 1)

`parking_reservation.php`, `upload_lease_document.php`, and `upload_payment_proof.php` all now enforce an extension allowlist **and** a server-side `finfo_file()` MIME check before `move_uploaded_file()`, matching the fix pattern below. `rent_application.php` and `service_request.php` (added since the last audit) do the same.

```php
$allowed_ext = ['jpg', 'jpeg', 'png', 'pdf'];
$ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
if (!in_array($ext, $allowed_ext)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "File type not allowed."]);
    exit;
}
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime  = finfo_file($finfo, $_FILES['file']['tmp_name']);
finfo_close($finfo);
$allowed_mimes = ['image/jpeg', 'image/png', 'application/pdf'];
if (!in_array($mime, $allowed_mimes)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "File content does not match declared type."]);
    exit;
}
```
(`check_in_visitor.php`, the last gap, was fixed 2026-09-14 — see Finding 3.)

### R-2. Client-Supplied MIME Type No Longer Trusted

All upload handlers now use `finfo_file()` for server-side MIME detection instead of the browser-supplied `$_FILES[...]['type']`.

### R-3. Backend Format Validation Added

`profile.php` validates `contact_no` against a PH mobile pattern server-side; `parking_reservation.php` validates plate numbers with `preg_match('/^[A-Z0-9\s\-]{3,10}$/', ...)`.

### R-4. Dead Session Code Removed

`login.php` no longer assigns `$_SESSION['user']`. Auth is exclusively the bearer session-token model in `config.php` (`create_session()` / `get_authenticated_user()` / `require_admin()` / `require_user()`).

### R-5. Credentials Externalized

`backend/config.php` loads DB credentials from `backend/config.env.php`, which is gitignored and not tracked (`git ls-files` confirms it). A checked-in `config.env.example.php` documents the required constants.

---

## 6b. Billing & Payments Hardening (2026-09)

Findings from the Module 3 (Rental Payment & Billing) audit, all since fixed.

| Issue | Where | Fix |
|---|---|---|
| **Unauthenticated billing IDOR** — omitting `X-User-Id` entirely skipped the ownership comparison, so any tenant's invoices (amounts, payment references, sender names, proof paths) were readable with no credentials | `get_invoices.php` | Requires a session via `require_user()`; a non-admin can only ever read their own `user_id`, whatever `?userId=` says |
| **Identity accepted from the request body** — `$_POST['userId']` fallback let anyone attach a payment reference/proof to another tenant's invoice | `upload_payment_proof.php` | Identity comes only from the verified session |
| **Unauthenticated mass notification dispatch**, plus `ALTER TABLE` DDL executed on every request | `check_due_date_reminders.php` | `require_admin()`; the reminder columns moved into `SetupDB.sql` |
| **Webhook replay** — the HMAC covers timestamp + payload, but the timestamp was never checked, so a captured `payment.paid` event stayed valid indefinitely | `paymongo_webhook.php` | 5-minute freshness window; event is also bound to the invoice's own `checkout_session_id`, and the UPDATE is scoped to open statuses so a settled or cancelled invoice cannot be rewritten |
| **Lost payments on DB failure** — the webhook returned HTTP 200 even when the write failed, so the gateway never retried | `paymongo_webhook.php` | Returns 500 on write failure; logs attributed to the paying tenant instead of a hardcoded (non-existent) user id 1 |
| **TLS verification disabled** on the call carrying the PayMongo secret key | `create_checkout_session.php` | Locates a CA bundle and verifies; only falls back to unverified on non-production, and then logs loudly |
| **Invoice state could be rewound** — no status guard or `affected_rows` check meant a tenant could re-submit against a `paid` invoice, resetting its status and blanking `paid_at` | `pay_bill.php`, `upload_payment_proof.php`, `schedule_payment.php` | All writes scoped to `BILLING_OPEN_STATUSES` with `affected_rows` checks returning 409 |
| **Invoice ID collisions overwrote real invoices** — `rand(1000,9999)` combined with `ON DUPLICATE KEY UPDATE` silently rewrote an existing invoice's amounts | `create_invoice.php` | `random_bytes()`-based ids; re-issuing a `paid`/`cancelled` invoice is refused |
| Unvalidated scheduling input (past dates, arbitrary time slots) and an UPDATE that was not owner-scoped | `schedule_payment.php` | Date/slot validation and owner-scoped claim in a single statement |

Header-trust (`X-User-Id` / `X-Admin-Id`) is now removed from every payment endpoint: `get_invoices.php`, `pay_bill.php`, `upload_payment_proof.php`, `schedule_payment.php`, `create_checkout_session.php`, `get_payment_channels.php`, `create_invoice.php`, `check_due_date_reminders.php`.

> Note: this hardening pattern (`require_user()`/`require_owner_or_admin()` instead of header trust) is exactly what still needs to be applied to the endpoints listed in Finding 1 above — the billing module is the reference implementation to copy from.

---

## 6c. Maintenance & Service Management Hardening (2026-09)

Findings from the Module 4 (Maintenance) and Module 5 (Service Management) audit, all since fixed and verified live.

| Issue | Where | Fix |
|---|---|---|
| **Unauthenticated request-history IDOR** — `?userId=` returned any tenant's maintenance tickets, CCTV incident reasons, parking plates and service bookings | `get_my_requests.php` | `require_user()`; a tenant only ever sees their own rows (an admin may look one up) |
| **Identity accepted from the request body** — anyone could file maintenance or CCTV requests as another tenant, book services that bill another tenant's invoice, or cancel another tenant's pending request | `maintenance_request.php`, `cctv_request.php`, `service_request.php`, `cancel_request.php` | Identity comes only from the session; submitting also requires an active tenancy |
| **Admin attribution from a spoofable header** — `handled_by`, `created_by` and activity logs were filled from `X-Admin-Id` | `update_service_status.php`, `manage_service_catalog.php`, `sync_service_to_invoice.php`, `update_maintenance_status.php`, `create_maintenance_request_admin.php`, `get_maintenance_requests.php`, `get_service_requests.php`, `get_cctv_requests.php`, `update_cctv_status.php` | `require_admin()`, which returns the verified admin id |
| **Unvalidated admin maintenance upload** — extension-only check, and a failed save was silently ignored | `create_maintenance_request_admin.php` | Shared `store_maintenance_attachment()`: extension allowlist, `finfo_file()` MIME check, 10MB cap, fails loudly |
| **Billing state could be forced** — a cancelled or rejected booking could be moved straight to Completed and billed | `update_service_status.php` | `SERVICE_TRANSITIONS` plus an atomic `WHERE status = <old>` claim |
| **Repeatable CCTV decisions** — an approved request could be flipped to rejected and back | `update_cctv_status.php` | Decided once, from `Pending`; `409` afterwards |
| **Internal error details in responses** | `update_service_status.php`, `get_cctv_requests.php`, `update_cctv_status.php`, `update_maintenance_status.php`, `maintenance_request.php` | Generic messages |

---

## 6d. Role-Based Access & Activity Log Hardening (2026-09-14)

Findings from the Module 11 (Role-Based Access) and 8.4–8.6 (Reports & Activity Log) audit, all since fixed and verified live — see `docs/documentation/module_verification_guide.md` §11–§12.

| Issue | Where | Fix |
|---|---|---|
| **Header identity trusted across the codebase** — about forty endpoints read `X-User-Id` / `X-Admin-Id` | `config.php` | Both headers are overwritten from the session (or removed) before any endpoint runs; the frontend no longer sends them |
| **Stale privileges** — the role came from `sessions.role`, a snapshot taken at login, so a demoted admin kept admin access and an archived user stayed signed in for up to 7 days | `get_authenticated_user()` | Role and archive state read live from `users`; archived sessions deleted on sight |
| **Sessions never revoked** (A-8) | `change_password.php`, `reset_password.php`, `manage_users.php` | `revoke_user_sessions()` on password change/reset, role change, archive |
| **Unauthenticated password change** — any account's password could be changed given its email, and guessed without limit | `change_password.php` | `require_user()`; shares the login limiter |
| **Login limiter defeated by one successful login**; archived status revealed before the password check | `login.php` | Per-account (5) + per-IP (20) failures per 15 minutes, cleared per account; password verified first; `login_attempts` DDL moved to `SetupDB.sql` |
| **Tenant IDOR via client-supplied ids** (A-7) | `get_notifications.php`, `mark_notification_read.php`, `delete_notification.php`, `get_contracts.php`, `get_visitors.php`, `check_in_visitor.php`, `update_visitor_status.php`, `upload_lease_document.php`, `parking_reservation.php`, `rent_application.php`, `submit_inquiry.php` | Identity and ownership from the session |
| **Unauthenticated writes/reads** — arbitrary notifications into any inbox; all announcements including drafts | `create_notification.php`, `get_announcements.php` | `require_admin()`; tenant feed requires a session and shows sent items only |
| **Notification scope** — a single id could be read-marked or deleted with no check; admin bulk actions wiped every tenant's inbox; the admin header's `{id}` fell through to the bulk branch | `mark_notification_read.php`, `delete_notification.php` | Scoped to own notifications (plus the admin queue for admins); `id` accepted |
| **Visitor registration for any unit/host**; unvalidated ID photo (B-7); unguarded status transitions | `check_in_visitor.php`, `update_visitor_status.php` | Tenant forced to own tenancy; upload allowlist + MIME; approve/deny only from pending, checkout only from checked-in |
| **One-open-application rule bypassed** with someone else's `appId` | `rent_application.php` | `403` unless the application is the caller's |
| **Admin self-guard and audit attribution from a header**; double-escaped names | `manage_users.php` | `require_admin()`; prepared statements only; last-admin and archived-promotion guards |
| **Audit trail attributable to anyone** — performer taken from whatever id the call site passed | `log_activity()` | Session user always wins; categories normalised |
| **Fake admin account settings** — profile and password forms showed success without calling the API | `AdminAccountSettings.jsx` | Wired to `profile.php` and `change_password.php` |
| **Inconsistent password minimum** (6 vs 8) | `reset_password.php`, `manage_users.php` | `PASSWORD_MIN_LENGTH` = 8 everywhere |
| Endpoint fatal on every call | `get_available_parking_slots.php` | Loads `config.php`; `require_user()` |

---

## 6e. Chat & Notification Surface Review (2026-09-24)

Reviewed after the chat module (PR #8) and the SMS/email pipeline landed. **Open** unless marked otherwise; nothing here is fixed yet.

| ID | Severity | Issue | Where | Fix |
|---|---|---|---|---|
| **CH-1** | **Critical** | **The Socket.IO chat server has no authentication.** `join(userId)` puts any socket in any user's room (listen live to anyone's chat, including the admin's); `send_message` trusts the client's `sender_id` and stores it, so a message "from the admin" can be forged to any tenant and appears in the PHP history too; typing events are spoofable; CORS is `origin: "*"`; every message body is printed to the console | `websocket-server/server.js:9,15,41-43,51-60,76,84-90`; the client joins with the id from storage (`ChatContext.jsx`) | Verify the session token on the handshake against `sessions` and derive the user id server-side; ignore client `sender_id`; restrict CORS to `ALLOWED_ORIGINS`; stop logging bodies; cap message length |
| **L-1** | **High** | **`backend/logs/` is readable over HTTP**, with a directory listing (verified: 200 on `queue_drain.log`, an outbox file, and the `notification_outbox/` listing). The mock outbox holds rendered SMS/emails with phone numbers, email addresses and names; `.html` outbox files are served as `text/html` from the API origin; `semaphore_account.json` (balance cache) lands there too. In Docker only `-Indexes` applies and `.dockerignore` does not exclude the folder | `backend/logs/` (no `.htaccess`) | `backend/logs/.htaccess` with `Require all denied` (as `backend/uploads/`), a `.gitignore` exception so it is committed, and exclude `backend/logs` in `.dockerignore` |
| **CH-2** | **High** | **`websocket-server/.env` is tracked in git** (added 2026-09-02; `.gitignore` does not untrack an already-committed file). It holds `DB_USER=root` with an empty password; the chat server connects to the database as root | `websocket-server/.env` | `git rm --cached`, add an `.env.example`, and give the chat server its own least-privilege DB user (A-3) |
| **CH-3** | Moderate | Any signed-in user can message any user id: `send_message.php` only checks that both ids exist — no tenant↔admin rule, no archived-user check, no rate limit | `send_message.php:54-66` | Allow tenant→admin and admin→tenant only; skip archived users; throttle per sender |
| — | Moderate | Chat endpoints create `messages` at request time (D-9) and echo DB errors (D-8); `messages` is not in `SetupDB.sql` | `get_chat_history.php`, `get_conversations.php`, `send_message.php` | Move the table into `SetupDB.sql`; drop the request-time DDL |
| **CH-4** | Low | The four chat endpoints send `Access-Control-Allow-Origin: *` and answer OPTIONS before `cors.php` runs; their allowed headers omit `Authorization`, so a cross-origin polling fallback fails preflight | `get_chat_history.php:2-9`, `send_message.php:2-10`, `get_conversations.php`, `get_admin_user.php` | Remove the local headers and rely on `cors.php` via `config.php` |
| **CH-5** | Low | `$stmt->close()` outside the `try` can fatal after an early exception | `get_chat_history.php:96` | Guard it or move it inside |
| **N-1** | Low | The Semaphore balance check puts the API key in the query string (Semaphore's API requires it for GET); TLS protects it in transit, but proxies may log URLs | `services/send_sms.php` (`_semaphore_request`) | Accept; never log request URLs |

**Correct — do not regress:**
- SMS/email are triggered only by admin endpoints (`require_admin()` on `create_announcement`, `process_tenant_request`, `send_payment_reminder`, `update_*_status`); `send_test_notification.php` and `get_sms_balance.php` are admin-only, and the test send goes to the admin's own contact only.
- Credentials in `system_settings` (`SECRET_SETTING_KEYS` in `config.php`: PayMongo, SMTP, `sms_api_key`) are stripped for non-admins, masked (`••••1234`) for admins, kept out of the activity log, and a returned mask never overwrites a key.
- Semaphore calls verify TLS (cURL default; XAMPP `curl.cainfo` is set). Only `/messages` and `/account` are called.
- Email templates escape every value (`esc()`, selftest M6-17); logged bodies are truncated to 500 characters and pruned by retention (C11).
- `backend/cron/*.php` refuse to run outside the CLI (`PHP_SAPI` check) — verified 403 over HTTP.
- `backend/room_images/` is public by design, with `-Indexes`, a script-extension block, and an image allowlist + `finfo` check in `store_room_image()`.
- The PHP chat endpoints take identity from the session (via `config.php`'s header rewrite), use prepared statements, and return only the caller's own threads.

---

## 7. Correct & Secure Implementations

These are done right — do not regress them.

| Endpoint | What's correct |
|---|---|
| [rent_application.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/rent_application.php) | File size limit (< 10 MB), extension allowlist, server-side `finfo_file()` MIME check (not client-supplied `type`) |
| [registration.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/registration.php) | Password confirmation match + minimum 8-character length enforced |
| [my_room.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/my_room.php), [profile.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/profile.php), [get_documents.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_documents.php), [update_occupants.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/update_occupants.php), [extend_lease.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/extend_lease.php), [record_move_out.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/record_move_out.php) | Identity resolved exclusively via `require_user($conn)` from the session token — this is the pattern every endpoint in Finding 1 needs to adopt |
| [get_report_data.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_report_data.php) | All year/month/quarter filters safely cast to `(int)` before SQL interpolation |
| [forgot_password.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/forgot_password.php), [reset_password.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/reset_password.php) | Reset tokens are random (`random_bytes(32)`) and stored only as a SHA-256 hash, with a 30-minute expiry and single-use deletion after success |
| All endpoints | Prepared statements (`bind_param`) used consistently — no raw string SQL construction anywhere in `backend/api/` |

| [change_password.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/change_password.php), [manage_users.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/manage_users.php) | Session-scoped (2026-09-14): own account only / verified admin; sessions revoked on password or role change; shared login throttle |

> `change_password.php` was previously excluded from this table because it had no session check; that was fixed on 2026-09-14 (§6d).

---

## Related Documentation

| Doc | Link |
|---|---|
| Deployment Guide (Production Steps) | [localhost_to_production.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/deployment/localhost_to_production.md) |
| System Design & Schema | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |
| Feature Backlog | [todo.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/todo.md) |
