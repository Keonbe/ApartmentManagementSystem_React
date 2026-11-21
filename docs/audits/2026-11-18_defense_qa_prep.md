# Defense Q&A prep (2026-11-18)

Thirty hard panel questions based on real decisions and weaknesses in this repo, with an honest answer and a likely follow-up for each. Where a doc and the code disagree, the code wins and the mismatch is listed at the end.

Sources read: `docs/features/panelist_feature_checklist.md`, `docs/documentation/system_design.md`, `docs/audits/security_audit.md`, `docs/documentation/module_verification_guide.md`, `docs/planning/todo.md` and `docs/audits/2026-11-12_panel_policy_gap_audit.md` (its Part B limitations and Part C panel simulation). Facts below were checked against the code on 2026-11-18.

Numbers to quote (run 2026-11-21): 169 PHP files in `backend/api/` (about 164 endpoints), 52 tables, 56 routes, 53 pages, 2 database roles (`user`, `admin`), 2,154 API tests in 108 files (all pass), 45 frontend tests in 7 files (all pass).

## 1. Architecture and tech choices

**1. Why plain PHP files with no framework?**
- **Answer:** The scope is one property (DE-1, panel audit Part B). Shared rules live in `backend/config.php`: identity guards (`require_admin`, `require_user`), `log_activity`, `settle_invoice`, `invoice_balance_cents`. Each endpoint is a thin file. The cost is a large `config.php` of about 6,400 lines.
- **Follow-up:** "What stops an endpoint from forgetting the auth guard?" Only convention plus the API suite. There is no middleware layer.

**2. Why a separate Node Socket.IO server?**
- **Answer:** PHP under Apache can't hold long-lived connections. The sidecar (`websocket-server/server.js`, port 3001) is a relay. Messages are still saved by the PHP REST endpoints. Since 2026-11-13 it validates the session token on connect (`io.use`, `server.js:80-92`).
- **Follow-up:** "If Node dies, is chat lost?" Real-time push is lost. Messages still save and load over REST.

**3. How do you keep tests from corrupting the dev database?**
- **Answer:** The suite builds a scratch `ams_test` database. `AMS_TEST_MODE=1` makes `config.php` refuse any database not named `*_test` (`AGENTS.md`, `api_testing.md`).
- **Follow-up:** "What if the env var is set wrong?" The guard refuses to start rather than falling back.

**4. Why `varchar` ids like `INV-202611-XXXXXXXX` and `CTR-…`?**
- **Answer:** The ids are readable on receipts and in chat. Uniqueness comes from the format plus unique keys such as `uq_invoice_rent_period`. The schema doc admits the cost: `rooms.id` is letter-coded, so `rent_applications.room_name` can't be a clean foreign key.
- **Follow-up:** "Why not an auto-increment id plus a display number?" That is cleaner and is what I'd do next time.

**5. Your frontend has no component tests. Why?**
- **Answer:** True. Frontend Vitest covers utilities only (45 tests in 7 files). The backend is the tested layer; the UI was checked by hand and in browser checks (SPRINT rows 57-61).
- **Follow-up:** "How do you know the UI shows the right balance?" A shared helper, `invoiceOwed()` in `utils/invoiceBalance.js`, mirrors the SQL rule and is unit-tested. The screens themselves aren't.

**6. `todo.md` says a Vitest suite is optional. Is there one?**
- **Answer:** That doc is stale. `ams-react` has `npm test` with 41 passing tests.

## 2. Data integrity and concurrency

**7. Two admins approve two applications for the same room at once. What happens?**
- **Answer:** `update_tenant_status.php` locks the room row and refuses when another application holds it ("Room A is already held by another application…"). `FOR UPDATE` appears 22 times in `config.php` and in 27 endpoint files.
- **Follow-up:** "Show me the lock." Open the endpoint. Note that `contract_end.test.js` currently expects different wording and fails (see Q25).

**8. Could one month's rent be billed twice?**
- **Answer:** No. The database has a unique key `uq_invoice_rent_period (user_id, rent_period_key)`. Parking uses `(reservation_id, billing_period)`. Reminders use a claim-first update.
- **Follow-up:** "What if the sweep runs twice at once?" The unique key makes the second insert fail harmlessly.

**9. Is it true you have no concurrency tests?**
- **Answer:** No. The panel audit says none exist, but 51 test files use `Promise.all`, and there is a new `money_audit.test.js` (12 tests, uncommitted).
- **Follow-up:** "Name one test that races two requests." Open `money_audit.test.js` and pick one before the defense.

**10. Do your `mysqli` calls throw or return false?**
- **Answer:** They throw. `config.php:126` sets `mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT)`. `AGENTS.md` still says "returns false, no exceptions", which is wrong.
- **Follow-up:** "What happens to an uncaught exception mid-transaction?" The transaction rolls back when the connection closes. Check that endpoints return a generic message (see Q20).

**11. What is the order of effects in a payment confirmation?**
- **Answer:** One shared settlement function, `settle_invoice()`, serves the desk path and the webhook path. It uses row locks and guarded updates.
- **Follow-up:** "What if the commit succeeds but the SMS throws?" Notifications go through a queue with retries (`process_queue.php`). Actions never wait on SMS or email.

**12. How do you keep room and tenant status from drifting apart?**
- **Answer:** Status changes go through helpers: `transition_application()` and `end_tenancy()`. `end_tenancy()` is shared by move-out and contract termination. It vacates the room, cancels pending invoices, and releases parking and visitors.
- **Follow-up:** "`rooms.tenant_name` is a string, not a foreign key. Doesn't that rot?" Yes (schema doc). It is synced on approval and breaks on user deletion; accounts are archived, never deleted.

## 3. Payments and money

**13. What if PayMongo's webhook never comes, or comes late?**
- **Answer:** The bill stays `processing`. The admin checks the PayMongo dashboard, then releases it with `release_checkout_session.php`. There is no polling (LI-6). A late webhook after a desk payment raises the money as an unapplied-payment refund (`paymongo_webhook.php:236`).
- **Follow-up:** "Why not poll?" It was out of scope and I accepted the manual step.

**14. How do you know a webhook is real?**
- **Answer:** It verifies the `Paymongo-Signature` header (HMAC-SHA256, 300 s freshness), binds to the checkout session and compares the amount in centavos.
- **Follow-up:** "What if two identical webhooks arrive?" The second finds the bill already paid and raises an unapplied-payment refund instead of paying twice.

**15. Why integer centavos?**
- **Answer:** To avoid float rounding. `invoice_balance_cents()` and one SQL fragment define "still owed" everywhere (`system_design.md` §1.1 #3).
- **Follow-up:** "Where could a float still sneak in?" Prepare an answer; I haven't checked the late-fee percentage path.

**16. A tenant leaves owing more than the deposit. What happens?**
- **Answer:** `settle_deposit()` offsets bills against the deposit in one locked transaction, marks covered bills paid from the deposit and invoices any shortfall as a "Move-out balance" invoice. Collecting it afterwards is a manager-tenant matter (LI-1).
- **Follow-up:** "So the system can't collect?" Correct. It records the debt but doesn't enforce collection.

**17. Can the admin fake a cash payment?**
- **Answer:** They can record only what the tenant declared, on the same channel and amount. Every action is logged with the session user. There is no second approver (LI-4).
- **Follow-up:** "Can an admin edit the log?" It is insert-only in the app. I haven't verified database-level protection, so don't claim it.

**18. What about proration and late fees?**
- **Answer:** Rent is billed per whole month. There is no proration in the code, so `todo.md:64` ("prorated billing done") is wrong. Late fees are configurable through settings (`late_fee_enabled`, `late_fee_type`, `late_fee_value`).
- **Follow-up:** "A tenant moves in on the 20th. What do they pay?" Describe the manager's manual computation (DE-10).

## 4. Security

**19. Why can the admin skip the login code, and why is `admin123` seeded?**
- **Answer:** Both are real. `login.php:139-140` (`$trusted = $isAdmin || …`) lets admins skip the device OTP. The seeded admin is `admin@gmail.com` / `admin123` (`SetupDB.sql:521`). Nothing forces a password change on first login. These are open items (A-1, SPRINT 145).
- **Follow-up:** "So the highest-privilege account has the weakest login?" Yes, until fixed. State the fix: change the password at go-live and add a forced change.

**20. Do your endpoints leak database errors?**
- **Answer:** The audit says 34 endpoint files echo `$stmt->error` or `$e->getMessage()` (D-8, recounted 2026-09-24). I haven't recounted since.
- **Follow-up:** "What is the exposure?" Table and column names to an attacker. It is a moderate finding.

**21. Where do session tokens live, and what if the database leaks?**
- **Answer:** The `sessions` table stores the raw token (`config.php:1472`), so a database read hands out live sessions. Password resets store only a hash. The browser keeps the token in web storage, so any XSS would steal it (L3, open).
- **Follow-up:** "What is your XSS surface?" React escapes by default. `ProfileSettings.jsx` uses `innerHTML` (L9, open).

**22. Can I read another tenant's messages?**
- **Answer:** Both paths check identity. REST uses the session. Socket.IO has required a live session token since 2026-11-13 (CH-1). Chat is tenant to admin only, with a send rate limit (CH-3, 2026-11-18).
- **Follow-up:** "It was open until last week?" Yes. Say so and point to `chat_socket.test.js`.

**23. Is `websocket-server/.env` in git?**
- **Answer:** No. `security_audit.md` §6e marks CH-2 resolved on 2026-10-31 and `git ls-files` shows only `.env.example`. `todo.md` still lists it as a High risk, which is stale. The old file stays in earlier commits; it held only a root user with an empty password, no secret.
- **Follow-up:** "Was the root database password in history?" Run `git log --all -- websocket-server/.env`. The audit says gitleaks runs in CI.

**24. Do you connect to MySQL as `root`?**
- **Answer:** Yes, in dev. A least-privilege database user is open (A-3), blocked by request-time DDL in a few endpoints (D-9).
- **Follow-up:** "Why does a request create tables?" Legacy. The migration plan removes it.

## 5. Testing and quality

**25. How many tests, and do they pass?**
- **Answer:** On 2026-11-21: 2,154 API tests in 108 files, all passing (the 3 failures of 2026-11-18 in `deposit_deductions` and `contract_end` were fixed by `8bbc925`). Frontend: 45 of 45.
- **Follow-up:** "Why do three fail?" Fix or explain them before the defense.

**26. Where is your user acceptance evidence?**
- **Answer:** None exists yet. The SUS kit (`sus_session_kit.md`) is ready and `todo.md` shows the session isn't done.
- **Follow-up:** "Then what is your evidence of usability?" A heuristic audit (AI-assisted) and an ISO 25010 map. Call these preliminary, not user data.

**27. Your docs disagreed on counts. Which is true?**
- **Answer:** 169 PHP files, about 164 endpoints, 52 tables, 108 test files, 2,154 API tests, 56 routes (2026-11-21). Older docs were snapshots. I reconciled them in commit `37aea84`.
- **Follow-up:** "How do you stop drift?" There is no automated check. It is a manual rule in `AGENTS.md`.

## 6. Scope and limitations

**28. What did you deliberately not build?**
- **Answer:** One property (DE-1), no owner or accountant role (DE-3), not accounting or tax software and no BIR receipts (DE-4), no metered utilities (DE-6), no proration or room transfers (DE-10), no native app (DE-9).
- **Follow-up:** "Isn't one admin doing everything a control weakness?" Yes (LI-4). The activity log is the compensating control.

**29. Is the e-signature legally binding? Does the contract comply with RA 9653?**
- **Answer:** The signature is an uploaded image (LI-8). Legal force comes from the signed or notarized copy the admin uploads. The audit says the contract was checked against RA 9653 and NHSB Resolution 2024-01 on 2026-11-13. I haven't re-verified the legal reading.
- **Follow-up:** "The rent cap resolution expires?" Yes, 2026-12-31. The settings must be updated (SPRINT 149).

## 7. What would you do differently

**30. If you restarted, what would you change?**
- **Answer:** Use a framework or middleware layer so auth isn't a per-file convention. Use integer foreign keys everywhere. Hash session tokens. Keep schema changes in migrations only, with no request-time DDL. Write the concurrency tests first. Run the user test earlier.
- **Follow-up:** "Which of these would have prevented a real bug you hit?" Pick one with evidence from the audit, such as the unauthenticated `change_password` fix or the chat socket.

## Docs that disagree with the code (code trusted)

- **`mysqli`:** `AGENTS.md` says no exceptions, but `config.php:126` turns strict mode on, so calls throw.
- **`websocket-server/.env`:** `todo.md` lists it as a High risk, but `security_audit.md` marks it resolved (2026-10-31) and the file is no longer tracked.
- **Concurrency tests:** the panel audit says none exist, but 51 test files use `Promise.all`.
- **Frontend tests:** `todo.md` says Vitest is optional, but 41 tests exist.
- **Panel audit:** dated 2026-11-12, and several rows are stale (for example the LI-5 void, now resolved). Check any row before quoting it.

## The five weakest answers

1. **No user acceptance evidence (Q26).**
   - Say: "The SUS procedure and kit are ready and have not been run. Our evidence is a code-based heuristic review, which is not user data. I'd run it next."
   - Don't present the heuristic audit as validation. Best fix before the defense: run even a small SUS session and report n and the score.
2. **The admin skips the device code and `admin123` is seeded (Q19).**
   - Say: "Both are open findings, A-1 and SPRINT 145. They're acceptable only because the password gets changed at go-live. The code doesn't enforce that."
   - Don't call it a dev-only convenience unless you've made the change.
3. **Three failing tests (Q25).**
   - Say: "All 2,154 pass (2026-11-21); the earlier deposit and contract-end failures were fixed."
   - Don't say "all tests pass." Fix or explain them first.
4. **Collecting money after move-out, and no second approver (Q16, Q17).**
   - Say: "The system records and invoices it but can't enforce it. We stated this as a limitation (LI-1, LI-4)."
   - Don't claim fraud-proof cash handling. Only the activity log protects it.
5. **Session tokens in plaintext plus web storage (Q21).**
   - Say: "It's a known, open finding (L3). A database leak would expose live sessions. We'd hash them at the next hardening pass."
   - Don't say "sessions are secure" without that caveat.
