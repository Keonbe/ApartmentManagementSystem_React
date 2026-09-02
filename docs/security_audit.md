# Security Audit — ApartmentManagementSystem (AMS)

> **Last Updated:** August 2026  
> **Stack:** React 18 (Vite SPA) + PHP 8 + MySQL/MariaDB on XAMPP  
> **Status:** Pre-production / Pilot Testing Review

---

## Shield Pre-Production & Pilot Testing Security Checklist

Use this table before any deployment — capstone demo, pilot, or full production rollout.

### SECTION 1 — Authentication & Access Control

| # | Check | Risk if Missed | Status |
|---|---|---|---|
| A-1 | Change the default admin password in the database | Admin account takeover by anyone who knows the demo password | `[ ]` |
| A-2 | Change MySQL `root` password on the production server | Full database access with no credentials | `[ ]` |
| A-3 | Create a least-privilege DB user (`ams_user`) instead of `root` | A PHP breach exposes the entire DB server | `[ ]` |
| A-4 | Verify every admin API endpoint calls `verify_admin($conn, $admin_id)` | Tenants can call admin-only APIs directly | `[x]` |
| A-5 | Add rate limiting to `login.php` (e.g., via `mod_ratelimit` or fail2ban) | Unlimited brute-force login attempts | `[x]` |
| A-6 | Remove dead `$_SESSION` code in `login.php` (lines 41-49) | Dead code creates false security assumptions | `[x]` |

### SECTION 2 — File Uploads

| # | Check | Risk if Missed | Status |
|---|---|---|---|
| B-1 | Validate file **extension** in `parking_reservation.php` (allow: jpg, jpeg, png, pdf) | Attacker uploads `.php` web shell - Remote Code Execution | `[x]` |
| B-2 | Validate file **extension** in `upload_lease_document.php` (allow: pdf, jpg, jpeg, png) | Same RCE risk | `[x]` |
| B-3 | Validate file **extension** in `upload_payment_proof.php` (allow: jpg, jpeg, png) | Same RCE risk | `[x]` |
| B-4 | Switch all MIME detection to `finfo_file()` — never trust `$_FILES['type']` (client-supplied) | Spoofed MIME bypasses extension-based guards | `[x]` |
| B-5 | Add `backend/uploads/.htaccess` blocking PHP execution and directory listing | Even if PHP is uploaded, it can be executed from the URL | `[x]` |
| B-6 | Set upload directory permissions: `chown www-data` + `chmod 755` | World-writable uploads are a server foothold | `[ ]` |

### SECTION 3 — Network & Transport

| # | Check | Risk if Missed | Status |
|---|---|---|---|
| C-1 | Enable HTTPS via Let's Encrypt (`certbot --apache`) | Login credentials and session IDs transmitted in plain text | `[ ]` |
| C-2 | Redirect all HTTP to HTTPS in Apache vhost | Users who type `http://` bypass TLS entirely | `[ ]` |
| C-3 | Lock CORS from `*` to your exact domain in `config.php` | Any website can call your API on behalf of a logged-in user | `[ ]` |
| C-4 | Add `Strict-Transport-Security` (HSTS) response header | Browsers allow HTTP downgrade even after first HTTPS visit | `[ ]` |

### SECTION 4 — Server & Configuration

| # | Check | Risk if Missed | Status |
|---|---|---|---|
| D-1 | Set `display_errors = Off` and `log_errors = On` in `php.ini` | Stack traces, file paths, and DB structure exposed in browser | `[ ]` |
| D-2 | Disable Apache directory listing (`Options -Indexes`) globally | Browsing to `/backend/uploads/` lists all tenant documents | `[x]` |
| D-3 | Move all credentials to `config.env.php` (not committed to Git) | Credentials in version history are permanently compromised | `[ ]` |
| D-4 | Add `config.env.php` to `.gitignore` and verify with `git status` | Accidental push exposes DB password publicly on GitHub | `[x]` |
| D-5 | Remove all debug `var_dump()`, `print_r()`, and bare `echo` in PHP files | Internal data structures leaked to any user who triggers an error | `[x]` |
| D-6 | Set `php.ini` limits: `upload_max_filesize=10M`, `post_max_size=12M` | Uploads silently fail or exceed memory on production | `[x]` |

### SECTION 5 — Frontend / React

| # | Check | Risk if Missed | Status |
|---|---|---|---|
| E-1 | Replace all hardcoded `http://localhost` strings with `VITE_API_BASE_URL` env var | All API calls fail on production; app is broken | `[ ]` |
| E-2 | Add `X-Frame-Options: SAMEORIGIN` response header | App can be embedded in an iframe for clickjacking attacks | `[ ]` |
| E-3 | Add `X-Content-Type-Options: nosniff` response header | Browser MIME-sniffing can execute uploaded files as scripts | `[ ]` |
| E-4 | Add `Referrer-Policy: strict-origin-when-cross-origin` response header | Referrer headers leak internal URLs to third parties | `[ ]` |
| E-5 | Run `grep -r "localhost" ams-react/dist/` after build — must return nothing | Production bundle silently calls localhost instead of real API | `[ ]` |
| E-6 | Confirm admin route guard: only `role === 'admin'` can reach admin pages | URL-guessing exposes admin UI to tenants | `[ ]` |

### SECTION 6 — Input Validation

| # | Check | Risk if Missed | Status |
|---|---|---|---|
| F-1 | Add backend format validation for `contact_no` in `profile.php` (PH mobile pattern) | Garbage data stored; client-only validation bypassed via direct API calls | `[x]` |
| F-2 | Add plate number length + alphanumeric check in `parking_reservation.php` | Raw untrusted strings stored directly in the DB | `[x]` |
| F-3 | Confirm all SQL queries use `bind_param` prepared statements — no string interpolation | SQL injection | `[x]` |

---

## Severity Summary

| Severity | Count | Items |
|---|---|---|
| Critical (RCE / Data Breach) | 5 | B-1, B-2, B-3, C-1, D-3 |
| High (Auth / Privilege Escalation) | 4 | A-1, A-2, A-3, C-3 |
| Moderate (Information Disclosure) | 5 | B-4, B-5, D-1, D-2, D-5 |
| Low (Hardening / Hygiene) | 9 | All remaining items |

> All **Critical** items must be resolved before any external user (pilot or production) touches the system. **High** items must be done before public access.

---

---

## Detailed Findings

_Scanned: all user-facing forms, parameter handling, and file upload handlers across `backend/api/`._

---

## 1. Critical: Unrestricted File Uploads (RCE Risk)

Several upload endpoints accept any file type. An attacker can upload a `.php` web shell and execute arbitrary commands on the server.

### [parking_reservation.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/parking_reservation.php)
- **Vulnerability:** Uploads `uploadedFile` directly to `../uploads/documents/` with no extension or MIME type check.
- **Remediation:** Enforce `['jpg', 'jpeg', 'png', 'pdf']` extension allowlist and `finfo_file()` MIME check.

### [upload_lease_document.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/upload_lease_document.php)
- **Vulnerability:** Uploads `file` to `../uploads/documents/` without any file type checks.
- **Remediation:** Restrict to `['pdf', 'jpg', 'jpeg', 'png']`.

### [upload_payment_proof.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/upload_payment_proof.php)
- **Vulnerability:** Uploads `proof` to `../uploads/payment_proofs/` without type validation.
- **Remediation:** Restrict to `['jpg', 'jpeg', 'png']`.

**Fix pattern (apply to all three):**
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

---

## 2. High: CORS Open Wildcard (`Access-Control-Allow-Origin: *`)

Every PHP endpoint (44+ files) sends `Access-Control-Allow-Origin: *`. On a public server this allows **any website** to make authenticated API calls on behalf of a logged-in tenant or admin.

**Fix:** Centralize CORS in `config.php`, then strip the wildcard from all endpoint files:
```php
// In config.php only:
$allowed_origins = [CORS_ORIGIN]; // defined in config.env.php
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed_origins, true)) {
    header("Access-Control-Allow-Origin: $origin");
}
```

Strip from all endpoints in one pass on the server:
```bash
sed -i "s|header('Access-Control-Allow-Origin: \*');||g" backend/api/*.php
sed -i 's|header("Access-Control-Allow-Origin: \*");||g' backend/api/*.php
```

---

## 3. High: Credentials Hardcoded in Source

`backend/config.php` currently contains:
```php
$servername = "localhost";
$username   = "root";
$password   = "";  // no password
```

**Fix:** Create `backend/config.env.php` (excluded from Git) and `require_once` it from `config.php`. See [localhost_to_production.md — Phase B](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/deployment/localhost_to_production.md) for the full template.

---

## 4. Moderate: Client-Supplied MIME Type Trusted

[rent_application.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/rent_application.php) and [upload_payment_proof.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/upload_payment_proof.php) read the MIME type from `$_FILES[...]['type']` — a **browser-supplied value** that any HTTP client can forge.

**Fix:** Use `finfo_file()` for server-side MIME detection as shown in the fix pattern above.

---

## 5. Moderate: Missing Backend Format Validation

### [profile.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/profile.php)
- **Gap:** `contact_no` is stored without backend format validation. Client-side checks are bypassed by direct API calls.
- **Fix:** Add `preg_match('/^\+63[89]\d{9}$/', $contact_no)` check before the UPDATE query.

### [parking_reservation.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/parking_reservation.php)
- **Gap:** Plate numbers accepted as raw strings with no length or character constraint.
- **Fix:** `preg_match('/^[A-Z0-9]{4,8}$/i', $plate_number)` — reject anything else with HTTP 422.

---

## 6. Low: Dead Session Code

[login.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/login.php) assigns `$_SESSION['user']` but has no `session_start()`. Auth is stateless (via `X-User-Id` header) and works correctly, but this dead code creates confusion about the auth model.

**Fix:** Remove the `$_SESSION` block (lines 41–49).

---

## 7. Correct & Secure Implementations

These are done right — do not regress them.

| Endpoint | What's correct |
|---|---|
| [rent_application.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/rent_application.php) | File size limit (< 10 MB), extension allowlist, `mime_content_type()` check |
| [registration.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/registration.php) | Password confirmation match + minimum 8-character length enforced |
| [change_password.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/change_password.php) | Same password strength guards as registration |
| [get_report_data.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_report_data.php) | All year/month/quarter filters safely cast to `(int)` before SQL interpolation |
| All endpoints | Prepared statements (`bind_param`) used consistently — no raw string SQL construction |

---

## Related Documentation

| Doc | Link |
|---|---|
| Deployment Guide (Production Steps) | [localhost_to_production.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/deployment/localhost_to_production.md) |
| System Design & Schema | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |
| Feature Backlog | [todo.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/todo.md) |
