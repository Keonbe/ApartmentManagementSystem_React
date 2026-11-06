# Apartment Management System (AMS) — React & PHP

A full-featured Apartment Management System for tenant self-service and day-to-day property administration. It is built from four parts:

| Part | Technology | Location |
|---|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 7 | [ams-react/](ams-react) |
| REST API | Plain PHP 8 endpoints (no framework), MySQLi prepared statements | [backend/](backend) |
| Chat server | Node.js, Express 5, Socket.IO 4, mysql2 | [websocket-server/](websocket-server) |
| Database | MariaDB 10.4+ / MySQL 8 (`ams_db`) | [backend/api/migrations/](backend/api/migrations) |

> Last reviewed against the code: **2026-10-31**.

---

## 📑 Documentation Index

System documentation lives in [docs/](docs). The first two entries are the authoritative status sources; when a document disagrees with the code, the code wins.

- **For AI assistants & contributors:** [AGENTS.md](AGENTS.md) is the shared guide for Claude, Codex, Gemini and Copilot (conventions, commit workflow, and which doc to update for which change). [SPRINT.md](SPRINT.md) tracks tasks and progress per commit.
- **Status & verification:**
  - [Panelist Feature Checklist](docs/features/panelist_feature_checklist.md) — Scope and completion status of every panel requirement.
  - [Module Verification Guide](docs/documentation/module_verification_guide.md) — Audited modules: API contracts, workflows, and test cases.
  - [Consolidated TODO](docs/planning/todo.md) — The open-work list (backend, security, deployment, testing).
  - [Security Audit & Hardening](docs/audits/security_audit.md) — Findings, fixes, and open risks.
- **System architecture & design:**
  - [System Design Specification](docs/documentation/system_design.md) — Data model, workflows, routes, and API inventory.
  - [Database Schema Reference](docs/documentation/database_schema.md) — ER diagram, table-by-table reference, and migration files.
  - [System Diagrams & Visual Flows](docs/documentation/system_diagrams.md) — Mermaid diagrams for the main workflows.
  - [External Services](docs/documentation/external_services.md) — PayMongo, Semaphore SMS, SMTP email: status and configuration.
- **Feature specifications:**
  - [SMS & Email Notifications](docs/features/sms_email_implementation.md) — Pipeline, Semaphore driver, go-live steps. Runbooks: [SMS/email mock testing](docs/features/sms_email_mock_testing.md) and [transactional email testing](docs/features/transactional_email_testing.md).
  - [Chat & Support System](docs/features/chat_design.md) — Tenant ↔ admin chat (as built, plus the complaints design).
  - [Payment System & Invoicing Design](docs/features/payment_system_design.md) — Billing lifecycle, advance/deposit rules, proof upload, receipts.
  - [Move-In & Move-Out Workflow](docs/features/move_in_move_out_design.md) — Tenant lifecycle, clearance, deposit refund.
  - [Inquiry & Reservation Design](docs/features/inquiry_reservation_design.md) — Public inquiries, holds, waitlist, conversion to application.
  - [Service Management Design](docs/features/service_management_design.md) — Service catalog, bookings, billing.
  - [Mobile Responsive Layout Guidelines](docs/features/mobile_responsive.md) — Viewport standards and responsive components.
- **Deployment & operations:**
  - [Dual Deployment Plan](docs/deployment/dual-deployment-environment-plan.md) — Local / self-hosted build targets and guardrails.
  - [Environment Configuration](docs/deployment/environment_config.md) — Local (XAMPP) and production environment values.
  - [Localhost to Production Deployment Guide](docs/deployment/localhost_to_production.md) — Deploying frontend, backend, and database.
  - [CI/CD Pipeline](docs/deployment/cicd_pipeline.md) — What CI runs and the deployment strategy.
  - [Backup and Restore Runbook](docs/deployment/backup_and_restore.md) — Procedure for backing up and restoring a production install.
  - [PayMongo Integration Guide](docs/deployment/paymongo_integration_guide.md) — Online payments (sandbox) and webhook.
- **Testing & development:**
  - [API Test Suite](docs/documentation/api_testing.md) — How the Vitest suite builds its scratch database and runs.
  - [Date-Dependent Testing Guide](docs/documentation/date_dependent_testing.md) — Simulating overdue payments, expiring rentals, billing cycles.
  - [Claude Code in this repo](docs/documentation/claude_code_guide.md) — Hooks, permissions and the `/db-snapshot` skill used for AI-assisted work.
  - [API Documentation (historical)](docs/documentation/api_documentation.md) — Older endpoint reference; check the code when they disagree.

---

## 🏗️ Folder Structure

```text
ApartmentManagementSystem_React/
├── ams-react/                      # Frontend (React 19 + Vite 8 + Tailwind CSS 4)
│   ├── public/                     # Static assets (+ .htaccess: no-cache index.html, immutable assets/)
│   ├── scripts/deploy-guard.mjs    # Refuses production builds that point at localhost
│   └── src/
│       ├── AdminPages/             # Admin portal (dashboard, units, tenants, applications, inquiries,
│       │   │                       #   contracts, payments, refunds, utilities, maintenance, services,
│       │   │                       #   parking, CCTV, visitors, announcements, messages, reports,
│       │   │                       #   users, activity logs, document requirements, account settings)
│       │   └── settings/           # Settings panels: account, floor rent, house rules, leasing, payments,
│       │                           #   parking, notifications, maintenance, requirements, utility types, minors
│       ├── UserPages/              # Tenant & public views (home, preview, inquiry, login, registration,
│       │                           #   rent application, my room, bills, refunds, services, parking, …)
│       ├── Components/             # Shared UI: TopBar, AdminSidebar, ChatWidget, modals, panels
│       │   └── admin/ contract/ form/ tenant/
│       ├── context/ChatContext.jsx # Chat state: Socket.IO connection + HTTP polling fallback
│       ├── api/                    # axiosConfig.js (Bearer token, 401 sign-out), env.js (API/socket URLs), fileUrl.js
│       ├── config/  hooks/  utils/ # Settings, i18n, notification links, shared hooks and helpers
│       ├── App.jsx                 # Router and route guards
│       └── main.jsx
├── backend/                        # PHP 8 REST API
│   ├── api/                        # ~135 endpoint files, one per action (get_*, add_*, update_*, …)
│   │   ├── services/               # send_notification.php (dispatcher + queue), send_sms.php (log / Semaphore),
│   │   │                           #   send_email.php (log / SMTP), email_templates.php
│   │   └── migrations/             # SetupDB.sql (full schema), dated 2026_*.sql upgrades,
│   │       └── seeds/              #   seeds: seed_mock_data.sql, seed_reset.sql, clear_and_seed.sql, demo seeds
│   ├── cron/                       # CLI-only: process_queue.php (+ run_queue.bat), daily_sweep.php,
│   │                               #   migrate.php, check_environment.php, notification/email self-tests
│   ├── config.php                  # DB connection, session auth (require_admin/require_user), billing,
│   │                               #   notification and tenancy helpers, log_activity()
│   ├── cors.php                    # CORS allowlist (loaded via config.php)
│   ├── config.env.example.php      # Environment template → copy to config.env.php (gitignored)
│   ├── vendor/                     # PHPMailer (committed: no composer install needed)
│   ├── room_images/  qr_codes/     # Public room photos; slot QR images
│   ├── uploads/                    # Private uploads, served only via download_file.php
│   └── logs/                       # Queue log + mock notification outbox (gitignored)
├── websocket-server/               # Node.js Socket.IO chat server (server.js, port 3001, .env.example)
├── tests/api/                      # Vitest API suite: scratch ams_test DB + php -S server (see Running the Tests)
├── deploy/env/                     # Self-hosted .env example
├── .github/workflows/ci.yml        # Frontend lint/build, PHP lint + PHPStan, schema validation, smoke test
└── docs/                           # Documentation (see index above)
```

---

## ⚙️ Installation & Setup

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| PHP | 8.0+ | With `mysqli`, `curl`, `openssl` and `fileinfo` enabled |
| MariaDB / MySQL | MariaDB 10.4+ or MySQL 8 | Bundled with XAMPP |
| Node.js | 20.19+ | Required by Vite 8 and ESLint 10; also used by the chat server and the API tests |
| Web server | Apache | The project is developed with **XAMPP** on port **8080** (WAMP/Laragon also work) |

### Step 1: Clone the repository

Place the project inside your web root so the API is served by Apache:

```bash
cd C:/xampp/htdocs
git clone https://github.com/Keonbe/ApartmentManagementSystem_React.git ApartmentManagementSystem_React
```

### Step 2: Database & environment

1. Start **Apache** and **MySQL** from the XAMPP Control Panel.
2. Import, **in this order**:
   1. [SetupDB.sql](backend/api/migrations/SetupDB.sql) — creates `ams_db`, every table, the default settings and the admin account.
   2. *(Optional)* [seed_mock_data.sql](backend/api/migrations/seeds/seed_mock_data.sql) — sample tenants, applications, invoices and logs.

   ```bash
   /c/xampp/mysql/bin/mysql -u root < backend/api/migrations/SetupDB.sql
   /c/xampp/mysql/bin/mysql -u root ams_db < backend/api/migrations/seeds/seed_mock_data.sql
   ```

   > ⚠️ `SetupDB.sql` drops and recreates tables and hardcodes `USE ams_db`. Re-import both files together to reset. Never run the demo seed on a deployed system.

   > **Upgrading an existing database?** Run `php backend/cron/migrate.php`. It applies the dated `2026_*.sql` files in `backend/api/migrations/` that the database has not had yet. Old migrations are deleted once applied everywhere (they are already in `SetupDB.sql`); recover one with `git log --diff-filter=D -- backend/api/migrations/` if a very old database needs it.
3. Copy `backend/config.env.example.php` to `backend/config.env.php` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` and `APP_ENV`. The template also documents `DEPLOYMENT_TARGET`, `APP_URL`, `ALLOWED_ORIGINS` and the PayMongo keys. `config.env.php` is gitignored: never commit it.
4. Check the environment:

   ```bash
   php backend/cron/check_environment.php
   ```

### Step 3: Frontend

```bash
cd ams-react
npm install
npm run dev            # Vite dev server, http://localhost:5173
npm run build:local    # build dist/ for XAMPP (development mode)
npm run lint
```

| Script | Mode | Use |
|---|---|---|
| `npm run dev` | development | Local development, API on XAMPP |
| `npm run build:local` | development | The `dist/` that XAMPP serves: `http://localhost:8080/ApartmentManagementSystem_React/ams-react/dist/index.html` |
| `npm run build:selfhosted` | selfhosted | Self-hosted server build; reads the gitignored `.env.selfhosted` (template: [.env.selfhosted.example](ams-react/.env.selfhosted.example)) |
| `npm run build` / `build:saas` | production | What CI runs; the API URL in [.env.production](ams-react/.env.production) is a placeholder |
| `npm run check:deploy` | any | Re-checks the env and scans `dist/` for localhost URLs |

The API base URL comes from `VITE_API_BASE_URL` ([src/api/env.js](ams-react/src/api/env.js)). In development it falls back to `http://localhost:8080/ApartmentManagementSystem_React/backend/api/`. The build guard refuses production builds that still point at localhost.

### Step 4: Chat server

```bash
cd websocket-server
npm install
cp .env.example .env   # Windows cmd: copy .env.example .env; optional, see below
node server.js         # Socket.IO on port 3001 (PORT in websocket-server/.env)
```

`websocket-server/.env` is gitignored. Without it the server uses the same values as [.env.example](websocket-server/.env.example) (`DB_HOST=localhost`, `DB_USER=root`, empty `DB_PASSWORD`, `DB_NAME=ams_db`, `PORT=3001`), so you only need the file when your database or port differs. `node_modules/` is never committed: always run `npm install` after cloning. `backend/vendor/` (PHPMailer) **is** committed, so the backend needs no `composer install`.

> **Updating an existing checkout?** Older commits tracked `websocket-server/node_modules/` and `websocket-server/.env`, so the first `git pull` after they were untracked deletes both from your disk. Before pulling, copy `websocket-server/.env` somewhere safe (a server that relies on it especially). After pulling, put it back and run `npm install` in `websocket-server/`, then restart `node server.js`.

The frontend connects via `VITE_CHAT_SOCKET_URL` (default `http://localhost:3001` in development). When the socket is down, chat falls back to HTTP polling of the PHP endpoints. Design notes: [Chat & Support System](docs/features/chat_design.md).

### Step 5: Background tasks (for SMS/email)

- [process_queue.php](backend/cron/process_queue.php) delivers queued SMS/email. Schedule it every minute ([run_queue.bat](backend/cron/run_queue.bat) is provided for Windows Task Scheduler).
- [daily_sweep.php](backend/cron/daily_sweep.php) runs the daily reminder/billing sweep.
- SMS and email ship on **dry-run drivers** that record messages without sending them. Go-live steps: [sms_email_implementation.md](docs/features/sms_email_implementation.md), Appendix C.

---

## 🧪 Running the Tests

The API suite calls the real PHP endpoints over HTTP and needs **MySQL running** (not Apache):

```bash
cd tests/api
npm install
npm test               # about 2-3 minutes
```

It builds a scratch database `ams_test` from `SetupDB.sql` + `seed_mock_data.sql`, serves the backend with `php -S` on port 8091 in test mode (SMS and email off), and refuses to touch any database not named `*_test`, so your dev `ams_db` is never changed. `KEEP_TEST_DB=1 npm test` keeps the scratch database. Details: [API Test Suite](docs/documentation/api_testing.md).

Frontend checks (the same ones CI runs): `cd ams-react && npm run lint && npm run build`.

---

## 🩹 Troubleshooting

| Symptom | Cause and fix |
|---|---|
| XAMPP MySQL stops immediately; `mysql_error.log` says *Aria recovery failed* | The Aria log is out of sync, usually after an unclean shutdown. Back up `C:\xampp\mysql\data`, then run `aria_chk -r` on the `mysql/*.MAI` tables and move `aria_log.*` out of the data folder. Your own InnoDB tables are not affected. Stop MySQL from the Control Panel before shutting down to avoid it. |
| Chat shows as offline | The Socket.IO server is not running (Step 4). Chat keeps working through HTTP polling meanwhile. |
| `npm test` says MySQL is not reachable | Start MySQL first. The suite does not need Apache. |
| `npm test` says port 8091 is in use | A previous test run is still alive; stop it and retry. |
| Production build refuses to run | The deploy guard found a localhost URL in the env. Set the real `VITE_API_BASE_URL` (see [Step 3](#step-3-frontend)). |

---

## 🔑 Default Accounts (Seed Data)

The admin account is created by [SetupDB.sql](backend/api/migrations/SetupDB.sql). The tenant accounts need [seed_mock_data.sql](backend/api/migrations/seeds/seed_mock_data.sql).

| Role | Email Address | Password | Portal URL |
|---|---|---|---|
| **Administrator** | `admin@gmail.com` | `admin123` | `/login` → `/admin-dashboard` |
| **Tenant** (active rent) | `maria.santos@demo.example` | `tenant123` | `/login` → `/my-room` |
| **Applicant** (application pending review) | `gloria.tan@demo.example` | `tenant123` | `/login` → `/track-application` |

`seed_mock_data.sql` seeds more tenants (`jose.reyes@demo.example`, `pedro.cruz@demo.example`, `rosa.delacruz@demo.example`, …); all use `tenant123`.

> ⚠️ These logins are demo data only. Never run the seed on a deployed system, and **change the admin password before any real deployment.**

---

## 🚀 Key Features

- **Public & applicants:**
  - Unit preview with admin-uploaded showcase photos or floor plans; public inquiry form with holds and a waitlist; guest chat for visitors.
  - Online application with the document uploads the admin requires and the previous address, live application tracking, move-in invoice payment.
  - Forgot / reset password.
- **Tenant portal:**
  - **My Room**: unit details, household members, rent extension (billed on approval), move-out requests and deposit refunds.
  - Bills: PayMongo online checkout (sandbox), split payments, proof-of-payment upload, payment history, utility readings.
  - Service catalog and bookings, maintenance tickets with photo/video, parking reservations, CCTV footage requests, visitor pre-registration.
  - Announcements, notification center with per-category preferences, and **live chat with the admin**.
- **Admin panel:**
  - Dashboard with a needs-attention list; units (pricing, status, showcase images); tenants (active/archived, restore, move-out); applications; inquiries and waitlist; contracts.
  - Payments and invoices (advance/deposit, adjustments, proof verification/rejection, reminders, scheduled payments), payment options, refunds; utilities; building expenses.
  - Maintenance board, service requests, parking slots and automated parking billing, CCTV and visitor management.
  - Announcements to all tenants or one unit, with optional SMS/email channels and drafts.
  - **Messages** inbox (real-time chat).
  - Reports (monthly, yearly, occupancy, maintenance, income statement, revenue diversification) with CSV/print export.
  - User management (RBAC), activity log.
  - Tabbed settings: account, floor rent, house rules, payments, parking, notifications (Semaphore SMS, SMTP), maintenance, document requirements.
- **Notifications:** in-app for every workflow. SMS through **Semaphore** and email through SMTP share one dispatcher with a queue, retries, quiet hours, a daily SMS cap and tenant opt-outs. Actual email delivery depends on the database's email-enabled switch, SMTP driver selection, and queue processing. SMS go-live remains pending.

---

## 🛡️ Tech Stack & Security

- **Frontend:** React 19, React Router 7, Axios, Tailwind CSS 4, Font Awesome, socket.io-client.
- **Backend:** PHP 8 REST endpoints (no framework), MySQLi prepared statements for all request input.
- **Chat server:** Node.js with Express 5, Socket.IO 4 and mysql2 ([websocket-server/](websocket-server)).
- **Quality:** Vitest API suite (~390 tests) plus CI: ESLint + production build, PHP syntax checks and PHPStan, schema/seed/migration validation on MariaDB, and a live-endpoint smoke test ([ci.yml](.github/workflows/ci.yml)).
- **Auth:** login issues a session token stored in the `sessions` table. The frontend sends it as `Authorization: Bearer …`, and `require_admin()` / `require_user()` / `require_owner_or_admin()` resolve identity from it; client-sent identity headers are overwritten. A 401 signs the user out.
- **Uploads:** extension + MIME allowlists; private files are served only through `download_file.php`.
- **Audit logging:** `log_activity()` into `activity_logs` for every write.
- **Secrets:** real credentials live only in the gitignored `backend/config.env.php` or environment variables (and the optional `websocket-server/.env`); templates ending in `.example` hold placeholders only.
- **Open risks:** the Socket.IO chat server does not authenticate connections yet, so do not expose port 3001 to the public internet before reading [docs/audits/security_audit.md](docs/audits/security_audit.md) (§6e), which tracks this and the other open items.
