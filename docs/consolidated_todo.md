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
| Backend | 29 | 10 |
| Frontend | 10 | 0 |
| Security | 19 | 6 |
| Deployment | 16 | 0 |
| Testing and quality | 8 | 0 |
| Documentation | 11 | 0 |
| **Total** | **93** | **16** |

Another 2 open decisions are listed under [Needs decision](#needs-decision). They are not counted above. Seven questions were decided on 2026-09-16 (see [Decided 2026-09-16](#decided-2026-09-16)); the resulting features were built on 2026-09-17 (see [Recently Completed](#recently-completed)).

**Known blockers**

- **Railway API is down:** `login.php` returns a blank 500 because the `DB_*` / `APP_ENV` variables aren't set on Railway yet. This needs the user to act, and it blocks all live verification. See [TASK.md](../TASK.md).
- **`ALLOWED_ORIGINS` / `APP_URL`** can't be set until the frontend is deployed, and that needs `vercel.json` plus a Vercel project.
- **Least-privilege DB user (A-3)** is blocked by the DDL that still runs at request time (D-9 / L2).
- **Going live with PayMongo** and the live-mode webhook check (H9a) are blocked until PayMongo verifies the business.
- **Email and SMS** are blocked until provider accounts exist (Resend or Gmail SMTP, and Semaphore).
- **Blocking lint check in CI** (removing `continue-on-error`) is blocked by the 178 existing ESLint errors. Branch protection is not planned (see the branch rule decided 2026-09-16).
- **Chat:** phases 2 and 3 depend on phase 1.

**Recommended execution order**

1. **Unblock production.** Set the Railway variables, including `APP_ENV=production` (fixes C4 / D-7), then redeploy and verify.
2. **Audit Phase 1 (money and accounts):** C3, C2, C1 and H1, plus changing the admin password (A-1) and `npm audit fix` (E-7).
3. **Audit Phase 2 (trustworthy writes):** H7 first, then H5, then H4, then the combined end-of-tenancy helper (H6, M3, M4).
4. **Audit Phase 3 (documents):** H2 / B-8, H3, B-6, and the checkout return URLs.
5. **Audit Phase 4 (billing integrity):** H8, H9, M12, H10, M8, M9.
6. **Make the cloud stack usable:** `vercel.json`, the uploads volume, `ALLOWED_ORIGINS`, and HTTPS plus security headers.
7. **Remaining work:** the Phase 5 Mediums, then the Phase 6 Lows, then the lint backlog and CI hardening.
8. **Last:** feature enhancements (email/SMS, chat, backlog items) and fixing stale docs.

---

## Backend

| Status | Priority | Task | Source |
|---|---|---|---|
| [ ] | High | **Bug** C1: recording any invoice payment re-runs the move-in cascade. Limit it to move-in invoices. The related sharp edge is that the first payment silently activates a draft contract. | [Audit C1](audits/ams_security_workflow_audit_2026-09-16.md#c1), [Guide §18.3](documentation/module_verification_guide.md#183-sharp-edges-working-as-designed-but-easy-to-misread) |
| [ ] | High | **Bug** C2: concurrent checkout sessions can lose a real payment. Claim the invoice before calling PayMongo. | [Audit C2](audits/ams_security_workflow_audit_2026-09-16.md#c2) |
| [ ] | High | **Bug** C3: `pay_bill.php` moves an invoice to pending-verification without proof, and it can stay there forever. Require a proof held on the server and add a reject action. | [Audit C3](audits/ams_security_workflow_audit_2026-09-16.md#c3) |
| [ ] | High | **Bug** H4: resubmitting an application resets a live tenancy to Pending Review. Guard the resubmission. | [Audit H4](audits/ams_security_workflow_audit_2026-09-16.md#h4) |
| [ ] | High | **Bug** H5: applications have no state machine, so "moved-out" can vacate another tenant's room. Add `APPLICATION_TRANSITIONS`. *Depends on:* H7. | [Audit H5](audits/ams_security_workflow_audit_2026-09-16.md#h5) |
| [ ] | High | **Bug** H6: restoring an archived tenant reinstates every cancelled invoice and re-occupies the room unconditionally. | [Audit H6](audits/ams_security_workflow_audit_2026-09-16.md#h6) |
| [ ] | High | **Bug** H7: failed statements inside transactions still commit, because mysqli doesn't throw in PHP 8.0. Enable strict `mysqli_report` and fix the three call sites that read `errno`. Do this before the other lifecycle fixes. | [Audit H7](audits/ams_security_workflow_audit_2026-09-16.md#h7) |
| [ ] | High | **Bug** H8: re-issuing an invoice overwrites posted parking, utility and late-fee amounts. Make creation insert-only and add a separate adjustment action. | [Audit H8](audits/ams_security_workflow_audit_2026-09-16.md#h8) |
| [ ] | High | **Bug** H9: the webhook's live-mode signature parsing is only plausibly correct, and it never checks the paid amount. *Blocked by (part a):* PayMongo live mode. | [Audit H9](audits/ams_security_workflow_audit_2026-09-16.md#h9), [paymongo guide §3](paymongo_integration_guide.md#3-production-deployment) |
| [ ] | High | **Bug** H10: repair costs flagged as the tenant's responsibility never reach an invoice. | [Audit H10](audits/ams_security_workflow_audit_2026-09-16.md#h10) |
| [ ] | Medium | **Bug** PayMongo return URLs fall back to a hardcoded `localhost` hash URL that `BrowserRouter` can't route. Build them from a server setting (M11, remaining part). | [Audit M11](audits/ams_security_workflow_audit_2026-09-16.md#m11), [Guide §18.1 #4](documentation/module_verification_guide.md#181-defects) |
| [ ] | Medium | **Bug** M2: editing an expired contract's dates rewrites the lease dates of a room that has since been re-let. | [Audit M2](audits/ams_security_workflow_audit_2026-09-16.md#m2) |
| [ ] | Medium | **Bug** M3 + M4: the archive paths disagree with move-out, and move-out writes off pending invoices with no reconciliation. Merge them into one end-of-tenancy helper. *Depends on:* H6. | [Audit M3](audits/ams_security_workflow_audit_2026-09-16.md#m3), [Audit M4](audits/ams_security_workflow_audit_2026-09-16.md#m4) |
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
| [ ] | High | **Risk** H1: `get_rooms.php` returns current and past tenant names, lease dates and rents without a login. Strip tenant data from the public view. | [Audit H1](audits/ams_security_workflow_audit_2026-09-16.md#h1), [security_audit §5](security_audit.md#5-moderate-additional-findings) |
| [ ] | High | **Risk** H2 / B-8: IDs, NBI clearances, payment proofs and leases are served from guessable static URLs. Add an authenticated download endpoint, block direct `uploads/` access, and use random file names (with a migration to rename existing files). | [Audit H2](audits/ams_security_workflow_audit_2026-09-16.md#h2), [security_audit §2](security_audit.md#section-2--file-uploads) |
| [ ] | High | **Risk** H3: `pay_bill.php` accepts the proof-of-payment path verbatim from the client. | [Audit H3](audits/ams_security_workflow_audit_2026-09-16.md#h3) |
| [ ] | High | **Risk** A-1: change the seeded admin password (`admin123`), and never import `seed_mock_data.sql` into production. | [security_audit §1](security_audit.md#section-1--authentication--access-control), [saas guide §2.6](deployment/saas_deployment_guide.md#26-production-hardening-checklist) |
| [ ] | High | **Risk** E-7: run `npm audit fix`. There are 6 high and 1 moderate dependency advisories. | [security_audit §5](security_audit.md#section-5--frontend--react) |
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
| [ ] | Unprioritized | **Maint** Clear the ESLint backlog (178 errors, mostly unused `React` imports). | [cicd Known Gaps](deployment/cicd_pipeline.md#1-lint-currently-fails--191-problems-178-errors-option-a-adopted), [cicd Week 1](deployment/cicd_pipeline.md#-week-1--foundation-get-ci-green) |
| [ ] | Unprioritized | **Maint** Remove `continue-on-error` from the lint step in `ci.yml`. *Depends on:* the lint backlog. | [cicd Week 1](deployment/cicd_pipeline.md#-week-1--foundation-get-ci-green) |
| [ ] | Unprioritized | **Enh** Add a MariaDB schema-validation job to CI (`mariadb:10.11`). | [cicd Week 2](deployment/cicd_pipeline.md#-week-2--refine-now-gate-on-it) |
| [ ] | Unprioritized | **Optional** Add Vitest with 3–5 tests and enable the CI test step (*Stretch*). | [cicd Week 3](deployment/cicd_pipeline.md#-week-3--test-stretch) |
| [ ] | Unprioritized | **Optional** Add PHPStan, and run the PHP endpoints against a live DB in CI (*Stretch*). *Depends on:* the schema job. | [cicd Week 3](deployment/cicd_pipeline.md#-week-3--test-stretch) |
| [ ] | Unprioritized | **Bug** `clear_and_seed.sql` and `seed_reset.sql` are out of sync: the bcrypt hash is broken and the ID ranges are stale. | [database_schema.md (seed scripts section)](documentation/database_schema.md) |
| [ ] | Unprioritized | **Maint** Run the move-in/move-out lifecycle checklist before deployment (room vacating, `is_archived` toggle, button states, full end-to-end run). | [move_in_move_out_design §6](features/move_in_move_out_design.md#6-pre-deployment-checklist-for-move-inout) |
| [ ] | Unprioritized | **Maint** Demo/sample data (checklist 8.8 is still 📋, but `seed_mock_data.sql` exists). Confirm it covers the demo, then close the item. | [Checklist Module 8](features/panelist_feature_checklist.md#module-8--admin-dashboard--reports) |

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
| [x] | Railway prep (2026-09-16): `Dockerfile`, DB settings read from env, `VITE_API_BASE_URL`, `fileUrl.js` for every file link, `cors.php` allowlist (C-3, E-1, E-5), JSON error on a failed DB connect | [TASK.md](../TASK.md), [environment_config.md](deployment/environment_config.md), [saas guide §0](deployment/saas_deployment_guide.md#0-before-you-start--readiness-status) |
| [x] | CI workflow: frontend lint (non-blocking) and build, PHP syntax check | [cicd Week 1](deployment/cicd_pipeline.md#-week-1--foundation-get-ci-green) |
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
