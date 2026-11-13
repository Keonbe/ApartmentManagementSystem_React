# Panel Policy and Gap Audit (defense readiness)

**Date:** 2026-11-12
**Scope:** all 12 panel categories (policy and process, finance, security, privacy and legal, data integrity, reliability, usability, performance, maintainability, operations, scope, research quality).
**Method:** AI-assisted, read-only review of code and docs at the working tree of 2026-11-12. The evidence was gathered on uncommitted changes over `034c9d3`; HEAD was `eec2885` (deposit forfeiture feature) when this was written. No live API tests, no writes to `ams_db`, no user data. Where code and docs disagree, the code is taken as true and the mismatch is listed (§A.13).
**Legend:** Class **H** = Handled, **P** = Partially handled, **DL** = Deliberate limitation, **G** = True gap. Sev **C/H/M/L** = Critical/High/Medium/Low panel impact. Verdict **PRAISE / CRITIQUE / NEUTRAL**. "Outside" = the process that happens off-system.
**Companion docs:** [security_audit.md](security_audit.md), [2026-11-10_iso25010_evidence_map.md](2026-11-10_iso25010_evidence_map.md), [2026-11-10_ui_ux_heuristic_audit.md](2026-11-10_ui_ux_heuristic_audit.md), [2026-11-10_real_world_test_guide.md](2026-11-10_real_world_test_guide.md).

---

## Executive summary

1. **Money handling is the strongest part.** There is one settlement path for the desk and the webhook (`settle_invoice`, row locks, guarded updates). Charges are claimed before posting, so none can post twice. Webhooks must match to the centavo, refunds are idempotent, and deposit deductions are itemized with a tenant review step.
2. **Access control is solid.** Identity comes only from the session. Role and archive status are re-read on every request, the 401/403 checks are central, and downloads check ownership.
3. **Critical: the chat socket server has no authentication** (CH-1). Any client can join any user's room and send as any `sender_id` (`websocket-server/server.js:41-60`).
4. **High: the admin account is the weakest login.** `admin@gmail.com`/`admin123` is still seeded, nothing forces a password change, and admins skip the device code (`login.php:140`).
5. **High (policy): a balance the deposit does not cover is only a number.** No balance invoice is created (SPRINT #73), and the overdue reminders stop after move-out.
6. **High (finance):** a paid desk payment cannot be voided in the system. A late PayMongo webhook on a bill already paid at the desk is acknowledged silently, so the double payment is never flagged.
7. **Critical for the panel: no user acceptance evidence.** There are no survey responses, SUS score or sample size. The usability and ISO 25010 audits are code reviews, not user tests.
8. **Scale and operations:** only the activity log is paginated. There has been no load or soak test, backups are a written procedure that nothing schedules, there are no failure alerts, and everything runs on one XAMPP server.
9. **Docs drift.** Test, endpoint and table counts differ across at least 6 docs. `security_audit.md` marks 4 items as open that are fixed in code, and the checklist shows Security 5/5 ✅ while CH-1 and A-1 are open.
10. **Smallest worthwhile pre-defense set (§D):**
    - authenticate the chat socket;
    - force the admin password change and stop admins skipping the device code;
    - reconcile the numbers in the docs;
    - add a consent checkbox at registration;
    - warn when a renewal rent increase exceeds the NHSB 2024-01 cap;
    - run one SUS session and one restore drill.

    Defend everything else as written in §B.

---

## Part A: Findings per category

### A.1 Policy and process

| # | Finding | Evidence | System does | Outside the system | Risk | Class | Sev | Verdict | Defense answer |
|---|---|---|---|---|---|---|---|---|---|
| P-01 | Move-out is not blocked by unpaid bills | `record_move_out.php:62-75` checks only the notice window; the moved-out branch of `update_tenant_status.php:341-438` has no balance check; only extensions are blocked (`extension_block_reason`, config.php:480) | Records move-out, then settles against the deposit | Manager decides whether to let a tenant with debt leave | Tenant leaves owing | DL | M | NEUTRAL | We cannot physically stop a tenant leaving; the system instead settles the debt against the deposit and shows any balance left. |
| P-02 | Deposit offset against everything owed | `settle_deposit()` config.php:3846-3928 (open invoices via `invoice_balance_sql` + deductions, `FOR UPDATE` 3849, guarded on status 3898-3904) | Takes unpaid rent, damage and utilities from a deposit that was actually paid (`Held`) | — | — | H | — | PRAISE | Clearance computes deposit minus balance minus itemized deductions in one locked transaction, so it cannot be settled twice. |
| P-03 | Itemized deductions and tenant review | `deposit_deductions` (SetupDB.sql:1484); categories at update_tenant_status.php:78; `deposit_reviews` (SetupDB.sql:1500), `request_deposit_review.php`, `resolve_deposit_review.php`; one review within `deposit_refund_days` (config.php:3988-3995) | Tenant sees each deduction line and can request one review | Physical inspection of the unit | — | H | — | PRAISE | Each deduction has a category and amount, and the tenant can contest the settlement once in the app. |
| P-04 | A shortfall after the deposit is not invoiced | `end_tenancy()` cancels pending, pending-verification and scheduled bills (config.php:881); the shortfall exists only in `balance_due` (update_tenant_status.php:528), a notification (431) and the log (438); the sweep skips moved-out tenants (config.php:5404, 5432); SPRINT #73 Open | Shows and logs the balance due | Collection: manager and former tenant agree on installments, a lump sum, or settlement elsewhere | Receivable lost from reports | G | H | CRITIQUE | The system records the outstanding balance at clearance; collection after move-out is arranged between the manager and the former tenant, and a balance invoice is our planned next step (#73). |
| P-05 | A proof still under review is cancelled at move-out | `end_tenancy` cancels `pending-verification` (config.php:881) | Voids the bill, so the proof is no longer acted on | Admin must verify proofs before clearance | Real payment dropped from the deposit computation | G | M | CRITIQUE | Admins clear tenants only after verifying pending proofs; we will block clearance while a proof is pending (S fix). |
| P-06 | No waive or write-off for the rest of a bill | `adjust_invoice.php:133-137` refuses a total at or below `amount_paid`; the message at :74 and config.php:1227 says "issue a manual credit", but no such feature exists | Can lower lines with a required reason (`invoice_adjustments`) | Write-off recorded on paper | Message promises a missing feature | G | M | CRITIQUE | Adjustments with a reason are supported; waiving a partly paid balance is done by the manager and noted in chat or on paper. The error message should be corrected. |
| P-07 | Part-payments supported, no installment schedule | `record_partial_payment()` config.php:1668-1748; tenant declares a part at `upload_payment_proof.php:95-116`; `submit_split_payment.php`; due date moved via `adjust_invoice.php:105-121` | Records each part, keeps the balance, settles the last part | Installment terms agreed verbally or in writing | Arrangement not enforced | P | M | NEUTRAL | Part-payments and split methods are recorded against the bill; the schedule itself is agreed by manager and tenant (manager Q12). |
| P-08 | Notice window is configurable | `move_out_min_notice_days` 15 and max 30 (SetupDB.sql:1587-1588; settingsSchema.js:23-24; LeasingPanel.jsx:77-85), enforced at record_move_out.php:63-75 | Rejects move-out dates outside the window | — | — | H | — | PRAISE | Notice rules are settings, not code. |
| P-09 | Early termination: deposit forfeiture with admin waiver | `deposit_forfeiture_reasons()` config.php:3824-3835; `waive_forfeiture_reason` update_tenant_status.php:22, logged :437; refundable per contract (create_contract.php:104; locked after draft, update_contract_status.php:153-166) | Withholds the deposit for no notice, early exit or termination for cause; admin can waive with a reason | — | — | H | — | PRAISE | Forfeiture follows fixed rules, and any waiver is reasoned and logged. |
| P-10 | No penalty beyond the deposit, no rent in lieu of notice | manager_interview_comparison.md Q29 | Deposit forfeiture only | Any extra penalty is agreed outside | — | DL | L | NEUTRAL | The manager does not charge penalties (Q29), so we did not model one. |
| P-11 | Non-renewal has no workflow of its own | `expire_lapsed_contracts` config.php:269; end-of-term reminders; todo.md:89 (notice actually given not measured) | Contract expires; tenant is reminded | Notice of non-renewal given verbally | — | P | L | NEUTRAL | Contracts expire automatically with reminders; non-renewal is simply not extending. |
| P-12 | Contract template hardcodes notice, occupant limit and fee | contract_template.php:74-76 ('15', '4', '₱1,000'), not tied to `move_out_min_notice_days`, `included_occupants`, `occupant_surcharge_per_person`; deposit clause :124 omits the forfeiture conditions | Prints fixed values | — | Contract and settings drift apart | P | M | CRITIQUE | Today's values match the settings; linking the template to them is a small fix. |
| P-13 | Refund payout recorded as method and reference only | `update_refund_request.php:89-94` (free-text `payout_method` up to 50 chars, `payout_reference`); REFUND_TRANSITIONS config.php:3740; events at config.php:3793; no proof column (SetupDB.sql:1370-1399); tenant cannot give payout details (`respond_refund_request.php:29`); deposit refunds always manual (todo.md:88) | Tracks the refund state and how it was paid | Money is sent by bank, GCash or cash; proof is kept by the admin | Disputed payout has no file proof | P | M | NEUTRAL | The system records who approved, how and with what reference; the transfer itself happens in the bank or e-wallet app. |
| P-14 | Room swap or transfer | grep found no endpoint, column or flow | — | Move-out plus a new application | Lost history link between rooms | G | M | CRITIQUE | Transfers are rare for this property; they are handled as a move-out and a new rent application. |
| P-15 | Co-tenants as a household roster | `household_members` SetupDB.sql:662-678; `apply_occupant_count` config.php:4811-4833; one login per unit (todo.md:175) | Lists occupants, surcharge re-prices the rent, changes need admin approval | — | — | H | — | PRAISE | One contract holder logs in, and all occupants are registered and priced. |
| P-16 | Subletting banned by clause | contract_template.php:199-200 (`cl-transfer`); legalContent.js:49 | States the rule | Manager enforces it | — | DL | L | NEUTRAL | Enforcement is physical; the system documents the rule the tenant signed. |
| P-17 | Guest stays tracked | `visitor_overstay_hours` 24; `alert_overstayed_visitors` config.php:5789; can be switched off (manager Q24) | Registers visitors and alerts on overstays | — | — | H | — | PRAISE | Visitor log with overstay alerts, configurable. |
| P-18 | No emergency contact; no flow for a tenant's death or incapacity | No emergency-contact field on users or applications; household `contact_no` is the closest | — | Manager keeps emergency contacts; termination or archive is used | Cannot reach family in an emergency | G | M | CRITIQUE | Emergency situations are handled in person; an emergency-contact field is a small addition. |
| P-19 | Approved applicant who never pays: hold expires | `void_lapsed_payments()` config.php:3103-3176 (window `payment_window_days` 3) → `release_application_holds()` config.php:786-824; `daily_sweep.php:22` and first `get_notifications.php` call each day | Cancels invoices and draft contract, frees the room | — | — | H | — | PRAISE | An unpaid approval lapses on its own and the room is released. |
| P-20 | Partial payers are not lapsed; a paid applicant who never moves in is flagged, not cancelled | Partial payers excluded at config.php:3144-3146; config.php:3018-3020 lists Approved applications with `move_in_date < CURDATE()` as "Move-in deadline passed" in the admin follow-up queue (`sync_followup_queue`) | Flags it to the admin; stays `Approved` | Manager decides | Room held until the admin acts | P | L | NEUTRAL | The admin is alerted when the move-in date passes; we do not cancel automatically because money was already received. |
| P-21 | Reservation fee is informational only | `unit_reservations.reservation_fee` set at create_reservation.php:30; inquiry_reservation_design.md §4 | Shows the amount | Fee collected and refunded in person | No record of reservation money | DL | M | NEUTRAL | Reservations are an inquiry-stage hold; the fee, if any, is handled at the office. |
| P-22 | Refunds raised for rejected or cancelled paid applications | `raise_rejection_refunds()` config.php:4012-4027 minus `cancellation_fee` (config.php:4000-4027) | Opens a refund request per paid bill | Payout (see P-13) | — | H | — | PRAISE | Money paid for a rejected application is never forgotten; a refund request opens automatically. |
| P-23 | Rent changes only at renewal | `extend_tenancy($new_rent)` config.php:574-608; admin_extend_rent.php:26; `lease_renewals.rent_at_renewal` | Records new rent per renewal; occupant change re-prices | Mid-term increase agreed separately | — | P | L | NEUTRAL | Rent is fixed for a term and changes at renewal, which matches local practice. |
| P-24 | No proration | Extensions in whole months (config.php:586); SPRINT #73; ISO map :29 | Bills whole months | Manager computes partial months by hand | Mid-month move-in or move-out billed wrong | G | M | CRITIQUE | The property bills by whole month; partial months are computed by the manager and entered as an adjustment. |
| P-25 | Late fee exists but is off and has no settings screen | `promote_overdue_invoices()` config.php:3186-3244 (once per bill, waivable via adjust_invoice.php:145-150); seeded off (SetupDB.sql:1627-1629); `late_fee_*` absent from settingsSchema.js (verified, 0 matches) | Can apply a flat or percent fee once | Manager policy is no late fee | Checklist §3.7 says "configurable" | P | L | NEUTRAL | The manager does not charge late fees, so the feature ships off; enabling it would take one settings row. |
| P-26 | No grace days | Overdue the day after the due date (`due_date < CURDATE()`, config.php:3202); invoices issued 7 days ahead (`RENT_INVOICE_LEAD_DAYS` config.php:1971); `overdue_threshold_days` 15 drives only the eviction flag | Reminders and overdue status | — | Strict overdue label | P | L | NEUTRAL | Bills are issued a week early, which acts as the grace period; eviction flags wait 15 days. |
| P-27 | Advance rent ledger | `advance_payment.php`; `advance_credits` SetupDB.sql:1167; `expire_unpaid_advances` config.php:2205; unused months become refund-due at move-out (config.php:889-906) | Applies prepaid months automatically and refunds unused ones | — | — | H | — | PRAISE | Prepaid months are a ledger, consumed monthly and refunded if unused. |

### A.2 Financial controls

| # | Finding | Evidence | System does | Outside the system | Risk | Class | Sev | Verdict | Defense answer |
|---|---|---|---|---|---|---|---|---|---|
| F-01 | Desk payments: admin only, checked against the tenant's proof | `record_payment_admin.php:14` (require_admin), :76-80 (`ADMIN_RECORDABLE_STATUSES` config.php:1448), channel/split/part checks :83-141 | Admin confirms what the tenant declared | Counting the cash | — | H | — | PRAISE | The admin can only confirm a payment the tenant declared, on the same channel and amount. |
| F-02 | Proof upload is type and size checked | upload_payment_proof.php:46-49, 129-135 (JPG/PNG/WEBP/PDF, 10 MB, finfo) | Stores proof privately | — | — | H | — | PRAISE | — |
| F-03 | Double-posting blocked | `settle_invoice` `FOR UPDATE` config.php:1498 + guarded update 1520-1525; partial payments 1677/1722; `post_invoice_charge` claim-first 1069-1077; `payment_reference_lock`, `find_reference_reuse`, `reference_norm` (SetupDB.sql:1196); `duplicate_reference_policy` | One bill cannot be settled twice; a reused reference warns or blocks | — | — | H | — | PRAISE | Every settlement locks the row and checks its old status; reused references are caught on a normalized, indexed column. |
| F-04 | A paid desk payment cannot be voided or reversed | `adjust_invoice.php:70-80` refuses paid bills; no un-pay endpoint | Money back goes through refund requests | A wrong entry is corrected by a manual refund or note | Mis-keyed payment stays "paid" | G | H | CRITIQUE | Paid records are immutable by design; a wrong entry is corrected by a refund request so the trail stays visible. A reasoned void is the proper fix. |
| F-05 | Webhook security | paymongo_webhook.php:78-84 (HMAC-SHA256, `hash_equals`), :70 (300 s window), :58-60 (mode key), :198-210 (bound to the checkout), :250-284 (amount to the centavo), :339-342 (500 so PayMongo retries) | Applies only genuine, matching events | — | — | H | — | PRAISE | Webhooks are signed, fresh, tied to the open checkout and must match the amount exactly, or the bill goes to manual review. |
| F-06 | Unapplied online payments become refund requests | `raise_unapplied_payment` paymongo_gateway.php:131-162 (once per payment id) | Opens a refund for money PayMongo holds | — | — | H | — | PRAISE | — |
| F-07 | Late webhook after a desk payment is silent (**confirmed live on the test DB 2026-11-12**: HTTP 200 "Already recorded", 0 refund requests, 0 log entries) | Release nulls the checkout ids (release_checkout_session.php:48), so the "already paid" branch (paymongo_webhook.php:225-239) finds no stored `paymongo_payment_id` and returns "Already recorded" with no refund or log | Ignores the event | Admin notices the double charge in the PayMongo dashboard | Tenant charged twice, unnoticed | G | M | CRITIQUE | The desk refuses to record while a checkout is in progress, and the admin must check PayMongo before releasing; raising a refund request in this branch is a small fix. |
| F-08 | No polling or reconciliation against PayMongo | Only create-session and refund API calls (create_checkout_session.php:221; paymongo_gateway.php) | Relies on the webhook | Admin uses "Check PayMongo" and the dashboard | Lost webhook = unrecorded payment | P | M | NEUTRAL | Webhooks are retried by PayMongo, and the admin checks the dashboard before releasing a stuck checkout. |
| F-09 | Reports count paid bills; the methods breakdown counts bills, not pesos | get_report_data.php:165, 447, 799-807; dashboard_stats.php:307-328 | Revenue by `paid_at` | Daily cash, GCash and bank totals matched against statements by hand | Weak reconciliation | P | M | CRITIQUE | Reports give revenue and outstanding totals; a peso-per-channel report is a small addition. |
| F-10 | Who pays services and maintenance | service_management_design.md §4-5 (server catalog price); update_maintenance_status.php:150, 306-307 (`tenant_responsible`) | Services billed to the tenant; maintenance only if flagged | — | — | H | — | PRAISE | Charges come from the server-side catalog; maintenance is billed only if the admin marks the tenant responsible. |
| F-11 | No invoice dispute screen | update_maintenance_status.php:266 ("contact the office"); `invoice_adjustments` SetupDB.sql:1521; manager Q13 | Adjustments with a reason and old/new values | Disputes discussed in chat or at the office | — | DL | L | NEUTRAL | The manager resolves disputes face to face (Q13); every adjustment is reasoned and logged. |
| F-12 | Money in integer cents, but some floats remain | `invoice_balance_cents` config.php:1661; `DECIMAL(10,2)`; some `bind_param "d"` (ISO map) | Compares balances in cents | — | Rare rounding edge | P | L | NEUTRAL | All balance comparisons use integer centavos. |
| F-13 | Insert-only activity log, but the DB user is root | `log_activity()` config.php:172-184; no UPDATE/DELETE on `activity_logs`; todo.md A-3 | App never edits the log | DB access control by the operator | A DB user could alter the log | P | M | NEUTRAL | The application cannot edit or delete log entries; a restricted DB user is a deployment step. |
| F-14 | A rejected proof loses its file link | reject_payment_proof.php:22 (reason required), :55 (`proof_of_payment_path = NULL`) | Keeps the reason | — | Evidence of a rejected attempt is lost | P | L | CRITIQUE | The reason is logged; keeping the rejected file path is a one-line change. |

### A.3 Security and access control

| # | Finding | Evidence | System does | Outside the system | Risk | Class | Sev | Verdict | Defense answer |
|---|---|---|---|---|---|---|---|---|---|
| S-01 | Session model | config.php:1288-1297 (32 random bytes, 7 days), 1343-1360 (live role and archive check), 3372 (revoke on password or role change), 5374 (cleanup), logout.php:20 | Server-side sessions | — | — | H | — | PRAISE | Sessions are random, expire, and are revoked when a password or role changes. |
| S-02 | Identity only from the session | `require_admin/user/owner_or_admin` config.php:1375-1417; headers overwritten at 5857-5869 | Ignores client ids | — | — | H | — | PRAISE | No endpoint trusts an id sent by the browser. |
| S-03 | Object-level access (IDOR) | `download_file.php` owner check; ISO map §3.4 (no admin endpoint accepted a tenant token) | Owner or admin only | — | No cross-tenant test with real ids | P | M | NEUTRAL | Ownership is checked server-side; a cross-tenant test is the next test to add. |
| S-04 | Session tokens stored in plain text; token in download URLs | `sessions.token` config.php:1290; audit §5, B-8 | — | — | DB leak or logs expose sessions | P | M | NEUTRAL | Reset tokens are already hashed; hashing session tokens is planned. |
| S-05 | Admins skip the device login code | login.php:140 (`$trusted` is true whenever `$isAdmin`) | Password only for admins | — | Most powerful account has the weakest login | G | H | CRITIQUE | This was a convenience for the single office PC; we will remove the bypass before go-live. |
| S-06 | Login code from `RAND()`, stored in plain text | login.php:153 | 15 min, 3 tries, `hash_equals` (verify_device.php:14-18) | — | Predictable or leaked codes | G | M | CRITIQUE | The attempt limit and expiry cap the risk; switching to `random_int` and a hashed code is a small fix. |
| S-07 | Trusted-device cookie lasts a year and is not revoked on password change | verify_device.php:31; no `trusted_devices` delete on password change (login.php:143,147; login_otp_settings.php:107) | HttpOnly, SameSite=Lax, hashed | — | Stolen device stays trusted | P | L | NEUTRAL | — |
| S-08 | Rate limits on login, reset and registration | config.php:3392-3420, 3437, 3468 | Per account, IP and both | — | — | H | — | PRAISE | Brute force is throttled per account and IP. |
| S-09 | No rate limit on inquiry, chat send, email verify or the socket | submit_inquiry.php, send_message.php:48-60 (CH-3), verify_email.php, server.js | — | — | Spam or flooding | G | M | CRITIQUE | Public forms are low value targets; one shared limiter call per endpoint fixes it. |
| S-10 | CORS allowlist is hardcoded and ignores `ALLOWED_ORIGINS` | backend/cors.php:19-25 (includes `http://localhost:5173/5174`, `http://168.107.72.9`); config.env.example.php:30,45 and check_environment.php:56-97 assume the env var | Exact-match allowlist, never `*` | — | Config check validates a setting nothing uses | P | M | CRITIQUE | CORS is an allowlist; the localhost entries should be dropped from production. |
| S-11 | Chat socket server has no authentication (CH-1) | websocket-server/server.js:41-43 (`join(userId)`), 51-60 (client `sender_id`), :14-17 (`origin "*"`), :76 (bodies logged), :21-26 (root); ChatContext.jsx:34-45, 297-303 | Relays and stores messages | — | Anyone can read or impersonate chat | G | C | CRITIQUE | Fix before defense: verify the session token on connect and take the sender from it. |
| S-12 | Upload safety | backend/uploads/.htaccess (deny all); random 32-hex names; `finfo` in 15 endpoints and `store_*` helpers (config.php:2838, 2888, 4440, 5067) | Private storage, MIME checked | — | — | H | — | PRAISE | Files are never served directly; downloads go through an ownership check. |
| S-13 | Upload exceptions | create_notification.php:59-68 (extension only, `uniqid()`); services/send_sms.php:285,375 (`0777`) | — | — | Weaker check on one admin path | P | L | NEUTRAL | Admin-only path; aligning it with `store_*` is trivial. |
| S-14 | Seeded default admin, no forced change (A-1) | SetupDB.sql:506; security_audit.md:18 | — | Operator must change it | Known credentials | G | H | CRITIQUE | The seed is for development; a forced change on first login is a small fix. |
| S-15 | DB user is root with no password by default (A-2/A-3) | config.php:28-29 | — | Operator creates a restricted user | Full DB access from the app | G | M | NEUTRAL | Local defaults; production uses its own credentials (environment_config.md). |
| S-16 | No global security headers (C-4, E-2..E-4) | Only download_file.php:187, public_file.php:50, open_cctv_footage.php:41 | Per endpoint only | Server config | Clickjacking or sniffing | G | M | CRITIQUE | Three headers in `.htaccess` close it. |
| S-17 | Secrets kept out of git | `config.env.php` gitignored (`git ls-files`); only `.example` files tracked; `APP_ENV` defaults to production (config.php:31-34) | — | — | — | H | — | PRAISE | — |
| S-18 | No four-eyes rule on admin money actions | Single admin can waive, adjust, record and change rent; last-admin guard in manage_users.php; reasons required (audit R-8) | Logs the performer from the session | Owner reviews the log | Insider abuse | DL | M | NEUTRAL | A small property has one manager; accountability comes from reasons and an insert-only log, not a second approver. |
| S-19 | Some writes are not logged | house_rules.php:84,135,139,158; verify_device, verify_email, forgot_password; socket chat path; Privacy Notice promises a log (legalContent.js:196) | Most money and status writes logged | — | Incomplete trail | P | M | CRITIQUE | All money and status changes are logged; the remaining gaps are content and auth events. |
| S-20 | Raw exception text in one endpoint; DDL on request | get_admin_user.php:47-49; get_inquiries.php:15,40 (D-9) | Elsewhere `public_error_message()` | — | Info leak | P | L | NEUTRAL | — |
| S-21 | Registration reveals existing emails | registration.php:55 | — | — | Account discovery | P | L | NEUTRAL | — |

### A.4 Privacy and legal

| # | Finding | Evidence | System does | Outside the system | Risk | Class | Sev | Verdict | Defense answer |
|---|---|---|---|---|---|---|---|---|---|
| L-01 | Privacy Notice covers RA 10173 | legalContent.js:136-209 (Filipino at 341+): purpose, recipients (Semaphore, PayMongo, Google Fonts), rights, NPC complaint | Published in English and Filipino | — | — | H | — | PRAISE | The notice lists what we collect, why, who receives it and how to complain to the NPC. |
| L-02 | Registration consent is text only | Registration.jsx:289-298, i18n.js:54 ("By continuing, you agree…"); no checkbox, no timestamp | Shows the notice | — | Weak proof of consent | P | H | CRITIQUE | The rent application and CCTV requests already store consent; adding the same checkbox at registration is a small fix. |
| L-03 | Consent stored where it matters most | rent_application.php:59,153 (`terms_agreed_at`); cctv_request.php:74-108 (`privacy_consent_at`) | Server enforces and timestamps it | — | — | H | — | PRAISE | — |
| L-04 | No terms version recorded; no named DPO | Only timestamps; legalContent.js:205 routes privacy requests to inquiry or chat | — | Owner acts as DPO | Cannot prove which text was accepted | G | M | CRITIQUE | The owner is the data protection contact; storing a terms version is a small addition. |
| L-05 | Retention: CCTV purged, the rest kept indefinitely and disclosed | `purge_expired_cctv_footage` config.php:5101; log pruning config.php:4722; legalContent.js:180 ("no fixed deletion period"), :200 (archive, not erase) | Purges footage and logs | Deletion requests handled by the owner | Over-retention | DL | M | NEUTRAL | Financial records must be kept; the notice states this openly. |
| L-06 | No erasure or anonymization; cascades are risky | No anonymization code; `ON DELETE CASCADE` users → invoices, messages, maintenance (SetupDB.sql:160, 263, 1276-77) | Archives accounts | Manual handling of erasure requests | A hard delete wipes financial history | G | M | CRITIQUE | Accounts are archived, never deleted, so records survive; an anonymize action is the proper RA 10173 answer. |
| L-07 | ID documents protected, not encrypted | download_file.php owner check; visitor IDs admin only; legalContent.js:167 discloses no encryption | Access control | Server disk security | Disk theft exposes IDs | DL | M | NEUTRAL | Access is restricted and the lack of encryption is disclosed. |
| L-08 | Move-in charges within RA 9653 | config.php:1907; contract_template.php:119-125 (1 month advance + 1 month deposit vs the legal maximum of 1 + 2) | Bills within limits | — | — | H | — | PRAISE | — |
| L-09 | Voluntary prepayment up to 12 months | `MAX_RENT_AHEAD_MONTHS_CEILING` config.php:383 | Tenant-initiated only | — | The law limits what an owner may demand (1 month advance, 2 months deposit), not what a tenant volunteers; this is a reading, not a ruling, so confirm with the adviser | P | L | NEUTRAL | Prepayment is the tenant's own choice, not a condition of renting. |
| L-10 | No cap on rent increases at renewal | admin_extend_rent.php:26-33 (0 < rent ≤ 99,999,999); no RA 9653 reference anywhere | Accepts any new rent | Manager checks the housing board cap for covered units | Non-compliant increase. NHSB Resolution 2024-01 (2025-2026) covers residential units renting at ₱10,000 or less and caps increases for the same tenant at 2.3% in 2025 and 1% in 2026, once a year; all 15 rooms in dev `ams_db` rent for ₱3,500-4,000, so they would be covered. No 2027 successor was found | G | H | CRITIQUE | Our rents fall inside the covered bracket, so the manager must apply the cap; a warning when a renewal exceeds the cap setting is a small fix (SPRINT 149). |
| L-11 | E-signature is an uploaded image | upload_lease_document.php:84-90, 181-199; log entry only; admin can upload a notarized copy | Stores the signed document | Wet or notarized signature if needed | Weak signer evidence | P | M | NEUTRAL | The system stores the signed contract; legal force comes from the signed or notarized copy, which the admin uploads. |
| L-12 | Disclaimers and governing law | legalContent.js:65, 127-132 | Terms say the signed contract prevails | — | — | H | — | PRAISE | — |

### A.5 Data integrity and consistency

| # | Finding | Evidence | System does | Outside the system | Risk | Class | Sev | Verdict | Defense answer |
|---|---|---|---|---|---|---|---|---|---|
| D-01 | Transactions and row locks | `FOR UPDATE` 16× in config.php, in 22 endpoint files; `begin_transaction` in 44 files; `GET_LOCK('ams_payment_reference')` config.php:2488; strict mysqli (config.php:126-131) | Atomic money and status changes | — | — | H | — | PRAISE | Every money path runs in a transaction with the row locked. |
| D-02 | Stale state and double submit | `payment_double_submitted()` config.php:2513; status-guarded updates with 409; `CONTRACT_TRANSITIONS`; buttons disabled while a request is in flight (audit F-4); `tests/api` race tests | Second admin or tab gets a conflict | — | — | H | — | PRAISE | Two admins acting at once get a clear conflict, not a double write (race tests in `tests/api`). |
| D-03 | Foreign keys mostly present | 48 constraints across 51 tables; `reply_to_id` (SetupDB.sql:1262) and `template_version_id` have none; orphan cleanup migration exists | — | — | Orphan rows | P | L | NEUTRAL | — |
| D-04 | Migration runner hides some errors | cron/migrate.php:20 skips 1060/1061/1050/1091; no down migrations; drift incident (ISO map §3.3); many repair or sync migrations | Records applied files | Operator checks the schema | Silent drift | P | M | NEUTRAL | Migrations are idempotent and tracked by file name; skipping "already exists" errors is what makes re-runs safe. |
| D-05 | Backups are a written procedure only | backup_and_restore.md:3 ("procedure only"), :208 (no drill) | — | Operator schedules mysqldump and the uploads copy | Data loss | G | H | CRITIQUE | The runbook is complete; we will schedule it and record one restore drill before defense. |
| D-06 | Timezone pinned in PHP and DB | config.php:47-48 (Asia/Manila), :158 (`time_zone = date('P')`); check_environment.php:133-140 | Consistent dates | — | — | H | — | PRAISE | — |
| D-07 | Socket server does not set the DB timezone | server.js (no `time_zone`); local MariaDB global zone is SYSTEM (Asia/Singapore, +08:00, same offset as Manila) so it is correct locally | `messages.created_at` uses the server zone | — | Chat times off on a UTC host (production not checked) | P | L | NEUTRAL | — |

### A.6 Reliability and fault tolerance

| # | Finding | Evidence | System does | Outside the system | Risk | Class | Sev | Verdict | Defense answer |
|---|---|---|---|---|---|---|---|---|---|
| R-01 | Notification queue with retries | `notification_queue`; process_queue.php:11-13 (batch claim); send_notification.php:306-333 (backoff, 3 attempts); `notification_log` config.php:4689-4720 | Endpoints never wait on SMS or email | — | — | H | — | PRAISE | A provider outage delays a message; it never fails the user's action. |
| R-02 | No view of failed deliveries; a stalled queue is invisible | `notification_queue_last_run` listed (config.php:4122) but never written; `queue_drain.log` not rotated | — | Operator reads the log | Silent outage | G | M | CRITIQUE | — |
| R-03 | Tenant without phone or email | send_notification.php:50,62 (skipped); in-app notification always created | Falls back to in-app | Manager calls | — | H | — | PRAISE | — |
| R-04 | PayMongo outage | paymongo_gateway.php:40,57-65 (30 s timeout, clean error); manual proof and QR fallback | Tenant can pay another way | — | — | P | L | NEUTRAL | Online payment is optional; proof upload always works. |
| R-05 | Scheduled jobs run by Task Scheduler, with a self-heal | daily_sweep.php:2-9; run_queue.bat:5; `run_notification_sweep` claim config.php:5355-5371 | Daily sweep also runs on the first request of the day | Operator sets up Task Scheduler | Jobs not set up on a new host | P | M | NEUTRAL | Even without the scheduler, the daily sweep runs on the first visit of the day. |
| R-06 | No alerting when jobs fail | — | — | Operator checks logs | Silent failure | G | M | CRITIQUE | — |
| R-07 | Generic error responses; errors are logged | config.php:86-100 (global handler; detail logged). Locally `php.ini:972` points to `C:\xampp\php\logs\php_error_log`, a folder that does not exist, so `[AMS]` lines land in `apache/logs/error.log` (2,456 entries, 2.2 MB, not rotated). Production not checked | — | — | Log path depends on the host | H | — | NEUTRAL | — |
| R-08 | Single server | One XAMPP host runs Apache, MariaDB and Node; chat falls back to polling (ChatContext.jsx) | — | Owner's hardware | Downtime | DL | M | NEUTRAL | Sized for a 15–100 unit property; the backup runbook covers recovery. |
| R-09 | SMS and email not live | checklist 6.6/6.7; SPRINT #74 (log driver, no verified Semaphore send) | Logs messages (dry run) | — | Panel may ask for a live demo | P | M | CRITIQUE | Drivers are built and tested in dry-run; going live only needs credentials and sender approval. |

### A.7 Usability and accessibility

| # | Finding | Evidence | System does | Outside the system | Risk | Class | Sev | Verdict | Defense answer |
|---|---|---|---|---|---|---|---|---|---|
| U-01 | Open severity-3 heuristic findings | 2026-11-10_ui_ux_heuristic_audit.md §3/§6: fetch errors look like empty data (MyRoom.jsx:152-154), form modals close on backdrop click or Escape (Modal.jsx:23), eviction flag with no confirmation (AdminContracts.jsx:507-519), `window.confirm` on a PayMongo refund (AdminRefunds.jsx:90) | — | — | Data loss or mistakes | P | M | CRITIQUE | — |
| U-02 | No React error boundary | 0 uses of `componentDidCatch` / `getDerivedStateFromError` | — | — | A render error blanks the app | G | M | CRITIQUE | — |
| U-03 | English and Filipino, tenant side | i18n.js (`en` :9, `fil` :1364); 27 of 28 UserPages use it, 3 of 26 AdminPages; SPRINT #71/#75 | Tenant UI bilingual | — | Admin UI English only | P | L | NEUTRAL | Tenants get Filipino; the admin is the manager, who works in English. |
| U-04 | Mobile layout | mobile_responsive.md "As built" :86-96; no page overflow at 375/390 px (ISO map) | Drawer menu, card lists | — | Small touch targets (Users page: 66 controls under 32 px) | P | L | PRAISE | — |
| U-05 | ARIA basics | 376 `aria-label`, 47 `role="alert"`, 4 `aria-live`; 0 unnamed buttons (ISO map §3.3) | — | — | No screen-reader test (SPRINT #67) | P | M | NEUTRAL | — |
| U-06 | No onboarding, user manual or training material | Heuristic audit §3 (Learnability); no manual file | — | Developer trains the manager in person | Hard handover | G | M | CRITIQUE | A short admin quick-start guide is planned for turnover. |
| U-07 | Native dialogs | 103 `alert(`, 30 `confirm(` | — | — | Inconsistent UX | P | L | NEUTRAL | — |

### A.8 Performance and scalability

| # | Finding | Evidence | System does | Outside the system | Risk | Class | Sev | Verdict | Defense answer |
|---|---|---|---|---|---|---|---|---|---|
| X-01 | Lists are not paginated on the server | Only get_activity_logs.php:86 uses `LIMIT ? OFFSET ?`; unbounded get_invoices, get_tenants, get_users, get_maintenance_requests, get_applications, get_inquiries, get_visitors, get_contracts, get_chat_history | Returns all rows | — | Slow after years of data | G | M | CRITIQUE | At 15–100 units, lists stay in the hundreds of rows; paging the invoice and log lists first is the fix. |
| X-02 | No N+1 queries found | Loop scan: get_rooms, get_contracts.php:122, get_invoices.php:70 batch-load | — | — | — | H | — | PRAISE | — |
| X-03 | Correlated subqueries in the conversation list | get_conversations.php:34-75 (6 per row) | — | — | Grows with thread count | P | L | NEUTRAL | — |
| X-04 | Missing indexes | No index on `invoices.status`/`due_date`; `LOWER(i.status)` at dashboard_stats.php:498-505 | — | — | Full scans | P | L | NEUTRAL | — |
| X-05 | No load or soak test | ISO map items 4, 5, 6, 13; timings measured on about 16 seed users | — | — | Unproven capacity | G | M | CRITIQUE | real_world_test_guide.md §2/§3 has the procedure. |
| X-06 | Single property | 51 tables, no building or property id; checklist header "15–100 units" | — | — | — | DL | L | NEUTRAL | The study targets one property (see §B). |
| X-07 | File storage growth | Per-file caps (config.php:2822, 2872, 4396, 4956); CCTV purge; no retention for proofs, documents or messages; dev uploads 92 MB | — | Disk monitoring | Disk fills | P | L | NEUTRAL | — |

### A.9 Maintainability and testing

| # | Finding | Evidence | System does | Outside the system | Risk | Class | Sev | Verdict | Defense answer |
|---|---|---|---|---|---|---|---|---|---|
| M-01 | Large API test suite | 79 `tests/api/*.test.js` (counted); 1,726 tests last recorded (api_testing.md:12); scratch `ams_test`, `AMS_TEST_MODE` guard | Tests run against a real PHP server and DB | — | — | H | — | PRAISE | 1,700+ end-to-end API tests on a throwaway database. |
| M-02 | No frontend tests | ams-react/package.json has no test runner; SPRINT #76 | — | Manual UI testing | UI regressions | DL | M | NEUTRAL | Business rules live in the backend, where the tests are. |
| M-03 | CI does not run the API suite | .github/workflows/ci.yml (lint, build, php -l, PHPStan, schema, smoke); cicd_pipeline.md:595 | Static checks plus smoke tests | Developer runs `npm test` | Untested pushes | P | M | NEUTRAL | — |
| M-04 | ESLint is clean: 0 errors, 14 warnings (re-run 2026-11-12) | Two errors were fixed in `7c0f66f` (AdminInquiries.jsx, UserAnnouncements.jsx); 14 `exhaustive-deps` warnings remain | Lint passes | — | — | H | — | NEUTRAL | Lint is green; the remaining warnings are hook-dependency notes. |
| M-05 | PHPStan at level 0 | phpstan.neon | — | — | Weak static checks | P | L | NEUTRAL | — |
| M-06 | Very large config.php | about 5,000+ lines; no framework | Shared helpers in one place | — | Hard to navigate | DL | L | NEUTRAL | A single helper file keeps every rule in one place. |
| M-07 | Migration CI step passes locally | SPRINT #81 (High, open) reports a failing upgrade step. On 2026-11-12 the CI schema job was replayed on a scratch MariaDB database (default collation): SetupDB, seed, reset, re-seed, clear_and_seed, demo seed and reset, then all 33 `[0-9]*.sql` migrations all succeeded. The GitHub run itself was not visible (no `gh` CLI) | Idempotent on a fresh schema | — | #81 looks stale | H | — | NEUTRAL | The upgrade migrations apply cleanly on a fresh schema; SPRINT #81 should be closed once a GitHub run confirms it. |

### A.10 Operations and deployment

| # | Finding | Evidence | System does | Outside the system | Risk | Class | Sev | Verdict | Defense answer |
|---|---|---|---|---|---|---|---|---|---|
| O-01 | Environment docs and check | environment_config.md; dual-deployment-environment-plan.md; cron/check_environment.php | Validates config | — | — | H | — | PRAISE | — |
| O-02 | No automated deploy | cicd_pipeline.md Phase 2 proposes deploy.yml; only ci.yml exists | — | Manual deploy | Human error | P | L | NEUTRAL | — |
| O-03 | No monitoring, alerting or log rotation | config.php:73-144 (error_log); localhost_to_production.md Phase F | Logs errors | Operator tails logs | Silent outage | G | M | CRITIQUE | — |
| O-04 | Cost notes cover hosting only | cicd_pipeline.md:496-497; external_services.md:162, 199, 233, 246; no PayMongo fee or SMS per-message cost in the repo. Published rates (checked 2026-11-12, confirm before quoting): PayMongo, VAT included: QR Ph 1.5%, GCash 2.5%, Maya 2.0%, GrabPay 2.2%, cards about 3.5% + ₱15, +1% for foreign cards, no monthly fee ([fees page](https://developers.paymongo.com/docs/fees-and-rates)); Semaphore: ₱0.56 per 160-character SMS excluding VAT, the priority/OTP route costs 2 credits, long texts are billed per segment ([semaphore.co](https://www.semaphore.co), [API docs](https://api.semaphore.co/docs)) | — | — | Panel asks "what does it cost to run?" | G | M | CRITIQUE | Put these rates in one running-cost table with hosting (SPRINT 150); sources are third-party listings, so check the providers' current pages. |
| O-05 | No handover, training or SLA document | — | — | Developer supports informally | Who runs it after turnover? | G | H | CRITIQUE | — |

### A.11 Scope vs objectives

| # | Finding | Evidence | System does | Outside the system | Risk | Class | Sev | Verdict | Defense answer |
|---|---|---|---|---|---|---|---|---|---|
| SC-01 | 100 features: 95 done, 4 partial, 1 designed | panelist_feature_checklist.md Summary :587-602 | — | — | — | H | — | PRAISE | — |
| SC-02 | Not done: 6.6 email live, 6.7 SMS live, 7.1 admin-started chat, 7.6 chat notification row, 7.7 complaints (designed only, targets a non-existent `conversations` table) | checklist §6-7 | — | Complaints via chat or office | — | P | M | NEUTRAL | — |
| SC-03 | Checklist inconsistencies | "automated reports [ ]" outside the count (:21); 6.8 "tenant UI pending" marked ✅; Module 11 5/5 ✅ vs open CH-1/A-1; Last Updated 2026-11-06 | — | — | Panel spots contradictions | P | M | CRITIQUE | — |
| SC-04 | Manager interview 30/30, with stated deviations | manager_interview_comparison.md: Q11 refundable deposit per contract (adviser, 2026-11-10), Q26 backups documented only, Q13 no dispute screen, Q2-Q4 kept by decision | — | — | — | H | — | PRAISE | Each deviation has a dated reason. |
| SC-05 | Open bugs | SPRINT #78 (advance invoice shown overdue), #77 (no receipt for part-payments), #80 (`floor_rates` seeded `{}`) | — | — | Demo glitch | P | M | CRITIQUE | — |
| SC-06 | No novelty or contribution statement | No such section in any doc | — | — | "What is new?" | G | M | CRITIQUE | Candidates: guest-to-tenant chat continuity, reused-reference detection, cents-safe balance rules, itemized deposit settlement with review, advance-credit ledger. |

### A.12 Research and documentation quality

| # | Finding | Evidence | System does | Outside the system | Risk | Class | Sev | Verdict | Defense answer |
|---|---|---|---|---|---|---|---|---|---|
| RD-01 | No user acceptance evidence | No survey, SUS score or sample size; both 11-10 audits say "not survey data"; real_world_test_guide.md is a plan (:36-48, :176) | — | — | Chapter 4 has no user data | G | C | CRITIQUE | Run the SUS and evaluator survey per the guide before defense and report n. |
| RD-02 | ISO 25010 coverage | evidence map §1: items 13 and 18 not evidenced, 15 partly | — | — | — | P | H | NEUTRAL | The map states honestly which items need real-user or load evidence. |
| RD-03 | No requirement → feature → test matrix | Checklist links code and docs, not tests; module_verification_guide.md has M-IDs but omits many test files | — | — | Weak traceability | G | M | CRITIQUE | — |
| RD-04 | Test docs incomplete | api_testing.md table has 69 rows; 10 test files are missing from it (application_lifecycle, balance_rules, charge_posting, demo_seed, guest_chat_links, input_validation, maintenance_workflow, parking_guards_orphan_cleanup, profile_avatar, service_workflow); qa_gap_audit.md summary is stale | — | — | — | P | L | NEUTRAL | — |
| RD-05 | Numbers drift across docs | §A.13 table | — | — | Panel credibility | G | H | CRITIQUE | Fix before defense (S). |

### A.13 Doc–code and doc–doc mismatches

| Metric or claim | What the docs say | Actual (code or count) |
|---|---|---|
| Test files | qa_gap_audit.md:3 → 49 · progress_report.md:256,273 → 67 · ISO map §3.1 → 76 · api_testing.md:12 → 77 · api_testing.md table → 69 rows | **79** |
| Test count | README.md:262 "~390" · qa_gap_audit "~514" · progress_report 1,598 · ISO map 1,696 · api_testing 1,726 | 1,726 (last recorded) |
| Endpoints (`backend/api/*.php`) | api_documentation.md:5 → 155 · ISO map item 16 → 159 · security_audit scope "83/104" | **160** |
| Tables | system_design.md:63 "30 + messages" · progress_report 46→49 · ISO map 50 · database_schema.md:8 → 51 | **51** |
| PHP version | docs and PHPStan 8.0 · CI 8.2 · local Apache 8.5.12 | mixed |
| security_audit D-7 | open | fixed (config.php:31-34; no `dev_token`) |
| security_audit L-1 | open, High | `backend/logs/.htaccess` tracked, deny all |
| security_audit CH-4 | open | chat endpoints include cors.php; no `*` in backend/api |
| security_audit D-9 | submit_inquiry, send_payment_reminder run DDL | only get_inquiries.php does |
| security_audit header | Last Updated 2026-09-24 | contains 2026-11-11 entries |
| C-3, backup_and_restore.md:17 | CORS from `ALLOWED_ORIGINS` | hardcoded in cors.php:19-25 |
| manager_interview Q11 | non-refundable by default | `deposit_refundable_default` = '1' (SetupDB.sql:1556; settingsSchema.js:26) |
| todo.md:64 | "Prorated billing on extension, done" | whole months (config.php:586); SPRINT #73 open |
| service_management_design.md §8 | reversal after payment is manual | automatic `rejected_charge` refund (config.php:1209-1214) |
| payment_system_design.md §7/§8 | overdue "future cron"; status check before session | overdue sweep exists; bill claimed before session |
| todo.md:91 | proof not required | required (upload_payment_proof.php) |
| AdminContracts.jsx:837 | "late fee of ₱500… on or before the 5th" | late fee off; default value ₱200 |
| adjust_invoice.php:74 | "issue a manual credit" | no manual credit feature |
| Checklist §3.7 | late fee "configurable" | no settings row |
| Checklist Module 11 | 5/5 ✅ | CH-1 Critical, A-1 High open |
| legalContent.js:196 | activity log of admin changes | house_rules edits and socket chat not logged |
| ISO map item 16 | expiry sweeps need no login "by design" | admin-only since R-7 (its own §3.6) |

---

## Part B: Limitations and Delimitations (thesis-ready)

### B.1 Delimitations (chosen not to cover)

| # | Statement | Justification | Covered off-system by |
|---|---|---|---|
| DE-1 | The study covers a single residential property of about 15–100 units; multi-building or multi-owner portfolios are out of scope. | The partner property is a single building; a property dimension would add complexity with no user to validate it. | Separate installations per property. |
| DE-2 | One contract holder per unit has a login; other occupants are recorded as household members without accounts. | Matches how the manager deals with tenants (one responsible payer). | Occupants contact the office through the contract holder. |
| DE-3 | There is no separate owner or accountant role; the admin (manager) performs all office functions. | The manager is also the owner's representative (manager interview Q2-Q4). | The owner reviews reports and the activity log. |
| DE-4 | The system is not an accounting or tax system; it does not issue BIR-registered official receipts or keep a general ledger. | Bookkeeping and tax compliance follow separate regulations and software. | The manager issues official receipts and the bookkeeper records revenue. |
| DE-5 | No tenant screening or credit check is performed. | No accessible credit bureau API; screening is a judgment call. | The manager interviews applicants and checks IDs and references. |
| DE-6 | Utility consumption is not metered; electricity and water amounts are entered by the admin. | Meters are read physically. | Manual meter reading. |
| DE-7 | A formal complaints module and an invoice dispute screen are not included. | The manager resolves disputes in person (Q13); chat serves as the written channel. | Chat and office conversation; adjustments are recorded with a reason. |
| DE-8 | Only Philippine pesos and Philippine phone formats are supported. | Local property and local payment channels. | — |
| DE-9 | No native mobile app; access is through a responsive web app. | One codebase; tenants use phone browsers. | — |
| DE-10 | Mid-month proration and room transfers are not automated. | Rent is billed by whole month at the partner property; transfers are rare. | The manager computes partial months and records transfers as a move-out plus a new application. |

### B.2 Limitations (cannot do, or depends on people or other parties)

| # | Statement | Justification | Covered off-system by |
|---|---|---|---|
| LI-1 | The system records the outstanding balance at move-out and offsets it against the deposit, but does not create a balance invoice or enforce collection of any shortfall. | Collection after the tenant leaves depends on negotiation, not software. | Installment, lump-sum or other settlement agreed between the manager and the former tenant. |
| LI-2 | The system records part-payments but does not enforce an installment schedule. | Payment arrangements vary per tenant. | The arrangement is agreed verbally or in writing; the admin moves due dates as agreed. |
| LI-3 | Refunds are tracked from request to "Refunded" with method and reference, but the transfer itself is executed outside the system. | Bank and e-wallet payouts happen in those providers' apps (except PayMongo refunds of online payments). | Admin sends via bank, GCash or cash and records the reference. |
| LI-4 | Cash payments rely on the admin's confirmation; there is no second approver. | A small property has one manager. | The owner reviews the activity log and reports. |
| LI-5 | A paid payment cannot be voided; corrections go through refund requests. | Keeping paid records immutable preserves the audit trail. | Refund request or a written correction. |
| LI-6 | Online payment confirmation depends on PayMongo's webhook; the system does not poll PayMongo. | PayMongo retries webhooks; polling is outside scope. | The admin checks the PayMongo dashboard before releasing a stuck checkout. |
| LI-7 | SMS and email delivery depend on Semaphore and an SMTP provider, which run in dry-run mode in the study environment. | Live sending needs paid credits and sender-name approval. | In-app notifications always work; the manager calls tenants when needed. |
| LI-8 | Legal compliance is the manager's responsibility: the system does not enforce rent control increase caps, and its e-signature is an uploaded image. | Coverage under RA 9653 depends on the unit's rent bracket; legal signature validity depends on the signed or notarized copy. | The manager applies the cap and keeps signed or notarized originals (uploadable). |
| LI-9 | Backups, restore drills and scheduled jobs must be set up and run by the operator. | They are host-level tasks (Task Scheduler, mysqldump). | `backup_and_restore.md` runbook; the daily sweep also self-runs on the first request each day. |
| LI-10 | The system runs on one server with no replication or monitoring. | Owner-hosted, sized for one property. | Backups and the restore runbook. |
| LI-11 | Data is kept until the owner deletes it; there is no automated erasure or anonymization. | Financial records must be retained; the Privacy Notice discloses this. | Privacy requests handled by the owner as data protection contact. |
| LI-12 | Emergency contacts and incapacity or death of a tenant are not modelled. | Rare events handled personally. | The manager keeps emergency contacts and uses termination or archive. |
| LI-13 | Usability, performance and reliability results come from code review and seed-data runs, not a large user population or a production load. | Capstone time and access constraints. | The SUS session and load test per `2026-11-10_real_world_test_guide.md`. |

---

## Part C: Panel simulation

### C.1 The 15 hardest questions (ranked)

| Rank | Question | Best honest answer | Show |
|---|---|---|---|
| 1 | "Where is your user acceptance evidence? How many respondents?" | If the SUS session is done: give n, mean SUS and method. If not: say plainly that the evaluation instrument and procedure are ready, and present the AI-assisted heuristic and ISO 25010 evidence as preliminary. | real_world_test_guide.md §1/§9; ISO map |
| 2 | "Is the chat secure? Can I read another tenant's messages?" | REST chat checks the session; the socket server did not until the fix. State which build you are on; if not fixed, admit CH-1 and explain the fix (token on connect, sender from session). | websocket-server/server.js; security_audit CH-1 |
| 3 | "A tenant leaves owing more than the deposit. What happens?" | Clearance offsets unpaid bills and deductions against the deposit in one locked transaction and shows the balance due; collecting it after move-out is agreed between manager and tenant (LI-1). | Admin Tenants → clearance; config.php `settle_deposit` |
| 4 | "Can the admin fake or delete a cash payment?" | They can record only what the tenant declared, on the same channel and amount; every action is logged with the session user; the log is insert-only; there is no second approver (DE-3, LI-4). | record_payment_admin.php; Activity Logs page |
| 5 | "A desk payment was recorded wrongly. How do you reverse it?" | Paid records are immutable; correction is by refund request so the trail remains (LI-5). Admit a reasoned void is the better design. | AdminRefunds |
| 6 | "What if PayMongo's webhook never arrives, or arrives late?" | Signed and retried webhooks; the bill stays processing; the admin checks the dashboard before releasing. Be honest that a late webhook after a desk payment is not flagged (F-07). | paymongo_webhook.php; release_checkout_session.php |
| 7 | "Does your contract comply with RA 9653?" | Move-in is 1 advance + 1 deposit, within the limits; increases are not capped by the system. Units renting at ₱10,000 or less are covered by NHSB Resolution 2024-01 (2.3% in 2025, 1% in 2026), and all our rooms are in that bracket, so the manager applies the cap and a warning on the renewal form is planned (LI-8, SPRINT 149). | contract_template.php:119-125 |
| 8 | "Is your e-signature legally binding?" | The system stores the signed contract; legal force comes from the signed or notarized copy the admin uploads. We do not claim a certified digital signature. | upload_lease_document.php; ViewContract |
| 9 | "How do you comply with RA 10173 on consent and deletion?" | Notice in English and Filipino; consent stored for applications and CCTV; retention disclosed; accounts archived, not erased, because of financial records. Admit registration consent is text-only (fix L-02). | legalContent.js; Registration page |
| 10 | "Why does the admin skip the device code, and why is admin123 seeded?" | Seed is for development; on the deployed build the password is changed. Admit the OTP bypass and state the fix. | login.php:140 |
| 11 | "Your docs say 49, 67, 77 and 79 test files. Which is it?" | 79 files, 1,726 tests at last run; older docs were snapshots in time. Only credible if the docs are reconciled first. | `tests/api`; api_testing.md |
| 12 | "What happens when the server dies? Show your backup." | Runbook exists; show a scheduled job and a recorded restore drill if done; otherwise admit it is a procedure. | backup_and_restore.md |
| 13 | "How does it scale? Why no pagination?" | Scoped to 15–100 units; lists stay small; the activity log is paged; admit no load test yet. | get_activity_logs.php; ISO map items 4-6 |
| 14 | "Can it run multiple buildings?" | No; delimitation DE-1, with reason. | database_schema.md |
| 15 | "What is novel compared with existing apartment software?" | Guest-to-tenant chat continuity, reused-reference detection, itemized deposit settlement with tenant review, advance-credit ledger, all fitted to a local manager's workflow from the interview. | manager_interview_comparison.md; checklist 7.8 |

### C.2 Top 10 PRAISE items

| # | Item | Evidence |
|---|---|---|
| 1 | One settlement path for desk and webhook, with row locks and guarded updates | config.php:1498, 1520-1525 (F-03) |
| 2 | Webhook: signed, fresh, bound to the checkout, exact to the centavo, unapplied money raised as a refund | paymongo_webhook.php:58-84, 198-284; paymongo_gateway.php:131-162 |
| 3 | Itemized deposit settlement with forfeiture rules, waiver reason and tenant review | config.php:3824-3928, 3988-3995 |
| 4 | Identity only from the server session; central role checks | config.php:1375-1417, 5857-5869 |
| 5 | Reused payment reference detection on a normalized indexed column | SetupDB.sql:1196; config.php:2488-2513 |
| 6 | 79-file, 1,726-test end-to-end API suite on a guarded scratch DB | tests/api; api_testing.md:12 |
| 7 | Unpaid approvals lapse on their own and release the room | config.php:786-824, 3103-3176 |
| 8 | Notification queue with backoff and delivery log; actions never wait on SMS or email | send_notification.php:306-333 |
| 9 | Private uploads (deny all, finfo, random names, ownership-checked download) | backend/uploads/.htaccess; download_file.php |
| 10 | Manager interview traced 30/30 with dated deviations | manager_interview_comparison.md |

### C.3 Top 10 CRITIQUE items (by severity)

| # | Item | Sev | Fix now or defend |
|---|---|---|---|
| 1 | Chat socket unauthenticated (S-11) | C | **Fix now** (M) |
| 2 | No user acceptance evidence (RD-01) | C | **Fix now**: run SUS with the evaluators |
| 3 | Seeded admin123 and admin OTP bypass (S-14, S-05) | H | **Fix now** (S) |
| 4 | Doc number drift and stale security_audit (RD-05, SC-03) | H | **Fix now** (S, docs only) |
| 5 | Residual balance after deposit not invoiced (P-04) | H | Defend (LI-1); build later (#73) |
| 6 | No void of a paid desk payment (F-04) | H | Defend (LI-5) |
| 7 | Backups not scheduled, no drill (D-05) | H | **Fix now**: schedule plus one drill |
| 8 | No handover or user manual (O-05, U-06) | H | Fix now: 2-page admin quick start |
| 9 | Registration consent text only (L-02) | H | **Fix now** (S) |
| 10 | No pagination or load test (X-01, X-05) | M | Defend (DE-1 scale) |

### C.4 Where our current answer is weak or contradicts a doc

- "Security 5/5 done" (checklist Module 11) contradicts open CH-1 and A-1 in security_audit.md.
- "Prorated billing done" (todo.md:64) contradicts whole-month code and open #73.
- "Deposit non-refundable by default" (manager_interview Q11 text) contradicts the seed value `1`.
- "Late fee configurable" (checklist §3.7) is not true in the UI, and the contract preview says ₱500.
- "CORS from `ALLOWED_ORIGINS`" (security_audit C-3, backup doc) is not how cors.php works.
- "Issue a manual credit" (adjust_invoice error) points to a feature that does not exist.
- Test, endpoint and table counts: any number quoted at defense can be contradicted by another doc.
- "All admin changes are logged" (Privacy Notice) is not true for house rules or socket chat.

---

## Part D: Gap action list (True gaps only)

| Gap | Size | Defend-instead wording | Docs to update if fixed |
|---|---|---|---|
| S-11 Chat socket auth | M | "The REST chat path is authenticated; the realtime relay is a known, documented risk scheduled for fixing." (weak; prefer the fix) | security_audit CH-1, chat_design.md, checklist Module 7/11, api_testing.md |
| RD-01 UAT / SUS evidence | M (people) | LI-13 | ISO map, progress_report, thesis Chapter 4 |
| S-14 Default admin password | S | "The seed is development-only; the deployed admin password was changed." | security_audit A-1, AGENTS.md seed note |
| S-05 Admin OTP bypass | S | "The admin uses a single trusted office PC." | security_audit, module_verification_guide (auth) |
| RD-05 Number drift | S | — (just fix) | api_testing, qa_gap_audit, progress_report, ISO map, README, system_design, api_documentation, security_audit |
| D-05 Backups not scheduled | S (ops) | LI-9 | backup_and_restore.md (drill record), manager_interview Q26 |
| L-02 Registration consent checkbox (+ L-04 terms version) | S | "Consent is captured at the rent application, where personal data is collected." | database_schema, api_documentation, security_audit, checklist |
| O-05 / U-06 Handover and admin quick start | S | "Training is delivered in person at turnover." | new docs/documentation/user_manual.md |
| P-05 Clearance while a proof is pending | S | "Admins verify pending proofs before clearance." | move_in_move_out_design.md |
| F-07 Late webhook after desk payment | S | LI-6 | payment_system_design.md, api_testing |
| P-06 Wrong "manual credit" message | S | — (fix the text) | — |
| S-16 Security headers | S | — | security_audit C-4/E-2..E-4 |
| S-09 Rate limit on inquiry and chat | S | "Public forms carry no money or account access." | security_audit CH-3 |
| S-06 OTP `random_int` + hashed | S | — | security_audit |
| SC-06 Novelty statement | S (writing) | — | system_design.md or thesis Chapter 1 |
| O-04 Running-cost table | S (writing) | — | external_services.md |
| P-18 Emergency contact field | S | LI-12 | database_schema |
| P-04 Balance invoice for residual debt | M | LI-1 | move_in_move_out_design, payment_system_design, checklist, api docs |
| F-04 Reasoned void of a paid payment | M | LI-5 | payment_system_design, api docs, tests |
| L-06 Anonymize action | M | LI-11 | security_audit, legalContent |
| L-10 Rent increase cap warning (promoted to pre-defense, rents fall in the covered bracket) | S | LI-8 | settingsSchema, checklist |
| P-24 Proration | M | DE-10 | payment_system_design |
| P-14 Room transfer | M | DE-10 | move_in_move_out_design |
| X-01 Server pagination | M | DE-1 scale | api_documentation |
| X-05 Load and soak test | M (run) | LI-13 | ISO map |
| U-02 Error boundary | S | — | — |
| R-02 / R-06 / O-03 Failed-delivery view, job alerting, log rotation | M | LI-9/10 | sms_email_implementation, environment_config |
| RD-03 Traceability matrix | M (writing) | — | module_verification_guide |

**Smallest set worth doing before defense (about 2–3 days):**
1. Authenticate the chat socket: verify the session token on connect and take the sender from the session.
2. Force the admin password change and remove the admin device-code bypass.
3. Reconcile every count in the docs and the stale security_audit statuses; fix the Module 11 checklist status.
4. Add the registration consent checkbox with a timestamp (and the terms version), and warn when a renewal rent increase exceeds the NHSB 2024-01 cap (L-10, SPRINT 149).
5. Run one SUS session (even n = 5–10) and one backup-and-restore drill, and record both.
6. Write a novelty paragraph, a cost table and a 2-page admin quick start.
7. Optional S fixes with high defense value: block clearance while a proof is pending (P-05), and raise a refund request on a late webhook (F-07, now confirmed live).

**Do not build before defense:** multi-building support, an installment scheduler, a four-eyes approval workflow, a frontend test suite, pagination on every list, a complaints or dispute module, proration, room transfers, or a native app. Each is better defended through §B than half-built.

---

## Part E: Scorecard

| # | Category | Score (1–5) | Reason |
|---|---|---|---|
| 1 | Policy and process | 4 | Deposit, forfeiture, holds and advance credits are strong; shortfall collection, proration and transfers are off-system. |
| 2 | Financial controls | 4 | Excellent anti-double-posting and webhook rules; no void, and weak reconciliation reporting. |
| 3 | Security and access | 3 | Solid session and role core, undermined by the unauthenticated chat socket and admin login weaknesses. |
| 4 | Privacy and legal | 3 | Good notice and stored consent where it matters; registration consent, erasure and the rent-cap question are open. |
| 5 | Data integrity | 4 | Transactions, locks and race tests; backups not yet scheduled. |
| 6 | Reliability | 3 | Queue with retries and a self-healing sweep; no alerting, single server, SMS and email not live. |
| 7 | Usability and accessibility | 3 | Bilingual tenant UI and mobile layout; open severity-3 items, no onboarding, no screen-reader test. |
| 8 | Performance and scalability | 2 | Fine at seed scale, but no pagination, no load test and missing indexes. |
| 9 | Maintainability and testing | 4 | Large API suite and CI; no frontend tests, lint currently failing, PHPStan level 0. |
| 10 | Operations and deployment | 2 | Good env docs; no monitoring, no deploy automation, no handover, incomplete costs. |
| 11 | Scope vs objectives | 4 | 95/100 done and traced to the manager interview; checklist inconsistencies and no novelty statement. |
| 12 | Research and documentation | 2 | Rich docs, but no user data, no traceability matrix and numbers that disagree. |

**Counts per classification (Part A, 127 rows):**

| Class | Count |
|---|---|
| Handled (H) | 37 |
| Partially handled (P) | 46 |
| Deliberate limitation (DL) | 12 |
| True gap (G) | 32 |

### UNVERIFIED items

Checked on 2026-11-12 and settled: ESLint (0 errors), the paid-never-moved-in case (flagged to the admin), the SPRINT #81 migration step (passes on a scratch DB), F-07 (confirmed live on the test DB), the rent-control bracket (NHSB Resolution 2024-01), and published PayMongo and Semaphore rates. Still open:

- N+1 and query behaviour at real data volume (X-02/X-03): needs the load test in `2026-11-10_real_world_test_guide.md` §2.
- PHP error logging and the socket server timezone on the **production** host (R-07, D-07): only the local machine was checked.
- The legal reading of 12-month voluntary prepayment under RA 9653 (L-09): confirm with the adviser.
- The GitHub run of `ci.yml` (M-07, SPRINT #81): no `gh` CLI here; the same steps pass locally.
- PayMongo and Semaphore figures come from published pages and third-party listings, not from an invoice or contract (O-04).

**Sources:** [NHSB Resolution 2024-01 (DHSUD)](https://dhsud.gov.ph/wp-content/uploads/Laws_Issuances/07_NHSB/NHSB%20Resolution%202024-01%20(Rent%20Control%202025-2026).pdf) · [PayMongo fees](https://developers.paymongo.com/docs/fees-and-rates) · [Semaphore](https://www.semaphore.co) · [Semaphore API docs](https://api.semaphore.co/docs)
