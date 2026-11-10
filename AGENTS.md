# AMS — AI agent guide (Codex, Gemini, Copilot, Cursor, Claude)

Shared instructions for every AI tool used on this repo. Claude Code also reads `CLAUDE.md`, which imports this file; Gemini reads `GEMINI.md` and Copilot reads `.github/copilot-instructions.md`, both of which point here. Edit conventions **here**, once.

React 19 + Vite 8 SPA (`ams-react/`, Tailwind 4, Router 7) → plain PHP 8.0 endpoints (`backend/api/*.php`, no framework; mysqli returns false on error, no exceptions) → MariaDB 10.4 `ams_db`, XAMPP Apache :8080. Chat also has a Node Socket.IO sidecar (`websocket-server/server.js`, :3001; frontend URL `VITE_CHAT_SOCKET_URL` in `src/api/env.js`).

## Session start
1. Read the open rows of `SPRINT.md` (the committed task/progress tracker).
2. `git status` + `git log --oneline -5`.
3. Open only files named there; grep before reading; read big docs by section (grep headings, then offset/limit).
4. `TASK.md` / `TASK.archive.md` are one person's local, gitignored scratch. Don't depend on them or commit them.

## Run / verify
- Start: `cmd //c "start /B C:\\xampp\\mysql_start.bat"` and `apache_start.bat` (Git Bash).
- API tests: `cd tests/api && npm test` (~40-80 s, needs MySQL not Apache). Builds scratch `ams_test` from `SetupDB.sql` + `seed_mock_data.sql`, reloads per file, `php -S` :8091 with `AMS_TEST_MODE=1` (config.php then refuses any DB not named `*_test`, so dev `ams_db` is never touched; SMS/email off). `KEEP_TEST_DB=1` keeps it. Run after backend changes; add a test with each endpoint fix (fixtures via `lib/db.js`, dates relative to today). Details: `docs/documentation/api_testing.md`.
- Frontend: `cd ams-react && npm run build:local` = the `dist/` XAMPP serves (no frontend test runner). `build:selfhosted` uses gitignored `.env.selfhosted`; the build guard rejects localhost URLs in production builds.
- PHP lint: `/c/xampp/php/php.exe -l <file>`. Lint files, not a pipe (stdin truncates large files and reports a false parse error).
- Env: backend reads `config.env.php` → env vars (`DB_*`, `APP_ENV`, `APP_URL`, `APP_TIMEZONE`, `ALLOWED_ORIGINS`). CORS in `backend/cors.php` via `config.php` (four chat endpoints still send their own `*` first, see security_audit §6e). Deploy: `docs/deployment/dual-deployment-environment-plan.md`; check `php backend/cron/check_environment.php`.
- DB reset: drop/recreate `ams_db`, import `backend/api/migrations/SetupDB.sql` then `seeds/seed_mock_data.sql`, always with `mysql --default-character-set=utf8mb4` (the Windows client default stores ₱ and other non-ASCII text corrupted). `SetupDB.sql` hardcodes `USE ams_db`: for a scratch DB `sed` the name first or it wipes dev. Never run `seed_mock_data.sql` on prod (use local gitignored `seed_prod_demo.sql`).
- Snapshot dev `ams_db` (mysqldump into the gitignored `.db-snapshots/`) before any live API test that writes data or any migration. Claude Code users: `/db-snapshot`.
- Seed/test emails are `@demo.example` only, never real addresses. `DEVICE_OTP_BYPASS_DOMAINS=demo.example` (in `config.env.php`, set by the test harness) makes those accounts skip the device OTP outside production. Admin stays `admin@gmail.com` until the real owner account replaces it.
- Live checks: curl with a Bearer token; recipes and seed accounts in `docs/documentation/module_verification_guide.md` §3.2 / §1.4 (`admin@gmail.com` / `admin123`; login body key is `email_address`).

## Backend conventions (`backend/config.php`)
- Identity only from the session: `require_admin`, `require_user`, `require_owner_or_admin` (`X-User-Id`/`X-Admin-Id` are overwritten; never trust request ids).
- Prepared statements for all request input.
- Writes call `log_activity($conn, $id, <LOG_CATEGORIES value>, 'Title Case Action', $details)`.
- Notify via `create_notification()`; admin queue via `notify_admins_queue()` / `resolve_admin_queue()` (only queue rows are `'Pending'`).
- "Still owed" = `BILLING_OPEN_STATUSES` / `billing_open_status_sql()` and the balance `total_amount - amount_paid` (`invoice_balance_cents()`), not the total. In SQL use `invoice_balance_sql()` + `invoice_owed_where_sql()` (open statuses, advance rent excluded); in JSX `invoiceOwed()` from `utils/invoiceBalance.js`. Charges onto invoices: `post_invoice_charge($conn, 'service'|'maintenance'|'parking', $id)` / `reverse_invoice_charge()` (claim-first, backs out the posted `invoiced_amount`). Application status: only `transition_application()` / `archive_application()` / `restore_application()` write it (`APPLICATION_TRANSITIONS`), with `release_application_holds()` for a cancelled / rejected application. Plain settings: one row in `ams-react/src/config/settingsSchema.js` + one rule in `update_system_settings.php` `$SETTING_RULES`.
- Frontend API calls only via `ams-react/src/api/axiosConfig.js` (exception: chat's socket.io-client in `context/ChatContext.jsx`); uploads via `src/api/fileUrl.js`; new routes in `App.jsx` with the right guard.
- User-facing text says "rent", never "lease".
- **Migrations**: new idempotent `YYYY_MM_name.sql` in `backend/api/migrations/`, mirrored into `SetupDB.sql` and seeds. `cron/migrate.php` runs pending ones (prod = MySQL 8; strips `IF NOT EXISTS`, one statement at a time). Prefer `information_schema` + `PREPARE` guards (pattern `2026_10_prod_schema_repair.sql`); no `DELIMITER`. Once on prod everywhere, delete the file (SetupDB has it; git keeps history). Never merge or rename a migration prod already applied (tracked by filename).
- **Before committing to main, merge the workstream's not-yet-on-prod migrations into one file** (concatenate under `-- ===== name =====` headers, delete the per-feature files, fix references, test twice on a DB built from the previous `SetupDB.sql`).
- **Apply every schema change to dev `ams_db` yourself, same task.** Dev was built from `SetupDB.sql`, so `schema_migrations` lacks the old files and `migrate.php` would re-run them (some change data). Snapshot first, run only your file (`/c/xampp/mysql/bin/mysql -u root ams_db < <file>`), `INSERT INTO schema_migrations (migration_name) VALUES ('<file>')` only if not listed, confirm with `SHOW TABLES` / `DESCRIBE`. Not done until `ams_db` has it and `npm run build:local` was run.

## Documentation update rules (every change, same commit as the code)
Docs are part of the deliverable. Before finishing, find every row below your change touches and update that doc. Edit the existing section instead of appending a duplicate, match the doc's format, use `YYYY-MM-DD` dates. If code and a doc disagree, the code wins: fix the doc.

| If you change… | Update |
|---|---|
| **Any commit or task** | `SPRINT.md`: add a row, or update the existing one (Task, Category, Description, Status = Done / In progress / Open / Blocked, Priority, Start, End). Open rows have no end date. Put it in the table for the current period. |
| Feature behaviour or workflow | `docs/features/<feature>_design.md` (chat, payment_system, service_management, move_in_move_out, inquiry_reservation, mobile_responsive …) and the rows + counts in `docs/features/panelist_feature_checklist.md` |
| Database tables, columns, indexes, enums | `docs/documentation/database_schema.md` (plus `SetupDB.sql`, seeds and the migration, see Backend conventions) |
| API endpoint added or changed (params, response, auth, errors) | `docs/documentation/api_documentation.md`; test notes in `api_testing.md` |
| Architecture, modules, data flow, roles | `docs/documentation/system_design.md` and the Mermaid diagrams in `docs/documentation/system_diagrams.md` |
| An audited module or its tests | `docs/documentation/module_verification_guide.md` (section per §2 template, test IDs `M<module>-NN`) |
| Deployment, env vars, CI/CD, backup | `docs/deployment/*` (`environment_config.md`, `cicd_pipeline.md`, `backup_and_restore.md`, …) |
| SMS / email / third-party services | `docs/features/sms_email_implementation.md`, `docs/documentation/external_services.md` |
| Security finding or fix | `docs/audits/security_audit.md` |
| Backlog (new or finished open work) | `docs/planning/todo.md` (move finished items to Recently Completed) |
| A command, env var, folder or convention in this guide | `AGENTS.md` (and `README.md` if user-facing) |

`docs/planning/progress_report.md` is tracked and refreshed per milestone; `docs/planning/AMS_Development_Timeline.xlsx` is gitignored. If your change makes `api_documentation.md` wrong, fix the affected section.
- Say which docs you updated in the commit body under **Docs**. If you could not update one, say so in your final message.

## Docs map (authoritative first)
- Folders (nothing loose in `docs/`): `documentation/` (schema, API, design, testing guides) · `features/` (per-feature designs, checklist) · `deployment/` (env, CI/CD, backup, PayMongo, hooks) · `audits/` (security_audit and dated audits) · `planning/` (`todo.md` = live backlog, `archive/` = old backlogs, local progress files).
- `docs/features/panelist_feature_checklist.md` scope/status · `docs/documentation/module_verification_guide.md` audited modules (contract, workflow, tests) · `api_testing.md` the suite · `database_schema.md`, `system_design.md`, `system_diagrams.md` · `docs/features/sms_email_implementation.md` (+ `sms_email_mock_testing.md`) · `chat_design.md` ("As built" first) · `docs/deployment/*` · `docs/documentation/claude_code_guide.md` (Claude hooks, permissions).
- Possibly stale: `api_documentation.md` (spot-checked 2026-11-06; new endpoints are in its §15).

## Workflow rules
- Git: everything goes straight to `main`, no feature branches or required PRs.
- **Never commit on your own**, even if a plan lists per-phase commits: the user tests first. Leave changes uncommitted and draft the message(s). **One commit per feature or task** (a feature, a fix, a refactor...), never one per area: the code, tests and docs of that feature go in the same commit. Title is `type(scope): what it does` (`feat`, `fix`, `refactor`, `style`, `docs`, `chore`); the body lists the work under **Backend / Frontend / Docs** headings (omit an empty one). A file shared by several features (`config.php`, `i18n.js`) is split with `git add -p`; list the files per commit and flag unrelated changes to leave out. Commit only when told; never push unless told.
- **Run the CI checks before drafting a commit message** (`.github/workflows/ci.yml` runs on push to main). Fix failures, say which you could not run:
  - Frontend: `cd ams-react && npm run lint && npm run build` (CI uses `build`; build does not cover lint).
  - PHP: `php -l` on **every** `backend/**/*.php`; `phpstan analyse --configuration=phpstan.neon --no-progress` if installed (CI PHP 8.2, local 8.0).
  - Schema: on a scratch DB (never `ams_db`) import `SetupDB.sql`, `seeds/seed_mock_data.sql`, `seed_reset.sql`, re-seed, `clear_and_seed.sql`, then every `backend/api/migrations/[0-9]*.sql` (CI MariaDB 10.11). Asserts: ≥13 users after seed, 1 after reset, 14 rooms after `clear_and_seed`. Mirror schema/seed/migration changes so this passes.
  - Smoke: on the seeded DB `get_system_settings.php`, `get_rooms.php`, `get_service_catalog.php` return 200, and admin login's `sessionToken` works on `dashboard_stats.php` (`npm test` covers this).
  - CI overwrites `config.env.php`: depend on no local config, gitignored files or `ams_db` state.
- Plans open with a short **TL;DR** (few one-line bullets: what changes and why).
- Prefer small edits over full-file rewrites. On big/shared CRLF files (`config.php`) never script find-and-replace; `php -l` right after.
- Verify proportionately: `php -l` on changed PHP, `npm run build` for JSX, curl only the rows that prove the fix.
- **Self-review `git diff` before saying "done"** (the suite covers only some endpoints, no UI). Check, and fix first:
  - Empty vs zero: `||`/falsy checks where `0` is valid (use `??` / `=== 0`); a field missing from an input or webhook.
  - Concurrency: two tabs/admins, stale edit after the row changed (`FOR UPDATE`, re-check state; `affected_rows` is 0 for unchanged rows), double submit.
  - Order of effects: work after `commit()` that can throw; files written/deleted before the DB write succeeds; failure reported for something already saved.
  - Queries in loops: no DB/settings read per row; on list endpoints compare `SHOW GLOBAL STATUS LIKE 'Questions'` before/after (prod pays a round trip per query).
  - Blast radius: grep other callers of any shared function, parameter or column changed; mirror seeds and `SetupDB.sql`.
  - Then test one negative, one edge (boundary/zero/missing) and one stale-state case live.
- Before stopping: update `SPRINT.md` (and the docs table above). Start a new session after a workstream is committed or when switching tasks.

## Panel audit routine (one checklist area at a time)
Read the area's checklist rows → audit endpoints + pages → fix → verify live (restore DB) → add the module's section to the verification guide (§2 template; test IDs `M<module>-NN`) → update checklist rows, detail table and counts.
