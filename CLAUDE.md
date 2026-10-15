# AMS — Claude Code guide

React 19 + Vite 8 SPA (`ams-react/`, Tailwind 4, React Router 7) → plain PHP 8 endpoints (`backend/api/*.php`, no framework) → MariaDB 10.4 `ams_db`, served by XAMPP Apache on :8080. PHP is 8.0: mysqli returns false on errors (no exceptions). Chat also runs a Node Socket.IO sidecar (`websocket-server/server.js`, :3001, `node server.js`; frontend URL `VITE_CHAT_SOCKET_URL` in `src/api/env.js`).

## Session start

1. Read `TASK.md` (local, gitignored) if present — it is the current workstream plus open items. Finished workstreams live in `TASK.archive.md` (also local): grep it by topic, never read it whole.
2. `git status` + `git log --oneline -5`.
3. Open only files named there; `grep` before reading. Read large docs by section (Grep headings → Read with offset/limit), never whole.

## Run / verify

- Start: `cmd //c "start /B C:\\xampp\\mysql_start.bat"` and `apache_start.bat`
- Frontend: `cd ams-react && npm run build:local` for the XAMPP-served `dist/` (no test runner exists). `build:selfhosted` uses the gitignored `.env.selfhosted` for other self-hosted deployments; a build guard fails production builds with localhost URLs
- Deployment targets/guardrails: `docs/deployment/dual-deployment-environment-plan.md`; backend check `php backend/cron/check_environment.php`
- Env: backend reads `config.env.php` → env vars (`DB_*`, `APP_ENV`, `APP_URL`, `APP_TIMEZONE`, `ALLOWED_ORIGINS`); CORS lives in `backend/cors.php`, loaded through `config.php` (the four chat endpoints still send their own `*` header first — see security_audit §6e).
- PHP: `/c/xampp/php/php.exe -l <file>` (Bash tool is Git Bash)
- DB reset: drop/recreate `ams_db`, import (SetupDB.sql hardcodes `USE ams_db` — for a scratch DB, `sed` the name first or it wipes dev) `backend/api/migrations/SetupDB.sql` then `migrations/seeds/seed_mock_data.sql` (seeds/resets live in `seeds/`; never run `seed_mock_data.sql` on prod — use the local-only, gitignored `seed_prod_demo.sql`)
- Live API checks: curl with a Bearer token — recipes and seed accounts in `docs/documentation/module_verification_guide.md` §3.2 / §1.4 (`admin@gmail.com` / `admin123`)

## Backend conventions (backend/config.php)

- Identity only from the session: `require_admin`, `require_user`, `require_owner_or_admin`. `X-User-Id`/`X-Admin-Id` are overwritten by `config.php` — never trust request ids.
- Prepared statements for all request input.
- Writes call `log_activity($conn, $id, <one of LOG_CATEGORIES>, 'Title Case Action', $details)`.
- Notifications via `create_notification()`; admin queue via `notify_admins_queue()` / `resolve_admin_queue()`. Only queue rows are `'Pending'`.
- Invoice "still owed" = `BILLING_OPEN_STATUSES` / `billing_open_status_sql()`. Charges onto invoices: `post_service_charge()` / `post_parking_charge()` (claim-first).
- Migrations: new idempotent `YYYY_MM_name.sql` in `backend/api/migrations/` + mirror into `SetupDB.sql`/seeds; `cron/migrate.php` runs pending ones (prod is MySQL 8). The runner strips `IF NOT EXISTS` (MySQL 8) and runs one statement at a time, skipping only statements whose change already exists; still prefer `information_schema` + `PREPARE` guards (pattern: `2026_10_prod_schema_repair.sql`). No `DELIMITER` blocks. Once applied everywhere (prod included), delete it; `SetupDB.sql` already has it and git keeps the history. **Before committing to main, merge the workstream's new (not yet on prod) migrations into one `YYYY_MM_<name>.sql`** (concatenate in order under `-- ===== name =====` headers, delete the per-feature files, fix references, test on a DB built from the previous `SetupDB.sql`, twice). Never merge or rename a migration prod has already applied: the runner tracks them by filename.
- Frontend API calls only through `ams-react/src/api/axiosConfig.js` (the one exception: chat's socket.io-client in `context/ChatContext.jsx`); uploads via `src/api/fileUrl.js`; new routes registered in `App.jsx` with the right guard.

## Docs (authoritative first)

- `docs/features/panelist_feature_checklist.md` — scope & status (panel requirements)
- `docs/documentation/module_verification_guide.md` — audited modules: API contract, diagrams, workflow, tests
- `docs/documentation/database_schema.md`, `system_design.md` — schema/overview (check code if they disagree)
- `docs/features/sms_email_implementation.md` (+ `sms_email_mock_testing.md` runbook) — SMS/email pipeline, Semaphore
- `docs/features/chat_design.md` — chat: "As built" section first; the rest is design
- `docs/deployment/*` — deployment
- `docs/documentation/claude_code_guide.md` — this repo's Claude Code setup: `/db-snapshot`, hooks, permissions
- Historical/possibly stale: `api_documentation.md`, `notification_services.md` (design), `todo.md`, `.agents/prd.md`

## Workflow rules

- Git: all work, including big implementations, goes straight to `main`, with no feature branches. No required-PR branch protection.
- **Never commit on your own, even when a plan lists per-phase commits.** The user verifies and tests first. Leave changes uncommitted, draft the commit message(s), and commit only when the user says so. For a large change, draft one message per area or phase.

- Work directly by default. Use a subagent only for broad read-only sweeps whose raw output the main thread doesn't need (e.g. "which endpoints lack `log_activity`"); prefer `repo-sweep` (Sonnet). Don't spawn subagents for single-area fixes, edits, or verification.
- Plans (plan mode) open with a short **TL;DR**: a few one-line bullets on what changes and why, before the detailed sections.
- Prefer Edit over full-file Write unless most of the file changes.
- Verify proportionately: `php -l` on changed PHP, `npm run build` for JSX, curl only the rows that prove the fix.
- **Self-review the diff before saying "done"** (the repo has no test suite, so this is the safety net). Read `git diff` and check each item, and fix before reporting:
  - **Empty vs zero:** `||` / falsy checks on values where `0` is meaningful (use `??` / `=== 0`); a field missing from an input or webhook payload.
  - **Concurrency:** two tabs/admins doing the same action; a stale edit after the row was sent/deleted (lock with `FOR UPDATE`, re-check state, don't trust `affected_rows` alone: unchanged rows report 0); double submit.
  - **Order of effects:** work after `commit()` that can still throw; files deleted or written before the DB write succeeds; a failure reported for something already saved.
  - **Queries in loops:** no DB or settings read per row. On a list endpoint, count queries before and after (`SHOW GLOBAL STATUS LIKE 'Questions'`); prod pays a network round-trip per query.
  - **Blast radius:** grep other callers of any shared function, endpoint parameter or column you changed; seeds and `SetupDB.sql` mirrored.
  - **Edits to big/shared files** (`config.php`): use Edit, never a scripted find-and-replace (the files are CRLF); `php -l` right after.
  - Then test one negative, one edge (boundary/zero/missing) and one stale-state case live, not only the happy path.
- Before stopping or when a workstream ends: update `TASK.md`; draft a commit message (don't commit unless asked), grouped Backend / Frontend / Docs. Once a workstream is committed, move its section to `TASK.archive.md` and keep only its unfinished points under "Open items".
- When a change makes a doc claim stale, fix that doc section in the same task.
- Start a new session once a workstream is committed, or when switching branches/tasks — don't carry finished work into the next request.

## Panel audit routine (one checklist area at a time)

Read the area's checklist rows → audit endpoints + pages → fix → verify live (restore DB) → add the module's section to the verification guide (§2 template; test IDs `M<panel module>-NN`) → update checklist rows, detail table, summary counts.
