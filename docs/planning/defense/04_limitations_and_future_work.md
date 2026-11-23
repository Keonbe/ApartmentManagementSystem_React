# Limitations and future work: the honest answer

Written for: the student presenting. The tone is plain and specific: say what is missing, why, and what happens next. No apologies, no defensiveness. Sources: `docs/planning/todo.md`, the panel audit Part B (limitations LI-1 to LI-13 and delimitations DE-1 to DE-10), `security_audit.md`.

## The spoken version (about 90 seconds)

"There are three kinds of limits, and I'll keep them apart.

**Things we chose not to build.** It serves one property of about fifteen units. There is no accounting or tax system and no BIR receipts. There is no tenant screening, no metered utilities, no native mobile app, and no automatic proration or room transfers. Each is a delimitation we wrote down with a reason, usually that the manager handles it in person.

**Things that depend on other people or services.** SMS and email run in a dry-run mode in the study environment, because live sending needs paid credits and an approved sender name. PayMongo is in sandbox. When a tenant leaves owing more than the deposit, the system invoices the shortfall but cannot force payment. Refund payouts by bank or GCash are made outside the system and recorded with a reference. Backups are a written procedure. They are not yet scheduled, and I have not recorded a restore drill.

**Things that are unfinished and are ours.** First, we have no user acceptance data. The usability test kit is ready, but I have not run it with real users, so any usability claim is preliminary. Second, our 2,154 API tests all pass today, but a green suite is not proof of correctness. Third, our security audit still lists open items: the default admin password, unhashed session tokens, and the admin sign-in code skip. Fourth, the frontend has unit tests on helpers only, with no component tests.

If I continue, the order is: run the usability session and publish the score; fix the failing tests; force the admin password change and hash the session tokens; add security headers and a least-privilege database user; take SMS and email live; schedule backups and do one restore drill; then add proration and an accounting export."

## Why each limit exists (if asked "why not?")

| Limit | Honest reason | Where it is written |
|---|---|---|
| One property only | The partner building is one building; a property dimension adds complexity with no user to validate it | DE-1 |
| One admin, no second approver on cash | Small property with one manager; the activity log is the control | DE-3, LI-4 |
| No accounting, tax or BIR receipts | Separate regulations and software | DE-4 |
| Utilities typed in, not metered | Meters are read physically | DE-6 |
| ~~No proration, no room transfers~~ (Built 2026-11) | Final-period proration (`prorate_final_period`) and room transfers in place (`transfer_room.php`) were implemented November 2026 | Retired DE-10 |
| Shortfall collection after move-out not enforced | Depends on negotiation, not software | LI-1 |
| No installment enforcement | Arrangements vary per tenant | LI-2 |
| Refund payout outside the system (except PayMongo) | Done in bank and wallet apps | LI-3 |
| No PayMongo polling | Webhooks are retried; polling out of scope | LI-6 |
| SMS and email not live | Needs paid credits and sender approval | LI-7 |
| E-signature is an uploaded image | Legal force is the signed or notarized copy | LI-8 |
| Backups and scheduled jobs are the operator's job | Host-level tasks | LI-9 |
| Single server, no replication | Owner-hosted, sized for one property | LI-10 |
| Data kept until the owner deletes it | Financial records must be retained; disclosed in the privacy notice | LI-11 |
| Performance and usability from code review and seed data | Capstone time and access limits | LI-13 |

## Future work (ordered, with the reason for the order)

| Order | Work | Why this position |
|---|---|---|
| 1 | Run one SUS usability session with real users; record n and the score | The largest evidence gap (panel audit RD-01); the kit is `docs/audits/sus_session_kit.md` |
| 2 | Fix the three failing API tests | They sit in the money area |
| 3 | Force admin password change on first login; remove the admin device-code skip; hash session tokens | Closes the main High findings (A-1, S-05, L3) |
| 4 | Security headers; least-privilege DB user; remove request-time DDL | Hardening; the DB user is blocked by the DDL work |
| 5 | Schedule the nightly backup; record one restore drill | Operations (SPRINT 87) |
| 6 | Take SMS and email live (Semaphore credits and sender name; email via PHPMailer and SMTP) | Closes checklist rows 6.6 and 6.7 |
| 7 | Chat gaps: admin can start a thread; write a notification on send; move `messages` into `SetupDB.sql` | Closes checklist rows 7.1 and 7.6 |
| 8 | Index `get_conversations.php` (about 1.1 s at 5,000 messages) | Measured in `2026-11-13_load_check.md` |
| 9 | Proration; an accounting export | Needs manager input |
| 10 | Rent-control settings: update the cap before 2027-01-01 | The current NHSB numbers end 2026-12-31 |

## Phrases to use and avoid

| Use | Avoid |
|---|---|
| "We chose not to build X, because Y." | "We ran out of time." |
| "This is open, and this is the fix." | "That's not really a problem." |
| "We have not measured that." | "It's fast enough." |
| "Preliminary evidence" | "Validated" or "proven" |
| "Audited, with open findings listed" | "Secure" |
