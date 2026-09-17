# AMS — Consolidated TODO

> **Compiled:** 2026-09-16 from every backlog, audit, checklist, deployment and design doc in the repository. The source files are unchanged and hold the full details, so follow the **Source** link before starting any task.
>
> **Scope:** this file lists open work only. Items that the source docs still show as open but the code already implements are listed under [Recently Completed](#recently-completed), not here.

**How to read the tables**

- **Priority** comes from the source.
  - [security_audit.md](security_audit.md): Critical/High → **High**, Moderate → **Medium**, Low → **Low**.
  - [2026-09-16 audit](audits/ams_security_workflow_audit_2026-09-16.md): C#/H# → **High**, M# → **Medium**, L# → **Low**.
  - Anything else → **Unprioritized**. A qualifier the source gives (*Stretch*, *Optional*, *v1.1*) stays in the task text.
- **Tags:**
  - **Bug**: wrong behaviour today
  - **Risk**: security exposure
  - **Enh**: new capability
  - **Maint**: cleanup, config or process
  - **Optional**: the source calls it optional or a stretch goal
  - **Blocked by / Depends on**: an ordering constraint
- IDs such as `C3`, `H7`, `M11` and `L2` refer to the 2026-09-16 audit. IDs such as `A-1`, `D-7` and `E-7` refer to the checklist in `security_audit.md`.
- `docs/audits/` is gitignored, so links to the audit only resolve in a local checkout.

---

## Summary

| Category | Open tasks | High |
|---|---|---|
| Backend | 20 | 3 |
| Frontend | 10 | 0 |
| Security | 16 | 3 |
| Deployment | 16 | 0 |
| Testing and quality | 2 | 0 |
| Documentation | 11 | 0 |
| **Total** | **75** | **6** |

Another 2 open decisions are listed under [Needs decision](#needs-decision). They are not counted above. Seven questions were decided on 2026-09-16 (see [Decided 2026-09-16](#decided-2026-09-16)); the resulting features were built on 2026-09-17 (see [Recently Completed](#recently-completed)).

**Known blockers**

- **Railway API is down:** `login.php` returns a blank 500 because no database or `DB_*` / `APP_ENV` variables exist on Railway yet. Railway's MySQL template is MySQL 9.4 and rejects the MariaDB schema, so the database runs as a `mariadb:10.11` image instead. This needs the user to act, and it blocks all live verification. Follow [railway_setup_runbook.md](deployment/railway_setup_runbook.md).
- **`ALLOWED_ORIGINS` / `APP_URL`** can't be set until the frontend is deployed, and that needs `vercel.json` plus a Vercel project.
- **Least-privilege DB user (A-3)** is blocked by the DDL that still runs at request time (D-9 / L2).
- **Going live with PayMongo** and the live-mode webhook check (H9a) are blocked until PayMongo verifies the business.
- **Email and SMS** are blocked until provider accounts exist (Resend or Gmail SMTP, and Semaphore).
- **Chat:** phases 2 and 3 depend on phase 1.

**Recommended execution order**

1. **Unblock production.** Set the Railway variables, including `APP_ENV=production` (fixes C4 / D-7), then redeploy and verify.
2. ~~**Audit Phase 1 (money and accounts):** C3, C2, C1 and H1, plus changing the admin password (A-1) and `npm audit fix` (E-7).~~ Done 2026-09-17 except A-1, which is a post-deploy action blocked on Railway going live (see [Recently Completed](#recently-completed)).
3. ~~**Audit Phase 2 (trustworthy writes):** H7 first, then H5, then H4, then the combined end-of-tenancy helper (H6, M3, M4).~~ Done 2026-09-17 (see [Recently Completed](#recently-completed)).
4. **Audit Phase 3 (documents):** H2 / B-8, B-6, and the checkout return URLs.
5. **Audit Phase 4 (billing integrity):** H8, H9, M12, H10, M8, M9.
6. **Make the cloud stack usable:** `vercel.json`, the uploads volume, `ALLOWED_ORIGINS`, and HTTPS plus security headers.
7. **Remaining work:** the Phase 5 Mediums, then the Phase 6 Lows.
8. **Last:** feature enhancements (email/SMS, chat, backlog items) and fixing stale docs.

---

## Backend

| Status | Priority | Task | Source |
|---|---|---|---|
| [ ] | High | **Bug** H8: re-issuing an invoice overwrites posted parking, utility and late-fee amounts. Make creation insert-only and add a separate adjustment action. | [Audit H8](audits/ams_security_workflow_audit_2026-09-16.md#h8) |
| [ ] | High | **Bug** H9: the webhook's live-mode signature parsing is only plausibly correct, and it never checks the paid amount. *Blocked by (part a):* PayMongo live mode. | [Audit H9](audits/ams_security_workflow_audit_2026-09-16.md#h9), [paymongo guide §3](paymongo_integration_guide.md#3-production-deployment) |
| [ ] | High | **Bug** H10: repair costs flagged as the tenant's responsibility never reach an invoice. | [Audit H10](audits/ams_security_workflow_audit_2026-09-16.md#h10) |
| [ ] | Medium | **Bug** PayMongo return URLs fall back to a hardcoded `localhost` hash URL that `BrowserRouter` can't route. Build them from a server setting (M11, remaining part). | [Audit M11](audits/ams_security_workflow_audit_2026-09-16.md#m11), [Guide §18.1 #4](documentation/module_verification_guide.md#181-defects) |
| [ ] | Medium | **Bug** M2: editing an expired contract's dates rewrites the lease dates of a room that has since been re-let. | [Audit M2](audits/ams_security_workflow_audit_2026-09-16.md#m2) |
| [ ] | Medium | **Bug** M5: a "Converted" unit hold leaves the unit reserved forever. | [Audit M5](audits/ams_security_workflow_audit_2026-09-16.md#m5) |
| [ ] | Medium | **Bug** M6: manual occupancy skips the vacancy check, invoice and contract, and `rooms.status` has no allowlist. | [Audit M6](audits/ams_security_workflow_audit_2026-09-16.md#m6), [Guide §18.3](documentation/module_verification_guide.md#183-sharp-edges-working-as-designed-but-easy-to-misread) |
| [ ] | Medium | **Bug** M7: lease length, occupants, room and rent aren't validated when an application is submitted. | [Audit M7](audits/ams_security_workflow_audit_2026-09-16.md#m7) |
| [ ] | Medium | **Bug** M8: manual invoices have no duplicate-period guard, allow negative amounts, and take a free-text period. | [Audit M8](audits/ams_security_workflow_audit_2026-09-16.md#m8) |
| [ ] | Medium | **Bug** M12: move-out notices, payments without proof and webhook settlements skip the admin queue. Share one `settle_invoice()` between the desk and webhook paths. The webhook path also skips move-in activation. *Depends on:* C1. | [Audit M12](audits/ams_security_workflow_audit_2026-09-16.md#m12) |
| [ ] | Low | **Bug** L5: the service-charge reversal runs before the status claim and outside a single transaction. | [Audit L5](audits/ams_security_workflow_audit_2026-09-16.md#l5) |
| [ ] | Low | **Bug** L6: lease extensions skip the 24-month cap and `CONTRACT_TRANSITIONS`, and don't re-arm the lease-end reminder. | [Audit L6](audits/ams_security_workflow_audit_2026-09-16.md#l6) |
| [ ] | Low | **Maint** L7: `get_rooms.php` runs N+1 queries, and the sweep, overstay and overdue checks run on every poll or GET. | [Audit L7](audits/ams_security_workflow_audit_2026-09-16.md#l7) |
| [ ] | Low | **Maint** L10: `service_request.php` writes its queue row by hand. Use `notify_admins_queue()`. | [Audit L10](audits/ams_security_workflow_audit_2026-09-16.md#l10) |
| [ ] | Unprioritized | **Enh** Adjust billing pro rata when a lease is extended (checklist 3.10, partial). | [Checklist Module 3](features/panelist_feature_checklist.md#module-3--rental-payment--billing) |
| [ ] | Unprioritized | **Enh** Generate monthly invoices automatically (no scheduler exists yet; prd v2.0). | [date_dependent_testing §14](date_dependent_testing.md#14-tips--gotchas), [prd v2.0](../.agents/prd.md#v20--future-backlog-post-defense) |
| [ ] | Unprioritized | **Enh** Email and SMS notifications (checklist 6.6/6.7), including real password-reset email and a notification queue with retries. *Blocked by:* provider accounts. Maintenance update notices (4.10) are waiting on this. Email/SMS on new inquiries is TBA. | [Checklist Module 6](features/panelist_feature_checklist.md#module-6--notification-module), [notification_services §10](features/notification_services.md#10-implementation-plan--phased), [saas guide §8](deployment/saas_deployment_guide.md#8-email-resend--sms-semaphore), [external_services §1](documentation/external_services.md#1-external-service-integration-matrix), [prd v1.1](../.agents/prd.md#v11--sms--email-notification-activation) |
| [ ] | Unprioritized | **Enh** Two-way chat, phase 1: migration plus `start_conversation`, `get_messages`, `send_message` and `get_conversations` (checklist 7.1–7.6, prd v1.2). | [chat_design §9](features/chat_design.md#9-implementation-checklist), [Checklist Module 7](features/panelist_feature_checklist.md#module-7--communication-two-way-chat) |
| [ ] | Unprioritized | **Enh** Complaints management channel (checklist 7.7). | [Checklist Module 7](features/panelist_feature_checklist.md#module-7--communication-two-way-chat) |
| [ ] | Unprioritized | **Enh** Scheduled announcements (FR-10.6), and reservation reports per module (parking, CCTV, maintenance per unit). | [todo.md Announcements](todo.md#announcements), [todo.md Reports](todo.md#reports) |
| [ ] | Unprioritized | **Enh / Bug** Service-management known limitations: no recurring bookings, no staff-assignment UI, reversal after payment is manual, and `parking_reservation.php` still stores `../uploads/` paths. | [service_management_design §8](features/service_management_design.md#8-known-limitations) |

## Frontend

| Status | Priority | Task | Source |
|---|---|---|---|
| [ ] | Medium | **Bug** M9: the checkout cancel URL omits the invoice id, so the "processing" hold is never released. *Depends on:* the return-URL fix in Backend. | [Audit M9](audits/ams_security_workflow_audit_2026-09-16.md#m9) |
| [ ] | Medium | **Bug** M10: adding, editing or deleting admin payment-history records in `AdminPayments.jsx` is never saved. Remove those controls or back them with real endpoints. | [Audit M10](audits/ams_security_workflow_audit_2026-09-16.md#m10) |
| [ ] | Low | **Bug** L8: add a catch-all 404 route (unknown paths render blank), show errors in a shared toast instead of `console.error`, and stop PayBills from submitting when the proof upload fails. | [Audit L8](audits/ams_security_workflow_audit_2026-09-16.md#l8), [Guide §18.3](documentation/module_verification_guide.md#183-sharp-edges-working-as-designed-but-easy-to-misread) |
| [ ] | Unprioritized | **Enh** Two-way chat, phases 2 and 3: `ChatWindow`, `AdminChat` and `TenantChat`, routes, polling and the unread badge. *Depends on:* chat phase 1. | [chat_design §9](features/chat_design.md#9-implementation-checklist) |
| [ ] | Unprioritized | **Enh** Add a lease-extension history tab to the `AdminUnits` detail modal. The `lease_renewals` data already exists. | [todo.md Room & Occupancy](todo.md#room--occupancy), [todo.md Unit Management](todo.md#unit-management) |
| [ ] | Unprioritized | **Enh** Make the minimum and maximum lease or rental duration configurable. `AdminUnits.jsx` hardcodes 6 months; the backlog asks for a default of 3. | [todo.md Room & Occupancy](todo.md#room--occupancy), [todo.md Reservation & Lease](todo.md#reservation--lease) |
| [ ] | Unprioritized | **Enh** Add min/max limits to form inputs, including a plate-number `maxLength` in `ParkingReservation.jsx`. The backend already validates both. | [todo.md Registration & Application](todo.md#registration--application), [todo.md Parking Reservation](todo.md#parking-reservation) |
| [ ] | Unprioritized | **Enh** Let a rejected applicant edit and resubmit their application. Today they can only file a new one. | [todo.md Registration & Application](todo.md#registration--application) |
| [ ] | Unprioritized | **Enh** Documents: accept Police Clearance and Proof of Billing uploads, and let an admin request more documents from a tenant (with a notification). | [todo.md Documents](todo.md#documents) |
| [ ] | Unprioritized | **Enh** Housekeeping pages (garbage schedule, house rules), terms for occupancy and tenant responsibility, and restricting CCTV requests to incidents. | [todo.md Housekeeping](todo.md#housekeeping), [todo.md Room & Occupancy](todo.md#room--occupancy), [todo.md CCTV](todo.md#cctv-footage-request) |

## Security

| Status | Priority | Task | Source |
|---|---|---|---|
| [ ] | High | **Risk** C4 / D-7: `APP_ENV` defaults to `development`, so `forgot_password.php` returns the reset token to anyone. Set `APP_ENV=production` on every deployment and make the default fail closed. | [Audit C4](audits/ams_security_workflow_audit_2026-09-16.md#c4), [security_audit §4](security_audit.md#section-4--server--configuration), [saas guide §2.6](deployment/saas_deployment_guide.md#26-production-hardening-checklist) |
| [ ] | High | **Risk** H2 / B-8: IDs, NBI clearances, payment proofs and leases are served from guessable static URLs. Add an authenticated download endpoint, block direct `uploads/` access, and use random file names (with a migration to rename existing files). | [Audit H2](audits/ams_security_workflow_audit_2026-09-16.md#h2), [security_audit §2](security_audit.md#section-2--file-uploads) |
| [ ] | High | **Risk** A-1: change the seeded admin password (`admin123`), and never import `seed_mock_data.sql` into production. *This is a post-deploy action* — already listed as go-live checklist item 2 in the saas guide; nothing left to change in code until Railway is actually live. | [security_audit §1](security_audit.md#section-1--authentication--access-control), [saas guide §2.6](deployment/saas_deployment_guide.md#26-production-hardening-checklist) |
| [ ] | Medium | **Risk** M1: a tenant can replace the signed or notarized lease after the contract is activated. | [Audit M1](audits/ams_security_workflow_audit_2026-09-16.md#m1) |
| [ ] | Medium | **Risk** M13 / A-9: the account lockout can be abused to lock out any account (key it on account + IP), and registration has no throttling. (Reset requests were throttled on 2026-09-17.) | [Audit M13](audits/ams_security_workflow_audit_2026-09-16.md#m13), [security_audit §1](security_audit.md#section-1--authentication--access-control) |
| [ ] | Medium | **Risk** D-8 / L1: raw `$stmt->error` or exception text is still returned to clients (about 12 sites). Use `server_error_response()`. | [Audit L1](audits/ams_security_workflow_audit_2026-09-16.md#l1), [security_audit §4](security_audit.md#section-4--server--configuration) |
| [ ] | Medium | **Maint** D-9 / L2: remove the request-time DDL from `submit_inquiry`, `get_inquiries` and `send_payment_reminder`, and move the pre-auth writes in `get_rooms` and `my_room` after authentication. | [Audit L2](audits/ams_security_workflow_audit_2026-09-16.md#l2), [security_audit §4](security_audit.md#section-4--server--configuration) |
| [ ] | Medium | **Risk** A-3: create a least-privilege DB user instead of `root`. *Blocked by:* D-9 / L2. | [security_audit §1](security_audit.md#section-1--authentication--access-control) |
| [ ] | Medium | **Risk** C-1 / C-2: HTTPS, and redirect HTTP to HTTPS, on the self-hosted server. Railway and Vercel provide TLS. | [security_audit §3](security_audit.md#section-3--network--transport), [localhost_to_production §2](deployment/localhost_to_production.md#2-changes-checklist) |
| [ ] | Low | **Risk** Security response headers: HSTS (C-4), `X-Frame-Options` (E-2), `nosniff` (E-3) and `Referrer-Policy` (E-4). | [security_audit §3](security_audit.md#section-3--network--transport), [security_audit §5](security_audit.md#section-5--frontend--react) |
| [ ] | Low | **Risk** D-1: set `display_errors=Off` and `log_errors=On` in production `php.ini`. *Depends on:* D-7. | [security_audit §4](security_audit.md#section-4--server--configuration) |
| [ ] | Low | **Risk** A-2 / B-6: change the MySQL root password, set upload directory ownership and `755` permissions, and stop using `mkdir 0777`. | [security_audit §1](security_audit.md#section-1--authentication--access-control), [security_audit §6](security_audit.md#6-low--hygiene) |
| [ ] | Low | **Risk** L3: sessions are stored as raw tokens (store a SHA-256 hash instead), tokens are kept in web storage, and expired session rows are never purged. The CORS part is done. | [Audit L3](audits/ams_security_workflow_audit_2026-09-16.md#l3), [security_audit §5](security_audit.md#5-moderate-additional-findings) |
| [ ] | Low | **Risk** L4: public settings are filtered by a denylist. Switch to an allowlist. | [Audit L4](audits/ams_security_workflow_audit_2026-09-16.md#l4) |
| [ ] | Low | **Risk** L9: an email change doesn't require re-authentication, one admin can reset another admin's password, `create_contract` accepts a client-chosen id, `ProfileSettings.jsx` uses `innerHTML`, and the occupant count has no upper bound. | [Audit L9](audits/ams_security_workflow_audit_2026-09-16.md#l9) |
| [ ] | Low | **Risk** Hygiene: the uploads `.htaccess` uses Apache 2.2 syntax and its denylist misses `phar`/`phtml`/`html`/`svg`, and `registration.php` reveals which emails are already registered. | [security_audit §6](security_audit.md#6-low--hygiene), [security_audit §5](security_audit.md#5-moderate-additional-findings) |

## Deployment

| Status | Priority | Task | Source |
|---|---|---|---|
| [ ] | Unprioritized | **Maint** Set the Railway `DB_*` variables and `APP_ENV=production`, push, and deploy the latest commit. *This is a user action and blocks everything live.* | [TASK.md](../TASK.md), [environment_config §6](deployment/environment_config.md#6-checklist-bringing-production-up) |
| [ ] | Unprioritized | **Maint** Check the live API: `login.php` should return JSON (it currently returns a blank 500) and the CORS/env changes should be in effect. *Depends on:* redeploy. | [TASK.md](../TASK.md), [environment_config §8](deployment/environment_config.md#8-how-this-was-verified) |
| [ ] | Unprioritized | **Bug** Add `ams-react/vercel.json` with an SPA rewrite. Without it, refreshing a deep link returns 404 on Vercel. | [saas guide §0](deployment/saas_deployment_guide.md#0-before-you-start--readiness-status) |
| [ ] | Unprioritized | **Maint** Deploy the frontend to Vercel, then set `ALLOWED_ORIGINS` and `APP_URL` on Railway. *Depends on:* `vercel.json`. | [TASK.md](../TASK.md), [saas guide §2.6](deployment/saas_deployment_guide.md#26-production-hardening-checklist) |
| [ ] | Unprioritized | **Bug** Mount a Railway volume at `/var/www/html/uploads`, or use Supabase Storage. Otherwise uploads are wiped on every redeploy. | [saas guide §0](deployment/saas_deployment_guide.md#0-before-you-start--readiness-status) |
| [ ] | Unprioritized | **Maint** Confirm `backend/api/migrations` is excluded from the Docker image. | [saas guide §2.6](deployment/saas_deployment_guide.md#26-production-hardening-checklist) |
| [ ] | Unprioritized | **Maint** Configure an external scheduler for the daily sweep and the `expire_*` cron targets on the cloud stack. | [saas guide §9](deployment/saas_deployment_guide.md#9-scheduled-jobs) |
| [ ] | Unprioritized | **Maint** Set up DB and uploads backups, and watch the error log after go-live. | [saas guide §12.3](deployment/saas_deployment_guide.md#123-backups), [localhost_to_production §2](deployment/localhost_to_production.md#2-changes-checklist) |
| [ ] | Unprioritized | **Maint** Run the post-deployment and go/no-go checklist, including a test from an outside network and a ₱1 test payment. | [saas guide §11](deployment/saas_deployment_guide.md#11-post-deployment-verification-checklist), [localhost_to_production §5](deployment/localhost_to_production.md#5-pre-deployment-gono-go-checklist) |
| [ ] | Unprioritized | **Enh** Switch PayMongo to live mode: live keys and webhook, and remove the hardcoded `disabled` on the Live option in `AdminAccountSettings.jsx`. *Blocked by:* PayMongo business verification. | [paymongo guide §3](paymongo_integration_guide.md#3-production-deployment), [saas guide §7.4](deployment/saas_deployment_guide.md#74-going-live) |
| [ ] | Unprioritized | **Maint** Set up email and SMS provider accounts (Resend or Gmail SMTP, and Semaphore). This unblocks the Backend email/SMS task. | [saas guide §8](deployment/saas_deployment_guide.md#8-email-resend--sms-semaphore) |
| [ ] | Unprioritized | **Maint** Keep CI results visible on every push and act on red runs. Branch rule adopted 2026-09-16: routine work goes straight to `main`, big features use a `feature/` branch, and there is no required-PR protection. | [cicd Git Branching Strategy](deployment/cicd_pipeline.md#git-branching-strategy), [cicd Week 2](deployment/cicd_pipeline.md#-week-2--refine-now-gate-on-it) |
| [ ] | Unprioritized | **Optional** Custom domains (frontend and API). | [saas guide §10](deployment/saas_deployment_guide.md#10-custom-domains--https) |
| [ ] | Unprioritized | **Optional** CD workflow (`deploy.yml`) for a single target, then for two targets (Week 4 / 5+). *Depends on:* CI green. | [cicd Week 4](deployment/cicd_pipeline.md#-week-4--deploy-single-target-optional), [cicd Week 5+](deployment/cicd_pipeline.md#-week-5--deploy-dual-target-optional-stretch) |
| [ ] | Unprioritized | **Optional** Self-hosted path: `vite.config` base, server `php.ini`, SPA `.htaccess`, DB export and import, and checking the DB for stored Windows paths. Applies only if you host on your own server. | [localhost_to_production §2](deployment/localhost_to_production.md#2-changes-checklist) |
| [ ] | Unprioritized | **Optional** Runbook for migrating to SaaS. *Blocked by:* a home-server failure (contingency only). | [saas_fallback_strategy §6](deployment/saas_fallback_strategy.md#6-recommended-migration-path-if-home-server-fails) |

## Testing and quality

| Status | Priority | Task | Source |
|---|---|---|---|
| [ ] | Unprioritized | **Optional** Add Vitest with 3–5 tests and enable the CI test step (*Stretch*). | [cicd Week 3](deployment/cicd_pipeline.md#-week-3--test-stretch) |
| [ ] | Unprioritized | **Maint** Run the move-in/move-out lifecycle checklist before deployment (room vacating, `is_archived` toggle, button states, full end-to-end run). | [move_in_move_out_design §6](features/move_in_move_out_design.md#6-pre-deployment-checklist-for-move-inout) |

## Documentation

| Status | Priority | Task | Source |
|---|---|---|---|
| [ ] | Unprioritized | **Maint** Update guide §18.1 #4 and §18.3 once the audit fixes change the behaviour they describe (audit roadmap Phase 6). | [Audit §4](audits/ams_security_workflow_audit_2026-09-16.md#phase-6--hardening-and-cleanup), [Guide §18](documentation/module_verification_guide.md#18-known-issues--blocked-tests) |
| [ ] | Unprioritized | **Maint** Add a CI status badge to `README.md`. | [cicd Week 2](deployment/cicd_pipeline.md#-week-2--refine-now-gate-on-it) |
| [ ] | Unprioritized | **Maint** Fix stale entries in `todo.md`: several open items are done in code (see [Recently Completed](#recently-completed)), and "payment reference" appears both open and done. | [todo.md](todo.md) |
| [ ] | Unprioritized | **Maint** `system_design.md`: §7.2, §9 and Priorities C–E list endpoints and features as missing that exist, and contradict §12. §10 still describes `X-User-Id` authentication. | [system_design §7.2](documentation/system_design.md#72-endpoints-still-missing), [system_design §12](documentation/system_design.md#12-module-status-summary-current-live-state) |
| [ ] | Unprioritized | **Maint** `.agents/prd.md`: status is stale for notification preferences, inquiry/reservation, services, the parking inventory question (Q3), the security checklist (CORS and env items done), and the v2.0 items already shipped. | [prd v1.0](../.agents/prd.md#v10--shipped-current-state), [prd Security Requirements](../.agents/prd.md#security-requirements) |
| [ ] | Unprioritized | **Maint** `localhost_to_production.md`: the §1 localhost table and §1.7 `.env.production` items are done, and so is removing `Allow-Origin: *`. | [localhost_to_production §1](deployment/localhost_to_production.md#1-audit-results--what-must-change) |
| [ ] | Unprioritized | **Maint** `external_services.md` says notification preferences are "UI toggle only" (they are server-side) and that SaaS uses MySQL/PlanetScale (MariaDB is required). | [external_services §1](documentation/external_services.md#1-external-service-integration-matrix) |
| [ ] | Unprioritized | **Maint** `payment_system_design.md`: §1 still shows In-Person as "📋 New", and §7 says `overdue` is "future cron". Both are implemented. | [payment_system_design §1](features/payment_system_design.md#1-overview) |
| [ ] | Unprioritized | **Maint** Align the stack version (React 18 in README, prd and design docs vs React 19 / Vite 8 in `package.json` and cicd) and the endpoint count (80/84/87 in docs vs 88 files). | [cicd_pipeline.md](deployment/cicd_pipeline.md), [environment_config.md](deployment/environment_config.md), [README.md](../README.md) |
| [ ] | Unprioritized | **Maint** `cicd_pipeline.md` says the repo has "20 commits, no branches". It has about 196 commits and several branches. | [cicd_pipeline.md](deployment/cicd_pipeline.md#git-branching-strategy) |
| [ ] | Unprioritized | **Maint** `date_dependent_testing.md` §14 points to `todo.md` "Priority B" for auto-invoicing, but that label no longer exists there. | [date_dependent_testing §14](date_dependent_testing.md#14-tips--gotchas) |

### Needs decision

Open questions that block or shape tasks above. Questions the sources have since resolved are left out, such as lease-extension conflicts (see `inquiry_reservation_design.md`) and parking inventory.

| Status | Priority | Question | Source |
|---|---|---|---|
| [ ] | Unprioritized | Should the `dev_token` bypass be removed entirely, and when? This ties to C4. | [prd Open Questions](../.agents/prd.md#open-questions) |
| [ ] | Unprioritized | When should PayMongo switch to live mode? | [prd Open Questions](../.agents/prd.md#open-questions) |

### Decided 2026-09-16

These are no longer open questions. The features they called for were built on 2026-09-17 and are listed under [Recently Completed](#recently-completed).

| Status | Question | Decision | Source |
|---|---|---|---|
| [x] | Password change and reset policy | Light policy: no cap on changes, no cooldown, no forced expiry; the new password must differ from the current one; at most 3 reset requests per email per hour | [todo.md Account Management](todo.md#account-management) |
| [x] | Multiple occupants: shared or individual lease, shared or separate logins | One shared lease. Only the lease holder logs in; co-occupants go on a household roster | [todo.md Room & Occupancy](todo.md#room--occupancy), [prd Open Questions](../.agents/prd.md#open-questions) |
| [x] | Do occupant-count changes need admin approval? | Yes, as a tenant request approved by an admin | [prd Open Questions](../.agents/prd.md#open-questions) |
| [x] | 360° room viewing | Not planned (no panorama images). The admin chooses between images and floor plan | [todo.md Unit Information](todo.md#unit-information) |
| [x] | Where report expenses come from | An `expenses` table with manual entry, added to the derived maintenance costs | [todo.md Reports](todo.md#reports), [prd Open Questions](../.agents/prd.md#open-questions) |
| [x] | Feature branches or direct pushes to `main` | Routine work and bug fixes go to `main`; big implementations use a `feature/` branch; no required PRs | [cicd Git Branching Strategy](deployment/cicd_pipeline.md#git-branching-strategy), [CLAUDE.md](../CLAUDE.md) |
| [x] | Inquiry waitlist, conversion report, email/SMS | Conversion report: yes. Basic waitlist: yes. Email/SMS on new inquiries: TBA | [inquiry_reservation_design §8](features/inquiry_reservation_design.md#8-planned-and-deferred) |

---

## Recently Completed

Items the source docs mark done. Items marked † are still shown as open in an older doc, but the code proves they are done.

| Status | Item | Source |
|---|---|---|
| [x] | Audit Phase 2 — trustworthy writes (2026-09-17): H7 added `mysqli_report(MYSQLI_REPORT_ERROR \| MYSQLI_REPORT_STRICT)` in `config.php` so a failed statement inside a transaction throws instead of silently letting the transaction commit, and fixed the three call sites that read `errno` after `execute()` (`parking_reservation.php`, `update_parking_status.php`; `save_utility_reading.php` already handled the exception form) to catch `mysqli_sql_exception` instead. H5 added `APPLICATION_TRANSITIONS` (`config.php`) and enforced it with an optimistic-lock `WHERE id = ? AND status = ?` in `update_tenant_status.php` and `update_contract_status.php`'s `terminate` action; `end_tenancy()` (renamed from `vacate_tenant_room()`) now also guards the room update on `tenant_name` and fails closed. H4 restricted `rent_application.php` resubmission to `Rejected`/`Declined` applications (checked twice: before the upload and again in the `UPDATE`'s `WHERE`) and derives `monthly_rent` from `rooms.monthly_rent` server-side instead of trusting the client. H6/M3/M4 consolidated `archive_tenant.php`, `update_tenant_status.php`'s move-out branch and `update_contract_status.php`'s `terminate` action onto the shared `end_tenancy()` helper, which now tags every invoice it cancels with `invoices.cancel_reason` (new column, migration `2026_09_end_tenancy.sql`); `restore_tenant.php` only reinstates invoices tagged `'Archived'` and only reactivates the room/contract when the application is restored to `active` or `Approved` — restoring to `moved-out` now leaves the settled contract and vacant room alone. Move-out clearance (M4) computes `open invoices + damage/utility deductions − deposit` before cancelling anything, clears the remaining open invoices only when the deposit covers the balance, and returns/logs the leftover `balance_due` otherwise. `archive_tenant.php` also now terminates any still-active contract so the daily sweep can't send an archived tenant a stale "Lease Contract Expired" notice, and `manage_users.php`'s `delete` action refuses to archive a login with an open tenancy (`Approved`/`active`/`pending-move-out`), pointing the admin at Tenant Management instead. Verified live against the seed data (invalid/valid `APPLICATION_TRANSITIONS` moves, a full move-out → archive → restore round trip, the resubmission guard, and the `manage_users.php` guard); database restored via `clear_and_seed.sql` + `seed_mock_data.sql` afterward. | [Audit H4](audits/ams_security_workflow_audit_2026-09-16.md#h4), [H5](audits/ams_security_workflow_audit_2026-09-16.md#h5), [H6](audits/ams_security_workflow_audit_2026-09-16.md#h6), [H7](audits/ams_security_workflow_audit_2026-09-16.md#h7), [M3](audits/ams_security_workflow_audit_2026-09-16.md#m3), [M4](audits/ams_security_workflow_audit_2026-09-16.md#m4) |
| [x] | Audit Phase 1 — money and accounts (2026-09-17): C1 limited the move-in cascade in `record_payment_admin.php` to the move-in invoice itself (`security_deposit > 0`, application still `Approved`), guarded the room update so it can't overwrite a different tenant, and dropped `expired` from the contract-promotion set; C2 made `create_checkout_session.php` claim the invoice (`status='processing'`) before calling PayMongo, with the claim released on every failure path and the final `checkout_session_id` write guarded so a second request can't steal it; C3 stopped `pay_bill.php` from trusting a client-supplied proof path (closing H3 too) — a non-cash payment now requires a proof already stored by `upload_payment_proof.php` — and added `reject_payment_proof.php` (+ a "Reject Proof" button in `AdminPayments.jsx`) so a bad proof returns the invoice to `overdue`/`pending` with a reason instead of staying stuck forever; the eviction-monitoring query in `get_contracts.php` now also counts a past-due `pending-verification` invoice; H1 split `get_rooms.php` into a public projection (`id, type, floor, rent, status, roomCondition, furnishingStatus`) for guests/tenants and the full tenant/lease/history payload for authenticated admins only; `npm audit fix` (E-7) cleared all 7 advisories (1 moderate, 6 high) with no `--force`. A-1 (rotate `admin123`) is a post-deploy action already listed in the saas guide's go-live checklist — nothing left to change in code until Railway is live. | [Audit C1](audits/ams_security_workflow_audit_2026-09-16.md#c1), [C2](audits/ams_security_workflow_audit_2026-09-16.md#c2), [C3](audits/ams_security_workflow_audit_2026-09-16.md#c3), [H1](audits/ams_security_workflow_audit_2026-09-16.md#h1), [H3](audits/ams_security_workflow_audit_2026-09-16.md#h3) |
| [x] | Railway prep (2026-09-16): `Dockerfile`, DB settings read from env, `VITE_API_BASE_URL`, `fileUrl.js` for every file link, `cors.php` allowlist (C-3, E-1, E-5), JSON error on a failed DB connect | [TASK.md](../TASK.md), [environment_config.md](deployment/environment_config.md), [saas guide §0](deployment/saas_deployment_guide.md#0-before-you-start--readiness-status) |
| [x] | CI workflow (2026-09-16): frontend lint (non-blocking) and build, PHP syntax check | [cicd Week 1](deployment/cicd_pipeline.md#-week-1--foundation-get-ci-green) |
| [x] | Access control: session-only identity (A-7), session revocation (A-8), login and change-password throttle, visitor upload validation (B-7) | [security_audit §6d](security_audit.md#6d-role-based-access--activity-log-hardening-2026-09-14) |
| [x] | Billing, maintenance and service hardening (webhook replay, invoice state guards, IDOR fixes) | [security_audit §6b](security_audit.md#6b-billing--payments-hardening-2026-09), [§6c](security_audit.md#6c-maintenance--service-management-hardening-2026-09) |
| [x] | Module audits 1, 2, 5 and 9–12 fully ✅; modules 3, 4 and 8 have one open item each | [Checklist summary](features/panelist_feature_checklist.md#summary--implementation-progress) |
| [x] | Guide §18.1 defects #1–#3 fixed (parking slots fatal, unauthenticated password change, reset link) | [Guide §18.1](documentation/module_verification_guide.md#181-defects) |
| [x] | Payment reference number † (`invoices.payment_reference`) | [todo.md Payment](todo.md#payment) |
| [x] | Invoices marked overdue automatically † (`promote_overdue_invoices()`, daily sweep) | [todo.md Payment](todo.md#payment), [Checklist 3.7](features/panelist_feature_checklist.md#module-3--rental-payment--billing) |
| [x] | Lease-expiration reminders † (`send_lease_end_reminders()`, banner in `MyRoom.jsx`) | [todo.md Reservation & Lease](todo.md#reservation--lease), [system_design §9.3](documentation/system_design.md#93-user-facing-missing-features) |
| [x] | Tenant notified on every maintenance status change † (in-app) | [todo.md Maintenance](todo.md#maintenance) |
| [x] | Data-privacy consent checkbox on the CCTV form † (`CctvRequest.jsx`) | [todo.md CCTV](todo.md#cctv-footage-request) |
| [x] | Announcements aimed at one unit's tenant † (`create_announcement.php`) | [todo.md Announcements](todo.md#announcements) |
| [x] | Occupant-change request with admin approval † (`process_tenant_request.php`) | [todo.md Room & Occupancy](todo.md#room--occupancy) |
| [x] | Proof-of-payment upload and admin verification | [todo.md](todo.md) |
| [x] | Password policy (2026-09-17): new password must differ from the current one on every reset path; `forgot_password.php` limited to 3 per email / 10 per IP per hour; reset links no longer expire on issue (timezone bug) | [todo.md Account Management](todo.md#account-management), [Guide §18.1](documentation/module_verification_guide.md#181-defects) |
| [x] | Household roster (2026-09-17): `household_members`, `household_members.php`, approval in Notifications, My Room section, admin read-only list, `max_occupants_per_unit` cap, household ends with the tenancy | [todo.md Room & Occupancy](todo.md#room--occupancy), [Guide §18.4](documentation/module_verification_guide.md#184-household-roster-waitlist-and-room-preview-added-sept-2026) |
| [x] | Room preview setting (2026-09-17): admin chooses images or floor plan; 360° dropped | [todo.md Unit Information](todo.md#unit-information) |
| [x] | Expenses table with manual entry in Reports (2026-09-17) | [todo.md Reports](todo.md#reports), [database_schema.md](documentation/database_schema.md) |
| [x] | Inquiry conversion report and basic unit waitlist (2026-09-17) | [inquiry_reservation_design §8](features/inquiry_reservation_design.md#8-planned-and-deferred) |
| [x] | Server-side notification preferences † (`get_/update_notification_preferences.php`) | [external_services §1](documentation/external_services.md#1-external-service-integration-matrix) |
| [x] | ESLint backlog cleared (2026-09-17): 178 errors → 0, mostly unused `React`/icon imports plus ~40 React Compiler rule fixes (`react-hooks/immutability`, `react-hooks/set-state-in-effect`); `continue-on-error` removed from the CI lint step, which is now a real, blocking check | [cicd Known Gaps §1](deployment/cicd_pipeline.md#1-lint-backlog-cleared--the-lint-step-is-now-a-required-blocking-check), [cicd Week 1](deployment/cicd_pipeline.md#-week-1--foundation-get-ci-green) |
| [x] | CI `database` job (2026-09-17): imports `SetupDB.sql` against `mariadb:10.11`, validates the table count, then round-trips `seed_mock_data.sql` → `seed_reset.sql` → re-seed → `clear_and_seed.sql` and applies every `2026_09_*.sql` upgrade migration | [cicd Week 2](deployment/cicd_pipeline.md#-week-2--refine-now-gate-on-it) |
| [x] | PHPStan (2026-09-17, level 0, `phpVersion: 80000`) in the CI `backend` job, plus a `smoke-test` job that boots `php -S` against the CI database and exercises an unauthenticated and an authenticated (login + Bearer token) endpoint | [cicd Week 3](deployment/cicd_pipeline.md#-week-3--test-stretch) |
| [x] | `clear_and_seed.sql` and `seed_reset.sql` rewritten (2026-09-17) to match the current schema and `seed_mock_data.sql`: `clear_and_seed.sql` truncates and restores exactly the `SetupDB.sql` defaults; `seed_reset.sql` removes exactly what `seed_mock_data.sql` inserts, matched by email/title rather than stale id ranges | [database_schema.md (seed scripts section)](documentation/database_schema.md) |
| [x] | Demo/sample data confirmed and checklist 8.8 closed (2026-09-17): `seed_mock_data.sql` covers 12 tenants, 8 months of invoices and maintenance/parking/CCTV/service records | [Checklist Module 8](features/panelist_feature_checklist.md#module-8--admin-dashboard--reports) |
