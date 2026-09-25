# AMS — SMS & Email Notification Implementation Guide

> **Version:** 1.3 — Phase 1 built on mock drivers **2026-09-22**; §0.1 findings implemented the same day; audited against the codebase on 2026-09-20 (commit `8352371`)
> **Status:** Phase 1 built and console-tested on mock drivers — see [§1.0](#10-what-phase-1-shipped) and the [mock testing runbook](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/sms_email_mock_testing.md). Phase 2 wiring is next.
> **Prerequisite:** none for the dry run. A provider account is needed only to go live (see [Appendix C](#appendix-c--provider-setup)).
> **Closes:** Panelist checklist items **4.10** (🔧), **6.6** (📋), **6.7** (📋); extends **6.8**

---

## Table of Contents

- [§0 Pre-Implementation Review](#0-pre-implementation-review)
  - [0.1 Compatibility findings](#01-compatibility-findings)
  - [0.1a What shipped](#01a-what-shipped)
  - [0.2 Architecture decision — queue first](#02-architecture-decision--queue-first)
  - [0.3 Cost model](#03-cost-model)
  - [0.4 Philippine SMS rules & compliance](#04-philippine-sms-rules--compliance)
  - [0.5 Recommended scope](#05-recommended-scope)
- [Phase 1 — Foundation](#phase-1--foundation)
  - [1.0 What Phase 1 shipped](#10-what-phase-1-shipped)
  - [1.1 Database Migration](#11-database-migration)
  - [1.2 Install PHPMailer](#12-install-phpmailer)
  - [1.3 SMS Service — send_sms.php](#13-sms-service--send_smsphp)
  - [1.4 Email Service — send_email.php](#14-email-service--send_emailphp)
  - [1.5 Email Templates — email_templates.php](#15-email-templates--email_templatesphp)
  - [1.6 Central Dispatcher — send_notification.php](#16-central-dispatcher--send_notificationphp)
- [Phase 2 — Wire to Existing Endpoints](#phase-2--wire-to-existing-endpoints)
  - [2.1 Announcements](#21-announcements--create_announcementphp)
  - [2.2 Maintenance Status](#22-maintenance-status--update_maintenance_statusphp)
  - [2.3 Payment Reminders](#23-payment-reminders--send_payment_reminderphp)
  - [2.4 CCTV / Parking / Service](#24-cctv--parking--service-status-endpoints)
  - [2.5 Daily Sweep](#25-daily-sweep--run_notification_sweep)
- [Phase 3 — User Controls](#phase-3--user-controls)
  - [3.1 Extend Preferences API](#31-extend-preferences-api)
  - [3.2 Profile Settings UI](#32-profile-settings-ui)
  - [3.3 Admin Settings UI](#33-admin-settings-ui--smtp--sms-config)
- [Phase 4 — Polish](#phase-4--polish)
  - [4.1 Notification Queue](#41-notification-queue--process_queuephp)
  - [4.2 Delivery Log Viewer](#42-delivery-log-viewer)
  - [4.3 Verification](#43-verification)
- [Appendix A — File Inventory](#appendix-a--file-inventory)
- [Appendix B — Notification Event Map](#appendix-b--notification-event-map)
- [Appendix C — Provider Setup](#appendix-c--provider-setup)

---

## Quick-Start Checklist

> **Phase 1 is built.** To run and test what exists today, go straight to the
> **[mock testing runbook](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/sms_email_mock_testing.md)** — no account, no credentials, no spend. The list below is what remains before real messages can go out.

- [x] Read **[§0](#0-pre-implementation-review)** — it changes the build order and the schema in §1.1.
- [x] Build and demo against the **`log` (dry-run) driver** first ([§1.3](#13-sms-service--send_smsphp)). Done for both channels — email has a matching `log` driver ([§1.0](#10-what-phase-1-shipped)).
- [x] Run the migration SQL — shipped as `backend/api/migrations/2026_09_sms_email_channels.sql` ([§0.1a](#01a-what-shipped))
- [ ] **Phase 2 — wire the endpoints** ([§2](#phase-2--wire-to-existing-endpoints)). Nothing calls the dispatcher yet, so no tenant action produces an SMS or email. This is the next task, and it needs no provider account.

**Then, to go live.** Email first: it is free, has no lead time, and demos reliably.

- [ ] Create a Gmail App Password (Google Account → Security → 2FA → App Passwords), install PHPMailer ([§1.2](#12-install-phpmailer)), fill the SMTP fields in Account Settings and set **Email Driver** to `smtp`
- [ ] Sign up with **Semaphore** — the only SMS provider AMS supports (see [Appendix C.1](#c1-semaphore-sms--philippine-local)). **Start the sender-ID registration on day one** — it is the long pole (1–3 business days).
- [x] Semaphore driver — **shipped 2026-09-24**. The Twilio / Vonage / Movider / iTexMo stubs were removed the same day (migration `2026_09_sms_semaphore_only.sql`).
- [ ] Schedule the queue drain (`backend/cron/run_queue.bat`, every minute — command in C.1). A real provider makes the admin endpoints enqueue; nothing is delivered until it runs.
- [ ] Put the API key into Account Settings → Notifications tab, then switch **SMS Provider** off `log`
- [ ] ~~Update the `Dockerfile` so Railway gets `vendor/`~~ — deferred; Railway is on indefinite hold, so XAMPP is the only target ([§1.2](#12-install-phpmailer))

---

## §0 Pre-Implementation Review

This section is the result of auditing the rest of this guide against the code on `main` at commit `8352371`. Everything below either corrects a wrong assumption, or names a decision that must be made before Phase 1.

### 0.1 Compatibility findings

**Status (2026-09-22).** Every finding that could be closed against code that exists today has been. Shipped: **C1**, **C2**, **C3**, **C4**, **C9**, **C11**, **C12**, **C14**, **C15** — see [§0.1a](#01a-what-shipped). Still open, because they are corrections to files Phase 1 has yet to create or constraints on how it is written: **C5** (queue before wiring — the tables exist, the dispatcher does not), **C6** (Composer in the deploy path), **C7** (Railway cron), **C8** (write to the PHP 8.0 floor), **C10** (escape template values), **C13** (anchor Phase 2 edits to call text). C6 and C7 are **deferred**: Railway is on indefinite hold, so the XAMPP path is the only deploy target this feature targets for now.

| # | Finding | Where | Action |
|---|---|---|---|
| **C1** | **`notification_preferences` is keyed `(user_id, category)`, not one row per user.** Adding `sms_enabled` / `email_enabled` there gives per-category channel control — which is what §3 wants — but it gives **no global "stop all SMS" switch**, and rows only exist once a user has saved a preference. | `SetupDB.sql:615` | Keep the per-category columns **and** add per-user global opt-out columns on `users` ([§1.1](#11-database-migration)). Absent row = opted in, which the dispatcher already assumes. |
| **C2** | **Always-on notification types have no category**, so `notification_pref_category_for_type()` returns `null` for `maintenance_update`, `overdue`, `payment_received`, `lease_expiring`, and every decision notice. The §1.6 dispatcher treats `null` as "allowed", so those would go out by **SMS with no way for the tenant to opt out**. That is fine for in-app; it is not fine for a paid, regulated channel. | `config.php:1378-1384`, §1.6 | The global `users.sms_opt_out` from C1 is checked **first**, before the category lookup. |
| **C3** | **Settings keys collide with names already in the codebase.** `get_system_settings.php:27-33` and `update_system_settings.php:24` already carry a secret list using `semaphore_api_key`, `smtp_user`, `smtp_pass` — not the `sms_api_key` / `smtp_username` / `smtp_password` this guide invents. Neither key set is seeded or read anywhere yet. §3.3's claim that these are "already masked" is **wrong**. | `get_system_settings.php`, `update_system_settings.php` | Adopt this guide's names (they are clearer and provider-scoped) and **replace** the legacy three in both lists in the same commit, so no key is left unmasked. |
| **C4** | **`users.email_address` is `varchar(30)`** — shorter than a great many real addresses, and `UNIQUE`. Any tenant with a longer address either can't register or is silently truncated, and email notifications then bounce. | `SetupDB.sql:379` | Widen to `varchar(190)` in the same migration (190 keeps the unique index inside the utf8mb4 key limit). Pre-existing bug, but email delivery is what makes it visible. |
| **C5** | **Synchronous sends will time out the HTTP request.** §2.1 loops over every recipient calling `send_sms()` (15 s cURL timeout) and `send_email()` (a fresh SMTP handshake each). A 30-tenant announcement is 30 TCP+TLS round trips inside one POST — PHP's `max_execution_time` and the browser both give up first, and the admin sees a failure on a request that partly succeeded. | §2.1, §2.5 | See [§0.2](#02-architecture-decision--queue-first). |
| **C6** | **No Composer anywhere in the deploy path.** The `Dockerfile` is `php:8.2-apache`, has no `composer` binary, and does `COPY backend/ /var/www/html/`. §1.2's "the Dockerfile must run `composer install`" would fail the build as written. `vendor/` is also **not** in `.gitignore`. | `Dockerfile`, `.gitignore` | Pick one of the two options in [§1.2](#12-install-phpmailer). Committing `vendor/` is the lower-risk choice for this project. |
| **C7** | **Railway has no cron.** `process_queue.php` is documented as a Windows Task Scheduler job, which only covers the XAMPP install. The SaaS deployment would queue notifications and never drain them. | §4.1 | Drain the queue from `run_notification_sweep()` / the `get_notifications.php` poll, the same trick `config.php:1585-1595` already uses for the daily sweep. Details in [§4.1](#41-notification-queue--process_queuephp). |
| **C8** | **PHP version split: local 8.0.30, container 8.2.** `match` and named arguments are fine on 8.0. `readonly`, enums-in-interfaces, `never`, and PHPMailer 7 are not. | — | Write to the 8.0 floor; pin `phpmailer/phpmailer:^6.9`. |
| **C9** | **Preference API payload shape is a breaking change.** `update_notification_preferences.php:33-38` validates that each value is a bool/0/1 and **422s on anything else**. §3.1's new `{"in_app":…,"sms":…}` object payload would be rejected before it reached the insert, and `UserNotifications.jsx` (C13 — the guide said `ProfileSettings.jsx`) still sends the old shape. | `update_notification_preferences.php` | Accept **both** shapes ([§3.1](#31-extend-preferences-api)); ship the backend before the frontend. |
| **C10** | **Email templates interpolate unescaped values.** `email_status_update_template()` inserts `$details`, `$request_label` and `$tenant_name` straight into HTML; `email_payment_template()` does the same with `$room` and `$ref`. A tenant-supplied maintenance description is enough to inject markup into an email the admin also receives. | §1.5 | `htmlspecialchars()` every interpolated value ([§1.5](#15-email-templates--email_templatesphp)). |
| **C11** | **`notification_log` stores full message bodies forever** — names, unit numbers, amounts, phone numbers and email addresses, with no retention policy. Under RA 10173 that is personal data held without a purpose limit, and the table grows unbounded. | §1.1 | Store a truncated body and prune on a schedule ([§1.1](#11-database-migration)). |
| **C12** | **Phone normalisation is too naive.** `preg_replace('/^0/', '+63', trim($phone))` does not strip spaces, dashes or parentheses, so `0917 123 4567` fails the regex and is logged as invalid. `users.contact_no` is free-text `varchar(30)` with no format enforcement. | §1.3 | Strip non-digits first ([§1.3](#13-sms-service--send_smsphp)). |
| **C13** | **Line numbers in Phase 2 are already drifting.** Several "after line N" anchors no longer point where the guide says (`create_announcement.php:23` still holds, `config.php`'s sweep is at ~1585 not 1590). **§3.1 also names the wrong file:** the legacy flat preferences payload is sent by `UserNotifications.jsx`, not `ProfileSettings.jsx`, which contains no preferences UI at all. | §2, §3.1 | Anchor edits to the `create_notification(...)` call text, not to line numbers. File names corrected below. |
| **C14** | **Link fix:** the footer points at `docs/documentation/notification_services.md`, which does not exist. The file is `docs/features/notification_services.md`. | footer | Corrected below. |
| **C15** | `backend/api/services/` does not exist yet; `backend/cron/` does (`check_environment.php`, `daily_sweep.php`). | — | Create the one directory; the cron additions sit beside the existing scripts. |

### 0.1a What shipped

Implemented 2026-09-22. Phase 1 builds on these rather than restating them.

**Migration — `backend/api/migrations/2026_09_sms_email_channels.sql`**, mirrored into `SetupDB.sql` (idempotent; verified by running it twice and by a clean `SetupDB.sql` + `seed_mock_data.sql` import producing the same schema).

- **C4** — `users.email_address` is now `varchar(190)`. Nothing assumed the old width: `registration.php` validates with `FILTER_VALIDATE_EMAIL` only, and no form sets a `maxLength` on an email field.
- **C1 / C2** — `users.sms_opt_out`, `users.email_opt_out`, `users.sms_consent_at`; `notification_preferences.sms_enabled`, `.email_enabled`.
- **C11** — `notification_log` (with `idx_log_sent_at`) and `notification_log_retention_days`, default 90.
- `notification_queue` is created here too, so the schema is settled in one migration. Nothing writes to it until the dispatcher lands.
- **C3** — the full settings key block is seeded, and the legacy `semaphore_api_key` / `smtp_user` / `smtp_pass` rows are deleted.

**Both channels ship off.** `notifications_email_enabled` and `notifications_sms_enabled` seed to `'0'`, so the per-category columns above are dormant until an admin turns a channel on. That, not a column default, is the cost control from [§0.3](#03-cost-model).

**C3 — secret masking.** `get_system_settings.php` `$sensitive_keys` and `update_system_settings.php` `$secret_keys` now carry the same provider-scoped list (`smtp_username`, `smtp_password`, `sms_api_key`, and every provider-specific credential). The two lists must be edited together; both say so.

**C2 / C11 / C12 — helpers in `backend/config.php`**, beside `create_notification()`:

| Helper | Closes | Behaviour |
|---|---|---|
| `user_channel_allowed($conn, $user_id, $type, $channel)` | C2 | The one gate before any send. Checks `users.<channel>_opt_out` **first**, then the building-wide `notifications_<channel>_enabled`, then the per-category row (absent row = allowed, category-less type = allowed). |
| `normalize_ph_mobile($phone)` | C12 | Strips non-digits first, then normalises `09…` / `639…` / `+639…` / `00639…` to E.164; `null` when it is not a PH mobile. `0917 123 4567` and `(0917)123-4567` both work. |
| `gsm7_safe($text)` | §0.3 | Folds `₱`→`PHP `, em/en dash, smart quotes and ellipsis to GSM-7 and drops the rest, so a message cannot silently bill as three UCS-2 segments. |
| `sms_single_segment($text, $limit = 160)` | §0.3 | One segment, hard. |
| `log_notification_delivery(...)` | C11 | The only writer into `notification_log`; truncates the body to 500 chars. |
| `prune_notification_log($conn, $limit = 5000)` | C11 | Deletes past the retention setting, capped per call. Called at the end of every queue drain (`process_notification_queue()`; selftest M6-18). |

**C9 — preferences API takes both payload shapes.** `update_notification_preferences.php` accepts `"<category>": true|false` and `"<category>": {in_app, sms, email}`, plus top-level `sms_opt_out` / `email_opt_out`. An omitted channel is written back **as it was stored**, read once before the loop — the flat payload the notifications page still sends can no longer re-enable SMS. Turning SMS back on stamps `sms_consent_at`. `get_notification_preferences.php` returns `sms_enabled` / `email_enabled` per category plus `channels`, `sms_opt_out`, `email_opt_out`, `has_contact_no`, `has_email`. The frontend is unchanged and still works, which was the C9 ship-order requirement.

**C15** — `backend/api/services/` exists (placeholder only).

**C14** — verified: the footer already points at `docs/features/notification_services.md`.

### 0.2 Architecture decision — queue first

**Move the queue from Phase 4 to Phase 1, and never call `send_sms()` / `send_email()` from inside a web request.**

The build order in this guide (wire synchronously in Phase 2, add a queue in Phase 4 "for production") means every Phase 2 endpoint gets written twice, and in between the app has a real failure mode: an announcement to 30 tenants issues 30 blocking HTTP calls inside one POST. It also couples the admin's success/failure response to a third-party API being up.

Revised order:

| Step | What | Why |
|---|---|---|
| 1 | Migration (§1.1, with the §0.1 corrections) | Schema first |
| 2 | `send_sms.php` with the **`log` dry-run driver only** | Whole feature becomes demoable with zero spend and zero accounts |
| 3 | `send_email.php`, `email_templates.php` | |
| 4 | **`notification_queue` + `process_queue.php`** (was §4.1) | Before anything enqueues |
| 5 | Dispatcher (§1.6) — **enqueues**, never sends | One call site, one behaviour |
| 6 | Phase 2 wiring | Each endpoint is now one cheap `INSERT` |
| 7 | Phase 3 user/admin controls | |
| 8 | Real providers, delivery log viewer | |

Concretely, `dispatch_external_notification()` writes rows to `notification_queue` and returns in microseconds. `process_queue.php` — run by Task Scheduler on XAMPP, and by the sweep piggyback on Railway (C7) — is the only place a provider is ever contacted. The synchronous path stays available behind a `notifications_dispatch_mode` setting (`queue` | `sync`) purely so a live demo can show an SMS arriving while the panel watches.

### 0.3 Cost model

> Prices below were checked against published rate cards in **September 2026** and are indicative only. Every provider changes pricing and every PH carrier surcharges differently — re-verify at signup and record the actual figure here.

The per-SMS price is the easy part; **message volume is what decides the bill**, and the event map in [Appendix B](#appendix-b--notification-event-map) is generous. Sending all twelve event types by SMS to every tenant:

| Event class | Per tenant / month | 30 tenants |
|---|---|---|
| Rent due + overdue reminders | 2–4 | 60–120 |
| Announcements (2/month, all tenants) | 2 | 60 |
| Request status changes (maintenance, CCTV, parking, service) | 3–8 | 90–240 |
| Payment confirmations | 1–2 | 30–60 |
| Lease / contract reminders | 0–1 | 0–30 |
| **Total** | **8–17** | **240–510 SMS/month** |

At ₱0.50/SMS that is **₱120–₱255/month**, not the ₱75 quoted in Appendix C — and that figure assumes one 160-character segment per message. A message with `₱`, `—` or an emoji is **UCS-2 encoded and drops to 70 characters per segment**, so it silently bills as 2–3 segments. The SMS bodies in Appendix B all contain `₱` or an em dash.

**Cost controls, in order of effect:**

1. **Email is effectively free; SMS is not.** Default every category to email-on, SMS-off. Let SMS be opt-*in* per category, with only overdue rent and urgent announcements defaulting on.
2. **Keep SMS to GSM-7.** No emoji, no `₱` (write `PHP 4,500`), no em dash, no smart quotes. Add a `gsm7_safe()` pass in `send_sms()` and assert on it in testing. This alone can halve the bill.
3. **One segment, hard.** Cap at 160 characters, not the 300 in §1.3. If it does not fit, it belongs in an email.
4. **No links.** PH carriers filter A2P SMS containing URLs (see §0.4), and shorteners are blocked outright.
5. **Never SMS an announcement to "all tenants" by default.** Make SMS a deliberate per-announcement choice in the admin form, and show the admin the recipient count and estimated cost before sending.

Email side: Gmail SMTP is free up to **500 recipients/day** (personal) or 2,000/day (Workspace) — comfortable at this scale, but a 30-tenant announcement plus a sweep is ~60 sends in a burst, so throttle the queue drain rather than firing them all at once. Resend's free tier is 3,000/month.

Minimum realistic first-year budget for a 30-unit building: **₱0 email + ₱1,500–₱3,000/year SMS**, plus whatever minimum top-up the provider enforces (Semaphore sells prepaid credit in blocks, so the first load is the real floor).

### 0.4 Philippine SMS rules & compliance

These are constraints on the *content and consent*, not on the code, and they are the things that actually get an SMS integration blocked.

**Sender ID registration.** Since the SIM Registration Act (RA 11934) and the NTC's follow-on rules, PH carriers (Globe, Smart/TNT, DITO) require A2P traffic to come from a **registered sender ID or a registered number**. Unregistered alphanumeric traffic is filtered, usually silently — the API returns success and the message never lands. Plan for this:

- **Semaphore** registers the sender name on your behalf: submit `AMS` (or the building's name), allow 1–3 business days. Until it is approved your messages go out under the shared `SEMAPHORE` sender.
- Global providers (Twilio, Vonage, Movider) make you register the sender ID with each carrier yourself, often with business documents — one reason Semaphore is the only provider AMS supports.

**No links.** PH carriers block or filter A2P messages containing URLs, and URL shorteners (`bit.ly` and friends) are blocked outright as an anti-scam measure. Keep every SMS link-free and tell the tenant to open the app.

**Opt-out.** Commercial/marketing SMS must offer a way to stop. Transactional messages (your rent is due, your request was approved) are on much firmer ground, but the honest and defensible design is: **every tenant can turn SMS off entirely**, and that switch is respected before the per-category one (C1/C2). Announcements are the category closest to marketing — treat them as opt-in.

**Data Privacy Act (RA 10173).** Phone numbers, unit numbers and amounts are personal data. Three things follow for this feature:
- Collect consent at onboarding — a checkbox on the tenant profile is enough, and it maps to the `users.sms_opt_out` / `email_opt_out` columns in §1.1.
- State the purpose. One line in the profile UI: "We use your number only for building notices and billing reminders."
- Limit retention. `notification_log` keeps message bodies; see C11.

**Quiet hours.** Not a legal requirement for transactional SMS, but a 21:00–07:00 hold in the queue processor costs three lines and prevents the single most common complaint. Overdue and emergency announcements can be exempt.

**Content.** Identify the sender in the message body (`AMS:` prefix — the guide already does this), keep it factual, and never put a password, OTP, full amount owed with account details, or any document reference in an SMS.

### 0.5 Recommended scope

If the deadline is tight, this is what "done" should mean:

| Tier | Scope | Closes |
|---|---|---|
| **Must** | Migration · `log` + Semaphore drivers · email via Gmail SMTP · queue + processor · dispatcher · maintenance status + rent due/overdue wiring · per-category and global opt-out · admin config UI | **4.10**, **6.6**, **6.7**, extends **6.8** |
| **Should** | Announcements with an explicit SMS opt-in and a cost preview · delivery log viewer · quiet hours | polish the same rows |
| **Could** | Remaining status endpoints · delivery receipts | — |
| **Won't (say so on the panel)** | Inbound SMS / STOP keyword handling · per-message delivery status webhooks · multi-tenant per-building sender IDs | scope statement |

Email is the honest win here: it is free, has no registration lead time, and demos reliably. SMS should be built behind the same abstraction, proven on the `log` driver, and switched to a live provider only once the sender ID is approved.

---

## Phase 1 — Foundation

### 1.0 What Phase 1 shipped

Built 2026-09-22, on **mock drivers**. The pipeline is complete and end-to-end testable; no provider is contacted and nothing is spent.

> **How to run and test it: [`sms_email_mock_testing.md`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/sms_email_mock_testing.md).** That runbook replaces the two `php -r` recipes that used to live in [§4.3](#43-verification).

| File | What it is |
|---|---|
| `backend/api/services/send_sms.php` | `send_sms()` plus the `log` dry-run driver and `write_mock_outbox()`. **Semaphore** is the live driver (Appendix C.1) and the only real SMS provider; any other `sms_provider` value fails with "Unknown SMS provider". |
| `backend/api/services/send_email.php` | `send_email()` with two drivers chosen by the new **`email_driver`** setting (`log` \| `smtp`). |
| `backend/api/services/email_templates.php` | §1.5 as written, `esc()` on every interpolated value (C10). |
| `backend/api/services/send_notification.php` | `dispatch_external_notification()`, `dispatch_external_broadcast()`, `enqueue_notification()`, `process_notification_queue()`. |
| `backend/cron/process_queue.php` | CLI drain. Task Scheduler entry point. |
| `backend/cron/notification_selftest.php` | 19 dry-run checks (M6-02…M6-18, C11, M6-35, M6-39, DRY). The verification gate for this module. |
| `backend/api/send_test_notification.php` | Admin-only test send; returns the rendered message for the settings UI to print to the browser console. |
| `ams-react/src/AdminPages/AdminAccountSettings.jsx` + `settings/NotificationsPanel.jsx` | §3.3 — Notifications tab: provider (Log / Semaphore), API key, sender name + approval, balance check, daily cap, test sends. |
| `backend/api/get_sms_balance.php` | Admin-only Semaphore credit balance (cached 60 s — `/account` allows 2 calls a minute). |
| `backend/cron/run_queue.bat` | Task Scheduler wrapper for `process_queue.php` (C.1 step 5). |
| `ams-react/src/config/systemSettings.js` | The camelCase map both ways — a key missing here is silently never saved. |

**Deliberate differences from the listings below.**

- **`email_driver` is new**, and is the email mirror of `sms_provider = 'log'`. It means the email path is demonstrable with no Composer, no PHPMailer and no Gmail account. §1.4's `require_once 'vendor/autoload.php'` moved **inside** the `smtp` branch so a checkout with no `vendor/` still parses and runs; a missing PHPMailer is a `failed` row, never a fatal.
- **Semaphore is the only SMS provider.** Twilio, Vonage, Movider and iTexMo were planned as stubs and removed on 2026-09-24 (`2026_09_sms_semaphore_only.sql`): untested code that contacts a paid API is worse than none. Semaphore was built once credits existed to test it against (Appendix C.1).
- **The dispatcher calls `user_channel_allowed()`** from `config.php` instead of repeating the opt-out ladder per channel, which is what §1.6's listing does. C2's ordering — global opt-out, then building switch, then category — is decided in one place.
- **The mock outbox** (`backend/logs/notification_outbox/`, gitignored) holds one file per message: `.txt` for SMS, `.html` for email. Opening the HTML in a browser is the closest thing to seeing the real mail.
- **Secret masking landed early.** Rendering credential fields in a browser is the moment §3.3's security note matters, so `SECRET_SETTING_KEYS`, `mask_secret_value()` and `is_masked_secret()` now live in `config.php`; admins receive `••••1234` and posting that back means "unchanged". This covers the PayMongo keys too.

**Not built yet:** Phase 2 endpoint wiring (nothing calls the dispatcher in anger), the §3.2 tenant preferences UI, the §4.2 delivery log viewer, real provider drivers (Semaphore has since shipped — C.1), PHPMailer. The web-path queue drain in §4.1 is deliberately absent — with nothing enqueuing from an endpoint it would be untestable; it belongs with the Phase 2 wiring.

---

### 1.1 Database Migration

**File:** [`backend/api/migrations/2026_09_sms_email_channels.sql`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/migrations/2026_09_sms_email_channels.sql) — **shipped 2026-09-22** and mirrored into `SetupDB.sql`. `seed_mock_data.sql` needed no change: it seeds neither `system_settings` nor `notification_preferences`.

> **Revised in v1.1** for findings **C1** (global opt-out), **C3** (settings key collision), **C4** (`email_address` width) and **C11** (log retention). The listing below is what was applied, with two deliberate differences: the file is named for the migration convention already in the directory, and `payload` is `longtext` rather than `JSON` — MariaDB 10.4 aliases `JSON` to `longtext` anyway, so the dump and the source now agree.

```sql
-- ============================================================
-- AMS — SMS & Email notification channels (checklist 6.6, 6.7)
-- Idempotent. Safe to re-run.
-- ============================================================

-- 0. C4 — users.email_address is varchar(30), which truncates or rejects
--    perfectly ordinary addresses. Email delivery is what makes that visible,
--    so widen it here. 190 keeps the UNIQUE index inside the utf8mb4 key limit.
ALTER TABLE `users`
  MODIFY COLUMN `email_address` VARCHAR(190) NOT NULL;

-- 1. Per-category channel opt-out. The table is keyed (user_id, category),
--    so these are per-category flags; a missing row means "opted in".
ALTER TABLE `notification_preferences`
  ADD COLUMN IF NOT EXISTS `sms_enabled`   TINYINT(1) NOT NULL DEFAULT 1 AFTER `in_app_enabled`,
  ADD COLUMN IF NOT EXISTS `email_enabled` TINYINT(1) NOT NULL DEFAULT 1 AFTER `sms_enabled`;

-- 1b. C1/C2 — global per-user kill switch. Notification types that belong to
--     no category (maintenance_update, overdue, payment_received,
--     lease_expiring, every decision notice) bypass the table above, so
--     without this a tenant could not stop SMS at all. Checked FIRST by the
--     dispatcher. sms_consent_at records the RA 10173 consent moment.
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `sms_opt_out`     TINYINT(1) NOT NULL DEFAULT 0 AFTER `contact_no`,
  ADD COLUMN IF NOT EXISTS `email_opt_out`   TINYINT(1) NOT NULL DEFAULT 0 AFTER `sms_opt_out`,
  ADD COLUMN IF NOT EXISTS `sms_consent_at`  DATETIME DEFAULT NULL AFTER `email_opt_out`;

-- 2. Delivery log — every outbound SMS/email attempt is recorded.
--    C11: message_body is truncated to 500 chars by the writer and the table
--    is pruned (see step 5), so personal data is not kept indefinitely.
CREATE TABLE IF NOT EXISTS `notification_log` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`       INT DEFAULT NULL,
  `channel`       ENUM('in-app','email','sms') NOT NULL,
  `event_type`    VARCHAR(50) NOT NULL,
  `recipient`     VARCHAR(255) DEFAULT NULL COMMENT 'email address or phone number',
  `subject`       VARCHAR(255) DEFAULT NULL,
  `message_body`  TEXT DEFAULT NULL,
  `status`        ENUM('sent','failed','skipped') DEFAULT 'sent',
  `error_message` TEXT DEFAULT NULL,
  `sent_at`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_notif_log_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_log_channel_status` (`channel`, `status`),
  INDEX `idx_log_user`           (`user_id`),
  INDEX `idx_log_sent_at`        (`sent_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. Async notification queue (Phase 4 — optional but recommended).
CREATE TABLE IF NOT EXISTS `notification_queue` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`         INT NOT NULL,
  `channel`         ENUM('email','sms') NOT NULL,
  `event_type`      VARCHAR(50) NOT NULL,
  `payload`         JSON NOT NULL COMMENT '{"to","subject","body","template","vars"}',
  `status`          ENUM('pending','processing','sent','failed') DEFAULT 'pending',
  `claim_token`     CHAR(16) DEFAULT NULL COMMENT 'set by the claiming drain; see 4.1',
  `attempts`        TINYINT DEFAULT 0,
  `max_attempts`    TINYINT DEFAULT 3,
  `next_attempt_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `error_message`   TEXT DEFAULT NULL,
  `created_at`      DATETIME DEFAULT CURRENT_TIMESTAMP,
  `processed_at`    DATETIME DEFAULT NULL,
  CONSTRAINT `fk_notif_queue_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_queue_pending` (`status`, `next_attempt_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4. Seed system_settings for provider credentials (admin-configurable).
--    sms_provider accepts: 'log' or 'semaphore'
--    'log' is the dry-run driver: writes to notification_log, sends nothing.
--
--    C3 — get_system_settings.php and update_system_settings.php already carry
--    a secret list using the legacy names semaphore_api_key / smtp_user /
--    smtp_pass. Nothing reads or writes them. Replace those three entries with
--    the keys below in the SAME commit, or the new secrets ship unmasked.
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
  ('smtp_host',                    'smtp.gmail.com'),
  ('smtp_port',                    '587'),
  ('smtp_username',                ''),
  ('smtp_password',                ''),
  ('smtp_from_name',               'AMS Notifications'),
  ('smtp_from_email',              ''),
  ('sms_provider',                 'log'),
  ('sms_api_key',                  ''),
  ('sms_sender_name',              'AMS'),
  ('notifications_email_enabled',  '0'),
  ('notifications_sms_enabled',    '0'),
  -- queue | sync. 'sync' blocks the HTTP request and exists only for demos.
  ('notifications_dispatch_mode',  'queue'),
  -- Quiet hours (24h, local). Overdue and urgent announcements are exempt.
  ('notifications_quiet_start',    '21'),
  ('notifications_quiet_end',      '07'),
  -- C11 retention: notification_log rows older than this are pruned.
  ('notification_log_retention_days', '90'),
  -- Claimed by the queue drain, same pattern as notification_sweep_last_run.
  ('notification_queue_last_run',  '2000-01-01 00:00:00'),
  -- Drives the cost preview on the announcement form (§2.1). Set to whatever
  -- the provider actually charges once you have a real rate card.
  ('sms_unit_cost',                '0.50');

-- 5. C11 — retention. Run from process_queue.php once per drain; cheap because
--    of idx_log_sent_at. Kept as a statement here so a manual prune is possible.
-- DELETE FROM `notification_log`
--   WHERE `sent_at` < DATE_SUB(NOW(), INTERVAL 90 DAY) LIMIT 5000;
```

**Verify:**

```bash
C:\xampp\php\php.exe -r "
  \$c = new mysqli('localhost','root','','ams_db');
  echo \$c->query(\"SHOW COLUMNS FROM notification_preferences LIKE 'sms_enabled'\")->num_rows ? 'OK' : 'MISSING';
  echo ' | ';
  echo \$c->query(\"SHOW TABLES LIKE 'notification_log'\")->num_rows ? 'OK' : 'MISSING';
"
```

---

### 1.2 Install PHPMailer

> **Not done, and not needed yet.** The `email_driver = 'log'` path ([§1.0](#10-what-phase-1-shipped)) renders and records email without PHPMailer, so Phase 1 shipped with no Composer install at all. Do this when you are ready to send real mail; `send_email.php` already has the SMTP branch and will pick it up with no code change. The C6 Dockerfile discussion below is **deferred** with Railway.

```bash
cd C:\xampp\htdocs\ApartmentManagementSystem_React\backend
composer require phpmailer/phpmailer:^6.9
```

**Pin the 6.x line.** Local XAMPP runs PHP 8.0.30 (`php -v`); PHPMailer 7 requires 8.1+ and Composer would resolve to it unpinned, then fail at runtime on the local box while working in the 8.2 container. PHPMailer 6.9 has no runtime dependencies beyond ext-ctype/filter/hash, all of which the base image has.


**C6 — the deploy path has no Composer.** `Dockerfile` is `php:8.2-apache` with no composer binary, and it does `COPY backend/ /var/www/html/`. Pick one:

**Option A — commit `vendor/` (recommended for this project).** One dependency, no build step, and `COPY backend/` already ships it. Do *not* add `vendor/` to `.gitignore`; add `.gitattributes` marking it `linguist-vendored` so it does not skew the repo language stats.

**Option B — build it in the image.** Add a Composer stage before the existing `COPY`:

```diff
 FROM php:8.2-apache
+
+# Composer is not in the base image; PHPMailer is installed at build time so
+# vendor/ stays out of git.
+COPY --from=composer/composer:2-bin /composer /usr/bin/composer
 
 # mysqli (with mysqlnd) is the only extension not bundled in the base image;
@@
 COPY backend/ /var/www/html/
+RUN cd /var/www/html \
+ && composer install --no-dev --no-interaction --optimize-autoloader \
+ && rm -f /usr/bin/composer
```

Option B needs `backend/composer.json` **and** `backend/composer.lock` committed, and it lengthens every Railway build. Option A is the smaller change; with a single pure-PHP dependency it is also the safer one.

Either way, confirm before wiring anything up:

```bash
/c/xampp/php/php.exe -r "require 'backend/vendor/autoload.php'; echo class_exists('PHPMailer\\\\PHPMailer\\\\PHPMailer') ? 'OK' : 'MISSING';"
```

---

### 1.3 SMS Service — send_sms.php

**File:** [`backend/api/services/send_sms.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/services/send_sms.php) — **shipped**. The `log` and **Semaphore** drivers are built, and they are the only two; any other `sms_provider` value fails loudly with "Unknown SMS provider" instead of appearing to work.

> **The Semaphore listing below is the original plan, superseded by the shipped driver.** The real one strips the `+` from the number, posts `sendername` only when `sms_sender_approved = '1'`, requires a `message_id` in the response (Semaphore reports errors as a JSON object *with HTTP 200*), and `send_sms()` enforces `sms_daily_cap` before any real provider is called. See [Appendix C.1](#c1-semaphore-sms--philippine-local).

A standalone function that routes SMS through whichever provider is configured in `system_settings.sms_provider`. Each provider has its own private send function. The public `send_sms()` signature never changes — endpoints don't need to know which provider is active.

**Supported providers:** `log` (dry-run) · `semaphore` — the only real provider. (Stub entries for Twilio, Vonage, Movider and iTexMo were removed 2026-09-24.)

> **Build the `log` driver first.** It is the default in §1.1's seed. It writes a `sent` row to `notification_log` and contacts nothing, so the whole feature — dispatcher, queue, preferences, admin UI, delivery log viewer — can be built, demoed and defended on the panel with no account, no spend, and no sender-ID approval. Swap `sms_provider` to a real driver only when credentials and the sender ID are actually approved.

> **Revised in v1.1** for **C12** (phone normalisation) and the segment-cost controls in [§0.3](#03-cost-model). Two changes matter to the bill: the cap is **160 characters, not 300**, and the body is forced to GSM-7 — one `₱`, em dash or emoji switches the whole message to UCS-2 and cuts the segment to 70 characters, so a "one-segment" message silently bills as three.

```php
<?php
/**
 * Multi-provider SMS sender.
 *
 * Usage:
 *   require_once __DIR__ . '/send_sms.php';
 *   $ok = send_sms($conn, $phone_number, $message, $event_type, $user_id);
 *
 * The active provider is read from system_settings.sms_provider.
 * Returns true on success, false on failure. Every attempt is logged to notification_log.
 */

function send_sms($conn, $phone, $message, $event_type = 'general', $user_id = null) {
    // --- Guard: is SMS globally enabled? ---
    $enabled = get_setting($conn, 'notifications_sms_enabled', '0');
    if ($enabled !== '1' && $enabled !== 'true') {
        log_notification_delivery($conn, $user_id, 'sms', $event_type, $phone, null, $message, 'skipped', 'SMS globally disabled');
        return false;
    }

    // C12 — users.contact_no is free-text varchar(30), so "0917 123-4567" and
    // "+63 917 123 4567" both occur. Strip to digits before deciding anything.
    $phone = normalize_ph_mobile($phone);
    if ($phone === null) {
        log_notification_delivery($conn, $user_id, 'sms', $event_type, $phone, null, $message, 'failed', 'Invalid phone number');
        return false;
    }

    // Cost control (§0.3): force GSM-7 and hard-cap at one 160-char segment.
    // A single "₱" or em dash makes the message UCS-2 (70 chars/segment), so a
    // message that looks like one segment bills as three. sms_single_segment()
    // in config.php does both (it calls gsm7_safe() itself).
    $message = sms_single_segment($message);

    // --- Route to the configured provider ---
    $provider = strtolower(get_setting($conn, 'sms_provider', 'log'));

    $result = match ($provider) {
        'log'       => ['ok' => true],   // dry run: logged below, nothing sent
        'semaphore' => _send_via_semaphore($conn, $phone, $message),
        default     => ['ok' => false, 'error' => "Unknown SMS provider: $provider"],
    };

    if ($result['ok']) {
        log_notification_delivery($conn, $user_id, 'sms', $event_type, $phone, null, $message, 'sent');
        return true;
    }

    log_notification_delivery($conn, $user_id, 'sms', $event_type, $phone, null, $message, 'failed', $result['error']);
    return false;
}

// ──────────────────────────────────────────────
//  Provider: Semaphore  (semaphore.co)
// ──────────────────────────────────────────────
//  Settings required:
//    sms_api_key      → Your Semaphore API key
//    sms_sender_name  → Approved sender name (e.g. "AMS")
//  API endpoint:  POST https://api.semaphore.co/api/v4/messages
//  Auth:          API key in the POST body
//  Response:      JSON array of message objects on success
// ──────────────────────────────────────────────
function _send_via_semaphore($conn, $phone, $message) {
    $api_key     = get_setting($conn, 'sms_api_key', '');
    $sender_name = get_setting($conn, 'sms_sender_name', 'AMS');

    if ($api_key === '') return ['ok' => false, 'error' => 'No Semaphore API key configured'];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => 'https://api.semaphore.co/api/v4/messages',
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'apikey'     => $api_key,
            'number'     => $phone,
            'message'    => $message,
            'sendername' => $sender_name,
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 5,
    ]);

    $response  = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_err  = curl_error($ch);
    curl_close($ch);

    if ($curl_err) return ['ok' => false, 'error' => "cURL error: $curl_err"];

    $json = json_decode($response, true);
    if ($http_code >= 200 && $http_code < 300 && is_array($json) && !empty($json)) {
        return ['ok' => true];
    }

    $error = is_array($json) ? json_encode($json) : $response;
    return ['ok' => false, 'error' => "HTTP $http_code: $error"];
}

?>
```

> **The helpers this file calls already exist** — `normalize_ph_mobile()`, `gsm7_safe()`, `sms_single_segment()` and `log_notification_delivery()` shipped in `config.php` ([§0.1a](#01a-what-shipped)), which every endpoint already includes. Do not redeclare them here: `send_email.php` needs the same logger, and a second declaration is a fatal redeclare.

> **Rate limiting.** The driver does not throttle, and Semaphore rate-limits bursts. The queue processor is where this belongs — see [§4.1](#41-notification-queue--process_queuephp).

---

### 1.4 Email Service — send_email.php

**File:** [`backend/api/services/send_email.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/services/send_email.php) — **shipped**, with two changes to the listing below ([§1.0](#10-what-phase-1-shipped)):
>
> 1. A **`log` driver** was added alongside this SMTP one, selected by the new `email_driver` setting and used by default. It writes the rendered HTML to the mock outbox and opens no socket, which is what lets the email path be built and demonstrated before any Gmail account exists.
> 2. `require_once '../../vendor/autoload.php'` moved **inside** the SMTP branch, behind an `is_file()` check. As written below, a checkout without `vendor/` fatals on include — including on the log path, which does not need PHPMailer at all. A missing dependency is now a `failed` row with a readable reason.

```php
<?php
/**
 * PHPMailer email sender.
 *
 * Usage:
 *   require_once __DIR__ . '/send_email.php';
 *   $ok = send_email($conn, $to_email, $subject, $html_body, $event_type, $user_id);
 *
 * SMTP credentials are read from system_settings (admin-configurable).
 */

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/send_sms.php'; // for log_notification_delivery()

function send_email($conn, $to_email, $subject, $html_body, $event_type = 'general', $user_id = null) {
    // --- Guard: is email globally enabled? ---
    $enabled = get_setting($conn, 'notifications_email_enabled', '0');
    if ($enabled !== '1' && $enabled !== 'true') {
        log_notification_delivery($conn, $user_id, 'email', $event_type, $to_email, $subject, null, 'skipped', 'Email globally disabled');
        return false;
    }

    $smtp_host     = get_setting($conn, 'smtp_host', 'smtp.gmail.com');
    $smtp_port     = (int)get_setting($conn, 'smtp_port', '587');
    $smtp_username = get_setting($conn, 'smtp_username', '');
    $smtp_password = get_setting($conn, 'smtp_password', '');
    $from_name     = get_setting($conn, 'smtp_from_name', 'AMS Notifications');
    $from_email    = get_setting($conn, 'smtp_from_email', $smtp_username);

    if ($smtp_username === '' || $smtp_password === '') {
        log_notification_delivery($conn, $user_id, 'email', $event_type, $to_email, $subject, null, 'failed', 'SMTP credentials not configured');
        return false;
    }

    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = $smtp_host;
        $mail->SMTPAuth   = true;
        $mail->Username   = $smtp_username;
        $mail->Password   = $smtp_password;
        $mail->SMTPSecure = $smtp_port == 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $smtp_port;
        $mail->CharSet    = 'UTF-8';

        $mail->setFrom($from_email, $from_name);
        $mail->addAddress($to_email);

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $html_body;
        // Plain-text fallback
        $mail->AltBody = strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $html_body));

        $mail->send();
        log_notification_delivery($conn, $user_id, 'email', $event_type, $to_email, $subject, null, 'sent');
        return true;
    } catch (Exception $e) {
        $error = $mail->ErrorInfo ?: $e->getMessage();
        log_notification_delivery($conn, $user_id, 'email', $event_type, $to_email, $subject, null, 'failed', $error);
        return false;
    }
}
?>
```

---

### 1.5 Email Templates — email_templates.php

**File:** [`backend/api/services/email_templates.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/services/email_templates.php) — **shipped** as written, `esc()` throughout. Emoji were dropped from the subject lines: they survive in email but the same strings feed SMS, where they force UCS-2 encoding (§0.3).

Returns HTML email bodies. Called by the dispatcher or endpoint before `send_email()`.

> **C10 — escape every interpolated value.** The version below adds `htmlspecialchars()` throughout. Without it, a tenant-authored maintenance description, a rejection reason, or a room label injects markup into an email that the admin also receives. `$title` and `$content_html` in `email_base_template()` are the only parameters that may legitimately contain HTML, and only because callers build them from already-escaped parts.

```php
<?php
/**
 * AMS email templates. Each function returns an HTML string.
 *
 * Convention: every caller-supplied value is escaped with esc() at the point of
 * interpolation. email_base_template() is the one function that accepts HTML,
 * and only from the functions below.
 */

function esc($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }

function email_base_template($title, $content_html) {
    return <<<HTML
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#2563eb;color:#ffffff;padding:20px 28px;font-size:18px;font-weight:bold;">
            🏢 Apartment Management System
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <h2 style="margin:0 0 16px 0;color:#1e293b;font-size:20px;">{$title}</h2>
            {$content_html}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;">
            This is an automated notification from your apartment management office.<br>
            If you have questions, please contact the admin office directly.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;
}

function email_announcement_template($title, $body, $tag = 'General') {
    $tag_color = match($tag) {
        'Urgent'   => '#dc2626',
        'Reminder' => '#d97706',
        default    => '#2563eb',
    };
    $tag_badge = "<span style=\"display:inline-block;padding:2px 10px;border-radius:4px;background:{$tag_color};color:#fff;font-size:12px;\">" . esc($tag) . "</span>";
    $content = "<p style=\"margin:0 0 12px 0;\">{$tag_badge}</p>"
             . "<p style=\"margin:0;color:#334155;line-height:1.6;\">" . nl2br(esc($body)) . "</p>";
    return email_base_template("📢 " . esc($title), $content);
}

function email_payment_template($tenant_name, $amount, $room, $period, $status, $ref = '') {
    $amount_fmt = '₱' . number_format((float)$amount, 2);
    $content = "<p style=\"color:#334155;line-height:1.6;\">Hello <strong>" . esc($tenant_name) . "</strong>,</p>"
             . "<table style=\"width:100%;border-collapse:collapse;margin:16px 0;\">"
             . "<tr><td style=\"padding:8px 0;color:#64748b;\">Amount</td><td style=\"padding:8px 0;font-weight:bold;\">{$amount_fmt}</td></tr>"
             . "<tr><td style=\"padding:8px 0;color:#64748b;\">Unit</td><td style=\"padding:8px 0;\">" . esc($room) . "</td></tr>"
             . "<tr><td style=\"padding:8px 0;color:#64748b;\">Period</td><td style=\"padding:8px 0;\">" . esc($period) . "</td></tr>"
             . ($ref ? "<tr><td style=\"padding:8px 0;color:#64748b;\">Reference</td><td style=\"padding:8px 0;\">" . esc($ref) . "</td></tr>" : "")
             . "</table>";
    $title = $status === 'confirmed' ? '💰 Payment Received' : '⏰ Payment Reminder';
    return email_base_template($title . " — Unit " . esc($room), $content);
}

function email_status_update_template($tenant_name, $request_type, $request_label, $new_status, $details = '') {
    $icon = match($request_type) {
        'maintenance' => '🔧',
        'cctv'        => '📹',
        'parking'     => '🅿️',
        'service'     => '🛎️',
        'lease'       => '📋',
        default       => '📌',
    };
    // $details is often a tenant-authored description or an admin rejection
    // reason — never interpolate it raw (C10).
    $content = "<p style=\"color:#334155;line-height:1.6;\">Hello <strong>" . esc($tenant_name) . "</strong>,</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Your " . esc($request_type) . " request <strong>\"" . esc($request_label) . "\"</strong> has been updated to: "
             . "<strong style=\"color:#2563eb;\">" . esc($new_status) . "</strong></p>"
             . ($details ? "<p style=\"color:#475569;line-height:1.6;background:#f1f5f9;padding:12px;border-radius:6px;\">" . nl2br(esc($details)) . "</p>" : "");
    return email_base_template("{$icon} " . esc($request_type) . " Update — " . esc($request_label), $content);
}

function email_lease_reminder_template($tenant_name, $room, $lease_end, $days_left) {
    $content = "<p style=\"color:#334155;line-height:1.6;\">Hello <strong>" . esc($tenant_name) . "</strong>,</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Your lease for <strong>Unit " . esc($room) . "</strong> expires on <strong>" . esc($lease_end) . "</strong> "
             . "(<strong>" . (int)$days_left . " days remaining</strong>).</p>"
             . "<p style=\"color:#334155;line-height:1.6;\">Please contact the admin office to discuss renewal options.</p>";
    return email_base_template("📋 Lease Expiring Soon — Unit " . esc($room), $content);
}
?>
```

> **Every Phase 2 call site passes `''` as `$tenant_name`**, which renders "Hello ,". Either resolve the name in the dispatcher (it already selects `first_name`) and pass it through, or drop the greeting. The dispatcher in §1.6 is the better place — it is the one function that has the user row.

---

### 1.6 Central Dispatcher — send_notification.php

**File:** [`backend/api/services/send_notification.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/services/send_notification.php) — **shipped**, and it holds the queue drain too. The per-channel opt-out ladder written out twice below is now one `user_channel_allowed()` call per channel (config.php), so C2 ordering lives in exactly one place.

The single function every endpoint calls after `create_notification()`. It resolves the user's contact info, checks per-channel preferences, and — by default — **enqueues** rather than sends. In-app is already handled by `create_notification()`.

> **Revised in v1.1** for **C2** (always-on types had no SMS opt-out) and **C5** (synchronous sends block the request). Two changes to the version below:
>
> 1. `users.sms_opt_out` / `email_opt_out` are checked **first**, before the category lookup. Types with no category (`maintenance_update`, `overdue`, `payment_received`, `lease_expiring`, every decision notice) return `null` from `notification_pref_category_for_type()` and would otherwise be unstoppable on a paid channel.
> 2. Unless `notifications_dispatch_mode` is `sync`, the function writes to `notification_queue` and returns. `process_queue.php` ([§4.1](#41-notification-queue--process_queuephp)) is the only place a provider is contacted.
>
> Apply both to the code below — it is shown in the original synchronous form so the diff against the queue version is readable:
>
> ```php
> // At the top of dispatch_external_notification(), after fetching $user:
> $mode = get_setting($conn, 'notifications_dispatch_mode', 'queue');
> $category = notification_pref_category_for_type($event_type);
>
> $sms_allowed   = !(int)$user['sms_opt_out']   && !empty($user['contact_no']);
> $email_allowed = !(int)$user['email_opt_out'] && !empty($user['email_address']);
> // ...then the existing per-category checks narrow these further.
>
> // And at each send site:
> if ($sms_allowed) {
>     $mode === 'sync'
>         ? send_sms($conn, $user['contact_no'], $sms_text, $event_type, $user_id)
>         : enqueue_notification($conn, $user_id, 'sms', $event_type,
>               ['to' => $user['contact_no'], 'body' => $sms_text]);
> }
> ```
>
> `enqueue_notification()` is a four-line `INSERT` into `notification_queue`; put it in this file next to the dispatcher. Add `first_name` to the payload and pass it to the templates so the greeting is not "Hello ,".

```php
<?php
/**
 * Central notification dispatcher. Call AFTER create_notification().
 *
 * Usage:
 *   require_once __DIR__ . '/services/send_notification.php';
 *   dispatch_external_notification($conn, $user_id, $event_type, $subject, $sms_text, $email_html);
 *
 * This function never throws — failures are logged to notification_log.
 */

require_once __DIR__ . '/send_sms.php';
require_once __DIR__ . '/send_email.php';
require_once __DIR__ . '/email_templates.php';

function dispatch_external_notification($conn, $user_id, $event_type, $subject, $sms_text, $email_html) {
    if (!$user_id || (int)$user_id <= 0) return;

    // Fetch user contact info. sms_opt_out / email_opt_out are the global
    // switches from §1.1 and are checked before any per-category preference.
    $stmt = $conn->prepare("SELECT email_address, contact_no, first_name, sms_opt_out, email_opt_out FROM users WHERE id = ? AND is_archived = 0");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$user) return;

    // Check per-category preferences for this event type
    $category = notification_pref_category_for_type($event_type);

    // --- SMS ---
    if (!empty($user['contact_no']) && !(int)$user['sms_opt_out']) {
        $sms_allowed = true;
        if ($category !== null) {
            $pref = $conn->prepare("SELECT sms_enabled FROM notification_preferences WHERE user_id = ? AND category = ?");
            $pref->bind_param("is", $user_id, $category);
            $pref->execute();
            $row = $pref->get_result()->fetch_assoc();
            $pref->close();
            if ($row && !(int)$row['sms_enabled']) $sms_allowed = false;
        }
        if ($sms_allowed) {
            send_sms($conn, $user['contact_no'], $sms_text, $event_type, $user_id);
        }
    }

    // --- Email ---
    if (!empty($user['email_address']) && !(int)$user['email_opt_out']) {
        $email_allowed = true;
        if ($category !== null) {
            $pref = $conn->prepare("SELECT email_enabled FROM notification_preferences WHERE user_id = ? AND category = ?");
            $pref->bind_param("is", $user_id, $category);
            $pref->execute();
            $row = $pref->get_result()->fetch_assoc();
            $pref->close();
            if ($row && !(int)$row['email_enabled']) $email_allowed = false;
        }
        if ($email_allowed) {
            send_email($conn, $user['email_address'], $subject, $email_html, $event_type, $user_id);
        }
    }
}

/**
 * Broadcast to multiple users (e.g. announcements).
 * $user_ids: array of user IDs.
 */
function dispatch_external_broadcast($conn, $user_ids, $event_type, $subject, $sms_text, $email_html) {
    foreach ($user_ids as $uid) {
        dispatch_external_notification($conn, $uid, $event_type, $subject, $sms_text, $email_html);
    }
}
?>
```

---

## Phase 2 — Wire to Existing Endpoints

> ### ✅ §2.1–§2.4 shipped — what the code actually does
>
> All seven admin endpoints are wired (announcements, maintenance, payment reminders ×2 paths, CCTV, parking, service, tenant requests). Three differences from the listings below:
>
> **Call sites use `dispatch_admin_action_notification()`, not the dispatcher directly.** It is a thin wrapper in [`send_notification.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/services/send_notification.php) that adds two things the raw dispatcher cannot: a **`rendered`** block (the post-`gsm7_safe()`, post-`sms_single_segment()` SMS text, the subject and the email HTML) and a **`dry_run`** flag. Endpoints return that as `notification_dispatch`, and a response interceptor in `axiosConfig.js` prints it to the browser console. On a mock driver the console *is* the message, so this is what makes the feature visible without a provider. `dispatch_admin_action_broadcast()` is the announcement equivalent. A companion `notify_recipient_name()` supplies the template greeting so it never renders "Hello ,".
>
> **Admin actions dispatch synchronously while both drivers are `log`.** `dispatch_external_notification()` gained an optional 7th parameter, `$force_mode`; `_admin_action_mode()` returns `'sync'` only when `sms_provider` **and** `email_driver` are both `log`, otherwise `null` (fall through to the configured mode). Sync is what puts the rendered message in the HTTP response. Forcing it unconditionally would undo C5's whole point the day a provider is configured — an announcement to 30 tenants would become 30 round trips inside one POST. Configure a real provider and the endpoints silently revert to enqueuing.
>
> **Dispatch happens after `commit()` where the endpoint has a transaction** (announcements, tenant requests). A notification problem must not roll back an announcement tenants can already see, or an approval that has already changed occupancy and billing. `create_announcement.php` consequently records `channels` by **updating** the row after the broadcast, so the stored value reflects what actually reached someone rather than §2.1's hardcoded `['in-app']`.
>
> **§2.5 (the daily sweep) is deliberately not wired.** It runs from cron with no browser, so it gains nothing from sync dispatch and belongs on the queue path. See [`sms_email_mock_testing.md` §6](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/sms_email_mock_testing.md) for how to drive the wired endpoints from the UI.

Each change below is a single `require_once` + a function call added **after** the existing `create_notification()` call. The in-app notification remains the primary channel.

> **Two corrections that apply to this whole phase.**
>
> **C13 — anchor on code, not line numbers.** Several "after line N" references below have already drifted (`config.php`'s sweep is near 1585, not 1590). Search for the `create_notification(...)` call text instead.
>
> **C5 — every call site should be `dispatch_external_notification()`, never `send_sms()` / `send_email()` directly.** With the dispatcher enqueuing ([§1.6](#16-central-dispatcher--send_notificationphp)), each endpoint's added cost is one `INSERT`. §2.1's per-recipient loop below predates that decision and is kept only to show what changes; use the replacement immediately after it.

### 2.1 Announcements — create_announcement.php

**File:** [`backend/api/create_announcement.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/create_announcement.php)

> **Shipped (2026-09-24).** The endpoint dispatches through `dispatch_admin_action_broadcast()` after the commit. The admin form's `channels` is honoured — SMS/email text is passed as `null` (skipped) unless that channel was ticked; in-app always goes out — and `announcements.channels` is rewritten with the channels that actually reached someone. `unit` targets one unit's current tenants; `draft: true` stores a `status = 'draft'` row and notifies nobody. The cost preview (§0.5 *Should*) is not built.

**What changes:** After the in-app notification loop (line 80–82), add SMS/email dispatch if those channels were selected. Replace the hardcoded `$channels = json_encode(['in-app'])` with the actual input.

```diff
 // Line 23 — accept channel selection from the admin form
-$channels = json_encode(['in-app']); // Email and SMS are not built (checklist 6.6 / 6.7).
+$requested_channels = $input['channels'] ?? ['in-app'];
+if (!is_array($requested_channels)) $requested_channels = ['in-app'];
+$channels = json_encode(array_values(array_intersect($requested_channels, ['in-app', 'sms', 'email'])));

 // After line 86 (the commit + log_activity), before the json_encode response:
+    // --- SMS / Email dispatch (checklist 6.6, 6.7) ---
+    require_once __DIR__ . '/services/send_notification.php';
+    $sms_sent = 0;
+    $email_sent = 0;
+
+    if (in_array('sms', $requested_channels) || in_array('email', $requested_channels)) {
+        $sms_text   = "AMS: $title — " . mb_substr($body, 0, 120);
+        $email_html = email_announcement_template($title, $body, $tag);
+
+        foreach ($recipients as $uid) {
+            if (in_array('sms', $requested_channels)) {
+                // send_sms checks global enable + user preference internally
+                $u = $conn->prepare("SELECT contact_no FROM users WHERE id = ?");
+                $u->bind_param("i", $uid);
+                $u->execute();
+                $ur = $u->get_result()->fetch_assoc();
+                $u->close();
+                if ($ur && !empty($ur['contact_no'])) {
+                    if (send_sms($conn, $ur['contact_no'], $sms_text, $notif_type, $uid)) $sms_sent++;
+                }
+            }
+            if (in_array('email', $requested_channels)) {
+                $u = $conn->prepare("SELECT email_address FROM users WHERE id = ?");
+                $u->bind_param("i", $uid);
+                $u->execute();
+                $ur = $u->get_result()->fetch_assoc();
+                $u->close();
+                if ($ur && !empty($ur['email_address'])) {
+                    if (send_email($conn, $ur['email_address'], "AMS Announcement: $title", $email_html, $notif_type, $uid)) $email_sent++;
+                }
+            }
+        }
+    }
```

**Use this instead.** The loop above issues one `SELECT`, one cURL call and one SMTP handshake *per recipient* inside a single POST — a 30-tenant announcement is 30 blocking round trips, and it re-queries `users` twice per tenant for data the dispatcher already has. Replace the whole `foreach` with:

```php
require_once __DIR__ . '/services/send_notification.php';

$sms_text   = gsm7_safe("AMS: $title - " . mb_substr($body, 0, 90));
$email_html = email_announcement_template($title, $body, $tag);

// Enqueues; returns immediately. Per-user opt-outs are applied inside.
dispatch_external_broadcast(
    $conn, $recipients, $notif_type,
    "AMS Announcement: $title", $sms_text, $email_html
);
```

`$requested_channels` still decides *whether* to dispatch; pass it through to the dispatcher (or skip the call) rather than branching per recipient.

> **Cost gate (§0.3).** Announcements are the one event that multiplies by tenant count, and the category closest to marketing. Three rules for the admin form:
> - SMS is **off by default** and must be ticked deliberately per announcement.
> - Show the recipient count and the estimated cost next to the tick (`{n} recipients × ₱0.50 ≈ ₱{n×0.5}`), read from a `sms_unit_cost` setting.
> - Respect the `announcements` preference category — this is the one broadcast a tenant can fully mute, and it should be **opt-in** for SMS rather than opt-out.

---

### 2.2 Maintenance Status — update_maintenance_status.php

**File:** [`backend/api/update_maintenance_status.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/update_maintenance_status.php) — **Closes checklist 4.10 🔧**

**What changes:** After the `create_notification()` call on line 163, dispatch SMS/email.

```diff
 // After line 163:
 create_notification($conn, $current['user_id'], 'maintenance_update', 'Maintenance Update', $message);

+    // SMS/Email (checklist 4.10 — external channels)
+    require_once __DIR__ . '/services/send_notification.php';
+    $sms_text = "AMS: Your request \"$label\" is now $new_status.";
+    if ($rejection_reason !== null) $sms_text .= " Reason: $rejection_reason";
+    $email_html = email_status_update_template(
+        '', 'maintenance', $label, $new_status,
+        $rejection_reason ? "Reason: $rejection_reason" : ''
+    );
+    dispatch_external_notification(
+        $conn, $current['user_id'], 'maintenance_update',
+        "Maintenance Update — $label", $sms_text, $email_html
+    );
```

---

### 2.3 Payment Reminders — send_payment_reminder.php

**File:** [`backend/api/send_payment_reminder.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/send_payment_reminder.php)

**What changes:** After each `create_notification()` call (lines 50 and 104), also dispatch SMS/email.

```diff
 // After line 50 (batch mode) and line 104 (single mode):
 create_notification($conn, $inv['user_id'], $overdue ? 'overdue' : 'rent_due', $title, $message);

+require_once __DIR__ . '/services/send_notification.php';
+$amount_fmt = '₱' . number_format((float)$inv['total_amount'], 2);
+$unit = $inv['room_name'] ?: 'your unit';
+$due_text = (new DateTime($inv['due_date']))->format('M j');
+$sms_text = $overdue
+    ? "AMS: Your {$amount_fmt} rent for {$unit} is overdue. Please settle immediately."
+    : "AMS: Your {$amount_fmt} rent for {$unit} is due {$due_text}.";
+$email_html = email_payment_template(
+    '', $inv['total_amount'], $unit, $inv['billing_period'] ?? '',
+    $overdue ? 'overdue' : 'reminder'
+);
+dispatch_external_notification(
+    $conn, $inv['user_id'], $overdue ? 'overdue' : 'rent_due',
+    ($overdue ? '⚠️ Overdue Payment' : 'Rent Payment Reminder') . " — $unit",
+    $sms_text, $email_html
+);
```

---

### 2.4 CCTV / Parking / Service Status Endpoints

The same pattern applies to each status-change endpoint. After the existing `create_notification()` call, add `dispatch_external_notification()`.

| File | Notification Call Line | SMS Text Pattern |
|---|---|---|
| [`update_cctv_status.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/update_cctv_status.php) | L57 | `AMS: Your CCTV request for {location} has been {status}.` |
| [`update_parking_status.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/update_parking_status.php) | After status notification | `AMS: Your parking request has been {status}.` |
| [`update_service_status.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/update_service_status.php) | After status notification | `AMS: Service request #{id} is now {status}.` |
| [`process_tenant_request.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/process_tenant_request.php) | After decision notification | `AMS: Your {type} request has been {decision}.` |

**Example — update_cctv_status.php (L54–58):**

```diff
     if ($cctv) {
         $notifTitle = "CCTV Request " . $status;
         $notifMsg = "Your CCTV footage request for " . $cctv['location_details'] . " on " . $cctv['incident_date'] . " has been " . strtolower($status) . ".";
         create_notification($conn, $cctv['user_id'], 'cctv_request', $notifTitle, $notifMsg);
+
+        require_once __DIR__ . '/services/send_notification.php';
+        $sms_text = "AMS: " . $notifMsg;
+        $email_html = email_status_update_template('', 'cctv', $cctv['location_details'], $status);
+        dispatch_external_notification($conn, $cctv['user_id'], 'cctv_request', $notifTitle, $sms_text, $email_html);
     }
```

---

### 2.5 Daily Sweep — run_notification_sweep()

**File:** [`backend/config.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/config.php) — `run_notification_sweep()`, near line 1585 (search for the function, not the line — C13)

> **This is the highest-value wiring in Phase 2 and the one most at risk from C5.** The sweep runs from `get_notifications.php` — a poll that *every signed-in page* makes. The first request of the day claims the run, so if the sweep sends synchronously, one unlucky tenant's page load carries every rent-due SMS and email for the whole building. Enqueuing is not optional here.
>
> The sweep is also the natural place to **drain** the queue on Railway (C7): after the reminder loops, call `process_notification_queue($conn, 20)` — the same function `process_queue.php` wraps. One tenant's poll then carries at most 20 sends, and the next poll carries the next 20.

The sweep already calls `create_notification()` for rent-due and overdue reminders (lines 1641, 1660). Add SMS/email dispatch alongside:

```diff
 // Line 1641 (upcoming reminders):
 create_notification($conn, $inv['user_id'], 'rent_due', $title, $message);
+dispatch_external_notification($conn, $inv['user_id'], 'rent_due',
+    "Rent Due — " . ($inv['room_name'] ?: 'your unit'),
+    "AMS: " . strip_tags($message),
+    email_payment_template('', $inv['total_amount'], $inv['room_name'] ?: 'your unit', $inv['billing_period'] ?? '', 'reminder')
+);

 // Line 1660 (overdue reminders):
 create_notification($conn, $inv['user_id'], 'overdue', $title, $message);
+dispatch_external_notification($conn, $inv['user_id'], 'overdue',
+    "⚠️ Overdue Payment — " . ($inv['room_name'] ?: 'your unit'),
+    "AMS: " . strip_tags($message),
+    email_payment_template('', $inv['total_amount'], $inv['room_name'] ?: 'your unit', $inv['billing_period'] ?? '', 'overdue')
+);
```

Add at the top of `run_notification_sweep()`:

```php
require_once __DIR__ . '/api/services/send_notification.php';
```

---

## Phase 3 — User Controls

### 3.1 Extend Preferences API

> **Shipped 2026-09-22** — both endpoints below are done, including the C9 dual-shape handling. See [§0.1a](#01a-what-shipped). The listings that follow describe what was applied; the frontend (§3.2) is still outstanding.

#### get_notification_preferences.php

**File:** [`backend/api/get_notification_preferences.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_notification_preferences.php)

```diff
-$stmt = $conn->prepare("SELECT category, in_app_enabled FROM notification_preferences WHERE user_id = ?");
+$stmt = $conn->prepare("SELECT category, in_app_enabled, sms_enabled, email_enabled FROM notification_preferences WHERE user_id = ?");

 // In the foreach loop:
 $preferences[] = [
     'category'       => $key,
     'label'          => $cat['label'],
     'in_app_enabled' => $saved[$key]['in_app'] ?? true,
+    'sms_enabled'    => $saved[$key]['sms'] ?? true,
+    'email_enabled'  => $saved[$key]['email'] ?? true,
 ];

 // Update the $saved parsing:
-foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
-    $saved[$row['category']] = (bool)$row['in_app_enabled'];
-}
+foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
+    $saved[$row['category']] = [
+        'in_app' => (bool)$row['in_app_enabled'],
+        'sms'    => (bool)$row['sms_enabled'],
+        'email'  => (bool)$row['email_enabled'],
+    ];
+}
```

Also add to the response:

```diff
 echo json_encode([
     "success"     => true,
     "preferences" => $preferences,
     "always_on"   => [...],
+    "channels"    => [
+        "sms_available"   => get_setting($conn, 'notifications_sms_enabled', '0') === '1',
+        "email_available" => get_setting($conn, 'notifications_email_enabled', '0') === '1',
+    ],
+    // Global switches (§1.1). The UI shows these above the per-category table,
+    // because they win over it.
+    "sms_opt_out"   => (bool)$me['sms_opt_out'],
+    "email_opt_out" => (bool)$me['email_opt_out'],
+    // So the UI can warn when a channel is on but unreachable.
+    "has_contact_no"  => !empty($me['contact_no']),
+    "has_email"       => !empty($me['email_address']),
 ]);
```

`$me` is one extra `SELECT contact_no, email_address, sms_opt_out, email_opt_out FROM users WHERE id = ?`.

#### update_notification_preferences.php

**File:** [`backend/api/update_notification_preferences.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/update_notification_preferences.php)

Accept per-channel preferences in the payload:

```json
{
  "preferences": {
    "announcements": { "in_app": true, "sms": false, "email": true },
    "payment_reminders": { "in_app": true, "sms": true, "email": true }
  },
  "sms_opt_out": false,
  "email_opt_out": false
}
```

> **C9 — this is a breaking change, and the diff below is incomplete.** The endpoint validates each value with `if (!is_bool($enabled) && !in_array($enabled, [0, 1, '0', '1'], true))` and **422s before reaching the insert**, so an object payload is rejected outright. [`UserNotifications.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/UserNotifications.jsx) — **not** `ProfileSettings.jsx`, which has no preferences UI — also still sends the old flat shape, so a backend-only deploy would break saving entirely.
>
> Accept both shapes. Replace the validation loop with:
>
> ```php
> foreach ($prefs as $category => $value) {
>     if (!isset(NOTIFICATION_PREF_CATEGORIES[$category])) { /* existing 422 */ }
>
>     // Legacy shape: true|false|0|1 means in-app only, channels untouched.
>     if (!is_array($value)) {
>         if (!is_bool($value) && !in_array($value, [0, 1, '0', '1'], true)) { /* existing 422 */ }
>         continue;
>     }
>     // New shape: { in_app, sms, email } — each key optional, each a boolean.
>     foreach (['in_app', 'sms', 'email'] as $ch) {
>         if (array_key_exists($ch, $value)
>             && !is_bool($value[$ch]) && !in_array($value[$ch], [0, 1, '0', '1'], true)) {
>             http_response_code(422);
>             echo json_encode(["success" => false, "message" => "Preference values must be true or false."]);
>             exit;
>         }
>     }
> }
> ```
>
> A missing key must mean **"leave unchanged"**, not "set true" — otherwise the legacy frontend silently re-enables SMS on every save. Use `COALESCE` in the upsert, or read the existing row first.
>
> **Also handle the global switches here.** `sms_opt_out` / `email_opt_out` (§1.1) live on `users`, not in `preferences`, and they are what make the opt-out defensible under [§0.4](#04-philippine-sms-rules--compliance):
>
> ```php
> if (array_key_exists('sms_opt_out', $input) || array_key_exists('email_opt_out', $input)) {
>     $sms   = !empty($input['sms_opt_out'])   ? 1 : 0;
>     $email = !empty($input['email_opt_out']) ? 1 : 0;
>     $u = $conn->prepare("UPDATE users SET sms_opt_out = ?, email_opt_out = ? WHERE id = ?");
>     $u->bind_param("iii", $sms, $email, $auth['id']);
>     $u->execute();
>     $u->close();
>     $changed[] = 'sms ' . ($sms ? 'off' : 'on') . ', email ' . ($email ? 'off' : 'on');
> }
> ```
>
> The existing `log_activity($conn, $auth['id'], 'user', 'Updated Notification Preferences', ...)` call already covers this — keep appending to `$changed` so the channel change is auditable.
>
> **Ship order:** backend (accepting both shapes) → verify the old frontend still saves → frontend.

```diff
-$stmt = $conn->prepare("INSERT INTO notification_preferences (user_id, category, in_app_enabled) VALUES (?, ?, ?)
-                        ON DUPLICATE KEY UPDATE in_app_enabled = VALUES(in_app_enabled)");
+$stmt = $conn->prepare("INSERT INTO notification_preferences (user_id, category, in_app_enabled, sms_enabled, email_enabled)
+                        VALUES (?, ?, ?, ?, ?)
+                        ON DUPLICATE KEY UPDATE in_app_enabled = VALUES(in_app_enabled),
+                                                sms_enabled = VALUES(sms_enabled),
+                                                email_enabled = VALUES(email_enabled)");

 foreach ($prefs as $category => $settings) {
-    $flag = $enabled ? 1 : 0;
-    $stmt->bind_param("isi", $auth['id'], $category, $flag);
+    $in_app = ($settings['in_app'] ?? true) ? 1 : 0;
+    $sms    = ($settings['sms'] ?? true) ? 1 : 0;
+    $email  = ($settings['email'] ?? true) ? 1 : 0;
+    $stmt->bind_param("isiii", $auth['id'], $category, $in_app, $sms, $email);
     $stmt->execute();
 }
```

---

### 3.2 Profile Settings UI

**File:** [`ams-react/src/UserPages/UserNotifications.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/UserNotifications.jsx) — the preferences panel lives here, not in `ProfileSettings.jsx` (C13).

Add a "Notification Preferences" section with three toggles per category.

Four things the table below does not cover, all of them from [§0.4](#04-philippine-sms-rules--compliance):

- **The global switches come first**, above the table: "Send me SMS" and "Send me email". They override every row, and they are what a tenant reaches for when they want it to stop.
- **A consent line** under the SMS switch: *"We use your number only for building notices and billing reminders. Standard carrier rates do not apply — messages are sent by the building."* Record the moment in `users.sms_consent_at`.
- **Warn when a channel is on but unreachable** — SMS enabled with an empty `contact_no` is the most common support ticket. Use `has_contact_no` / `has_email` from the response above.
- **SMS defaults off per category**, email defaults on. Overdue and urgent announcements are the only SMS defaults worth arguing for, and they are always-on types anyway (C2), so they are governed by the global switch rather than the table.

Also note the table headers below are gated on `channels.sms_available`, which is the *admin's* global enable. When the admin has SMS off, the column disappears rather than showing toggles that do nothing.

```jsx
// Notification preferences section (after existing profile fields)
<div className="notification-prefs-section">
  <h3>Notification Preferences</h3>
  <p className="prefs-subtitle">Choose how you'd like to be notified</p>

  <table className="prefs-table">
    <thead>
      <tr>
        <th>Category</th>
        <th>In-App</th>
        {channels.sms_available && <th>SMS</th>}
        {channels.email_available && <th>Email</th>}
      </tr>
    </thead>
    <tbody>
      {preferences.map(pref => (
        <tr key={pref.category}>
          <td>{pref.label}</td>
          <td><ToggleSwitch checked={pref.in_app_enabled} onChange={...} /></td>
          {channels.sms_available && <td><ToggleSwitch checked={pref.sms_enabled} onChange={...} /></td>}
          {channels.email_available && <td><ToggleSwitch checked={pref.email_enabled} onChange={...} /></td>}
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

---

### 3.3 Admin Settings UI — SMTP / SMS Config

**File:** [`ams-react/src/AdminPages/AdminAccountSettings.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminAccountSettings.jsx) — **shipped 2026-09-22**, ahead of the rest of Phase 3, because a mock build you cannot drive from the UI is not much of a demo.

> **Three things the table below does not mention.**
>
> 1. **The settings map is where the work is.** `settings` on that page is camelCase and passes through [`ams-react/src/config/systemSettings.js`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/config/systemSettings.js), where `saveSystemSettings()` posts a **fixed payload object**. A key missing from that object is silently never saved, so each setting needs an entry in `DEFAULTS`, in `getSystemSettings()` **and** in `saveSystemSettings()` — three places, not one form field.
> 2. **`log` is the first option in both driver dropdowns**, and an inline note marks the real providers as not yet implemented. The **Email Driver** dropdown (`log` | `smtp`) is the new `email_driver` setting.
> 3. **A "Send test notification" control** posts to `send_test_notification.php` (admin-only; always to the admin's own number and address, never a tenant's) and prints the full rendered SMS text and email HTML to the **browser console**. On a mock driver that console output *is* the message. The response carries a `dry_run` flag so a log-driver success cannot be read as a delivery.

Fields, alongside the existing PayMongo settings:

| Field | Setting Key | Input Type |
|---|---|---|
| **Email Notifications** | `notifications_email_enabled` | Toggle |
| SMTP Host | `smtp_host` | Text |
| SMTP Port | `smtp_port` | Number |
| SMTP Username | `smtp_username` | Text |
| SMTP Password | `smtp_password` | Password |
| From Name | `smtp_from_name` | Text |
| From Email | `smtp_from_email` | Text |
| **SMS Notifications** | `notifications_sms_enabled` | Toggle |
| SMS Provider | `sms_provider` | Dropdown: `log` · `semaphore` |
| SMS Sender Name | `sms_sender_name` | Text |
| **— Semaphore fields** | *(show when provider = semaphore)* | |
| API Key | `sms_api_key` | Password |

> **Security — C3, corrected.** The claim that these keys are "already masked" is wrong. What exists today is a secret list under **different names** that nothing reads or writes:
>
> - `update_system_settings.php:24` — `$secret_keys = ['paymongo_secret_key', 'paymongo_webhook_secret', 'semaphore_api_key', 'smtp_pass', 'smtp_user'];` (keeps values out of the activity log)
> - `get_system_settings.php:27-33` — `$sensitive_keys = [...same five...];` (stripped for non-admins)
>
> `semaphore_api_key`, `smtp_pass` and `smtp_user` are placeholders from an earlier design. **Replace those three entries in both lists** with every new secret, in the same commit as the migration:
>
> ```php
> $secret_keys = [
>     'paymongo_secret_key', 'paymongo_webhook_secret',
>     'smtp_username', 'smtp_password',
>     'sms_api_key',
> ];
> ```
>
> Two further points, **both now done** (2026-09-22, when the form that renders these fields landed):
> - **The lists must stay identical.** ✅ Hoisted into `config.php` as `const SECRET_SETTING_KEYS`; both endpoints read it, so they cannot drift again.
> - **`get_system_settings.php` only stripped secrets for non-admins**, so an admin's browser received the SMTP password and every API key as cleartext JSON. ✅ Admins now get `••••1234` (`mask_secret_value()`), and `update_system_settings.php` skips any value that comes back still masked (`is_masked_secret()`) — an untouched field cannot overwrite a working key. This covers the three PayMongo secrets, which the same page already rendered.

> **Conditional fields:** The admin UI should show/hide provider-specific fields based on the selected `sms_provider` value. Use a simple conditional render — when the dropdown changes, only the relevant credential fields appear. This keeps the form clean and avoids confusion.

---

## Phase 4 — Polish

### 4.1 Notification Queue — process_queue.php

**File:** [`backend/cron/process_queue.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/cron/process_queue.php) — **shipped**, as a thin CLI wrapper over `process_notification_queue()` in `send_notification.php`. All four corrections below are implemented. The `flock` in the listing was dropped: claiming the batch with a token makes it redundant. The web-path drain (change 1) is deferred to Phase 2 — nothing enqueues from an endpoint yet.

Processes the `notification_queue` table with retry and exponential backoff.

> **Moved to Phase 1 in v1.1** — see [§0.2](#02-architecture-decision--queue-first). Nothing should enqueue before this exists.

Four changes to the script below:

**1. C7 — Railway has no cron.** Windows Task Scheduler only covers the XAMPP install; the SaaS deployment would queue and never drain. Split the work into a function and give it two entry points, exactly as `run_notification_sweep()` already does:

```php
// In config.php (or api/services/send_notification.php):
//   $limit sends per call. Returns ['processed' => n, 'failed' => n].
function process_notification_queue($conn, $limit = 20) { /* the loop below */ }
```

- **XAMPP:** `backend/cron/process_queue.php` calls it, Task Scheduler runs that every minute.
- **Railway:** `run_notification_sweep()` calls it at the end of each run, and `get_notifications.php` — which every signed-in page polls — calls it with a small limit and its own once-per-N-minutes claim row (`notification_queue_last_run`), mirroring `notification_sweep_last_run`. A building with anyone logged in drains continuously; a building with nobody logged in has nobody waiting on a notification.
- Keep the limit small on the web path. 20 SMTP handshakes is several seconds a tenant should not pay for; 5 is plenty.

**2. Quiet hours (§0.4).** Skip non-urgent jobs outside `notifications_quiet_start`–`notifications_quiet_end` by pushing `next_attempt_at` to the window's end rather than sending:

```php
$hour = (int)date('G');
$quiet = $hour >= (int)get_setting($conn, 'notifications_quiet_start', '21')
      || $hour <  (int)get_setting($conn, 'notifications_quiet_end', '07');
$urgent = in_array($job['event_type'], ['overdue', 'action'], true);
if ($job['channel'] === 'sms' && $quiet && !$urgent) { /* defer, continue */ }
```

**3. Rate limiting.** The driver does not throttle and Semaphore rate-limits bursts, so add a `usleep(200000)` between sends and a per-recipient daily count check against `notification_log`.

**4. Retention (C11).** Prune at the end of each run:

```php
$days = (int)get_setting($conn, 'notification_log_retention_days', '90');
$conn->query("DELETE FROM notification_log WHERE sent_at < DATE_SUB(NOW(), INTERVAL $days DAY) LIMIT 5000");
```

**Task Scheduler setup (XAMPP only):**

```php
<?php
/**
 * Notification queue processor (CLI only).
 *
 * Task Scheduler setup:
 *   Program:   C:\xampp\php\php.exe
 *   Arguments: C:\xampp\htdocs\ApartmentManagementSystem_React\backend\cron\process_queue.php
 *   Trigger:   Every 1 minute
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../api/services/send_email.php';
require_once __DIR__ . '/../api/services/send_sms.php';

// Lock: only one instance at a time.
$lock_file = sys_get_temp_dir() . '/ams_queue_lock';
$fp = fopen($lock_file, 'w');
if (!flock($fp, LOCK_EX | LOCK_NB)) {
    echo "Another instance is running.\n";
    exit;
}

$batch = $conn->query("
    SELECT * FROM notification_queue
    WHERE status = 'pending' AND next_attempt_at <= NOW()
    ORDER BY created_at ASC LIMIT 20
");

$processed = 0;
while ($job = $batch->fetch_assoc()) {
    $conn->query("UPDATE notification_queue SET status='processing' WHERE id={$job['id']}");
    $payload = json_decode($job['payload'], true);

    $success = match($job['channel']) {
        'email' => send_email($conn, $payload['to'], $payload['subject'], $payload['body'], $job['event_type'], $job['user_id']),
        'sms'   => send_sms($conn, $payload['to'], $payload['body'], $job['event_type'], $job['user_id']),
        default => false
    };

    if ($success) {
        $stmt = $conn->prepare("UPDATE notification_queue SET status='sent', processed_at=NOW() WHERE id=?");
        $stmt->bind_param("i", $job['id']);
        $stmt->execute();
        $stmt->close();
    } else {
        $attempts = $job['attempts'] + 1;
        $status = $attempts >= $job['max_attempts'] ? 'failed' : 'pending';
        $backoff = min(60 * pow(2, $attempts), 3600);
        $stmt = $conn->prepare("UPDATE notification_queue SET status=?, attempts=?,
                                next_attempt_at=DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id=?");
        $stmt->bind_param("siii", $status, $attempts, $backoff, $job['id']);
        $stmt->execute();
        $stmt->close();
    }
    $processed++;
}

echo '[' . date('Y-m-d H:i:s') . "] Processed $processed queued notification(s).\n";

flock($fp, LOCK_UN);
fclose($fp);
$conn->close();
?>
```

> **Claim the batch, don't just lock the file.** The `flock` above only guards the CLI script — once the sweep and the `get_notifications.php` poll also drain the queue (change 1), two PHP processes can `SELECT` the same pending rows. Claim atomically instead, the same claim-first pattern `post_parking_charge()` uses:
>
> ```php
> $token = bin2hex(random_bytes(8));
> $conn->query("UPDATE notification_queue SET status='processing', claim_token='$token'
>               WHERE status='pending' AND next_attempt_at <= NOW()
>               ORDER BY created_at LIMIT $limit");
> $batch = $conn->query("SELECT * FROM notification_queue WHERE claim_token='$token'");
> ```
>
> Add `claim_token CHAR(16) DEFAULT NULL` to the table in §1.1. Also add a reaper for rows stuck in `processing` (a crashed run leaves them there forever): `UPDATE notification_queue SET status='pending' WHERE status='processing' AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`.
>
> Two smaller fixes to the script as written: `$job['id']` is interpolated into a query string (it is an int from the DB, so not injectable, but bind it anyway for consistency with the project's prepared-statement rule), and `send_email()` opens a new SMTP connection per job — reuse one `PHPMailer` instance with `SMTPKeepAlive = true` across the batch and Gmail will be far happier.

---

### 4.2 Delivery Log Viewer

Add a "Delivery Log" tab to [`AdminNotifications.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminNotifications.jsx) that queries `notification_log`:

```
GET /api/get_notification_log.php?page=1&channel=sms&status=failed
```

Returns:

```json
{
  "success": true,
  "logs": [
    {
      "id": 42,
      "channel": "sms",
      "event_type": "rent_due",
      "recipient": "+639171234567",
      "status": "failed",
      "error_message": "cURL timeout",
      "sent_at": "2026-09-21 09:15:00"
    }
  ],
  "total": 42
}
```

**File:** `backend/api/get_notification_log.php` **[NEW]** — admin-only, paginated, filterable by channel and status.

---

### 4.3 Verification

**There is no test runner in this project** (CLAUDE.md), so verification is: `php -l` on every changed file, `npm run build:local` for JSX, CLI scripts for the services, and curl against a restored database for the endpoints. The advantage of the `log` driver ([§1.3](#13-sms-service--send_smsphp)) is that almost everything below is assertable against `notification_log` with **zero spend and no provider account**.

Test IDs follow the verification-guide convention (`M<module>-NN`, module 6 — Notifications). Add these to `docs/documentation/module_verification_guide.md` §2 when the module is audited.

**Tier 1 — dry run (`sms_provider = 'log'`, no account needed)**

| ID | Test | Expected |
|---|---|---|
| M6-01 | Migration applied twice in a row | Second run is a no-op; no error (idempotency, CLAUDE.md rule) |
| M6-02 | `normalize_ph_mobile()` over `09171234567`, `0917 123-4567`, `+63 917 123 4567`, `639171234567`, `9171234567` | All five → `+639171234567` |
| M6-03 | Same over `12345`, `''`, `+14155551234`, `abc` | All → `null`, logged `failed` / "Invalid phone number" |
| M6-04 | `gsm7_safe("AMS: ₱4,500 rent — due Oct 5 ✅")` | No `₱`, no em dash, no emoji; `strlen === mb_strlen` |
| M6-05 | Message longer than 160 chars | Truncated to 160 with `...`; one segment |
| M6-06 | Change a maintenance ticket status | One `notification_log` row per channel, `status='sent'`, correct `event_type` — **closes 4.10** |
| M6-07 | Admin toggles `notifications_sms_enabled` off, repeat M6-06 | SMS row `status='skipped'`, reason "SMS globally disabled"; email unaffected |
| M6-08 | Tenant sets `sms_opt_out = 1`, repeat M6-06 | **No SMS row at all** (dispatcher short-circuits). This is the C2 regression test — `maintenance_update` has no preference category |
| M6-09 | Tenant disables `announcements` → SMS, admin posts an announcement | In-app + email only; no SMS row for that tenant, SMS rows for others |
| M6-10 | Tenant with `contact_no = NULL` | No SMS row, no error, email still sent |
| M6-11 | Announcement to 30 seeded tenants | Response returns in **< 1 s**; 60 `notification_queue` rows; zero provider calls during the request (C5) |
| M6-12 | Run the queue drain | Rows move `pending → sent`; `notification_log` gains one row each |
| M6-13 | Force a driver failure (bad key) and drain 4× | `attempts` 1→2→3, `next_attempt_at` backs off, then `status='failed'`; no infinite retry |
| M6-14 | Two drains started concurrently | No job sent twice (claim-token test) |
| M6-15 | Queue a non-urgent SMS at 23:00 | Deferred to `notifications_quiet_end`, not sent |
| M6-16 | Queue an `overdue` SMS at 23:00 | Sent — urgent types are exempt |
| M6-17 | Maintenance description containing `<img src=x onerror=alert(1)>`, then read the email body | Escaped as text (C10) |
| M6-18 | Insert a `notification_log` row dated 100 days ago, drain | Row pruned at the retention threshold (C11) |
| M6-19 | `GET get_notification_preferences.php` | Returns `sms_enabled` / `email_enabled` per category plus `sms_opt_out`, `email_opt_out`, `channels` |
| M6-20 | `POST update_notification_preferences.php` with the **legacy** flat payload | Still 200; in-app updated; SMS/email flags unchanged (C9 back-compat) |
| M6-21 | Same with the new object payload | 200; all three flags updated; `activity_log` row written |
| M6-22 | Same with `{"announcements": {"sms": "yes"}}` | 422, "Preference values must be true or false." |
| M6-23 | Non-admin `GET get_system_settings.php` | No `smtp_password`, no `sms_*` secret in the response (C3) |
| M6-24 | Admin saves SMTP settings | `activity_log` details contain no cleartext secret |
| M6-25 | Register a tenant with a 40-character email address | Accepted and stored intact (C4) |
| M6-26 | `php backend/cron/check_environment.php` | Passes; no new warnings |
| M6-35 | `send_sms()` with `sms_provider = 'log'` (selftest) | Outbox file written, `sent` row, no network call |
| M6-36 | `sms_daily_cap` at or below today's `sent` count, provider `semaphore` | Row `skipped`, "Daily SMS cap reached (N)"; Semaphore not called |
| M6-37 | Provider `semaphore` with an invalid API key | Row `failed`, "Semaphore: The selected apikey is invalid." — not `sent`, although Semaphore answers HTTP 200 |
| M6-38 | `GET get_sms_balance.php` as tenant / unauthenticated / admin on `log` | 403 / 401 / `success:false` "only available when the SMS provider is Semaphore" |
| M6-39 | `send_sms()` of "🔔 Test reminder" (selftest) | Logged and sent as `AMS: Test reminder` — Semaphore silently drops messages starting with "TEST" |
| M6-40 | Two `GET get_sms_balance.php` calls within a minute, provider `semaphore` | Second answer is `Semaphore rate limit reached (retry after 60s)` on a 429 (seen live with an invalid key, 2026-09-24); with a valid key the second call is served from the 60 s cache (`cached: true`, `checked_at`) and Semaphore is not called |

**Tier 2 — live provider (costs credits; run once, record the result)**

| ID | Test | Expected |
|---|---|---|
| M6-27 | Send one SMS to your own number via the real driver (**Send test**) | Delivered. Sender is `SEMAPHORE` while `sms_sender_approved = '0'`, the registered name once it is `'1'` |
| M6-28 | Send with an unapproved sender ID | Documents the actual failure mode — likely a success response and no delivery (§0.4). Worth knowing before the demo |
| M6-29 | Send one email via Gmail SMTP to a Gmail **and** a non-Gmail address | Both land in the inbox, not spam. Check the raw headers for SPF/DKIM alignment |
| M6-30 | Email rendering in Gmail web, Gmail mobile and Outlook | Table layout holds; the `AltBody` plain-text fallback is readable |

**Tier 3 — deployment**

| ID | Test | Expected |
|---|---|---|
| M6-31 | `npm run build:local` | Clean; no localhost-URL guard failure |
| M6-32 | Railway build with the Dockerfile change | `vendor/autoload.php` present in the image; `PHPMailer` class resolves (C6) |
| M6-33 | Queue drains on Railway with no cron | Rows drain via the sweep/poll piggyback (C7) |
| M6-34 | Outbound port 587 from the Railway container | SMTP connects — verify before relying on it |

**Running the tests.** Tier 1 is automated — `php backend/cron/notification_selftest.php` covers M6-02 through M6-18, C11, M6-35, M6-39 and DRY (19 checks) in one run, on the mock drivers, with no spend. The manual recipes that used to sit here (send one SMS, send one email, dispatch and drain, read the log and the outbox) are in the runbook:

> **[`sms_email_mock_testing.md`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/sms_email_mock_testing.md)**

M6-01 (migration idempotency), M6-19 to M6-26 (preferences API, secret masking, the widened `email_address`, the environment check) were verified with the §0.1 work. M6-06, M6-09 and M6-11 need an endpoint to dispatch, so they belong to Phase 2. Tier 3's Railway rows (M6-32, M6-33) are deferred.


After all tests pass:
- Run `php -l` on every changed PHP file, and `npm run build:local` for the JSX
- Update [`panelist_feature_checklist.md`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/panelist_feature_checklist.md): row **4.10** (L708) — drop "+ optional SMS/email, not yet built"; rows **6.6** (L748) and **6.7** (L749) → ✅; row **6.8** (L750) — drop "Per-channel (email/SMS) preferences await 6.6/6.7". Update the detail table and the summary counts in the same pass (CLAUDE.md panel-audit routine).
- Add a §2 section to [`module_verification_guide.md`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/documentation/module_verification_guide.md) with the M6-NN IDs above
- Update [`database_schema.md`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/documentation/database_schema.md) for `notification_log`, `notification_queue`, the new `users` and `notification_preferences` columns, and the widened `email_address`
- Update [`external_services.md`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/documentation/external_services.md) with the chosen SMS provider and Gmail SMTP
- Mirror the migration into `SetupDB.sql` **and** `seed_mock_data.sql`
- Update [`consolidated_todo.md`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/consolidated_todo.md): remove 4.10/6.6/6.7 from the Urgent table
- Mark [`notification_services.md`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) as superseded by this guide, or fold the still-accurate parts in — CLAUDE.md lists it as "historical/possibly stale" and it is the doc every checklist row links to

---

## Appendix A — File Inventory

> **Updated 2026-09-22.** Rows marked ✅ are built. `backend/api/services/` now holds the four service files; `backend/cron/` holds `check_environment.php`, `daily_sweep.php`, `process_queue.php` and `notification_selftest.php`.

### New Files (16)

| File | Phase | Purpose |
|---|---|---|
| ✅ `backend/api/services/send_sms.php` | 1 | **Shipped:** `log` driver + mock outbox; **Semaphore** live (C.1) — the only real provider |
| ✅ `backend/api/services/send_email.php` | 1 | **Shipped:** `log` driver + an SMTP branch that waits for PHPMailer |
| ✅ `backend/api/services/email_templates.php` | 1 | **Shipped:** escaped throughout (C10) |
| ✅ `backend/api/services/send_notification.php` | 1 | **Shipped:** dispatcher, enqueue and the queue drain |
| ✅ `backend/api/migrations/2026_09_sms_email_channels.sql` | 1 | Schema migration — **shipped** |
| ✅ `backend/cron/process_queue.php` | 1 | **Shipped:** CLI drain (moved to Phase 1 per §0.2) |
| ✅ `backend/cron/notification_selftest.php` | 1 | **Shipped:** 19 dry-run checks (M6-NN, C11, DRY), the verification gate |
| ✅ `backend/cron/run_queue.bat` | 4 | **Shipped:** Task Scheduler runner → `backend/logs/queue_drain.log` (task not yet registered) |
| ✅ `backend/api/get_sms_balance.php` | 3 | **Shipped:** admin-only Semaphore balance, 60 s cache |
| ✅ `backend/api/migrations/2026_09_sms_semaphore_live.sql` / `2026_09_sms_semaphore_only.sql` | 1 | **Shipped:** Semaphore settings (`sms_sender_approved`, `sms_daily_cap`); removal of the four dropped providers' settings |
| ✅ `ams-react/src/AdminPages/settings/NotificationsPanel.jsx` | 3 | **Shipped:** the Notifications tab of Account Settings |
| ✅ `backend/api/send_test_notification.php` | 3 | **Shipped:** admin test send; returns the rendered message for the console |
| ✅ `docs/features/sms_email_mock_testing.md` | 1 | **Shipped:** how to run and test the mock drivers |
| `backend/api/get_notification_log.php` | 4 | Admin delivery log API |
| `backend/composer.json` + `composer.lock` | — | Deferred: the `log` email driver needs no Composer |
| ~~`Dockerfile`~~ | 1 | Deferred — Railway on indefinite hold (C6/C7) |
| ~~`.gitattributes`~~ | — | Deferred with Composer and Railway |

### Modified Files (18)

| File | Phase | Change |
|---|---|---|
| ✅ `backend/api/create_announcement.php` | 2 | **Shipped:** Accept channels, dispatch SMS/email |
| ✅ `backend/api/update_maintenance_status.php` | 2 | **Shipped:** SMS/email after status change (4.10) |
| ✅ `backend/api/send_payment_reminder.php` | 2 | **Shipped:** SMS/email for reminders |
| ✅ `backend/api/update_cctv_status.php` | 2 | **Shipped:** SMS/email on decision |
| ✅ `backend/api/update_parking_status.php` | 2 | **Shipped:** SMS/email on decision |
| ✅ `backend/api/update_service_status.php` | 2 | **Shipped:** SMS/email on status change |
| ✅ `backend/api/process_tenant_request.php` | 2 | **Shipped:** SMS/email on lease/occupancy decision |
| ✅ `backend/config.php` | 1 | **Shipped:** `user_channel_allowed()`, `normalize_ph_mobile()`, `gsm7_safe()`, `sms_single_segment()`, `log_notification_delivery()`, `prune_notification_log()`, plus `SECRET_SETTING_KEYS` / `mask_secret_value()` / `is_masked_secret()`. Still to come: the dispatcher `require_once` in the sweep (Phase 2) |
| ✅ `backend/api/get_notification_preferences.php` | 3 | **Shipped:** per-channel columns, `channels`, global opt-outs, reachability flags |
| ✅ `backend/api/update_notification_preferences.php` | 3 | **Shipped:** both payload shapes (C9), global opt-outs, consent stamp |
| ✅ `ams-react/src/AdminPages/AdminAccountSettings.jsx` | 3 | **Shipped:** settings shell; test send and balance handlers (§3.3) — the fields live in `settings/NotificationsPanel.jsx` |
| `ams-react/src/UserPages/UserNotifications.jsx` | 3 | Per-channel toggles + global opt-out + consent line (§3.2, not built) |
| ✅ `ams-react/src/config/systemSettings.js` | 3 | **Shipped:** the camelCase map for every notification setting |
| ✅ `.gitignore` | 1 | **Shipped:** ignores `backend/logs/` (the mock outbox) |
| ✅ `backend/api/get_system_settings.php` | 3 | **Shipped:** shared secret list, and credentials masked for admins |
| ✅ `backend/api/update_system_settings.php` | 3 | **Shipped:** shared list; a returned mask means "unchanged" |
| `backend/api/get_notifications.php` | 4 | Drain the queue on poll (the XAMPP path; the Railway motivation in C7 is deferred) |
| `backend/cron/daily_sweep.php` | 4 | Drain after the sweep |
| ✅ `backend/api/migrations/SetupDB.sql` | 1 | **Shipped:** migration mirrored. `seed_mock_data.sql` needed no change |

---

## Appendix B — Notification Event Map

Complete map of every event that triggers a notification, the endpoint that fires it, and the SMS/email content.

> **Two corrections (v1.1).**
>
> **Every SMS body below contains `₱` or an em dash**, which forces UCS-2 and cuts the segment to 70 characters — a message you think is one segment bills as three ([§0.3](#03-cost-model)). Rewrite them GSM-7-clean: `PHP 4,500` not `₱4,500`, `-` not `—`, no emoji. `gsm7_safe()` does this at send time, but fix the source strings so the character budget is honest.
>
> **The "SMS" column is a menu, not a plan.** Sending all twelve by SMS to every tenant is 240–510 messages/month for 30 units. The `Default` column below is the recommendation: email carries everything, SMS carries only what is time-critical and cheap.

| Event | Default channels | Why |
|---|---|---|
| Overdue rent | in-app + email + **SMS** | Time-critical, small volume, the one event that pays for itself |
| Rent due (3 days before) | in-app + email + **SMS** | Same |
| Urgent announcement | in-app + email + **SMS** (admin ticks per announcement) | Multiplies by tenant count — never automatic |
| Everything else | in-app + email | Email is free and carries more detail |


| Event | Endpoint | Notification Type | SMS Text | Email Subject |
|---|---|---|---|---|
| Announcement | `create_announcement.php` | info / warning / action | `AMS: {title} — {body:120}` | `📢 AMS Announcement: {title}` |
| Maintenance status | `update_maintenance_status.php` | maintenance_update | `AMS: Your request "{label}" is now {status}.` | `🔧 Maintenance Update — {label}` |
| CCTV decision | `update_cctv_status.php` | cctv_request | `AMS: Your CCTV request for {location} has been {status}.` | `📹 CCTV Request — {status}` |
| Parking decision | `update_parking_status.php` | parking_reservation | `AMS: Your parking request has been {status}.` | `🅿️ Parking Update — {status}` |
| Service status | `update_service_status.php` | service_status | `AMS: Service request #{id} is now {status}.` | `🛎️ Service Request — {status}` |
| Lease extension | `process_tenant_request.php` | lease_extension_request | `AMS: Your lease extension has been {decision}.` | `📋 Lease Extension — {decision}` |
| Occupancy change | `process_tenant_request.php` | occupancy_change_request | `AMS: Your occupancy change has been {decision}.` | `👥 Occupancy Request — {decision}` |
| Rent due (sweep) | `config.php` sweep | rent_due | `AMS: Your ₱{amount} rent for {room} is due {date}.` | `⏰ Rent Due — Unit {room}` |
| Overdue (sweep) | `config.php` sweep | overdue | `AMS: Your ₱{amount} rent for {room} is overdue.` | `⚠️ Overdue Payment — Unit {room}` |
| Payment confirmed | `paymongo_webhook.php` | payment_received | `AMS: ₱{amount} received for {room}. Ref: {ref}` | `💰 Payment Received — Unit {room}` |
| Lease expiring | `config.php` sweep | lease_expiring | `AMS: Your lease for {room} expires in {days} days.` | `📋 Lease Expiring — Unit {room}` |

---

## Appendix C — Provider Setup

### SMS Provider — Semaphore only

> **All prices and free tiers below are indicative, checked September 2026.** Every provider revises its rate card, PH carriers surcharge differently by destination network, and free tiers get withdrawn. **Verify at signup and write the real number here.** Treat the monthly figures in C.1 as the arithmetic (30 tenants × ~5 SMS), not as a quote — [§0.3](#03-cost-model) shows the realistic 8–17 SMS/tenant/month range, which is 2–3× those figures.
>
> The column that decides your choice is **sender-ID lead time**, not price. A ₱0.10 saving per message is ₱50/month; a sender ID that is not approved by demo day is the whole feature.

| Provider | Coverage | Cost to PH | Free Tier | Sender ID | Lead time | Auth Method | PHP Dependency |
|---|---|---|---|---|---|---|---|
| **`log` (dry run)** | — | ₱0 | ∞ | n/a | none | none | none |
| **Semaphore** | PH only | ₱0.35–₱0.50/SMS | ~50 free SMS | Custom, they register it for you | 1–3 business days | API key in body | cURL only |

> **Recommendation for this project:**
> - **Build and demo on `log`.** Nothing else lets you finish and defend the feature independently of an external approval queue.
> - **One real provider: Semaphore.** PH-only is all this system needs, it is the only option that handles sender-ID registration for you, and the lead time is days rather than weeks. Start the registration the day you start Phase 1.
> - **Semaphore is the only provider AMS supports.** Twilio, Vonage, Movider and iTexMo were evaluated and dropped (2026-09-24): global reach this system does not need, PH sender-ID registration you would have to do yourself, and — for iTexMo — a shared shortcode with no sender ID. Their stub drivers and credential settings were removed.

---

### C.1 Semaphore (SMS — Philippine Local)

> **Shipped (2026-09-24).** `_send_via_semaphore()` in `backend/api/services/send_sms.php` is live and is the only real SMS driver. Migration `2026_09_sms_semaphore_live.sql` adds the two settings below.

1. Go to [semaphore.co](https://semaphore.co) → Sign Up → buy credits
2. Dashboard → **API** → copy your API key
3. **Sender Names** → Request → enter `AMS` → wait 1–3 business days for approval
4. Run `backend/api/migrations/2026_09_sms_semaphore_live.sql` and then `2026_09_sms_semaphore_only.sql` on an existing database (fresh installs get both from `SetupDB.sql`)
5. Schedule the queue drain — **required**: with a real provider the admin endpoints enqueue instead of sending, and nothing is delivered until the drain runs. From an admin prompt:
   ```bat
   schtasks /create /tn "AMS Notification Queue" /sc minute /mo 1 /tr "\"C:\xampp\htdocs\ApartmentManagementSystem_React\backend\cron\run_queue.bat\""
   ```
   `run_queue.bat` appends each run to `backend/logs/queue_drain.log`. Remove with `schtasks /delete /tn "AMS Notification Queue" /f`.
6. Give the admin account a mobile number (the test send goes to the admin's own `contact_no`)
7. In AMS admin panel → **Account Settings → Notifications tab**:
   - SMS Provider: `Semaphore`, paste the API key, **Save**
   - **Check balance** — shows the account's credits. Semaphore allows 2 checks a minute, so a repeat within 60 s shows the cached answer ("as of HH:MM")
   - Leave **Sender name approved by Semaphore** unticked until the dashboard shows `AMS` approved
   - **Daily SMS Cap** — defaults to 100
8. Toggle **SMS Notifications** → ON, Save, then **Send test** (SMS). It sends synchronously to your own number only.

**Cost:** ₱0.35–₱0.50/SMS prepaid. ~₱75/month for 30 tenants.

**How the driver behaves:**

| Concern | Behaviour |
|---|---|
| Number | `normalize_ph_mobile()` gives `+639…`; the driver posts `639…` |
| Sender name | `sendername` is posted **only** when `sms_sender_approved = '1'`. Otherwise it is omitted and Semaphore uses its shared `SEMAPHORE` sender — an unapproved name gets the message rejected |
| Success | The response must be a JSON **list** whose first message has a `message_id` and a status other than `Failed`/`Refunded` |
| Errors | Semaphore returns validation errors as `{"field": ["message"]}` **with HTTP 200** (verified: an invalid key does this), so the status code alone is not trusted. These are flattened to e.g. `Semaphore: The selected apikey is invalid.` in `notification_log.error_message` and `notification_queue.error_message` |
| Spend cap | `sms_daily_cap` (default `100`, `0` = none): once today's `sent` SMS rows reach it, further sends log `skipped` with `Daily SMS cap reached (N)` and cost nothing. Applies to real providers only, not `log` |
| Balance | `GET backend/api/get_sms_balance.php` (admin-only) → `credit_balance`, `account_name`, `account_status` via Semaphore's `/api/v4/account`. The key never leaves the server |
| Clock | Quiet hours use the **database** clock (`HOUR(NOW())`). `config.php` pins PHP to `APP_TIMEZONE` (default `Asia/Manila`; XAMPP ships `Europe/Berlin`) and sets the DB session `time_zone` to the same offset, so both clocks agree on any host; `check_environment.php` errors if they drift |
| "TEST" prefix | Semaphore **silently ignores** any message that starts with "TEST": the API accepts it and it never arrives. `sms_avoid_ignored_prefix()` (config.php) prefixes such text with `AMS: ` (case-insensitive, after GSM-7 cleanup), for every driver, so the log and the dry-run outbox show what was really sent |
| Rate limits | `POST /messages` 120/min — the drain sends at most 20 jobs a minute, 200 ms apart. `GET /account` **2/min** — a successful balance is cached for 60 s in `backend/logs/semaphore_account.json` (keyed to a hash of the API key; errors are not cached). A 429 is logged as `Semaphore rate limit reached (retry after Ns)` from `Retry-After`; queued jobs retry on their normal backoff |
| Endpoints | Only `/messages` and `/account`. `/priority` and `/otp` cost 2 credits per message, and `/otp` is for one-time passwords only, so AMS never calls them |
| Recipients | One POST per recipient. Semaphore accepts up to 1000 comma-separated numbers per call and prefers bulk calls, but at ~30 tenants and 20 jobs/min AMS is far under the limit; grouping identical queued bodies is a future option |
| Delivery status | A `Queued`/`Pending`/`Sent` answer is logged as `sent` (accepted by Semaphore). Final carrier delivery is not polled (`GET /messages/{id}`, 30/min) |

**Verify setup:** use **Send test** in Account Settings, then:

```sql
SELECT id, status, recipient, error_message, sent_at FROM notification_log
WHERE channel = 'sms' ORDER BY id DESC LIMIT 5;
```

Do not verify by calling `send_sms()` with a made-up number — once the driver is live, a made-up number is somebody's phone.

---

### C.2 Gmail SMTP (Email — Self-Hosted)

1. Go to [myaccount.google.com](https://myaccount.google.com) → Security → enable **2-Step Verification**
2. Security → **App Passwords** → create one for "Mail" → copy the 16-character password
3. In AMS admin panel → **Account Settings**:
   - SMTP Host: `smtp.gmail.com`
   - SMTP Port: `587`
   - Username: `your-email@gmail.com`
   - Password: the 16-character app password
   - From Name: `AMS Notifications`

**Limit:** 500 recipients/day (personal Gmail) or 2,000/day (Google Workspace). Comfortable for 30 units, but a building-wide announcement plus a sweep is a ~60-message burst — throttle the queue drain rather than firing them at once.

**Deliverability caveats — the reason email "doesn't work" when it does:**

- **`From` must be the authenticated Gmail account.** Setting `smtp_from_email` to `noreply@yourbuilding.com` while authenticating as a `@gmail.com` address fails SPF/DKIM alignment and lands in spam. Either send as the Gmail address, or use a provider where you own the domain (C.7).
- **App Passwords require 2FA**, and Google has removed them for some Workspace configurations. If the App Password option is missing, the account's admin has disabled it.
- **Verify outbound port 587 from the Railway container** before relying on it (test M6-34). Many hosts block 25; 587 is usually open, but confirm rather than assume.
- **Send a test to a non-Gmail address** (Outlook, Yahoo). Gmail-to-Gmail always looks fine and tells you nothing.
- Keep an unsubscribe route visible in the footer — a link to the tenant's notification preferences page. Below Gmail's bulk-sender thresholds you are not obliged to add a `List-Unsubscribe` header, but the footer link costs nothing and is what a reasonable reader expects.

### C.3 Resend (Email — SaaS Alternative)

1. Sign up at [resend.com](https://resend.com) → verify your domain (DNS TXT records)
2. **API Keys** → Create → copy
3. In AMS admin panel → **Account Settings**:
   - SMTP Host: `smtp.resend.com`
   - SMTP Port: `465`
   - Username: `resend`
   - Password: your Resend API key
   - From Email: `noreply@yourdomain.com`

**Limit:** 3,000 emails/month free, then $20/month for 50k.

---

> **Related docs:**
> - [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) — full design spec, provider comparisons, alternative approaches
> - [external_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/documentation/external_services.md) — integration matrix for all external services
> - [panelist_feature_checklist.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/panelist_feature_checklist.md) — Module 6 checklist
> - [saas_deployment_guide.md §8](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/deployment/saas_deployment_guide.md) — cloud deployment setup
