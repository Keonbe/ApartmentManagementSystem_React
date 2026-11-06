# Environment Configuration — Local (XAMPP) and Production

> **Changed:** 2026-11-06 (Railway material removed; it was dropped 2026-09-20) · **Related:** [security_audit.md](../audits/security_audit.md) (C-3, E-1, E-5)

This page covers how AMS chooses its settings in each environment, and what changed when a production domain went live. For the build/run targets (local, self-hosted), the guardrails and the `DEPLOYMENT_ID` claim, see [dual-deployment-environment-plan.md](dual-deployment-environment-plan.md).

---

## 1. What runs where

| Piece | Local | Production |
|---|---|---|
| PHP API | `http://localhost:8080/ApartmentManagementSystem_React/backend/api/` | `https://ams-api.example.com/api/` |
| Database | MariaDB on XAMPP (`localhost:3306/ams_db`) | A separate MariaDB/MySQL server, reachable only on a private host |
| Frontend | Vite dev server `http://localhost:5173`, or `ams-react/dist/` served by Apache | **Not deployed yet** |

The production domain is the **API**, not the database.

---

## 2. Backend settings

`backend/config.php` reads each setting from the first of these sources that has it:

1. A constant in `backend/config.env.php` (gitignored; copy it from `config.env.example.php`). XAMPP and self-hosted servers use this file.
2. An environment variable (`getenv`, then `$_ENV`/`$_SERVER`), for hosts that set them.
3. A built-in default.

| Setting | Local default / example | Production value | Purpose |
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
> A constant in `config.env.php` overrides the environment. A host without that file uses only the variables.

---

## 3. Frontend settings

`ams-react/src/api/env.js` (read by `axiosConfig.js` and `fileUrl.js`) uses `VITE_API_BASE_URL`, which Vite writes into the bundle **at build time**. The value comes from the file for the build mode:

| File | Committed | Used by | Value |
|---|---|---|---|
| `ams-react/.env.development` | yes | `npm run dev`, `npm run build:local` | XAMPP API URL |
| `ams-react/.env.production` | yes | `npm run build`, `npm run build:saas` | Production API URL |
| `ams-react/.env.selfhosted` | no (from `.env.selfhosted.example`) | `npm run build:selfhosted` | the self-hosted operator's API URL |
| `ams-react/.env.local` / `.env.<mode>.local` | no (gitignored) | every mode / that mode | your own value |

These files contain no secrets, since every `VITE_*` value ends up in the public JavaScript.

> [!WARNING]
> **Behaviour change:** a plain `npm run build` now produces a bundle that calls the **production API**. To rebuild the `dist/` that XAMPP serves (`http://localhost:8080/ApartmentManagementSystem_React/ams-react/dist/index.html`), run:
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
| development | unset | `localhost`/`127.0.0.1` on ports 5173 and 8080 are echoed; any other origin gets `*` (XAMPP behaves as before) |
| production | unset | No `Access-Control-Allow-Origin`, so browsers on other origins are blocked |

Origins must match exactly: scheme, host and port, with no trailing slash. Separate several with commas:

```
ALLOWED_ORIGINS=https://ams.example.com,http://localhost:5173
```

Add `http://localhost:5173` only if you want to run `npm run dev` against the production API. Each endpoint's `Allow-Methods` / `Allow-Headers` lines are unchanged. No `Allow-Credentials` header is needed, because auth is a bearer token.

---

## 5. Database connection errors

On PHP 8.1+ (CI runs 8.2), `new mysqli()` **throws** when it can't connect. `config.php` used to register its exception handler only after the connect call, so a bad `DB_*` value in production produced an **HTTP 500 with an empty body**. The live API was doing exactly this on 2026-09-16.

`config.php` now handles both PHP 8.0 (XAMPP, `connect_error`) and PHP 8.1+ (the exception) the same way:

- The server log gets `[AMS] Database connection failed (host:port/db): <reason>`.
- In production, the client gets `{"success":false,"message":"Database connection failed"}`.
- In development, the page shows `Connection failed: <reason>`, as before.

**If you see this in production:**
1. Check the host's `DB_*` settings (`config.env.php` or environment).
2. Confirm `DB_NAME=ams_db`.
3. Confirm the schema was imported (§3.3).

---

## 6. Checklist: bringing production up

1. On the production host, set `DB_*`, `DB_NAME=ams_db` and `APP_ENV=production` (in `config.env.php` or the environment).
2. Deploy the latest commit, then test:
   ```bash
   API=https://ams-api.example.com/api
   curl -s "$API/get_invoices.php"          # {"success":false,"message":"Authentication required"}
   curl -s -X POST "$API/login.php" -H "Content-Type: application/json" \
     -d '{"email_address":"admin@gmail.com","password":"<ADMIN_PASSWORD>"}'
   ```
   If this returns "Database connection failed", see §5.
3. When a frontend is deployed:
   - Set `ALLOWED_ORIGINS` (and `APP_URL`) to its origin.
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
| Docs | this page · `security_audit.md` · `CLAUDE.md` |

## 8. How this was verified

- `php -l` passes on `config.php`, `cors.php` and all `backend/api/*.php`. No `Allow-Origin: *` is left in `backend/`.
- `npm run build` succeeds in both modes.
  - The production bundle contains the production API URL. Its only `localhost` strings are react-router/axios internals that use it as a URL-parsing base.
  - The development bundle contains no production URL.
- XAMPP: `login.php` with `Origin: http://localhost:5173` echoes that origin and logs in as `admin@gmail.com`.
- Production mode was tested with `cors.php` under PHP's built-in server:
  - `APP_ENV=production ALLOWED_ORIGINS=https://app.example`: the listed origin is echoed; `https://evil.example` gets no header.
  - `APP_ENV=production` with no list: neither origin gets a header.
- **Not yet verified:** a live production API after redeploying this change.
