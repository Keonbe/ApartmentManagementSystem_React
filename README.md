# Apartment Management System (AMS) — React & PHP

A full-featured Apartment Management System built with a **React 19 + Vite 8** frontend, a **PHP 8** REST API backend, a small **Node.js Socket.IO** chat server, and a **MySQL / MariaDB** database. Designed for tenant self-service and day-to-day property administration.

> Last reviewed against the code: **2026-09-24**.

---

## 📑 Documentation Index

System documentation lives in [docs/](docs/). The first two entries are the authoritative status sources.

- **Status & verification:**
  - [Panelist Feature Checklist](docs/features/panelist_feature_checklist.md) — Scope and completion status of every panel requirement.
  - [Module Verification Guide](docs/documentation/module_verification_guide.md) — Audited modules: API contracts, workflows, and test cases.
  - [Consolidated TODO](docs/consolidated_todo.md) — The single open-work list (backend, security, deployment, testing).
  - [Security Audit & Hardening](docs/security_audit.md) — Findings, fixes, and open risks.
- **System Architecture & Design:**
  - [System Design Specification](docs/documentation/system_design.md) — Data model, workflows, routes, and API inventory.
  - [Database Schema Reference](docs/documentation/database_schema.md) — ER diagram, table-by-table reference, and every migration file.
  - [System Diagrams & Visual Flows](docs/documentation/system_diagrams.md) — Mermaid diagrams for the main workflows.
  - [External Services](docs/documentation/external_services.md) — PayMongo, Semaphore SMS, SMTP email: status and configuration.
- **Feature Specifications:**
  - [SMS & Email Notifications](docs/features/sms_email_implementation.md) — Pipeline, Semaphore driver, go-live steps; runbook: [sms_email_mock_testing.md](docs/features/sms_email_mock_testing.md).
  - [Chat & Support System](docs/features/chat_design.md) — Tenant ↔ admin chat (as built, plus the complaints design).
  - [Payment System & Invoicing Design](docs/features/payment_system_design.md) — Billing lifecycle, advance/deposit rules, proof upload, receipts.
  - [Move-In & Move-Out Workflow](docs/features/move_in_move_out_design.md) — Tenant lifecycle, clearance, deposit refund.
  - [Inquiry & Reservation Design](docs/features/inquiry_reservation_design.md) — Public inquiries, holds, waitlist, conversion to application.
  - [Service Management Design](docs/features/service_management_design.md) — Service catalog, bookings, billing.
  - [Mobile Responsive Layout Guidelines](docs/features/mobile_responsive.md) — Viewport standards and responsive components.
  - [Notification Services (historical)](docs/features/notification_services.md) — The original August 2026 SMS/email research; superseded by the SMS & Email doc above.
- **Deployment & Testing:**
  - [Dual Deployment Plan](docs/deployment/dual-deployment-environment-plan.md) — Local / self-hosted build targets and guardrails.
  - [Localhost to Production Deployment Guide](docs/deployment/localhost_to_production.md) — Deploying frontend, backend, and DB.
  - [PayMongo Integration Guide](docs/paymongo_integration_guide.md) — Online payments (sandbox) and webhook.
  - [Date-Dependent Testing Guide](docs/date_dependent_testing.md) — Simulating overdue payments, expiring leases, billing cycles.
  - [API Documentation (historical)](docs/documentation/api_documentation.md) — Older endpoint reference; check the code when they disagree.

---

## 🏗️ Folder Structure

```
ApartmentManagementSystem_React/
├── ams-react/                      # Frontend (React 19 + Vite 8 + Tailwind CSS 4)
│   ├── public/                     # Static assets (+ .htaccess: no-cache index.html, immutable assets/)
│   ├── scripts/deploy-guard.mjs    # Refuses production builds with localhost URLs
│   ├── src/
│   │   ├── AdminPages/             # Admin portal
│   │   │   ├── AdminDashboard.jsx, AdminUnits.jsx, AdminTenants.jsx, AdminApplications.jsx
│   │   │   ├── AdminInquiries.jsx, AdminContracts.jsx, AdminPayments.jsx, AdminUtilities.jsx
│   │   │   ├── AdminMaintainance.jsx, AdminServicePage.jsx, AdminParking.jsx, AdminCctv.jsx
│   │   │   ├── AdminVisitors.jsx, AdminAnnouncements.jsx, AdminNotifications.jsx, AdminMessages.jsx
│   │   │   ├── AdminReports.jsx, AdminUsers.jsx, AdminActivityLogs.jsx
│   │   │   ├── AdminAccountSettings.jsx   # Settings shell (tabs, dirty tracking, save bar)
│   │   │   └── settings/           # Account, Leasing, Payments, Parking, Notifications, Maintenance panels
│   │   ├── UserPages/              # Tenant & public views
│   │   │   ├── Home.jsx, Preview.jsx, InquiryForm.jsx, Login.jsx, Registration.jsx, ResetPassword.jsx
│   │   │   ├── RentApplication.jsx, TrackApplication.jsx, MyRoom.jsx, ViewContract.jsx
│   │   │   ├── PayBills.jsx, PaymentUpload.jsx, UserPaymentHistory.jsx, UserUtilities.jsx
│   │   │   ├── Services.jsx, ServiceCatalog.jsx, ServiceBooking.jsx, MaintenanceRequest.jsx
│   │   │   ├── ParkingReservation.jsx, CctvRequest.jsx, UserVisitors.jsx, UserMyRequests.jsx
│   │   │   └── UserAnnouncements.jsx, UserNotifications.jsx, ProfileSettings.jsx
│   │   ├── Components/             # Shared UI: TopBar, AdminSidebar, ChatWidget, RoomPreviewModal,
│   │   │                           #   HouseholdPanel, WaitlistPanel, ExpensesModal, ServiceCatalogModal, …
│   │   ├── context/ChatContext.jsx # Chat state: Socket.IO connection + HTTP polling fallback
│   │   ├── api/                    # axiosConfig.js (Bearer token, 401 sign-out), env.js (API/socket URLs), fileUrl.js
│   │   ├── config/                 # systemSettings.js, i18n.js, notificationLinks.js, maintenanceOptions.js, …
│   │   ├── utils/                  # avatarUrl.js
│   │   ├── App.jsx                 # Router and route guards
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── backend/                        # PHP 8 REST API
│   ├── api/                        # 104 endpoint files
│   │   ├── services/               # send_notification.php (dispatcher + queue), send_sms.php (log / Semaphore),
│   │   │                           #   send_email.php (log / SMTP), email_templates.php
│   │   └── migrations/             # SetupDB.sql, seed_mock_data.sql, 2026_09_*.sql upgrades, create_messages_table.sql
│   ├── cron/                       # CLI-only: process_queue.php (+ run_queue.bat), daily_sweep.php,
│   │                               #   check_environment.php, notification_selftest.php
│   ├── config.php                  # DB connection, session auth (require_admin/require_user), billing,
│   │                               #   notification and tenancy helpers, log_activity()
│   ├── cors.php                    # CORS allowlist (loaded via config.php)
│   ├── config.env.example.php      # Environment template → copy to config.env.php (gitignored)
│   ├── room_images/                # Public room showcase photos
│   ├── uploads/                    # Private uploads, served only via download_file.php
│   └── logs/                       # Queue log + mock notification outbox (gitignored)
├── websocket-server/               # Node.js Socket.IO chat server (server.js, port 3001)
├── deploy/env/                     # selfhosted .env example
├── .github/workflows/ci.yml        # Schema/seed/smoke-test jobs, PHPStan, ESLint
└── docs/                           # Documentation (see index above)
```

---

## ⚙️ Installation & Setup

### Prerequisites

- **PHP 8.0+** with `mysqli`, `curl`, `openssl` and `fileinfo` enabled.
- **MariaDB 10.4+** or **MySQL 5.7+**.
- **Node.js 18+** and **npm** (frontend and chat server).
- **XAMPP** (the project is developed with Apache on port **8080**), or WAMP/Laragon.

### Step 1: Clone Repository

Place the project inside your web root, e.g. `C:\xampp\htdocs\ApartmentManagementSystem_React`.

### Step 2: Database & Environment

1. Start **Apache** and **MySQL** from the XAMPP Control Panel.
2. Import, **in this order**:
   1. [backend/api/migrations/SetupDB.sql](backend/api/migrations/SetupDB.sql) — creates `ams_db`, every table, the default settings and the admin account.
   2. *(Optional)* [backend/api/migrations/seeds/seed_mock_data.sql](backend/api/migrations/seeds/seed_mock_data.sql) — sample tenants, applications, invoices and logs.

   > ⚠️ `SetupDB.sql` drops and recreates tables. Re-import both files together to reset.
   >
   > **Upgrading an existing database?** Run `php backend/cron/migrate.php`: it applies the dated files in `backend/api/migrations/` that the database hasn't had yet. Older migrations are deleted once applied everywhere (they're already in `SetupDB.sql`); recover one with `git log --diff-filter=D -- backend/api/migrations/` if a very old database needs it. The chat table comes from `create_messages_table.sql`.
3. Copy `backend/config.env.example.php` to `backend/config.env.php` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` and `APP_ENV`. The template also documents `DEPLOYMENT_TARGET`, `APP_URL`, `ALLOWED_ORIGINS` and the PayMongo keys.
4. Check the environment: `php backend/cron/check_environment.php`.

### Step 3: Frontend

```bash
cd ams-react
npm install
npm run dev            # Vite dev server, http://localhost:5173
npm run build:local    # build dist/ for XAMPP (development mode)
npm run lint
```

The API base URL comes from `VITE_API_BASE_URL` ([src/api/env.js](ams-react/src/api/env.js)). In development it falls back to `http://localhost:8080/ApartmentManagementSystem_React/backend/api/`. `build:selfhosted` uses the gitignored `.env.selfhosted`, and `check:deploy` / the build guard refuse production builds that still point at localhost.

### Step 4: Chat server

```bash
cd websocket-server
npm install
node server.js         # Socket.IO on port 3001 (PORT in websocket-server/.env)
```

The frontend connects via `VITE_CHAT_SOCKET_URL` (default `http://localhost:3001` in development). When the socket is down, chat falls back to HTTP polling of the PHP endpoints.

### Step 5: Background tasks (for SMS/email)

- `backend/cron/process_queue.php` delivers queued SMS/email. Schedule it every minute (`backend/cron/run_queue.bat` for Windows Task Scheduler).
- `backend/cron/daily_sweep.php` runs the daily reminder/billing sweep.
- SMS and email ship on **dry-run drivers** that record messages without sending them. Go-live steps: [sms_email_implementation.md](docs/features/sms_email_implementation.md), Appendix C.

---

## 🔑 Default Accounts (Seed Data)

The admin account is created by [SetupDB.sql](backend/api/migrations/SetupDB.sql). The tenant accounts need [seed_mock_data.sql](backend/api/migrations/seeds/seed_mock_data.sql).

| Role | Email Address | Password | Portal URL |
|---|---|---|---|
| **Administrator** | `admin@gmail.com` | `admin123` | `/login` → `/admin-dashboard` |
| **Tenant** (active lease) | `maria.santos@gmail.com` | `tenant123` | `/login` → `/my-room` |
| **Applicant** (application pending review) | `gloria.tan@gmail.com` | `tenant123` | `/login` → `/track-application` |

`seed_mock_data.sql` seeds more tenants (`jose.reyes@gmail.com`, `pedro.cruz@gmail.com`, `rosa.delacruz@gmail.com`, …); all use `tenant123`. **Change the admin password before any real deployment.**

---

## 🚀 Key Features

- **Public & applicants:**
  - Unit preview with admin-uploaded showcase photos or floor plans; public inquiry form with holds and a waitlist.
  - Online application with the document uploads the admin requires (valid ID front/back by default) and the previous address, live application tracking, move-in invoice payment.
  - Forgot / reset password.
- **Tenant portal:**
  - **My Room**: unit details, household members, lease extension (billed on approval), move-out requests.
  - Bills: PayMongo online checkout (sandbox), proof-of-payment upload, payment history, utility readings.
  - Service catalog and bookings, maintenance tickets with photo/video, parking reservations, CCTV footage requests, visitor pre-registration.
  - Announcements, notification center with per-category preferences, and **live chat with the admin**.
- **Admin panel:**
  - Dashboard; units (pricing, status, showcase images); tenants (active/archived, restore, move-out); applications; inquiries and waitlist; contracts.
  - Payments and invoices (advance/deposit, adjustments, proof verification/rejection, reminders, scheduled payments); utilities; building expenses.
  - Maintenance board, service requests, parking slots and automated parking billing, CCTV and visitor management.
  - Announcements to all tenants or one unit, with optional SMS/email channels and drafts.
  - **Messages** inbox (real-time chat).
  - Reports (monthly, yearly, occupancy, maintenance, income statement, revenue diversification) with CSV/print export.
  - User management (RBAC), activity log.
  - Tabbed settings: account, leasing, payments, parking, notifications (Semaphore SMS, SMTP), maintenance.
- **Notifications:** in-app for every workflow. SMS through **Semaphore** and email through SMTP share one dispatcher with a queue, retries, quiet hours, a daily SMS cap and tenant opt-outs. SMTP is configured for the current deployment; actual email delivery depends on the database's email-enabled switch, SMTP driver selection, and queue processing. SMS go-live remains pending.

---

## 🛡️ Tech Stack & Security

- **Frontend:** React 19, React Router 7, Axios, Tailwind CSS 4, Font Awesome, socket.io-client.
- **Backend:** PHP 8 REST endpoints (no framework), MySQLi prepared statements for all request input.
- **Chat server:** Node.js with Express 5, Socket.IO 4 and mysql2 (`websocket-server/`).
- **Auth:** login issues a session token stored in the `sessions` table. The frontend sends it as `Authorization: Bearer …`, and `require_admin()` / `require_user()` / `require_owner_or_admin()` resolve identity from it; client-sent identity headers are overwritten. A 401 signs the user out.
- **Uploads:** extension + MIME allowlists; private files are served only through `download_file.php`.
- **Audit logging:** `log_activity()` into `activity_logs` for every write.
- **Open risks** (e.g. the unauthenticated chat socket server) are tracked in [docs/security_audit.md](docs/security_audit.md).
