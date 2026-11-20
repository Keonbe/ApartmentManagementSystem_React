# One-page cheat sheet

Written for: the student presenting. Print this on one page. Numbers checked on 2026-11-18. **Rerun both test suites on the morning of the defense and update the test lines.**

## Numbers

| What | Number | Where it comes from |
|---|---|---|
| Project window | 2026-06-30 to 2026-11-18, about 20 weeks | `git log`, `SPRINT.md` |
| Commits | 583 on `main` | `git rev-list --count HEAD` |
| PHP files in `backend/api/` | 168 | `ls backend/api/*.php` |
| HTTP endpoints | 163 (168 minus 1 helper and 4 CLI-only scripts) | `api_documentation.md` header |
| Database tables | 52 (no views, triggers or events) | `SetupDB.sql` |
| Routes in `App.jsx` | 56 (10 public, 7 any signed-in, 13 tenant, 26 admin) | `App.jsx` |
| Pages | 53 (25 admin, 28 tenant and public) | `ams-react/src/AdminPages`, `UserPages` |
| Database roles | 2: `user` and `admin` | `users.role`, `manage_users.php` |
| Activity-log categories | 12 | `LOG_CATEGORIES` in `config.php` |
| Feature checklist | 12 modules, 100 rows, 96 done, 4 partial | `panelist_feature_checklist.md` |
| Partial rows | 6.6 email, 6.7 SMS, 7.1 and 7.6 chat gaps | same |
| API tests | 2,074 in 100 files (2,071 pass, 3 fail on 2026-11-18) | `tests/api`; takes about 11 min |
| Frontend tests | 41 in 6 files, all pass | `cd ams-react && npm test` |
| Seed | 15 demo tenants plus the admin, 14 rooms | `seed_mock_data.sql` |
| Max advance rent | 6 months | `ADVANCE_PAYMENT_MAX_MONTHS` |
| Rent invoice lead time | 7 days | `RENT_INVOICE_LEAD_DAYS` |
| Move-out notice | 15 to 30 days (admin-configurable) | `SetupDB.sql` settings |
| Session life | 7 days | `create_session()` |
| Login throttle | 5 failures per account, 20 per IP, per 15 min | `security_audit.md` A-9 |

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite 8, React Router 7, Tailwind 4 (single-page app) |
| Backend | Plain PHP 8.0, no framework, `mysqli` with prepared statements; shared rules in `backend/config.php` |
| Database | MariaDB 10.4 locally (MySQL 8 in production); 52 tables |
| Real-time chat | Node.js Socket.IO relay on port 3001 (`websocket-server/server.js`); messages saved by PHP |
| Payments | PayMongo (sandbox) plus manual cash, GCash, bank and QR Ph |
| Notifications | In-app first; SMS via Semaphore (live driver, not yet live-verified); email on a dry-run log driver; queue with retries |
| Hosting | Apache on XAMPP, port 8080; cloud deployment documented, not live |
| CI | GitHub Actions: lint, tests, build, PHP lint and PHPStan, schema check on MariaDB 10.11, API suite, `npm`/`composer audit`, gitleaks |

## The 10 sentences you must say without notes

1. "AMS is a web system for one small apartment building: it handles applications, rent, deposits, repairs, services, visitors and chat in one place."
2. "There are only two database roles, tenant and admin; guest, applicant and tenant come from the application's status."
3. "Identity comes only from the server session; any user id the browser sends is overwritten."
4. "All payments, from the desk or from the PayMongo webhook, end in one settlement function with row locks, so there is one set of money rules."
5. "A tenant's balance is calculated the same way everywhere, in whole centavos, and a month's rent can't be billed twice because the database has a unique key."
6. "An application can't be approved until its documents are verified, and an unpaid approval lapses and frees the room."
7. "At move-out the deposit is settled by itemized lines in one locked transaction, and any shortfall becomes an invoice. We cannot force collection after the tenant leaves."
8. "We audited security in writing, fixed the serious findings, and list the open ones ourselves: the default admin password, unhashed session tokens, and missing security headers."
9. "The API suite has 2,074 tests on a scratch database that can't touch dev data; three currently fail and I know where." *(update after rerunning)*
10. "We have no user acceptance data yet. The usability kit is ready, and running it is the first thing I would do next."

## If you only remember five things in Q&A

1. Say "I haven't measured that" instead of guessing.
2. When docs and code disagreed, the code was trusted and the docs were fixed (commit `37aea84`).
3. Open findings: A-1 (admin password, admin OTP skip), L3 (plain session tokens), C-4/E-2/E-3/E-4 (headers), A-3 (root DB user), D-8 (error text).
4. Limits you chose: one property, no accounting, no proration (DE-1 to DE-10). Limits you can't fix: collection after move-out, refund payouts outside, SMS and email going live (LI-1 to LI-13).
5. If a demo step fails, switch to the recording. Don't debug live.

## Morning-of checklist

- [ ] Rerun `cd tests/api && npm test` (use cmd with an uppercase `C:` drive, see memory note) and `cd ams-react && npm test`; update the test lines here and in slides 15 and 16.
- [ ] Snapshot dev (`/db-snapshot save`), load the defense scenarios, run `npm run build:local`.
- [ ] Log in once as admin and as `maria.santos@demo.example`; confirm no login-code prompt.
- [ ] Screenshots and the recording are on the desktop.
- [ ] `docs/audits/2026-11-18_defense_qa_prep.md` read once more, especially the five weakest answers.
