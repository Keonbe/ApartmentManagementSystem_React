# AMS — Claude Code guide

React 18 + Vite SPA (`ams-react/`) → plain PHP 8 endpoints (`backend/api/*.php`, no framework) → MariaDB 10.4 `ams_db`, served by XAMPP Apache on :8080. PHP is 8.0: mysqli returns false on errors (no exceptions).

## Session start

1. Read `TASK.md` (local, gitignored) if present — it is the current workstream.
2. `git status` + `git log --oneline -5`.
3. Open only files named there; `grep` before reading. Read large docs by section (Grep headings → Read with offset/limit), never whole.

## Run / verify

- Start: `cmd //c "start /B C:\\xampp\\mysql_start.bat"` and `apache_start.bat`
- Frontend: `cd ams-react && npm run build` (no test runner exists). Plain `build` targets Railway (`.env.production`); for the XAMPP-served `dist/` use `npm run build -- --mode development`
- Env: backend reads `config.env.php` → env vars (`DB_*`, `APP_ENV`, `APP_URL`, `ALLOWED_ORIGINS`); CORS lives in `backend/cors.php`, included by every endpoint. Prod API: `https://apartmentmanagementsystemreact-production.up.railway.app/api/`
- PHP: `/c/xampp/php/php.exe -l <file>` (Bash tool is Git Bash)
- DB reset: drop/recreate `ams_db`, import `backend/api/migrations/SetupDB.sql` then `seed_mock_data.sql`
- Live API checks: curl with a Bearer token — recipes and seed accounts in `docs/documentation/module_verification_guide.md` §3.2 / §1.4 (`admin@gmail.com` / `admin123`)

## Backend conventions (backend/config.php)

- Identity only from the session: `require_admin`, `require_user`, `require_owner_or_admin`. `X-User-Id`/`X-Admin-Id` are overwritten by `config.php` — never trust request ids.
- Prepared statements for all request input.
- Writes call `log_activity($conn, $id, <one of LOG_CATEGORIES>, 'Title Case Action', $details)`.
- Notifications via `create_notification()`; admin queue via `notify_admins_queue()` / `resolve_admin_queue()`. Only queue rows are `'Pending'`.
- Invoice "still owed" = `BILLING_OPEN_STATUSES` / `billing_open_status_sql()`. Charges onto invoices: `post_service_charge()` / `post_parking_charge()` (claim-first).
- Migrations: new idempotent file in `backend/api/migrations/` + mirror into `SetupDB.sql`/seed.
- Frontend API calls only through `ams-react/src/api/axiosConfig.js`; uploads via `src/api/fileUrl.js`; new routes registered in `App.jsx` with the right guard.

## Docs (authoritative first)

- `docs/features/panelist_feature_checklist.md` — scope & status (panel requirements)
- `docs/documentation/module_verification_guide.md` — audited modules: API contract, diagrams, workflow, tests
- `docs/documentation/database_schema.md`, `system_design.md` — schema/overview (check code if they disagree)
- `docs/deployment/*` — deployment
- Historical/possibly stale: `api_documentation.md`, `notification_services.md` (design), `todo.md`, `.agents/prd.md`

## Workflow rules

- Git: bug fixes and routine work are committed straight to `main`. Big implementations (e.g. the chat module, SaaS/deployment integration, a new module) go on a `feature/<name>` branch, then merge to `main` once verified. No required-PR branch protection.

- Work directly by default. Use a subagent only for broad read-only sweeps whose raw output the main thread doesn't need (e.g. "which endpoints lack `log_activity`"); prefer `repo-sweep` (Sonnet). Don't spawn subagents for single-area fixes, edits, or verification.
- Prefer Edit over full-file Write unless most of the file changes.
- Verify proportionately: `php -l` on changed PHP, `npm run build` for JSX, curl only the rows that prove the fix.
- Before stopping or when a workstream ends: update `TASK.md`; draft a commit message (don't commit unless asked), grouped Backend / Frontend / Docs.
- When a change makes a doc claim stale, fix that doc section in the same task.
- Start a new session once a workstream is committed, or when switching branches/tasks — don't carry finished work into the next request.

## Panel audit routine (one checklist area at a time)

Read the area's checklist rows → audit endpoints + pages → fix → verify live (restore DB) → add the module's section to the verification guide (§2 template; test IDs `M<panel module>-NN`) → update checklist rows, detail table, summary counts.
