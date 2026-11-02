# Environment Configuration — Local (XAMPP) and Production (Railway)

> **Changed:** 2026-09-16 · **Related:** saas_deployment_guide.md (doc removed) (§2.2, §2.6, §4.3, §4.4, §13), [security_audit.md](../security_audit.md) (C-3, E-1, E-5)

This page covers how AMS chooses its settings in each environment, and what changed when the Railway domain went live. For the three build/run targets (local, SaaS, self-hosted), the guardrails and the `DEPLOYMENT_ID` claim, see [dual-deployment-environment-plan.md](dual-deployment-environment-plan.md).

---

## 1. What runs where

| Piece | Local | Production |
|---|---|---|
| PHP API | `http://localhost:8080/ApartmentManagementSystem_React/backend/api/` | `https://apartmentmanagementsystemreact-production.up.railway.app/api/` |
| Database | MariaDB on XAMPP (`localhost:3306/ams_db`) | Separate Railway MariaDB service, reachable only on its **private** host |
| Frontend | Vite dev server `http://localhost:5173`, or `ams-react/dist/` served by Apache | **Not deployed yet** |

The Railway domain is the **API**, not the database. The Dockerfile copies `backend/` to the web root, so the endpoints are at `/api/*.php` and uploaded files at `/uploads/…`.

---

## 2. Backend settings

`backend/config.php` reads each setting from the first of these sources that has it:

1. A constant in `backend/config.env.php` (gitignored; copy it from `config.env.example.php`). Only XAMPP uses this file.
2. An environment variable (`getenv`, then `$_ENV`/`$_SERVER`). Railway uses these.
3. A built-in default.

| Setting | Local default / example | Railway value | Purpose |
|---|---|---|---|
| `DB_HOST` | `localhost` | reference → MariaDB private host | DB connection |
| `DB_PERSISTENT` | unset | `1` on prod if the DB is on another host | Reuse the DB connection across requests (saves the handshake round-trips) |
| `DB_PORT` | `3306` | reference → MariaDB private port | |
| `DB_USER` | `root` | reference → MariaDB user | |
| `DB_PASS` | *(empty)* | reference → MariaDB password | |
| `DB_NAME` | `ams_db` | `ams_db` (typed, not a reference) | |
| `APP_ENV` | `development` | `production` | Hides error detail and the password-reset dev token; turns on strict CORS |
| `ALLOWED_ORIGINS` | unset | unset until a frontend exists, then `https://<frontend-domain>` | CORS allowlist (§4) |
| `APP_URL` | unset | `https://<frontend-domain>` later | Public URL of the SPA; PayMongo return links must start with it |
| `APP_TIMEZONE` | `Asia/Manila` | `Asia/Manila` | PHP timezone; the DB session `time_zone` is set to the same offset in `config.php` |
| `DEPLOYMENT_TARGET` | `local` | `saas` | `local` / `saas` / `selfhosted`; checked by `cron/check_environment.php` |
| `DEPLOYMENT_ID` | unset | `saas-prod` | Unique deployment name stamped into the DB and uploads by `--claim` |
| `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` | unset | optional | Override the values stored in Admin → Settings |

> [!IMPORTANT]
> A constant in `config.env.php` overrides the environment. Railway's image has no such file, so on Railway only the variables apply.

---

## 3. Frontend settings

`ams-react/src/api/env.js` (read by `axiosConfig.js` and `fileUrl.js`) uses `VITE_API_BASE_URL`, which Vite writes into the bundle **at build time**. The value comes from the file for the build mode:

| File | Committed | Used by | Value |
|---|---|---|---|
| `ams-react/.env.development` | yes | `npm run dev`, `npm run build:local` | XAMPP API URL |
| `ams-react/.env.production` | yes | `npm run build`, `npm run build:saas` | Railway API URL |
| `ams-react/.env.selfhosted` | no (from `.env.selfhosted.example`) | `npm run build:selfhosted` | the self-hosted operator's API URL |
| `ams-react/.env.local` / `.env.<mode>.local` | no (gitignored) | every mode / that mode | your own value |

These files contain no secrets, since every `VITE_*` value ends up in the public JavaScript.

> [!WARNING]
> **Behaviour change:** a plain `npm run build` now produces a bundle that calls **Railway**. To rebuild the `dist/` that XAMPP serves (`http://localhost:8080/ApartmentManagementSystem_React/ams-react/dist/index.html`), run:
> ```bash
> cd ams-react && npm run build -- --mode development
> ```

Uploaded files (payment proofs, avatars, ID photos, lease documents) resolve through `ams-react/src/api/fileUrl.js`. Private uploads go through `download_file.php` and the public images (room photos in `room_images/`, QR codes in `qr_codes/`, Glass photos in `site_assets/`) through `public_file.php`, both under `VITE_API_BASE_URL`, so file links follow the same environment and only the API folder needs to be reachable (the deployed server maps only `/api/`). `TopBar.jsx`, `AdminPayments.jsx` and `UserPaymentHistory.jsx` previously hardcoded `localhost` and now use the helper too.

---

## 4. CORS

Every `backend/api/*.php` endpoint now starts with:

```php
require_once __DIR__ . '/../cors.php';
```

This replaces `header('Access-Control-Allow-Origin: *');`. `backend/cors.php` loads before the OPTIONS early exit, never touches the database, and does nothing from the CLI. `config.php` also includes it.

| Environment | `ALLOWED_ORIGINS` | Result |
|---|---|---|
| any | set | Only an `Origin` in the list is echoed back in `Access-Control-Allow-Origin` (plus `Vary: Origin`) |
| any | unset | `https://angcanan-ams.com`, `https://www.angcanan-ams.com`, and `localhost`/`127.0.0.1` on port 80 (no port), 5173, 5174 and 8080 are echoed; any other origin gets no header. Another domain, or opening the site by the server's IP, must be listed in `ALLOWED_ORIGINS` (which then replaces this list) |

An echoed origin also gets `Access-Control-Allow-Credentials: true`: `axiosConfig.js` sends `withCredentials` so the HttpOnly `ams_trusted_device` cookie (a device that passed the sign-in code, `verify_device.php`) reaches `login.php`. A wildcard is never sent. `cors.php` answers an OPTIONS preflight itself (200, `Access-Control-Max-Age: 7200`).

Origins must match exactly: scheme, host and port, with no trailing slash. Separate several with commas:

```
ALLOWED_ORIGINS=https://ams.example.com,http://localhost:5173
```

Add `http://localhost:5173` only if you want to run `npm run dev` against the production API. Each endpoint's `Allow-Methods` / `Allow-Headers` lines are unchanged. No `Allow-Credentials` header is needed, because auth is a bearer token.

---

## 5. Database connection errors

The Docker image runs PHP 8.2, where `new mysqli()` **throws** when it can't connect. `config.php` used to register its exception handler only after the connect call, so a bad `DB_*` value on Railway produced an **HTTP 500 with an empty body**. The live API was doing exactly this on 2026-09-16.

`config.php` now handles both PHP 8.0 (XAMPP, `connect_error`) and PHP 8.1+ (the exception) the same way:

- The server log gets `[AMS] Database connection failed (host:port/db): <reason>`.
- In production, the client gets `{"success":false,"message":"Database connection failed"}`.
- In development, the page shows `Connection failed: <reason>`, as before.

**If you see this on Railway:**
1. Check the service's `DB_*` variables against saas_deployment_guide.md §4.3 (doc removed).
2. Confirm `DB_NAME=ams_db`.
3. Confirm the schema was imported (§3.3).

---

## 6. Checklist: bringing production up

> For a step-by-step version, including creating the MariaDB service and importing the schema, see railway_setup_runbook.md (doc removed).

1. Railway → API service → **Variables**: set the `DB_*` references, `DB_NAME=ams_db` and `APP_ENV=production`.
2. **Deploy latest commit**, then test:
   ```bash
   API=https://apartmentmanagementsystemreact-production.up.railway.app/api
   curl -s "$API/get_invoices.php"          # {"success":false,"message":"Authentication required"}
   curl -s -X POST "$API/login.php" -H "Content-Type: application/json" \
     -d '{"email_address":"admin@gmail.com","password":"<ADMIN_PASSWORD>"}'
   ```
   If this returns "Database connection failed", see §5.
3. When a frontend is deployed:
   - Set `ALLOWED_ORIGINS` (and `APP_URL`) to its origin on Railway.
   - Build it with `npm run build`, or set `VITE_API_BASE_URL` in the host's dashboard.
4. Check that other origins are blocked:
   ```bash
   curl -s -i -X OPTIONS "$API/login.php" -H "Origin: https://evil.example" | grep -i allow-origin   # prints nothing
   ```

---

## 7. Files changed

| Area | Files |
|---|---|
| Backend | `backend/config.php` (APP_URL, includes cors.php, DB connect handling) · **new** `backend/cors.php` · `backend/config.env.example.php` · all 87 `backend/api/*.php` (CORS line) |
| Frontend | **new** `ams-react/.env.development`, `ams-react/.env.production` · `ams-react/.env.example` · `src/Components/TopBar.jsx`, `src/AdminPages/AdminPayments.jsx`, `src/UserPages/UserPaymentHistory.jsx` (use `fileUrl`) |
| Docs | this page · `saas_deployment_guide.md` · `security_audit.md` · `CLAUDE.md` |

## 8. How this was verified

- `php -l` passes on `config.php`, `cors.php` and all `backend/api/*.php`. No `Allow-Origin: *` is left in `backend/`.
- `npm run build` succeeds in both modes.
  - The production bundle contains the Railway URL. Its only `localhost` strings are react-router/axios internals that use it as a URL-parsing base.
  - The development bundle contains no Railway URL.
- XAMPP: `login.php` with `Origin: http://localhost:5173` echoes that origin and logs in as `admin@gmail.com`.
- Production mode was tested with `cors.php` under PHP's built-in server:
  - `APP_ENV=production ALLOWED_ORIGINS=https://app.example`: the listed origin is echoed; `https://evil.example` gets no header.
  - `APP_ENV=production` with no list: neither origin gets a header.
- **Not yet verified:** the live Railway API after redeploying this change.
