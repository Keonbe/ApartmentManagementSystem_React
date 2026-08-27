# AMS — Localhost → Production Deployment Guide

> **Stack:** React 18 (Vite SPA) + PHP 8 + MySQL/MariaDB  
> **Current Environment:** XAMPP on Windows (dev/demo machine)  
> **Target Environment:** Self-hosted Linux server (VPS or dedicated)  
> **Last Audited:** August 2026

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
Hardcoded localhost in 15+ files   Environment variables / config file
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

| File | Line(s) | Current Value | Fix |
|---|---|---|---|
| [config.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/config.php) | 2–4 | `localhost`, `root`, `""` (no password) | Use env config file |
| [axiosConfig.js](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/api/axiosConfig.js) | 5 | `http://localhost:8080/ApartmentManagementSystem_React/backend/api/` | `VITE_API_BASE_URL` env var |
| [vite.config.js](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/vite.config.js) | 11 | `http://localhost:8080` proxy target | Dev-only, not bundled — OK as-is |
| [AdminApplications.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminApplications.jsx) | 48, 309, 316, 323 | `http://localhost/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [AdminContracts.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminContracts.jsx) | 661, 702 | `http://localhost:8080/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [AdminMaintainance.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminMaintainance.jsx) | 102 | `http://localhost/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [AdminPayments.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminPayments.jsx) | 576 | `http://localhost/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [AdminServicePage.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminServicePage.jsx) | 401 | `http://localhost/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [AdminTenants.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminTenants.jsx) | 554–556 | `http://localhost:8080/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [TopBar.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/Components/TopBar.jsx) | 53 | `http://localhost/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [ProfileSettings.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/ProfileSettings.jsx) | 242 | `http://localhost/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |
| [UserPaymentHistory.jsx](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/UserPaymentHistory.jsx) | 202 | `http://localhost:8080/ApartmentManagementSystem_React/backend/...` | `VITE_BACKEND_BASE_URL` env var |

> [!WARNING]
> Two different ports are hardcoded — some files use bare `http://localhost` (port 80) and others use `http://localhost:8080`. Both happen to resolve on XAMPP but are inconsistent. Consolidate to one `VITE_BACKEND_BASE_URL` env var.

### 1.2 CORS — Open Wildcard (`*`)

> [!CAUTION]
> Every PHP endpoint contains `Access-Control-Allow-Origin: *`. On production, this allows **any website on the internet** to call your API with a logged-in user's credentials.

Found in **44+ PHP files**. Must be locked to your actual domain before go-live.

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
// CURRENT (backend/config.php lines 2–4):
$servername = "localhost";
$username = "root";
$password = "";
```

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

### 1.5 Login — Dead Session Code

[login.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/login.php) line 41 assigns `$_SESSION['user']` but there is no `session_start()` in the file. Auth works correctly (stateless via `X-User-Id` header) but the `$_SESSION` assignment is dead code. Not a blocker, but adds confusion.

### 1.6 File Upload MIME Type Validation

`rent_application.php` and `upload_payment_proof.php` read MIME type from `$_FILES[...]['type']` — this is **client-supplied** and easily spoofed. Use `finfo_file()` to detect the actual file type server-side.

### 1.7 No Environment Configuration

No `.env` or `config.env.php` file exists. All credentials and URLs are embedded in source code. This must change before production.

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
- [ ] **Run production build**:
  ```bash
  cd ams-react
  npm run build
  # Output written to ams-react/dist/
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
- [ ] **Remove `header('Access-Control-Allow-Origin: *')`** from all 44 endpoint files — `config.php` handles it centrally now. One sed command on the server:
  ```bash
  sed -i "s|header('Access-Control-Allow-Origin: \*');||g" backend/api/*.php
  sed -i 's|header("Access-Control-Allow-Origin: \*");||g' backend/api/*.php
  ```
- [ ] **Fix MIME type validation** in `rent_application.php` and `upload_payment_proof.php`:
  ```php
  // Replace: $mime = $_FILES[$fileKey]['type'];
  $finfo = finfo_open(FILEINFO_MIME_TYPE);
  $mime = finfo_file($finfo, $_FILES[$fileKey]['tmp_name']);
  finfo_close($finfo);
  ```
- [ ] **Remove dead `$_SESSION` code** from `login.php` lines 41–49
- [ ] **Set upload directory permissions** on server:
  ```bash
  chown -R www-data:www-data backend/uploads/
  chmod -R 755 backend/uploads/
  ```
- [ ] **Add `backend/uploads/.htaccess`** to block directory listing and PHP execution in uploads:
  ```apache
  Options -Indexes
  <FilesMatch "\.(php|php5|phtml|phar)$">
      Require all denied
  </FilesMatch>
  ```
- [ ] **Confirm `php.ini` limits** on server:
  ```ini
  upload_max_filesize = 10M
  post_max_size = 12M
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
- [ ] Ensure `config.env.php` is in `.gitignore` — verify with `git status`
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
[ ] Uploaded file accessible: https://yourdomain.com/backend/uploads/maintenance/<file>
[ ] /backend/uploads/ returns 403 (not a directory listing)
[ ] /backend/uploads/test.php returns 403 (PHP blocked in uploads)
[ ] PHP error log shows no warnings after login + navigation test
[ ] CORS: no console errors when React SPA calls the API

FRONTEND
[ ] npm run build completes with no errors
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
[ ] DB credentials not in Git (git log --all -- backend/config.env.php returns nothing)
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
