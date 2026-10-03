# Dual Deployment Environment Plan — SaaS + Self-Hosted from One Branch

> ⚠️ **Dropped (2026-09-20):** the Railway/SaaS target described here is no longer part of the plan. The project is deployed locally (XAMPP) only; `local` and `selfhosted` sections below remain accurate, but the `saas`/Railway rows, steps, and guardrails are historical and should not be followed. CI/CD (lint/build/syntax checks) is unaffected — see `cicd_pipeline.md`.

Status: implemented on `feature/dual-deployment-env` (2026-09-17). This document is both the plan and the record of what was built.

Goal: the same Git branch builds and runs three targets without source edits:

| Target | Who runs it | Frontend build | Backend config |
|---|---|---|---|
| `local` | developers on XAMPP | `npm run dev` / `npm run build:local` | `backend/config.env.php` |
| `saas` | us, on Railway (API + MariaDB) and a static host for the SPA | `npm run build:saas` (= `npm run build`) | Railway service variables |
| `selfhosted` | another operator, on their own server (XAMPP, Apache, or Docker) | `npm run build:selfhosted` | their own `config.env.php` or env file |

Related: [environment_config.md](environment_config.md) (variable reference for local/Railway), [saas_deployment_guide.md](saas_deployment_guide.md), [railway_setup_runbook.md](railway_setup_runbook.md).

**Step-by-step guides:** [§8 SaaS](#8-saas-deployment-steps) · [§9 Self-hosted](#9-self-hosted-deployment-steps) · [§10 Local XAMPP](#10-local-xampp-workflow) · [§10.1 Switching targets](#101-switching-between-targets-on-one-machine) · [§13 Rollback](#13-validation-and-rollback-procedures)

---

## 1. Current deployment architecture

Before this change:

- **Frontend** — React 19 + Vite in `ams-react/`. All HTTP goes through `src/api/axiosConfig.js`, whose base URL came from `VITE_API_BASE_URL` with a hard-coded XAMPP fallback. Uploaded files are resolved by `src/api/fileUrl.js`, which derived the backend root from the axios base URL. Two modes existed: `.env.development` (XAMPP) and `.env.production` (Railway).
- **Backend** — plain PHP in `backend/api/*.php`. `backend/config.php` loads `backend/config.env.php` (gitignored) if present, then environment variables (`DB_*`, `APP_ENV`, `APP_URL`), then local defaults. `backend/cors.php` applies `ALLOWED_ORIGINS`.
- **Docker/Railway** — `Dockerfile` copies `backend/` to the Apache web root (`/api/...`, `/uploads/...`). Uploads live in `/var/www/html/uploads` (a Railway volume).
- **Payments** — PayMongo secret key and webhook secret are rows in `system_settings`, edited in Admin → Settings. The webhook URL is registered by hand in the PayMongo dashboard.
- **Uploads** — endpoints write to `backend/uploads/<kind>/` with paths relative to the backend folder; the stored path is web-relative (`uploads/...`).

## 2. Problems caused by sharing one branch without isolation

1. **Only one production URL.** `.env.production` holds the SaaS API URL. A self-hosted operator running `npm run build` would ship a bundle that sends their tenants' logins and data to *our* Railway API.
2. **Silent localhost fallbacks.** A production build with a missing `VITE_API_BASE_URL` fell back to `http://localhost:8080/...` and still built successfully.
3. **Hard-coded payment return URLs.** `create_checkout_session.php` defaulted to a `localhost` return URL and accepted *any* `success_url`/`cancel_url` from the client, so a checkout could return a tenant to a different deployment (or anywhere).
4. **No identity for data stores.** Nothing stopped a deployment from being pointed, by a copy-pasted credential or a shared volume, at another deployment's database or uploads folder.
5. **No guardrails.** A production host could run with `APP_ENV=development`, a `*` in `ALLOWED_ORIGINS`, an empty DB password, or live PayMongo keys on a dev box, and nothing would say so.
6. **Payment keys only in the database.** An operator who wants keys in the host's secret store had no option.

## 3. Recommended environment strategy

- **Frontend: one Vite mode per target.** The mode picks the `.env.<mode>` file at build time. `development` = local, `production` = SaaS (kept so `npm run build` on Railway/Vercel is unchanged), `selfhosted` = the other operator. A self-hosted operator's values live in a gitignored `.env.selfhosted` made from a committed template.
- **Backend: runtime configuration only.** PHP reads settings on every request: `config.env.php` constants first, then environment variables, then local defaults. There is no build step for the backend. Two new identity settings, `DEPLOYMENT_TARGET` and `DEPLOYMENT_ID`, name the deployment.
- **One shared frontend config module** (`src/api/env.js`) is the only reader of `import.meta.env`. Axios, the upload URL helper and payment return links all use it.
- **Guardrails at both ends.** A Vite plugin (`scripts/deploy-guard.mjs`) validates each build. A CLI script (`backend/cron/check_environment.php`) validates each backend host and stamps the database and uploads folder with the deployment's ID.
- **Isolation by construction.** Each deployment has its own database server/account, uploads folder, origins, payment account and webhook. Payment settings stay per database (or per host environment), so they can't cross over.

## 4. Frontend environment files and variables

**Build-time behaviour.** Vite reads `.env`, `.env.local`, `.env.<mode>` and `.env.<mode>.local` (later files win; real environment variables on the build host win over all of them). Values are **inlined into the bundle** when `vite build` runs. Changing one means rebuilding. Every `VITE_*` value is public.

| File | Committed | Mode | Used by |
|---|---|---|---|
| `ams-react/.env.development` | yes | `development` | `npm run dev`, `npm run build:local` |
| `ams-react/.env.production` | yes (public URL only) | `production` | `npm run build`, `npm run build:saas` |
| `ams-react/.env.selfhosted.example` | yes (template) | — | copy to `.env.selfhosted` |
| `ams-react/.env.selfhosted` | **no** (gitignored) | `selfhosted` | `npm run build:selfhosted` |
| `ams-react/.env.<mode>.local` | **no** (gitignored) | that mode | per-machine overrides |
| `ams-react/.env.example` | yes | — | documentation of all variables |

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VITE_DEPLOYMENT_TARGET` | recommended | `local` in dev, otherwise the mode name | `local` / `saas` / `selfhosted`; checked by the guard |
| `VITE_API_BASE_URL` | yes, for any non-dev build | XAMPP URL, **dev builds only** | full URL of the PHP API folder, trailing slash |
| `VITE_ASSET_BASE_URL` | no | API URL minus `api/` | base for stored `uploads/...` paths |
| `VITE_PUBLIC_URL` | no | current page (`origin + pathname`) | where the SPA is served; used for PayMongo return links |

Payment configuration has no frontend variables: the SPA only calls `create_checkout_session.php`, and the payment methods shown come from the API.

**Scripts** (`ams-react/package.json`):

```bash
npm run build:local        # vite build --mode development  -> dist/ served by XAMPP
npm run build:saas         # vite build --mode production   (same as npm run build)
npm run build:selfhosted   # vite build --mode selfhosted   (needs .env.selfhosted)
npm run check:deploy -- <mode> [distDir]   # re-check an env + scan an existing dist/
```

## 5. Backend environment files and variables

**Runtime behaviour.** Nothing is compiled. On each request `config.php`:

1. includes `backend/config.env.php` if it exists (constants win),
2. otherwise reads the process environment (`getenv`, `$_ENV`, `$_SERVER`, via `ams_env()`),
3. otherwise uses the local default.

Editing `config.env.php` takes effect on the next request. Changing a Railway variable takes effect after the service redeploys.

| Variable | Default | Notes |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` | `localhost`, `3306`, `root`, *(empty)*, `ams_db` | each deployment has its own server/account/schema |
| `APP_ENV` | `development` | `production` hides error details and closes CORS by default |
| `DEPLOYMENT_TARGET` | `local` | **new** — `local` / `saas` / `selfhosted` |
| `DEPLOYMENT_ID` | *(empty)* | **new** — unique name, e.g. `saas-prod`, `<org>-selfhosted`; required in production |
| `APP_URL` | *(empty)* | public URL of this deployment's SPA; payment return links must start with it |
| `ALLOWED_ORIGINS` | *(empty)* | comma-separated exact origins; `*` is ignored |
| `PAYMONGO_SECRET_KEY` | *(unset → database)* | **new, optional** — overrides `system_settings.paymongo_secret_key` |
| `PAYMONGO_WEBHOOK_SECRET` | *(unset → database)* | **new, optional** — overrides `system_settings.paymongo_webhook_secret` |

Templates:

- `backend/config.env.example.php` — local XAMPP and self-hosted XAMPP/Apache (copy to `config.env.php`).
- `deploy/env/saas.env.example` — Railway service variables (enter them in the dashboard; uses `${{MariaDB.*}}` references).
- `deploy/env/selfhosted.env.example` — self-hosted Docker (`docker run --env-file deploy/env/selfhosted.env`) or Apache `SetEnv`.

Filled copies (`deploy/env/*.env`, `backend/config.env.php`) are gitignored. The webhook URL is not a variable: it is `<API base>/paymongo_webhook.php`, registered in *that deployment's* PayMongo account.

Uploads are not configurable: they are always `backend/uploads/` (Docker: `/var/www/html/uploads`), exposed as `UPLOADS_DIR`. Isolation comes from each host having its own folder or volume (§6).

## 6. Database and upload isolation

- **Database.** SaaS uses the Railway MariaDB service through private-network references. A self-hosted operator uses their own server and a non-root account, ideally with a distinct schema name (e.g. `ams_selfhosted`), so a mixed-up credential fails loudly instead of connecting.
- **Identity stamp.** `php backend/cron/check_environment.php --claim` writes `DEPLOYMENT_ID` to `system_settings.deployment_id` and to `uploads/.ams-deployment`, but only when they are empty; it never overwrites. After that, any host with a different `DEPLOYMENT_ID` that points at the same database or folder fails the check. `update_system_settings.php` skips the `deployment_id` key, so the admin Settings page can't change it.
- **Uploads.** SaaS: a Railway volume mounted at `/var/www/html/uploads`, attached only to the SaaS API service. Self-hosted: a local folder or a host directory mounted into their container. Never mount one volume into two deployments.
- **Payments.** Keys and the webhook secret are per database (Admin → Settings) or per host environment (`PAYMONGO_*`). Each deployment registers its own webhook in its own PayMongo account.
- **Sessions.** Auth is a bearer token stored in the `user_sessions` table of the deployment's own database, with no shared cookie or signing key. Separate databases therefore mean separate sessions.

## 7. CORS and public URL configuration

- `ALLOWED_ORIGINS` lists the exact origins of *this* deployment's frontend. `cors.php` now drops a `*` entry and logs it (before this change a `*` never matched anything, so behaviour is the same, but the intent is now explicit).
- Production with `ALLOWED_ORIGINS` unset allows no cross-origin calls. That's correct when the SPA and API share an origin (typical self-hosted Apache), and wrong for SaaS with a separate frontend domain.
- `APP_URL` is the SPA's public URL. `create_checkout_session.php` accepts the client's `success_url`/`cancel_url` only when they equal `APP_URL` or start with `APP_URL/` or `APP_URL#`. Otherwise it builds its own from `APP_URL`. With `APP_URL` unset, development keeps the old behaviour (client URL, else the XAMPP `dist/` URL) and production ignores client URLs.
- The frontend sends `VITE_PUBLIC_URL` (or the current page URL) as the return base, so keep `VITE_PUBLIC_URL` and `APP_URL` pointing at the same place.

Examples:

| Target | `APP_URL` | `ALLOWED_ORIGINS` |
|---|---|---|
| local (optional) | `http://localhost:8080/ApartmentManagementSystem_React/ams-react/dist/index.html` | `http://localhost:5173,http://localhost:8080` |
| saas | `https://<saas-frontend-domain>` | `https://<saas-frontend-domain>` |
| selfhosted (same origin) | `https://ams.example.org/ApartmentManagementSystem_React/ams-react/dist/index.html` | `https://ams.example.org` or unset |

## 8. SaaS deployment steps

For us, deploying to Railway. This assumes the Railway project, the MariaDB service and the API service already exist, as set up in [railway_setup_runbook.md](railway_setup_runbook.md) §1–§6. Placeholders in `<angle brackets>` are values you fill in; never paste real secrets into this file.

### Step 1 — Get the code onto `main`

```bash
git checkout main
git pull
git log --oneline -3        # confirm the dual-deployment commit is there
```

Railway deploys from `main`, so the API service redeploys by itself after the merge.

### Step 2 — Set the API service variables

1. Open Railway → your project → the **API** service → **Variables**.
2. Open `deploy/env/saas.env.example` in the repo and add each variable from it:

   | Variable | Value |
   |---|---|
   | `APP_ENV` | `production` |
   | `DEPLOYMENT_TARGET` | `saas` |
   | `DEPLOYMENT_ID` | `saas-prod` |
   | `APP_URL` | `https://<saas-frontend-domain>` (no trailing slash) |
   | `ALLOWED_ORIGINS` | `https://<saas-frontend-domain>` |
   | `DB_HOST` | `${{MariaDB.RAILWAY_PRIVATE_DOMAIN}}` |
   | `DB_PORT` | `3306` |
   | `DB_USER` | `${{MariaDB.MARIADB_USER}}` |
   | `DB_PASS` | `${{MariaDB.MARIADB_PASSWORD}}` |
   | `DB_NAME` | `${{MariaDB.MARIADB_DATABASE}}` |

3. Use Railway's **reference** picker for the `DB_*` values instead of typing the literal password.
4. Optional: add `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` here if you want the keys kept out of the database (see Step 7).
5. Don't add a `config.env.php` to the image. `.dockerignore` already leaves it out, and its constants would override these variables.

### Step 3 — Attach the uploads volume

1. API service → **Settings** → **Volumes** → **New Volume**.
2. Set the mount path to `/var/www/html/uploads`.
3. Make sure this volume is attached to the SaaS API service only.

### Step 4 — Deploy and read the log

1. Click **Deploy** (or wait for the automatic deploy after Step 2).
2. Open **Deployments** → the newest deployment → **Deploy Logs**.
3. Find the `AMS environment check` block. It should show `target=saas env=production id=saas-prod`.
4. On a first deploy, expect errors saying the database and uploads folder aren't claimed yet. That's normal: the check only logs and never blocks startup. Step 5 fixes it.

### Step 5 — Claim the database and uploads (once)

1. Open a shell in the running API container, either from the service's **Shell** option in the dashboard or with the Railway CLI:

   ```bash
   railway link                 # pick the project and the API service
   railway ssh
   ```

2. Inside the container, stamp this deployment's ID, then check again:

   ```bash
   php /var/www/html/cron/check_environment.php --claim
   php /var/www/html/cron/check_environment.php
   ```

3. Expect `Claimed database ... for saas-prod`, `Claimed uploads folder for saas-prod`, then `OK: 0 errors`. Warnings (for example "PayMongo is in test mode") are fine to read and act on later.
4. If you see `belongs to deployment '<other-id>'`, **stop**. The service is connected to someone else's database or volume. Fix the `DB_*` variables or the volume before going further.
5. Run the claim as root (the default shell user) or as `www-data`. Either works: the claim only needs write access to the uploads folder.

### Step 6 — Build and publish the frontend

On the static host (Vercel or similar):

1. Set the build command to `npm run build:saas` and the root directory to `ams-react`.
2. Under the host's environment variables, set:
   - `VITE_API_BASE_URL` = `https://<api-domain>/api/` (only needed if it differs from the value in `.env.production`)
   - `VITE_PUBLIC_URL` = `https://<saas-frontend-domain>/`
   - `VITE_DEPLOYMENT_TARGET` = `saas`
3. Deploy. In the build log, confirm the line `[deploy-guard] mode=production target=saas api=https://...`.
4. If the build stops with a `[deploy-guard]` error, read the listed reasons, fix the variable, and redeploy.

To build locally instead and upload `dist/` yourself:

```bash
cd ams-react
npm ci
npm run build:saas
npm run check:deploy -- production      # expect: no localhost URLs
```

### Step 7 — Configure PayMongo

1. In the **SaaS** PayMongo dashboard, go to **Developers** and copy the secret key.
2. Save it in one place only: either sign in to the SaaS app as admin (Admin → Settings → payment keys), or set `PAYMONGO_SECRET_KEY` on the API service. The environment variable wins if both are set.
3. Create a webhook pointing to `https://<api-domain>/api/paymongo_webhook.php` for the checkout-paid events, and copy its signing secret.
4. Save that secret in Admin → Settings, or as `PAYMONGO_WEBHOOK_SECRET`.
5. Re-run `php /var/www/html/cron/check_environment.php` in the container. The "not configured" warnings should be gone.

### Step 8 — Verify end to end

1. Run the API smoke tests in [saas_deployment_guide.md §4.5](saas_deployment_guide.md) and [railway_setup_runbook.md §9](railway_setup_runbook.md).
2. Check CORS from the real frontend origin, and from a wrong one:

   ```bash
   curl -s -i -H "Origin: https://<saas-frontend-domain>" https://<api-domain>/api/get_system_settings.php | grep -i access-control-allow-origin
   # expect: Access-Control-Allow-Origin: https://<saas-frontend-domain>
   curl -s -i -H "Origin: https://evil.example" https://<api-domain>/api/get_system_settings.php | grep -i access-control-allow-origin
   # expect: no output
   ```

3. Open the frontend, sign in, open a page with an uploaded file (for example a payment proof), and confirm the file loads from the API domain.
4. Start a sandbox payment and confirm PayMongo returns you to `https://<saas-frontend-domain>/#/pay-bills?...`.

## 9. Self-hosted deployment steps

For the other operator, from the same branch. Pick **one** backend option: A (XAMPP/Apache) or B (Docker). The database, frontend and payment steps are the same for both.

### Step 1 — Prepare the server

You need:

- Git and Node.js 20 or newer (for the frontend build)
- PHP 8.0 or newer with `mysqli`, and MariaDB/MySQL — or Docker
- A domain or IP address that users will reach, e.g. `https://ams.example.org`

Get the code:

```bash
git clone <repository-url> ApartmentManagementSystem_React
cd ApartmentManagementSystem_React
git checkout main
```

For XAMPP, clone into the web root (e.g. `C:\xampp\htdocs\`) so Apache serves it.

### Step 2 — Create your own database

Use your own database server, never the SaaS one. Choose a distinct schema name so a mixed-up credential fails instead of connecting.

1. Sign in to MariaDB as an administrator:

   ```bash
   mysql -u root -p
   ```

2. Create the schema and a dedicated application user:

   ```sql
   CREATE DATABASE ams_selfhosted CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
   CREATE USER 'ams_app'@'localhost' IDENTIFIED BY '<strong password>';
   GRANT ALL PRIVILEGES ON ams_selfhosted.* TO 'ams_app'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```

   With Docker, the API connects from the container, so use `'ams_app'@'%'` (or the container network's host) instead of `'localhost'`.

3. Import the schema. `SetupDB.sql` creates and selects `ams_db` itself, so point it at your schema first:

   ```bash
   sed 's/\bams_db\b/ams_selfhosted/g' backend/api/migrations/SetupDB.sql > /tmp/SetupDB_selfhosted.sql
   mysql -u root -p ams_selfhosted < /tmp/SetupDB_selfhosted.sql
   ```

   Check that the rename worked before importing: `grep -c ams_db /tmp/SetupDB_selfhosted.sql` should print `0`.

4. Import `backend/api/migrations/seeds/seed_mock_data.sql` only if this is a demo instance. It contains test accounts.

5. Confirm the tables exist:

   ```bash
   mysql -u ams_app -p ams_selfhosted -e "SHOW TABLES;" | head
   ```

### Step 3A — Backend on XAMPP or Apache

1. Create your config file from the template:

   ```bash
   cp backend/config.env.example.php backend/config.env.php
   ```

2. Open `backend/config.env.php`. At the top, **delete or change** the local lines (`DB_USER 'root'`, `DB_PASS ''`, `DB_NAME 'ams_db'`, `APP_ENV 'development'`, `DEPLOYMENT_TARGET 'local'`). PHP keeps the first `define()` of each name, so leaving both the local and self-hosted lines won't work.
3. Uncomment and fill in the "Self-hosted production example" block so the file defines each name once:

   ```php
   define('DB_HOST', 'localhost');
   define('DB_PORT', 3306);
   define('DB_USER', 'ams_app');
   define('DB_PASS', '<strong password>');
   define('DB_NAME', 'ams_selfhosted');
   define('APP_ENV', 'production');
   define('DEPLOYMENT_TARGET', 'selfhosted');
   define('DEPLOYMENT_ID', '<org>-selfhosted');
   define('APP_URL', 'https://ams.example.org/ApartmentManagementSystem_React/ams-react/dist/index.html');
   define('ALLOWED_ORIGINS', 'https://ams.example.org');
   ```

4. Make the uploads folder writable by the web server user (Linux):

   ```bash
   sudo chown -R www-data:www-data backend/uploads
   ```

   On Windows/XAMPP this is normally already writable.

5. Keep `backend/uploads/.htaccess` in place: it stops uploaded files from being executed.
6. Restart Apache.
7. Check the API responds:

   ```bash
   curl -s https://ams.example.org/ApartmentManagementSystem_React/backend/api/get_system_settings.php | head -c 100
   ```

Your API base URL for the frontend (Step 5) is `https://ams.example.org/ApartmentManagementSystem_React/backend/api/`.

### Step 3B — Backend on Docker

1. Create your env file from the template:

   ```bash
   cp deploy/env/selfhosted.env.example deploy/env/selfhosted.env
   ```

2. Edit `deploy/env/selfhosted.env` and replace every placeholder: `DEPLOYMENT_ID`, `APP_URL`, `ALLOWED_ORIGINS`, `DB_HOST` (the address of your database as seen from the container), `DB_USER`, `DB_PASS`, `DB_NAME`.
3. Create a folder on the host for uploads:

   ```bash
   sudo mkdir -p /srv/ams/uploads
   ```

4. Build and start the container:

   ```bash
   docker build -t ams-api .
   docker run -d --name ams-api --restart unless-stopped \
     --env-file deploy/env/selfhosted.env \
     -v /srv/ams/uploads:/var/www/html/uploads \
     -p 8080:80 ams-api
   ```

5. Read the start-up check:

   ```bash
   docker logs ams-api | sed -n '/AMS environment check/,/errors/p'
   ```

   Errors about the database or uploads not being claimed are expected until Step 4.

6. Put a reverse proxy with HTTPS (Nginx, Caddy, Apache) in front of port 8080.

Your API base URL for the frontend (Step 5) is `https://<api-host>/api/`.

### Step 4 — Check and claim

Run the check first, fix every `ERROR`, then claim:

```bash
# XAMPP/Apache (Windows: C:\xampp\php\php.exe backend\cron\check_environment.php)
php backend/cron/check_environment.php
php backend/cron/check_environment.php --claim
php backend/cron/check_environment.php

# Docker
docker exec ams-api php /var/www/html/cron/check_environment.php
docker exec ams-api php /var/www/html/cron/check_environment.php --claim
docker exec ams-api php /var/www/html/cron/check_environment.php
```

1. The first run shows which settings were loaded (`target=`, `db=`, `app_url=`). Confirm they are **your** values.
2. The `--claim` run should print `Claimed database ams_selfhosted for <org>-selfhosted` and `Claimed uploads folder ...`.
3. The last run should end with `OK: 0 errors`.
4. If any run says `belongs to deployment '...'`, **stop**. Your credentials or uploads folder point at another deployment's data.

### Step 5 — Build the frontend

1. Create your frontend env file:

   ```bash
   cd ams-react
   cp .env.selfhosted.example .env.selfhosted
   ```

2. Edit `ams-react/.env.selfhosted`:

   ```ini
   VITE_DEPLOYMENT_TARGET=selfhosted
   VITE_API_BASE_URL=https://ams.example.org/ApartmentManagementSystem_React/backend/api/
   # Optional; must match APP_URL on the backend
   VITE_PUBLIC_URL=https://ams.example.org/ApartmentManagementSystem_React/ams-react/dist/index.html
   ```

   Keep the trailing slash on `VITE_API_BASE_URL`. Never put passwords or keys in this file: everything in it is published in the site's JavaScript.

3. Install and build:

   ```bash
   npm ci
   npm run build:selfhosted
   ```

4. Confirm the build log shows `[deploy-guard] mode=selfhosted target=selfhosted api=https://ams.example.org/...` and `built in ...`.
5. Double-check the result:

   ```bash
   npm run check:deploy -- selfhosted
   # expect: env OK ... no localhost URLs
   ```

6. Publish the files:
   - **XAMPP/Apache (same folder):** nothing to copy. The site is at `https://ams.example.org/ApartmentManagementSystem_React/ams-react/dist/index.html`.
   - **Any other web server:** copy the contents of `ams-react/dist/` to its document root.

**Single-machine install only:** if the server is only ever used as `localhost`, the build guard will refuse localhost URLs. Build with `AMS_ALLOW_LOCALHOST_BUILD=1 npm run build:selfhosted` (PowerShell: `$env:AMS_ALLOW_LOCALHOST_BUILD='1'; npm run build:selfhosted`). The backend check will then warn, not fail, about the localhost `APP_URL`.

### Step 6 — Configure payments (optional)

1. Create **your own** PayMongo account. Never reuse the SaaS operator's keys.
2. Save the secret key in Admin → Settings (sign in as admin), or as `PAYMONGO_SECRET_KEY` in `config.env.php` or `selfhosted.env`.
3. In your PayMongo dashboard, register a webhook to `<your API base URL>paymongo_webhook.php`, e.g. `https://ams.example.org/ApartmentManagementSystem_React/backend/api/paymongo_webhook.php`.
4. Save the webhook signing secret in Admin → Settings, or as `PAYMONGO_WEBHOOK_SECRET`.
5. For Docker, restart after editing the env file: `docker rm -f ams-api`, then repeat the `docker run` command from Step 3B.

### Step 7 — Secure the admin account and verify

1. Open the site, sign in with the default admin account created by `SetupDB.sql` (`admin@gmail.com` / `admin123`), and **change its password immediately**.
2. Run the check one last time and expect `OK: 0 errors`.
3. Upload a test file (for example a profile picture) and confirm it displays.
4. If payments are set up, run a sandbox payment and confirm you return to your own site.
5. Schedule the daily sweep (`backend/cron/daily_sweep.php`) with cron or Windows Task Scheduler, as described at the top of that file.

### Step 8 — Updating later

```bash
git pull                                   # your gitignored config files stay untouched
# apply any new files in backend/api/migrations/ to your database
cd ams-react && npm ci && npm run build:selfhosted
php backend/cron/check_environment.php     # expect OK
```

For Docker, also rebuild the image and re-create the container (Step 3B, points 4–5).

## 10. Local XAMPP workflow

Nothing changes for day-to-day development.

### Step 1 — Start XAMPP

```bash
cmd //c "start /B C:\\xampp\\mysql_start.bat"
cmd //c "start /B C:\\xampp\\apache_start.bat"
```

Or use the XAMPP Control Panel.

### Step 2 — Check the backend config

1. If `backend/config.env.php` doesn't exist yet: `cp backend/config.env.example.php backend/config.env.php`.
2. Leave `DEPLOYMENT_TARGET` as `local` and `APP_ENV` as `development`. `DEPLOYMENT_ID` can stay unset.
3. Optional sanity check:

   ```bash
   /c/xampp/php/php.exe backend/cron/check_environment.php
   # expect: target=local env=development ... OK
   ```

### Step 3 — Develop

```bash
cd ams-react
npm install          # first time only
npm run dev          # Vite dev server on http://localhost:5173, API on XAMPP
```

### Step 4 — Build the XAMPP-served `dist/`

```bash
npm run build:local
```

Open `http://localhost:8080/ApartmentManagementSystem_React/ams-react/dist/index.html`.

**Watch out:** plain `npm run build` is the **SaaS** build, and its `dist/` calls the Railway API. Always use `build:local` for the copy XAMPP serves. The XAMPP fallback URL in `env.js` only applies to dev builds.

## 10.1 Switching between targets on one machine

A frontend build targets one deployment at a time, and each build overwrites `ams-react/dist/`.

1. Choose the target and run its build:

   | Want | Command | Reads |
   |---|---|---|
   | XAMPP copy | `npm run build:local` | `.env.development` |
   | SaaS upload | `npm run build:saas` | `.env.production` |
   | Self-hosted upload | `npm run build:selfhosted` | `.env.selfhosted` |

2. Read the `[deploy-guard] mode=... target=... api=...` line and confirm it names the target you want.
3. Upload or serve `dist/`.
4. **Before you go back to XAMPP testing**, run `npm run build:local` again, otherwise the XAMPP page keeps calling the last target's API.
5. To try a different URL for one build without editing files, set it on the command line:

   ```bash
   VITE_API_BASE_URL=https://staging.example.org/api/ npm run build:selfhosted
   ```

The backend never needs switching on one machine. Each server reads its own `config.env.php` or environment at runtime.

## 11. Branch and collaboration workflow

- Everyone works on `main` (or on `feature/*` branches merged to `main`, per `CLAUDE.md`). No per-deployment branches, and no commits that change URLs for one deployment.
- Deployment-specific values live only in: the host's variables (Railway, the static host), `backend/config.env.php`, `ams-react/.env.selfhosted`, `ams-react/.env.*.local`, and `deploy/env/*.env`. All of these are gitignored except the committed SaaS public URL in `.env.production`.
- The self-hosted operator pulls `main`, keeps their gitignored files, rebuilds the frontend and runs any new migrations. Their files never conflict with ours.
- A new setting follows the same pattern: a `VITE_*` value read in `src/api/env.js`, or a backend value read with `ams_env()` in `config.php`, added to the matching `.example` template and to §4/§5 here.

## 12. Secret-management rules

1. No secret in any `VITE_*` variable. The build fails if a `VITE_` name looks like a secret (`SECRET`, `PASSWORD`, `PASS`, `PRIVATE`, `*_KEY`).
2. No filled `config.env.php`, `.env.selfhosted`, `.env.*.local` or `deploy/env/*.env` in Git. `.gitignore` covers them; templates end in `.example` and hold placeholders only.
3. SaaS secrets live in Railway variables or Admin → Settings (masked for non-admins, never written to the activity log in clear text). Self-hosted secrets live in their `config.env.php`/env file or their own Admin → Settings.
4. Never reuse a database password, PayMongo key or webhook secret across deployments. The `DEPLOYMENT_ID` stamp catches a shared database, not a shared PayMongo account.
5. Rotate any secret that was pasted into a chat, ticket or commit, then check `git log -p` for it.

## 13. Validation and rollback procedures

**Frontend build guard** (`ams-react/scripts/deploy-guard.mjs`, runs inside every `vite build`). For a non-development mode it **fails** when:

- `VITE_API_BASE_URL` is missing, not absolute `http(s)`, or (SaaS) not `https://`
- `VITE_DEPLOYMENT_TARGET` is unknown, or is `local` in a production build
- a self-hosted build points at a `railway.app` API
- `VITE_API_BASE_URL`, `VITE_ASSET_BASE_URL` or `VITE_PUBLIC_URL` is a localhost URL (override with `AMS_ALLOW_LOCALHOST_BUILD=1`)
- a `VITE_*` name looks like a secret
- the emitted JS/CSS/HTML contains `localhost`, `127.0.0.1` or `0.0.0.0` followed by a port or path. A bare `http://localhost` is ignored because react-router and axios use it as a URL-parsing placeholder.

It warns when `VITE_DEPLOYMENT_TARGET` is unset or the API URL lacks a trailing slash.

**Backend check** (`backend/cron/check_environment.php`, CLI only; returns `Forbidden` over HTTP). It exits with status 1 on any error.

| Check | Error | Warning |
|---|---|---|
| `APP_ENV` / `DEPLOYMENT_TARGET` not a known value | ✓ | |
| production + target `local` | ✓ | |
| target `saas`/`selfhosted` + `APP_ENV=development` | | ✓ |
| production without `DEPLOYMENT_ID` / `APP_URL` | ✓ | |
| `*` in `ALLOWED_ORIGINS` | ✓ | |
| localhost `APP_URL` or origin in production | ✓ (saas) | ✓ (selfhosted) |
| SaaS `APP_URL` not https | ✓ | |
| production with `ALLOWED_ORIGINS` unset | | ✓ |
| empty `DB_PASS` in production | ✓ | |
| `DB_USER=root` in production | | ✓ |
| `config.env.php` present on SaaS | | ✓ |
| self-hosted `DB_HOST`/`APP_URL` on Railway | ✓ | |
| live PayMongo key on development | ✓ | |
| test PayMongo key in production; payment keys missing | | ✓ |
| database or uploads claimed by another `DEPLOYMENT_ID` | ✓ | |
| database/uploads not yet claimed | ✓ (production) | ✓ (development) |
| uploads folder missing or not writable | ✓ | |
| DB connection fails | ✓ | |

**Rollback.**

- *Frontend:* redeploy the previous build (static host "promote previous deployment"), or `git checkout <good-commit> && npm run build:<target>`.
- *Backend:* roll back the Railway deployment to the previous image. Self-hosted: `git checkout <good-commit>`. The change adds no schema migration; the only data it writes is the `deployment_id` row and the `.ams-deployment` file.
- *Wrong claim* (e.g. a typo in `DEPLOYMENT_ID`): `DELETE FROM system_settings WHERE setting_key = 'deployment_id';`, delete `uploads/.ams-deployment`, then run `--claim` again with the right ID. First confirm that the database really belongs to this deployment.
- *Reverting this feature entirely:* `git revert` the merge commit. The leftover `deployment_id` row is harmless.

## 14. Files changed by the implementation

Frontend (`ams-react/`)

- `src/api/env.js` — **new**; the only reader of `import.meta.env` (`API_BASE_URL`, `ASSET_BASE_URL`, `PUBLIC_URL`, `DEPLOYMENT_TARGET`, `appReturnBase()`). The XAMPP fallback is dev-only.
- `src/api/axiosConfig.js` — base URL from `env.js`.
- `src/api/fileUrl.js` — resolves uploads against `ASSET_BASE_URL`.
- `src/UserPages/PayBills.jsx`, `src/UserPages/TrackApplication.jsx` — payment return base from `appReturnBase()`.
- `scripts/deploy-guard.mjs` — **new**; build guard plugin and standalone checker.
- `vite.config.js` — registers `deployGuard()`.
- `package.json` — `build:local`, `build:saas`, `build:selfhosted`, `check:deploy`.
- `eslint.config.js` — Node globals for `vite.config.js` and `scripts/`.
- `.env.development`, `.env.production` — add `VITE_DEPLOYMENT_TARGET` and comments.
- `.env.example` — documents every variable and mode. `.env.selfhosted.example` is **new**.
- `.gitignore` — ignores `.env.selfhosted` and `.env.*.local`.

Backend

- `backend/config.php` — `ams_env()` function (replaces the closure), `DEPLOYMENT_TARGET`, `DEPLOYMENT_ID`, `UPLOADS_DIR`, `ams_env_setting()`.
- `backend/cors.php` — ignores and logs a `*` entry.
- `backend/api/create_checkout_session.php` — return URLs validated against `APP_URL`, no localhost default once `APP_URL` is set, `PAYMONGO_SECRET_KEY` override.
- `backend/api/paymongo_webhook.php` — `PAYMONGO_WEBHOOK_SECRET` override, and a failed settings query no longer fatals.
- `backend/api/update_system_settings.php` — skips the `deployment_id` key.
- `backend/cron/check_environment.php` — **new**; backend validation and `--claim`.
- `backend/config.env.example.php` — new variables and a self-hosted example.

Repo / ops

- `Dockerfile` — runs the environment check (non-blocking) at container start.
- `deploy/env/saas.env.example`, `deploy/env/selfhosted.env.example` — **new**.
- `.gitignore` — ignores `deploy/env/*.env` and stray `.env*` files.
- Docs: this file, [environment_config.md](environment_config.md) (pointer + new variables), `CLAUDE.md` (build commands).

## 15. Verification results and remaining limitations

Run on 2026-09-17 on Windows/XAMPP (PHP 8.0, MariaDB 10.4, Node 25).

| Check | Result |
|---|---|
| `npm run lint` | 0 errors, 12 warnings (all `react-hooks/exhaustive-deps`, none in changed files) |
| `npm run build:local` | built; guard shows `target=local`, XAMPP API URL present in bundle (expected) |
| `npm run build:saas` | built; guard shows `target=saas`, Railway API URL in bundle, **0** localhost hits |
| `npm run check:deploy -- production` | env OK, 3 built files scanned, no localhost URLs |
| `npm run build:selfhosted` without `.env.selfhosted` | **fails**: `VITE_API_BASE_URL is not set for mode "selfhosted"` |
| `npm run build:selfhosted` from the template | built; `https://ams.example.org/.../backend/api/` in bundle, 0 `railway.app` hits |
| self-hosted build with a `railway.app` API | **fails** as intended |
| self-hosted build with a localhost API | **fails**; succeeds with `AMS_ALLOW_LOCALHOST_BUILD=1` |
| SaaS build labelled `local` + `VITE_PAYMONGO_SECRET_KEY` set | **fails** with both errors |
| First SaaS build attempt | the bundle scan caught react-router/axios's bare `http://localhost` placeholder, so the scan was narrowed to host+port/path |
| `php -l` on `config.php`, `cors.php`, `create_checkout_session.php`, `paymongo_webhook.php`, `update_system_settings.php`, `cron/check_environment.php` | no syntax errors |
| `check_environment.php` on local XAMPP | `OK: 0 errors`, 2 warnings (PayMongo not configured) |
| `--claim` with `DEPLOYMENT_ID=verify-local`, then the same ID | claimed DB + uploads; `OK` |
| same database with `DEPLOYMENT_ID=other-deploy` | exit 1: database and uploads "belong to deployment 'verify-local'" |
| simulated unsafe self-hosted production (no ID, `*` origin, root/empty password, localhost URLs) | exit 1: 3 errors, 6 warnings, as in §13 |
| simulated SaaS production with localhost `APP_URL` and a test key from the environment | exit 1: localhost `APP_URL` + empty password errors; test-mode and `config.env.php` warnings |
| check script over HTTP | `Forbidden` |
| API smoke test after the `config.php` refactor | settings 200, admin login + `dashboard_stats.php` OK |
| `update_system_settings.php` with `deployment_id` | `changed: 0`, row not created |
| Cleanup | test `deployment_id` row and `.ams-deployment` marker removed; `dist/` rebuilt with `build:local` |

Limitations

- **Uploads path is fixed** to `backend/uploads/`. Isolation relies on a separate folder or volume per host plus the ownership marker. Moving uploads to object storage (Supabase, see `saas_deployment_guide.md` §6.2) is a separate change.
- **The `DEPLOYMENT_ID` stamp is opt-in.** It protects only after `--claim` has run, and the API itself doesn't re-check it on each request, to keep requests free of extra queries. Run the check after every credential or volume change. On Docker it also runs at each start.
- **Shared PayMongo accounts can't be detected.** Operators must use their own account and webhook.
- **Not live-tested:** the checkout return-URL validation and the `PAYMONGO_*` overrides were checked by reading the code and `php -l` only, because a live test needs a PayMongo key and would mutate invoices. CORS wildcard dropping was not exercised live, since it would mean editing the local `config.env.php`.
- **`vite.config.js` dev proxy** still rewrites `/api` to a stale `/Capstone/...` path. It is unused (the SPA calls absolute URLs) and left untouched as unrelated.
- Existing frontend cancel links (`#/pay-bills?status=cancelled`) don't carry `invoice_id`, as before. That's unchanged by this work.
- The Docker boot check runs as `www-data` and never claims. Claiming is a deliberate manual step.
