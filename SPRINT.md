# AMS — Sprint task table

Project window: 2026-06-30 (first commit) → 2026-11-01. Built from `TASK.md` and the full git history (430+ commits); dates are commit dates. Open items have no end date. Phases before 2026-10-13 are summarised from commit messages, grouped by feature.

**Status:** Done = committed · In progress = built, browser checks or commit pending · Open = not started · Blocked = needs prod access or the operator.
**Priority:** High = prod risk, data loss, CI, core flow · Medium = verification and UX gaps · Low = deferred or nice to have.
**Category:** Feature · Bug fix · Test (incl. browser checks) · Chore · Docs · Database · Security · DevOps/CI · UI/UX · Accessibility.

## Done — foundation and first build (Jun 30 – Jul 26)

| # | Task | Category | Description | Status | Priority | Start | End |
|---|------|----------|-------------|--------|----------|-------|-----|
| 1 | Project setup | Chore | React + Vite app, Tailwind, global styles, guest/user routing and layouts, base Services page | Done | High | 2026-06-30 | 2026-07-01 |
| 2 | Accounts and login | Feature | Registration, login API, error handling, profile settings, change password, admin redirect, middle name/suffix | Done | High | 2026-07-01 | 2026-07-07 |
| 3 | Tenant pages, first build | Feature | Rent application with file uploads, parking, CCTV and maintenance requests, PayBills, MyRoom, room preview modal | Done | High | 2026-07-02 | 2026-07-07 |
| 4 | Admin panel, first build | Feature | Dashboard, tenants, units, payments, maintenance, services, reports, admin settings, notifications (mock data first) | Done | High | 2026-07-02 | 2026-07-11 |
| 5 | Core database and backend | Database | Users and rent_applications schema, initial admin user, tenants and documents APIs, tenant archiving, ViewContract | Done | High | 2026-07-07 | 2026-07-13 |
| 6 | Priority 1-9 backend wave | Feature | Structural migrations, payments and contracts APIs, observability, admin security, tenant self-service pages, live dashboard and reports | Done | High | 2026-07-15 | 2026-07-15 |
| 7 | Rent application pipeline | Feature | Access limited to active renters, application tracking, admin pipeline, rejection reasons and resubmission, initial payment before active tenancy | Done | High | 2026-07-17 | 2026-07-19 |
| 8 | Wire pages to the database | Feature | Maintenance, services, reports, vacant rooms in Preview, payment proof upload (GCash, bank), occupant sync, SetupDB consolidated, mock seed | Done | High | 2026-07-18 | 2026-07-21 |
| 9 | Rent rules and PRD | Docs | Product requirements doc, contract language options, surcharges and late fees, duplicate-application block, audit cleanups | Done | Medium | 2026-07-26 | 2026-07-26 |

## Done — features and hardening (Aug 6 – Sep 30)

| # | Task | Category | Description | Status | Priority | Start | End |
|---|------|----------|-------------|--------|----------|-------|-----|
| 10 | Activity logs and archive | Feature | Admin activity log page (filter, search, paging), signed document viewing, user and tenant archiving | Done | Medium | 2026-08-06 | 2026-08-09 |
| 11 | Admin dashboard KPIs | Feature | KPI overhaul, cash flow chart, operational command center, dead code and mock engines pruned | Done | Medium | 2026-08-09 | 2026-08-09 |
| 12 | Documentation set | Docs | System design, chat design, notification and SMS/email research, panelist feature checklist, deployment guide, README | Done | Medium | 2026-08-11 | 2026-08-27 |
| 13 | Move-out and receipts | Feature | 15-30 day notice, clearance modal, official receipts, deposit tracking, extension requests, unit monitoring, income and revenue reports | Done | High | 2026-08-13 | 2026-08-19 |
| 14 | Mobile responsiveness | UI/UX | Responsive user and admin layouts, sidebar and navigation fixes | Done | Medium | 2026-08-24 | 2026-08-24 |
| 15 | Visitor management | Feature | Visitor log, government ID photo and number, required check-in time, expected check-out, preset notes | Done | Medium | 2026-08-24 | 2026-09-28 |
| 16 | English/Filipino toggle | Feature | Language toggle and translated user pages | Done | Medium | 2026-08-25 | 2026-08-27 |
| 17 | Payment channels and PayMongo | Feature | Dynamic channels and schedules, PayMongo gateway and sandbox, manual/sandbox-only mode | Done | High | 2026-08-26 | 2026-09-01 |
| 18 | Notifications, contracts, password reset | Feature | In-app notifications with audience, contract generation (module 9), lease extension fix, secure password reset | Done | High | 2026-09-01 | 2026-09-02 |
| 19 | Security hardening | Security | Input validation, upload MIME checks, admin guards, server-side session-token auth, secured tenant endpoints | Done | High | 2026-09-02 | 2026-09-11 |
| 20 | Real-time chat | Feature | Socket.IO messaging and typing, unread counts, admin messaging, attachments, replies, search, connection status | Done | High | 2026-09-02 | 2026-09-30 |
| 21 | Utilities module | Feature | Meter readings, other fees, invoice sync, consumption and financial reports | Done | High | 2026-09-03 | 2026-09-04 |
| 22 | Billing reminders | Feature | Due date reminders, overdue alerts, completed migrations cleaned | Done | Medium | 2026-09-04 | 2026-09-04 |
| 23 | Inquiries, services billing, parking | Feature | Inquiry and reservation workflow, service management and billing, configurable parking policies | Done | Medium | 2026-09-06 | 2026-09-09 |
| 24 | Contract lifecycle | Feature | Draft lifecycle, landlord settings, auto-expiry, renewal audit trail, eviction monitoring | Done | High | 2026-09-10 | 2026-09-10 |
| 25 | CI and deployment | DevOps/CI | Non-blocking frontend and backend checks, schema/seed/smoke jobs, PHPStan, dual deployment targets, CI/CD and DB docs | Done | High | 2026-09-09 | 2026-09-17 |
| 26 | Password policy and household | Feature | Password policy, household roster, room preview mode, expenses, 1F/2F = 4 rooms and 3F = 6 rooms | Done | Medium | 2026-09-16 | 2026-09-17 |
| 27 | Animation and icon polish | UI/UX | Animation system across user and admin pages, mobile polish, Lucide icons replace FontAwesome | Done | Low | 2026-09-20 | 2026-09-25 |
| 28 | Extension billing and showcase images | Feature | Bill extension months immediately, admin-managed showcase images for unit preview | Done | Medium | 2026-09-20 | 2026-09-20 |
| 29 | SMS and email | Feature | Mock drivers, Semaphore SMS driver, SMTP/PHPMailer, templates within Semaphore rules, announcement channels, app timezone | Done | High | 2026-09-22 | 2026-09-30 |
| 30 | Settings tabs | UI/UX | Admin settings split into side tabs, Semaphore controls | Done | Low | 2026-09-24 | 2026-09-24 |
| 31 | Form validation pass | Feature | Shared validation utilities, field-level errors and submit guards on every form, +63 phone numbers | Done | High | 2026-09-25 | 2026-09-27 |
| 32 | Billing flow rework | Feature | Payment confirmation loop, rent from tenancy start, advance payments, advance credits, past-due period, combined payments | Done | High | 2026-09-26 | 2026-09-30 |
| 33 | Application workflow notices | Feature | Archive notifications, cancel and resubmit applications, rejection attachments, admin notices | Done | Medium | 2026-09-29 | 2026-09-30 |

## Done — October and November (Oct 3 – Nov 1)

| # | Task | Category | Description | Status | Priority | Start | End |
|---|------|----------|-------------|--------|----------|-------|-----|
| 34 | Migration runner and contract templates | DevOps/CI | `migrate.php` runner and post-merge hook, contract template versioning, room archiving | Done | High | 2026-10-03 | 2026-10-03 |
| 35 | Bank transfer and split payment | Feature | Bank transfer support, transaction logging, split payment validation and UI, invoice breakdown | Done | High | 2026-10-03 | 2026-10-03 |
| 36 | Responsive admin and house rules | UI/UX | Admin drawer, phone cards, touch targets; house rules modal with Filipino translations; document preview modals | Done | Medium | 2026-10-05 | 2026-10-08 |
| 37 | Extensions, e-signatures, panelist gaps | Feature | Extension rules, holdover billing, e-signature upload, refund workflow, per-floor rent, utility bill proofs, children and pets rules | Done | High | 2026-10-11 | 2026-10-12 |
| 38 | Defense gaps pass | Bug fix | Scenario seed, refunds on rejected applications, payment window, utility total-only record, "Rent" wording sweep, combined receipt (`2df20b1`…`f1eab6c`) | Done | High | 2026-10-13 | 2026-10-13 |
| 39 | Known bugs pass | Bug fix | Failed-payment webhook, payment notices, extension range, atomic settings save, announcement drafts (`ac84a72`) | Done | High | 2026-10-15 | 2026-10-15 |
| 40 | API test suite | Test | Vitest + scratch `ams_test` DB, `php -S` server, test-mode guard, docs (`374307f`…`8c82ed3`) | Done | High | 2026-10-15 | 2026-10-16 |
| 41 | Rules and gallery | Feature | House, children/pets and parking rules shown together; gallery photo alt text and display size (`d2c1e80`, `95a0862`) | Done | Medium | 2026-10-16 | 2026-10-16 |
| 42 | Guest inquiry chat | Feature | Guest messaging, unread count, admin bell, header-only token (`28e2401`…`fef69d3`) | Done | Medium | 2026-10-18 | 2026-10-19 |
| 43 | Tenant split payment | Feature | Tenant split payment; desk clears only after the tenant acts (`b2c61c7`) | Done | Medium | 2026-10-19 | 2026-10-19 |
| 44 | Manager interview alignment, phases 1-5 | Feature | Admin-defined application documents, children rule per floor, provider-bill utilities, itemized deposit deductions, installment ledger (`88621d0`…`13033c7`) | Done | High | 2026-10-19 | 2026-10-20 |
| 45 | Invoice adjustment history + reused reference | Feature | Reason-required adjustments with history; duplicate payment-reference policy; indexed `reference_norm` (`f906f6a`) | Done | High | 2026-10-25 | 2026-10-26 |
| 46 | CI blockers | DevOps/CI | Idempotent migrations, 12 ESLint errors fixed, backup runbook, checklist counts (`93e69d1`) | Done | High | 2026-10-26 | 2026-10-26 |
| 47 | Tenant UI/UX passes A-D | UI/UX | Correct amounts and dates, dialogs and keyboard access, text/contrast/targets, English/Filipino on remaining pages (`9ca73df`…`debb28c`) | Done | Medium | 2026-10-26 | 2026-10-27 |
| 48 | Parking guards, demo seed, DB audit | Database | Parking slot guards on MySQL 8, full-coverage demo seed, legacy document columns dropped (`478dd3b`, `bbbcc91`, `3ff44df`) | Done | High | 2026-10-27 | 2026-10-28 |
| 49 | Admin a11y + money owed | Accessibility | Keyboard access, labels, focus, contrast; advance rent no longer counted as owed (`5fc7241`, `ca775b6`) | Done | High | 2026-10-28 | 2026-10-28 |
| 50 | Admin UI rounds 1-4 | UI/UX | Task-grouped sidebar, shared StatCard and Modal, type scale, needs-attention list, honest load failures, settings separation, move-in modal (`0ba4eb1`…`4b219a6`) | Done | Medium | 2026-10-28 | 2026-10-30 |
| 51 | Services portal and appearance customizer | Feature | Redesigned resident services portal, admin appearance customizer (`bce03c6`, `263eebf`) | Done | Medium | 2026-10-31 | 2026-11-01 |
| 52 | Glass Mode photos and Home Page text | Feature | Glass Mode keeps the last 6 photos; Home Page text tab in Settings (`39383c5`, `2f45185`) | Done | Low | 2026-11-01 | 2026-11-01 |
| 53 | Preview rooms-first layout | UI/UX | Rooms-first layout, whole-building photo, footer padding (`b1be3f9`) | Done | Low | 2026-10-31 | 2026-10-31 |
| 54 | Repo cleanup and public image serving | Chore | Stop tracking node_modules, websocket `.env` and stray upload; chat server setup docs; public file serving for images (`1e5a95e`, `8472e50`) | Done | Medium | 2026-10-31 | 2026-11-01 |
| 55 | Manager interview comparison, README refresh, Claude settings | Docs | Manager interview comparison doc (Q1-Q26), README rewritten against current code, `.claude/settings.json` permissions, this sprint table | Done | Medium | 2026-10-19 | 2026-11-01 |
| 91 | CCTV request rework | Feature | Incident-only requests (type, 20+ character description for "other", footage window), Settings → CCTV tab (locations, incident types, window, shortest reason), admin details modal, required decision note shown to the tenant in the notification and My Requests | Done | Medium | 2026-11-02 | 2026-11-02 |
| 92 | Terms clause, scheduled announcements, extension conflicts | Feature | Terms of Service "Maintenance and repairs" section (EN/FIL); announcements can be scheduled and are sent by a sweep (edit, send now, back to draft); a rent extension is refused while another applicant wants the unit, with an admin override that notifies them | In progress | Medium | 2026-11-03 | — |
| 90 | CCTV footage link or file | Feature | Admin attaches a short clip (up to 25 MB) or a private https link to an Approved request; the tenant opens it from My Requests; session-checked, tenant opens logged, auto-deleted after an admin-set number of days (default 14) | Done | Medium | 2026-11-03 | 2026-11-03 |
| 93 | Docs reorganised and refreshed | Docs | `docs/` root emptied into `planning/`, `audits/`, `deployment/`, `documentation/` (one live backlog `planning/todo.md`, old `todo.md` archived); `database_schema.md` now covers all 49 tables and the 2026-11 columns; new `features/tenant_pages.md`; dropped Railway/SaaS material trimmed from five deploy docs, and six obsolete docs deleted; tenant sections of the service, move-in, payment, chat and mobile docs updated | Done | Medium | 2026-11-06 | 2026-11-06 |

## In progress

| # | Task | Category | Description | Status | Priority | Start | End |
|---|------|----------|-------------|--------|----------|-------|-----|
| 56 | Browser check: admin pages | Test | Skip link and Tab order on a phone, contract download in a real print dialog, contrast on Reports/Units, advance-only invoice, Messages media viewer | In progress | Medium | 2026-10-28 | — |
| 57 | Browser check: admin round 3-4 refactors | Test | Contract editor, admin messages search, announcements attachments, top bar notices | In progress | Medium | 2026-10-26 | — |
| 58 | Browser check: payments | Test | Adjust modal reason and history, Reports "Adjust Existing", Settings payments policy, amber reuse badge | In progress | Medium | 2026-10-25 | — |
| 59 | Browser check: tenant passes A-D | Test | 375px on each page, English/Filipino switch, dialogs, Visitors cards, contrast on dark panels, Services/Parking with Apache stopped | In progress | Medium | 2026-10-26 | — |
| 60 | Browser check: phases 1-5 | Test | Application requirements, minors floors, provider-bill entry, move-out deductions, part-payments, Units occupancy history | In progress | Medium | 2026-10-19 | — |
| 61 | Print preview check | Test | Real print preview of Reports and a contract (only the receipt was checked with print stubbed) | In progress | Low | 2026-10-30 | — |
| 62 | Merge migrations before commit | Chore | Fold the workstream's not-yet-on-prod migrations into one file (CLAUDE.md rule) | In progress | High | 2026-10-27 | — |
| 63 | Site Maintenance settings | Feature | Settings → Other Settings → Site Maintenance: owner details and GCash/bank accounts saved as a contract version; Reports invoice header and Pay Bills account use them. Uncommitted | In progress | Medium | 2026-10-31 | — |
| 64 | Per-field server validation | Feature | `validation_fail` + `v_*` helpers in config.php on 16 endpoints, `input_validation.test.js`. Uncommitted | In progress | Medium | 2026-10-31 | — |
| 65 | Inquiries as chat (guest thread) | Feature | Emailed one-time links (`guest_chat_resume.php`, `guest_chat_links`), reply emails, end chat on this device, verified labels, token leak closed (#25). Uncommitted | In progress | Medium | 2026-10-31 | — |
| 66 | Browser pass fixes | Bug fix | Refund pages reload after a refused action, visitor walk-in dialog cut off on short screens, ReasonModal shows the server reason. Uncommitted | In progress | Medium | 2026-10-31 | — |
| 94 | Language switch in the account menu, admin on/off | Feature | Signed-in users pick English / Filipino in the account menu (guests keep it on the bar); Other Settings → Language hides the switch everywhere and shows English (`language_switch_enabled`) (`13312f8`) | Done | Low | 2026-11-06 | 2026-11-06 |
| 95 | QR Ph crop and 3 slots | Feature | Payment Options: a picked QR image opens a square cropper (drag, zoom, arrow keys; crop or upload as is); 3 slots instead of 5 (`QRPH_SLOT_COUNT`), older slot data trimmed on save, checkout falls back to slot 1. Uncommitted | In progress | Medium | 2026-11-06 | — |
| 96 | Payment History and My Refunds polish | UI/UX | Skeleton loading, sections rise in, cancelled bills (and My Requests' closed list) get a turning chevron and fade in | In progress | Low | 2026-11-06 | — |
| 97 | Announcements on the TopBar | UI/UX | Tenant TopBar link; the Announcements card is gone from Services and from the admin Services page | In progress | Low | 2026-11-06 | — |
| 98 | Service appearance icon grid scroll | Bug fix | Admin Customize Look dialog: the icon grid had its own scroll box inside the scrolling dialog; now only the dialog scrolls | In progress | Low | 2026-11-06 | — |
| 99 | Inquiry page polish | UI/UX | No emoji in the heading or the phone rules summary, chevron on "Continue your conversation" and the phone rules card, skeleton for the house rules and unit list, sections rise in | In progress | Low | 2026-11-07 | — |

## Open

| # | Task | Category | Description | Status | Priority | Start | End |
|---|------|----------|-------------|--------|----------|-------|-----|
| 67 | Screen-reader pass | Accessibility | Not done on admin or tenant pages | Open | Medium | — | — |
| 68 | Pay Bills banner stacking | Bug fix | Banners stack badly; not done from the tenant review | Open | Low | — | — |
| 69 | Preview page layout | UI/UX | Viewport-locked list and hero | Open | Low | — | — |
| 70 | Application status badge case | Bug fix | Applications shows `archived` lowercase (data value) | Open | Low | — | — |
| 71 | Translate shared strings | Feature | Validation templates, refund labels, relative time, server messages | Open | Low | — | — |
| 72 | Notification queue drain bug | Bug fix | Scheduled "AMS Notification Queue" task can drain a job through the `log` driver while the selftest has drivers switched | Open | Medium | — | — |
| 73 | Payments phase 3 | Feature | Move-out disposition as payments plus balance invoice, proration, advance refund payout | Open | Medium | — | — |
| 74 | SMS delivery | Feature | Rent-due/overdue SMS needs admin contact number, scheduled task, sender approval | Open | Low | — | — |
| 75 | English-only strings | Feature | About 150 across PayBills, UserPaymentHistory, TopBar | Open | Low | — | — |
| 76 | More API tests | Test | KB-B22 send rollback, KB-D01/D02 parallel sends, KB-F06 rooms query count, KB-E07 attachment visibility; then React Testing Library / Playwright | Open | Low | — | — |
| 77 | Receipts for part-payments | Feature | An installment has no tenant receipt until the bill is fully paid | Open | Medium | — | — |
| 78 | Advance rent shown overdue in Payment History | Bug fix | "To pay across N bills" counts an unpaid advance invoice and marks it Overdue; admin side excludes it | Open | Medium | — | — |
| 79 | Bank option for "paid outside the system" | Feature | UserUtilities offers GCash / Maya / Other only, no bank picker | Open | Low | — | — |
| 80 | Seed floor rates | Chore | `floor_rates` ships as `{}`; manager rates 1F/2F ₱4,000, 3F ₱3,500 | Open | Medium | — | — |
| 81 | CI "Apply upgrade migrations" fails at HEAD | DevOps/CI | `2026_10_add_reference_norm_and_tables.sql` (duplicate column) and `2026_10_deployed_server_sync.sql` (needs `schema_migrations`), both from `9fbf1ef` | Open | High | 2026-10-30 | — |
| 82 | Hash the guest chat token | Security | Store `guest_token` hashed | Open | Low | — | — |
| 83 | Contract editor saved-time bug | Bug fix | "Saved <time> by You" formats a UTC timestamp as local time | Open | Low | — | — |

## Blocked (prod / operator)

| # | Task | Category | Description | Status | Priority | Start | End |
|---|------|----------|-------------|--------|----------|-------|-----|
| 84 | Prod migration run | DevOps/CI | Push `main`, run `php backend/cron/migrate.php`. Restore prod `invoices` first or 7 payment rows are deleted | Blocked | High | 2026-10-27 | — |
| 85 | Prod reset and demo seed | Database | Dump, migrate, `seed_prod_demo_reset.sql`, wipe, `seed_demo_full.sql` | Blocked | High | 2026-10-27 | — |
| 86 | MySQL 8 check of `reference_norm` | Test | Watch the first prod run of the generated column; `SHOW CREATE TABLE invoices` and a spot check | Blocked | High | 2026-10-25 | — |
| 87 | Backup schedule and restore drill | DevOps/CI | Operator schedules the nightly job and records the first restore drill (`backup_and_restore.md` §7) | Blocked | High | 2026-10-26 | — |
| 88 | Prod config cleanup | Chore | Check `parking_monthly_fee` = 301, rotate the SMTP app password, delete `test.txt` (prod dump) | Blocked | High | 2026-10-27 | — |
| 89 | Email on for guest chat links | DevOps/CI | Emailed links need Settings → Notifications email ON and SMTP on prod; dev ships with email off | Blocked | Medium | 2026-10-31 | — |
