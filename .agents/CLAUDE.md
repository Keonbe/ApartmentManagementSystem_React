# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Apartment Management System (AMS): a React 18 + Vite SPA frontend talking to a PHP 8 REST API backend (no framework — plain scripts, one per endpoint), backed by MySQL/MariaDB, served locally via XAMPP. There is no Node-based backend server; PHP is executed by Apache.

## Commands

All frontend commands run from `ams-react/`:

```bash
cd ams-react
npm install       # install deps
npm run dev       # start Vite dev server (http://localhost:5173)
npm run build     # production build
npm run lint      # ESLint (flat config, eslint-plugin-react-hooks + react-refresh)
npm run preview   # preview a production build
```

There is no automated test suite (no test runner is configured in `package.json`, no `*.test.*`/`*.spec.*` files exist). Don't assume Jest/Vitest is available — verify changes by running the dev server and exercising the flow in-browser, or by tracing the PHP endpoint logic directly.

The backend has no build step — PHP files under `backend/api/` are executed directly by Apache (XAMPP). To run it, start Apache + MySQL from the XAMPP control panel; the app expects to live at `C:\xampp\htdocs\ApartmentManagementSystem_React`.

### Database setup

- Import `backend/api/migrations/SetupDB.sql` to create the `ams_db` schema.
- Optionally import `backend/api/migrations/seed_mock_data.sql` for demo data (seed accounts: `admin@apartment.com` / `admin123`, `tenant1@gmail.com` / `password123`, `applicant@gmail.com` / `password123`).
- Copy `backend/config.env.example.php` → `backend/config.env.php` and set `DB_HOST`/`DB_USER`/`DB_PASS`/`DB_NAME`/`APP_ENV` there. `backend/config.php` loads it with fallback defaults if the file is absent. `config.env.php` is gitignored — never commit real credentials into it.
- Migrations are additive only: use `ADD COLUMN IF NOT EXISTS`-style changes, never destructive `DROP COLUMN`/table rewrites, since production data must survive upgrades.

### Frontend ↔ backend wiring

- API base URL is hardcoded in `ams-react/src/api/axiosConfig.js` as `http://localhost:8080/ApartmentManagementSystem_React/backend/api/`. If Apache runs on a different port/path, update it there (this is the one central place, not per-call).
- `vite.config.js` also proxies `/api` → `http://localhost:8080`, rewriting to `/Capstone/ApartmentManagementSystem_React` — that proxy target looks stale relative to the axios baseURL; don't assume it's authoritative without checking which one the code path you're touching actually uses.

## Architecture

### Auth model

Server-issued session tokens are the real authorization boundary (migrated 2026-09 from pure header trust):

- On login, `login.php` creates a row in the `sessions` table (token, user_id, role, expires_at) and returns `sessionToken` in the response.
- `axiosConfig.js`'s request interceptor sends `Authorization: Bearer <sessionToken>`. The legacy `X-User-Id`/`X-Admin-Id` headers are still sent alongside it for backward compatibility during the transition, but endpoints should not trust them alone.
- `backend/config.php` provides `get_authenticated_user($conn)` (resolves the bearer token to `{id, role}` or null), and the guards built on it: `require_admin($conn)` (401/403 + exit, returns the real admin id), `require_user($conn)` (any authenticated user), `require_owner_or_admin($conn, $owner_id)` (self or admin only). New/updated endpoints should call these directly.
- `verify_admin($conn, $admin_id)` still exists as a **deprecated thin wrapper** around `require_admin()` — it ignores the `$admin_id` argument now and just checks the real session. Existing call sites using this old signature keep working, but treat it as legacy; prefer `require_admin()`/`require_user()` in new code and when touching a file for other reasons.
- Frontend route guards in `ams-react/src/App.jsx` (`ProtectedRoute`, `AdminProtectedRoute`, `TenantProtectedRoute`) gate on the `loggedInUser` object in storage and, for tenants, also on live room status fetched from `my_room.php`. These remain convenience UX guards only — the real authorization boundary is the server-side session check, since anyone can forge client-side state.

### Backend endpoint pattern

`backend/api/` is a flat directory of ~65 single-purpose PHP scripts (`get_*.php` for reads, verb-named scripts like `pay_bill.php`/`create_invoice.php` for writes) — there's no router or framework. Each endpoint follows this shape:

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// Admin-only guard (omit for tenant-facing endpoints; use require_user()/
// require_owner_or_admin() instead for tenant-facing ones that need auth):
$admin_id = require_admin($conn); // 401/403 + exit if not a real admin session; returns the true id

// ... query logic using $conn (mysqli) with prepared statements ...
echo json_encode(["success" => true, "data" => $result]);
$conn->close();
```

`backend/config.php` is the shared entry point: it establishes `$conn` (mysqli), and defines the session-auth guards (`require_admin`, `require_user`, `require_owner_or_admin`, `get_authenticated_user`, the deprecated `verify_admin` wrapper — see Auth model above) and `log_activity($conn, $performed_by, $category, $action, $details)`. Any state-changing endpoint should call `log_activity()` to write to `activity_logs` for the admin audit trail.

Use mysqli prepared statements (`$conn->prepare(...)->bind_param(...)`) for all queries touching request input — this is the established SQL-injection defense throughout the codebase (see `docs/security_audit.md`).

### Data model quirks (see `docs/documentation/system_design.md` for the full schema)

- `rooms.id` is a **VARCHAR** (e.g. `"A"`, `"B1"`), not an integer — don't assume numeric room IDs.
- Tenant identity is spread across tables: `rent_applications.user_id` FKs to `users.id`; `rent_applications.room_name` links to a room but is **not an enforced FK**. A common join pattern for "tenant name + room" is:
  ```sql
  LEFT JOIN users u ON u.id = t.user_id
  LEFT JOIN rent_applications ra ON ra.user_id = t.user_id AND ra.status = 'Approved'
  ```
- `lease_contracts` is a separate table from `rent_applications` and is not fully wired into `ViewContract.jsx` yet — check current state before assuming contract data flows through it.
- Status columns (`Pending`/`Approved`/`Rejected`, `Pending`/`Paid`, etc.) are matched with hardcoded exact-string comparisons in multiple frontend components for badge styling — changing an allowed value in one place requires grepping for every string match across the frontend, not just updating the DB/backend.
- `announcements` creation fans out to insert one row per tenant into `notifications` — expect a write amplification when creating announcements.

### Frontend structure

- `ams-react/src/AdminPages/` — admin-only views (routed under `/admin-*`, gated by `AdminProtectedRoute`).
- `ams-react/src/UserPages/` — public + tenant views (routed under root paths, gated by `ProtectedRoute`/`TenantProtectedRoute` as appropriate).
- `ams-react/src/Components/` — shared UI (e.g. `TopBar`).
- `ams-react/src/config/systemSettings.js` — admin-configurable system defaults (lease duration, overdue thresholds, payment channel toggles, PayMongo keys) fetched from the backend; all admin pages should read config through here rather than hardcoding values.
- All API calls must go through `import api from '../api/axiosConfig'` (never raw `fetch`/`axios`) since that's the only place auth headers get attached.
- `App.jsx` centralizes routing and the three route-guard components described above; new pages need to be registered there with the appropriate guard.

### Files that need care

Changes to these ripple across the whole app, so double-check call sites before editing:
- `ams-react/src/api/axiosConfig.js` — header injection affects every request.
- `backend/config.php` — shared DB connection + `verify_admin`/`log_activity` used by nearly every endpoint.
- `users` table schema — login/auth depends on its exact columns.
- Any existing `status` column's allowed values (frontend badge logic is string-matched, see above).

## Commit workflow

When creating git commit messages or committing changes, use a single commit that covers the entire changeset, but clearly organize and separate the commit message body into distinct categories (e.g., Backend, Frontend, Docs/Meta) covering the affected areas.

At the end of a task/prompt that changed code, draft a commit message summarizing the change (following the categorization above) and present it to the user — do not run `git commit` yourself unless the user explicitly asks you to commit. This is a draft-only habit, not an auto-commit habit.

## Docs upkeep

When a fix or change makes an existing markdown doc's claims stale or inaccurate, update that doc as part of the same task rather than leaving it to drift — this applies broadly, not just to one file:
- `docs/features/panelist_feature_checklist.md` — if a fix changes whether a checklist item is actually implemented, correct its checkbox/description rather than leaving an overstated "✅ done" claim standing (see the 2026-09 tenant/unit management audit for the pattern: check both the summary bullet list and the detailed feature table, they can drift independently).
- `docs/security_audit.md` — update when auth model, validation, or upload-sanitization behavior changes (e.g. the header-trust → session-token migration should be reflected here).
- Any other `docs/**/*.md` whose described behavior (schema, flow, endpoint list) the change invalidates.

Prefer correcting an inaccurate claim over deleting it silently — note briefly why it changed if it's non-obvious (e.g. "no such column exists" vs "removed in this pass").

## Documentation map

`docs/` has authoritative design docs worth consulting before large changes:
- `docs/documentation/system_design.md` — data model, schemas, entity relationships, API inventory.
- `docs/documentation/system_diagrams.md` — Mermaid diagrams for auth/applications/billing/maintenance/visitor flows.
- `docs/features/*.md` — per-feature specs (chat, notifications, payments, move-in/move-out, mobile responsive layout).
- `docs/deployment/localhost_to_production.md` — deployment steps.
- `docs/date_dependent_testing.md` — how to simulate overdue payments / expiring leases / billing cycles for manual testing.
- `docs/security_audit.md` — SQL injection defense, auth validation, upload sanitization notes.
- `docs/todo.md` — active backlog and priorities.
