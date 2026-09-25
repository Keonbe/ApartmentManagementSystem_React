# AMS — Localhost → Production Deployment Guide

> **Stack:** React 19 (Vite SPA) + PHP 8 + MySQL/MariaDB  
> **Current Environment:** XAMPP on Windows (dev/demo machine)  
> **Target Environment:** Self-hosted Linux server (VPS or dedicated)  
> **Last Audited:** August 2026 — re-verified against the live repo September 2026 (see note below)

> ⚠️ **Re-verification note (Sept 2026):** three items below were listed as open action items but are already fixed in the code — MIME-type validation (§1.6), the dead `$_SESSION` code (§1.5), and `backend/uploads/.htaccess` (Phase C) all already exist. The hardcoded-`localhost` audit table (§1.1) has also drifted: line numbers shifted from ongoing feature work, and 5 files that now also hardcode `localhost` were missing from the original list. Both are corrected below. The CORS wildcard count (§1.2) has grown from "44+" to 79 of 80 endpoint files as new features were added. None of this changes the recommended fixes — it means more of the "already fixed" boxes should be checked, and the CORS/localhost cleanup is larger in scope than originally scoped.

---

## 0. The Core Difference

```
LOCALHOST (now)                    PRODUCTION (target)
────────────────────────           ────────────────────────────────
Windows + XAMPP                    Linux VPS (Ubuntu 22.04 / AlmaLinux)
Apache 2.4 (XAMPP)                 Apache 2.4 or Nginx
PHP 8.x (mod_php)                  PHP 8.x (php-fpm preferred)
MySQL root / no password           MySQL with strong credentials
http://localhost:8080              https://yourdomain.com
No SSL                             SSL/TLS required (HTTPS)
Hardcoded localhost in 14 files    Environment variables / config file
CORS open (*) on all endpoints     CORS locked to your domain only
React dev server (npm run dev)     Built static files (npm run build)
Uploads in backend/uploads/        Same path or cloud storage
No rate limiting                   Rate limiting on auth + upload endpoints
Error details visible in browser   Errors logged, never displayed
```

---

## 1. Audit Results — What Must Change

### 1.1 Hardcoded `localhost` References

> [!CAUTION]
> These will **silently break** on production. Every one must be updated.

| Status | File | Line(s) | Current Value | Fix |
|---|---|---|---|---|
| [x] | [config.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/config.php) | 8–11 | `DB_HOST`/`DB_USER`/`DB_PASS` fallback constants (only used if `config.env.php` is absent) | Already uses env config file — `config.env.php` loader implemented at lines 2–5, fallbacks are dev-only |
| [ ] | [axiosConfig.js](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/api/axiosConfig.js) | 5 | `http://localhost:8080/ApartmentManagementSystem_React/backend/api/` | `VITE_API_BASE_URL` env var |
| [x] | [vite.config.js](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/vite.config.js) | 11 | `http://localhost:8080` proxy target | Dev-only, not bundled — OK as-is |
| [ ] | [AdminApplications.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminApplications.jsx) | 48, 309, 316, 323 | `http://localhost/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [ ] | [AdminContracts.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminContracts.jsx) | 661, 702 | `http://localhost:8080/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [ ] | [AdminMaintainance.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminMaintainance.jsx) | 104 | `http://localhost/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [ ] | [AdminParking.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminParking.jsx) | 246 | `http://localhost:8080/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var *(missing from original audit)* |
| [ ] | [AdminPayments.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminPayments.jsx) | 20 | `http://localhost:8080/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [ ] | [AdminServicePage.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminServicePage.jsx) | 646, 825 | `http://localhost:8080/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var *(2nd occurrence missing from original audit)* |
| [ ] | [AdminTenants.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminTenants.jsx) | 676–678 | `http://localhost:8080/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [ ] | [AdminVisitors.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminVisitors.jsx) | 461 | `http://localhost:8080/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var *(missing from original audit)* |
| [ ] | [TopBar.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/Components/TopBar.jsx) | 65 | `http://localhost/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [ ] | [ProfileSettings.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/ProfileSettings.jsx) | 245 | `http://localhost/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [ ] | [UserMyRequests.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/UserMyRequests.jsx) | 139 | `http://localhost/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var *(missing from original audit)* |
| [ ] | [UserPaymentHistory.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/UserPaymentHistory.jsx) | 219 | `http://localhost:8080/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |

> [!WARNING]
> Two different ports are hardcoded — some files use bare `http://localhost` (port 80) and others use `http://localhost:8080`. Both happen to resolve on XAMPP but are inconsistent. Consolidate to one `VITE_BACKEND_BASE_URL` env var.
>
> **This table needs re-auditing on every future pass**, not just at deployment time — 5 of the 12 frontend files above were added or gained a new hardcoded URL after the previous audit, purely from ordinary feature work (each new admin page that links to an uploaded file repeats the same pattern). Consider grepping for `http://localhost` in `ams-react/src/` as a CI check (see `cicd_pipeline.md`) rather than re-auditing by hand each time.

### 1.2 CORS — Open Wildcard (`*`)

> [!CAUTION]
> Every PHP endpoint contains `Access-Control-Allow-Origin: *`. On production, this allows **any website on the internet** to call your API with a logged-in user's credentials.

Found in **79 of the 80** endpoint files in `backend/api/` (re-verified Sept 2026 — was "44+" at the August audit; the codebase has grown substantially since). Must be locked to your actual domain before go-live.

```php
// CURRENT (dangerous on production):
header('Access-Control-Allow-Origin: *');

// PRODUCTION (lock to your domain — done ONCE in config.php):
$allowed_origins = ['https://yourdomain.com'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed_origins)) {
    header("Access-Control-Allow-Origin: $origin");
}
```

### 1.3 Database Credentials

> [!CAUTION]
> `root` with an empty password is XAMPP's default. Must **never** reach a public-facing server.

```php
// CURRENT (backend/config.php lines 8–11 — only takes effect if config.env.php is missing):
if (!defined('DB_HOST')) define('DB_HOST', 'localhost');
if (!defined('DB_USER')) define('DB_USER', 'root');
if (!defined('DB_PASS')) define('DB_PASS', '');
if (!defined('DB_NAME')) define('DB_NAME', 'ams_db');
```

> The env-file loader (§1.7, Phase B) is already implemented, so on any machine with a real `config.env.php` these fallbacks never fire. What's actually left to do before production: create a `config.env.php` on the production server itself with strong, non-default credentials — the *mechanism* is done, the *production values* aren't set yet.

### 1.4 PHP Error Display

XAMPP defaults to showing PHP errors in the browser. On production this leaks internal details (file paths, DB structure, stack traces) to any user who triggers an error.

```ini
; XAMPP default (dangerous):
display_errors = On

; Production php.ini:
display_errors = Off
log_errors = On
error_log = /var/log/php/ams_errors.log
```

### 1.5 Login — Dead Session Code ✅ Fixed

~~[login.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/login.php) line 41 assigns `$_SESSION['user']` but there is no `session_start()` in the file.~~ **Already resolved** — the dead `$_SESSION` assignment has been removed; the response now builds a clean `$userData` array directly (see the `// Clean user payload without dead $_SESSION assignment (A-6)` comment in the current file). Auth remains stateless via the `X-User-Id` header, as designed. No action needed.

### 1.6 File Upload MIME Type Validation ✅ Fixed

~~`rent_application.php` and `upload_payment_proof.php` read MIME type from `$_FILES[...]['type']`~~ **Already resolved** — both files now call `finfo_open(FILEINFO_MIME_TYPE)` / `finfo_file()` to detect the actual file type server-side (tagged `(B-4)` in `rent_application.php`'s comment). No action needed.

### 1.7 Environment Configuration

- [x] **Backend**: `backend/config.env.php` and `backend/config.env.example.php` created and ignored in `.gitignore`.
- [ ] **Frontend**: `ams-react/.env.production` not yet created. All credentials and URLs in React currently rely on hardcoded strings.

---

## 2. Changes Checklist

### Phase A — React / Frontend

- [ ] **Create `ams-react/.env.production`** (not committed to Git)
  ```env
  VITE_API_BASE_URL=https://yourdomain.com/backend/api/
  VITE_BACKEND_BASE_URL=https://yourdomain.com/backend
  ```
- [ ] **Update `axiosConfig.js`** line 5:
  ```js
  baseURL: import.meta.env.VITE_API_BASE_URL,
  ```
- [ ] **Create `src/utils/backendUrl.js`** — one shared helper for asset URLs:
  ```js
  export const backendUrl = (path) =>
      `${import.meta.env.VITE_BACKEND_BASE_URL}/${path.replace(/^\.\.\//, '')}`;
  ```
  Replace all 10+ hardcoded `http://localhost...` asset URL strings in the JSX files listed in §1.1 with `backendUrl(path)`.
- [ ] **Update `vite.config.js`** — add `base` if not served from domain root, remove proxy for prod build:
  ```js
  export default defineConfig({
    base: '/',    // or '/ams/' if served from a subdirectory
    plugins: [react(), tailwindcss()],
    // server.proxy block is dev-only — vite ignores it during build
  })
  ```
- [x] **Run production build**:
  ```bash
  cd ams-react
  npm run build
  # Output written to ams-react/dist/ (verified functional)
  ```
- [ ] **Verify no localhost strings** survived bundling:
  ```bash
  grep -r "localhost" ams-react/dist/
  # Should return nothing
  ```

### Phase B — PHP Backend

- [x] **Create `backend/config.env.php`** and `backend/config.env.example.php` (added to `.gitignore`):
  ```php
  <?php
  define('DB_HOST', 'localhost');
  define('DB_USER', 'ams_user');
  define('DB_PASS', 'yourStrongPasswordHere');
  define('DB_NAME', 'ams_db');
  define('CORS_ORIGIN', 'https://yourdomain.com');
  define('APP_ENV', 'production');
  ```
- [x] **Rewrite `backend/config.php`** to load `config.env.php`, use defined constants, lock CORS, and silence errors on production:
  ```php
  <?php
  if (file_exists(__DIR__ . '/config.env.php')) {
      require_once __DIR__ . '/config.env.php';
  }

  // CORS — locked to production domain
  $allowed_origins = [CORS_ORIGIN];
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if (in_array($origin, $allowed_origins, true)) {
      header("Access-Control-Allow-Origin: $origin");
  }
  header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
  header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

  // Hide errors on production
  if (APP_ENV === 'production') {
      ini_set('display_errors', 0);
      ini_set('log_errors', 1);
  }

  $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
  if ($conn->connect_error) {
      http_response_code(500);
      echo json_encode(["success" => false, "message" => "Service unavailable"]);
      exit;
  }

  function log_activity($conn, $user_id, $category, $action, $details = "") { /* unchanged */ }
  function verify_admin($conn, $admin_id) { /* unchanged */ }
  ```
- [ ] **Remove `header('Access-Control-Allow-Origin: *')`** from all 79 endpoint files that have it — `config.php` handles it centrally now. One sed command on the server:
  ```bash
  sed -i "s|header('Access-Control-Allow-Origin: \*');||g" backend/api/*.php
  sed -i 's|header("Access-Control-Allow-Origin: \*");||g' backend/api/*.php
  ```
- [x] ~~**Fix MIME type validation** in `rent_application.php` and `upload_payment_proof.php`~~ — already done, both files use `finfo_file()` (see §1.6)
- [x] ~~**Remove dead `$_SESSION` code** from `login.php`~~ — already done (see §1.5)
- [ ] **Set upload directory permissions** on server:
  ```bash
  chown -R www-data:www-data backend/uploads/
  chmod -R 755 backend/uploads/
  ```
- [x] ~~**Add `backend/uploads/.htaccess`** to block directory listing and PHP execution in uploads~~ — fixed 2026-09-17 (audit H2/B-8): `backend/uploads/.htaccess` (gitignored, so re-create it on the server — see below) now denies *all* direct requests, not just script execution, using the Apache 2.4-native form (`mod_access_compat`'s `Order`/`Deny from all` isn't on by default on every distro):
  ```apache
  Options -Indexes
  <RequireAll>
      Require all denied
  </RequireAll>
  <FilesMatch "\.(php|phtml|php3|php4|php5|php7|phps|phar|pht|cgi|pl|py|sh|html|htm|svg)$">
      Require all denied
  </FilesMatch>
  ```
  Every document that used to be a static `/uploads/...` link (gov IDs, NBI clearances, payment proofs, leases, avatars, attachments) is now served only through the authenticated `backend/api/download_file.php` endpoint, which checks the resource's owner or admin role before reading the file — `fileUrl.js` on the frontend already points there. The Docker image (`Dockerfile`) applies the same `Require all denied` at the vhost level instead of a `.htaccess`, since a mounted uploads volume hides it.
- [ ] **Confirm `php.ini` limits** on server:
  ```ini
   upload_max_filesize = 25M
   post_max_size = 32M
  max_execution_time = 60
  memory_limit = 128M
  ```

### Phase C — Web Server (Apache/Nginx)

- [ ] **Enable HTTPS** via Let's Encrypt:
  ```bash
  sudo certbot --apache -d yourdomain.com -d www.yourdomain.com
  ```
- [ ] **React SPA routing** — add `/.htaccess` in the React dist directory so React Router paths don't 404:
  ```apache
  Options -MultiViews
  RewriteEngine On
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteRule ^ index.html [QSA,L]
  ```
- [ ] **Security headers** in Apache vhost or `.htaccess`:
  ```apache
  Header set X-Frame-Options "SAMEORIGIN"
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
  ```
- [ ] **HTTP → HTTPS redirect** in Apache vhost:
  ```apache
  <VirtualHost *:80>
      ServerName yourdomain.com
      Redirect permanent / https://yourdomain.com/
  </VirtualHost>
  ```
- [ ] **Disable directory listing** globally: ensure `Options -Indexes` in vhost

### Phase D — Database Migration

- [ ] **Export from XAMPP** (Windows):
  ```powershell
  C:\xampp\mysql\bin\mysqldump -u root ams_db > ams_db_export.sql
  ```
- [ ] **Transfer** `ams_db_export.sql` to server (SCP/SFTP)
- [ ] **Create DB and user** on server:
  ```sql
  CREATE DATABASE ams_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'ams_user'@'localhost' IDENTIFIED BY 'yourStrongPass';
  GRANT SELECT, INSERT, UPDATE, DELETE ON ams_db.* TO 'ams_user'@'localhost';
  FLUSH PRIVILEGES;
  ```
- [ ] **Import**:
  ```bash
  mysql -u ams_user -p ams_db < ams_db_export.sql
  ```
- [ ] **Verify row counts** match between XAMPP and production:
  ```sql
  SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'ams_db';
  ```
- [ ] **Check for absolute paths in DB** — some columns may store Windows paths like `C:\xampp\htdocs\...`. Search and update if found.

### Phase E — Security Hardening

- [ ] Change **MySQL root password** on production server
- [ ] Change **admin account password** in `ams_db.users` (the default demo password)
- [ ] Add **rate limiting** to login endpoint to prevent brute force (`mod_ratelimit` or fail2ban)
- [x] Ensure `config.env.php` is in `.gitignore` — verify with `git status` / `.gitignore`
- [ ] Remove any debug `var_dump()`, `print_r()`, or `echo` statements left in PHP files

### Phase F — Monitoring & Ops

- [ ] **PHP error log** — watch it the first week:
  ```bash
  tail -f /var/log/php/ams_errors.log
  ```
- [ ] **Automated DB backup cron**:
  ```bash
  # crontab -e
  0 3 * * * mysqldump -u ams_user -p'yourpass' ams_db > /backups/ams_$(date +\%F).sql 2>> /var/log/ams_backup.log
  ```
- [ ] **Uploads backup** — `backend/uploads/` contains user-submitted files (IDs, payment proofs). Back these up separately.
- [ ] **Test from a different network** (mobile hotspot) before declaring production ready — catches DNS, SSL, and CORS issues that don't appear locally.

---

## 3. Recommended Server File Structure

```
/var/www/html/                        ← Apache document root
├── index.html                        ← from ams-react/dist/
├── assets/                           ← Vite JS/CSS bundles
├── .htaccess                         ← SPA rewrite rule
└── backend/
    ├── config.php                    ← Updated to use config.env.php
    ├── config.env.php                ← NEW — credentials (NOT in Git)
    ├── api/
    │   └── *.php                     ← Unchanged endpoint files
    └── uploads/
        ├── .htaccess                 ← Block listing + PHP exec
        ├── applications/
        ├── documents/
        ├── maintenance/
        └── payment_proofs/
```

> [!IMPORTANT]
> `config.env.php` must never be committed to Git. Add it to `.gitignore` now.

---

## 4. Transition Strategy Options

### Option 1 — Direct Cutover ("Big Bang")

Deploy everything at once. XAMPP goes offline, production goes live same day.

```
Day 0: XAMPP running
Day X: ──────────────────── cutover ────────────────────
Day X: Production server live
```

| | |
|---|---|
| **Pros** | Simplest to execute. No data sync needed. One deployment, done. |
| **Cons** | Zero fallback if something breaks. All issues hit production users immediately. |
| **Best for** | ✅ **Capstone demo / single admin / controlled user base** |

---

### Option 2 — Parallel Running

Both environments run simultaneously. Users migrate gradually.

```
Week 1–2: XAMPP active (admin continues daily work)
          Production deployed and verified in background
Week 3:   Admin uses production, XAMPP on standby
Week 4:   XAMPP retired
```

| | |
|---|---|
| **Pros** | Fallback always available. Low pressure. Real-world testing before full exposure. |
| **Cons** | Double data entry risk. Two "sources of truth" is confusing. More total effort. |
| **Best for** | Active apartment with existing tenants where downtime is unacceptable |

---

### Option 3 — Phased Rollout

Deploy modules one phase at a time, validating each before the next.

```
Week 1: Login + dashboard + tenant profiles (read-only)
Week 2: Payments + maintenance requests
Week 3: Notifications + chat + contracts
Week 4: Full parity → decommission XAMPP
```

| | |
|---|---|
| **Pros** | Risk isolated per feature. Easier to debug. Validates infrastructure before critical features go live. |
| **Cons** | Users get partially working system during transition. Requires feature flags or multiple deploys. Most effort. |
| **Best for** | Enterprise rollout with many users. Overkill for AMS at small/medium scale. |

---

### Option 4 — Pilot Deployment

Deploy production for 2–3 test users first before opening to all tenants.

```
Week 1: Production deployed
         Admin + 2 test tenant accounts run real workflows
Week 2: Fix all issues found in pilot
Week 3: Open to all tenants
```

| | |
|---|---|
| **Pros** | Catches real-world issues (mobile, file sizes, browser bugs) without full exposure. Low risk. High confidence. |
| **Cons** | Requires willing test users. At 15–30 tenants, a "pilot" is almost the full user base anyway. |
| **Best for** | ✅ **Post-capstone actual apartment deployment** |

---

### Recommendation Matrix

| Scenario | Strategy |
|---|---|
| Capstone demo only | **Direct Cutover** — deploy once, demo, done |
| Actual apartment (post-capstone, small) | **Pilot** — test with admin + 2 tenants before full rollout |
| Actual apartment (50+ tenants from day one) | **Phased** — too risky to go all-at-once |
| Zero-downtime requirement | **Parallel** — keep XAMPP as fallback during transition |

---

## 5. Pre-Deployment Go/No-Go Checklist

Run all of these before pointing DNS at the new server:

```
BACKEND
[ ] GET https://yourdomain.com/backend/api/get_rooms.php returns JSON (not HTML/500)
[ ] Login with admin credentials succeeds
[ ] File upload: submit a maintenance request with a photo — verify it saves
[ ] Direct static access is blocked: https://yourdomain.com/backend/uploads/maintenance/<file> returns 403
[ ] The same file loads through https://yourdomain.com/backend/api/download_file.php?path=uploads/maintenance/<file>&token=<a valid session token> (H2/B-8 — this replaces the static link)
[ ] /backend/uploads/ returns 403 (not a directory listing)
[ ] /backend/uploads/test.php returns 403 (PHP blocked in uploads)
[ ] PHP error log shows no warnings after login + navigation test
[ ] CORS: no console errors when React SPA calls the API
[ ] PayMongo Live webhook created and pointed at https://yourdomain.com/backend/api/paymongo_webhook.php
    (see paymongo_integration_guide.md §3.4) — the sandbox/ngrok webhook does not carry over
[ ] Push a ₱1.00 sandbox-mode payment through and confirm the invoice flips to "paid" via the
    webhook alone (not just checkout redirect) — this is the only proof the webhook is actually firing

FRONTEND
[x] npm run build completes with no errors
[ ] index.html loads at https://yourdomain.com
[ ] Navigating directly to /admin/dashboard doesn't 404 (SPA routing works)
[ ] DevTools Network: zero requests going to localhost
[ ] File links (contracts, ID uploads, payment proofs) resolve correctly

DATABASE
[ ] Row counts in production match XAMPP export
[ ] No Windows-style paths (C:\...) stored in any DB column

SECURITY
[ ] HTTPS works; HTTP redirects to HTTPS
[ ] config.env.php is NOT visible at https://yourdomain.com/backend/config.env.php (should 403/404)
[ ] Admin default password changed
[x] DB credentials not in Git (git log --all -- backend/config.env.php returns nothing / added to .gitignore)
```

---

## 6. Quick Reference — Environment Comparison

| Item | Localhost (XAMPP) | Production (Linux VPS) |
|---|---|---|
| **OS** | Windows | Ubuntu 22.04 / AlmaLinux 9 |
| **Web server** | Apache 2.4 (XAMPP) | Apache 2.4 or Nginx |
| **PHP mode** | mod_php | php-fpm (recommended) |
| **DB user** | `root` / no password | Dedicated `ams_user` with strong password |
| **URL** | `http://localhost:8080` | `https://yourdomain.com` |
| **SSL** | None | Let's Encrypt (free) |
| **CORS** | `*` (open) | Locked to `https://yourdomain.com` |
| **React serving** | `npm run dev` | Static files from `ams-react/dist/` |
| **PHP errors** | Shown in browser | Logged to file only |
| **Config** | Hardcoded in source | `config.env.php` (not in Git) |
| **File size limit** | XAMPP default (2 MB) | Set to 10 MB in `php.ini` |
| **Directory listing** | On (XAMPP default) | Off (`Options -Indexes`) |

---

## Related Documentation

| Doc | Path |
|---|---|
| System Design | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |
| Feature Checklist | [panelist_feature_checklist.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/panelist_feature_checklist.md) |
| Notification Services | [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |
| Chat Design | [chat_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/chat_design.md) |
| PayMongo Integration | [paymongo_integration_guide.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/paymongo_integration_guide.md) |
| SaaS Fallback Strategy | [saas_fallback_strategy.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/deployment/saas_fallback_strategy.md) |
