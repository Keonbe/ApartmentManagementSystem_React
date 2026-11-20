# Defense deck: slide outline and speaker notes

Written for: the student presenting (you), to build a pptx deck. Format agreed: pptx, 20-30 min talk plus Q&A, live demo on local XAMPP, three panelists, mostly IT. Every number was checked on 2026-11-18; recheck the test counts on the day (see the cheat sheet).

Timing plan: 19 slides at about 45 seconds = about 14 minutes, plus the 8-minute live demo (slide 19) = about 22 minutes. That leaves slack for questions inside a 25-30 minute slot. If you only have 20 minutes, cut slides 11, 12 and 18 to one line each.

## Part 1: Outline (one line per slide, with the point it proves)

| # | Slide | The point it proves |
|---|---|---|
| 1 | Title | Who you are, the system name, the one-sentence pitch |
| 2 | The problem | A small property manager runs rent, repairs and tenants on paper, chat apps and memory, and loses track of money |
| 3 | Users and roles | Two database roles (tenant and admin) plus signed-out guests; every screen and rule follows from that |
| 4 | Objectives and scope | You chose what to build and what not to (one property, no accounting software); scope is deliberate |
| 5 | Architecture | React single-page app, plain PHP endpoints, MariaDB, a small Node chat relay, external PayMongo and SMS; one request path |
| 6 | Data and integrity rules | 52 tables; money rules live in one place so every screen agrees |
| 7 | Workflow: application to move-in | A guarded pipeline: documents checked, approval, move-in invoice, payment, confirm move-in |
| 8 | Workflow: billing and payment | Invoices are created ahead of time; tenants pay by cash, GCash, bank, QR Ph or PayMongo; admin verifies proofs |
| 9 | Payments you can trust | Signed webhooks, reused-reference detection, one settlement path, no double billing |
| 10 | Workflow: move-out and deposit settlement | Itemized deposit deductions, bills paid from the deposit, shortfall invoiced, tenant can contest |
| 11 | Workflow: maintenance and services | Tickets and bookable services with status rules, billed onto the invoice when relevant |
| 12 | Chat and notifications | A guest's inquiry chat continues into the tenant's account; messages queue for SMS and email without blocking actions |
| 13 | Security: what we audited and fixed | A real audit, with real defects found and closed (identity from the session, chat socket, uploads) |
| 14 | Security: what remains | You know your own open findings (admin default password, plaintext session tokens, no headers) |
| 15 | Testing and CI | 2,074 API tests on a scratch database, 41 frontend tests, CI on every push |
| 16 | Results | 100 checklist rows (96 done, 4 partial), 168 PHP files, 52 tables, 56 routes |
| 17 | Limitations | Honest list: no user test yet, SMS and email not live, one property, no proration |
| 18 | Future work | A concrete, ordered next-steps list |
| 19 | Live demo | The system works end to end with real seeded data |
| 20 | Thank you and Q&A | Backup slides (security table, schema, test list) are ready |

(That is 20 slides if you count Q&A. Slides 1 and 20 take under 20 seconds each.)

## Part 2: Speaker notes (plain spoken, about 45 seconds each)

Speak these, don't read them. Each note gives the main spoken line, then one fact to keep ready.

**1. Title (15 s)**
"Good day. I'm [name], and this is the Apartment Management System, a web system that helps a small apartment manager handle tenants, rent, repairs and messages in one place. I'll show how it works, how we tested and secured it, and what is still unfinished."
- Keep ready: the system covers one building of about 15 units.

**2. The problem (45 s)**
"Our partner manager runs a single building. Rent, repairs and tenant requests are tracked on paper, in chat apps and from memory. Three things go wrong. Money gets lost or counted twice. Nobody can see who owes what. And rules like deposits and move-out are applied differently each time. We interviewed the manager, and the system follows what they told us."
- Keep ready: the manager interview is traced 30 of 30 points with dated deviations (`manager_interview_comparison.md`).

**3. Users and roles (45 s)**
"There are two roles in the database: tenant and admin. Before login, a visitor is a guest who can browse rooms and send an inquiry. After applying, the person is an applicant. Only once the move-in is confirmed do they become a tenant with full pages. So guest, applicant and tenant are not database roles. They come from the application's status."
- Keep ready: tenant means status `active` or `pending-move-out`. An `Approved` applicant is not yet a tenant.

**4. Objectives and scope (45 s)**
"We chose what to build and what not to. We built rent, billing, deposits, maintenance, services, parking, visitors, contracts, chat and reports. We did not build accounting or tax software, multi-building support, tenant screening, a mobile app, or room transfers. These are written down as delimitations, so they are choices, not gaps."
- Keep ready: DE-1 to DE-10 in `2026-11-12_panel_policy_gap_audit.md`, Part B.

**5. Architecture (60 s)**
"The browser runs a React 19 and Vite single-page app. It calls plain PHP endpoints through one axios file. The endpoints share one library, `config.php`, which holds the session check, logging and the money rules. Data lives in MariaDB. Chat has a small Node Socket.IO relay on its own port, because PHP can't hold a live connection. Payments go through PayMongo, SMS through Semaphore. We chose no PHP framework because the scope is one property, and the cost is a big shared file."
- Keep ready: Apache on port 8080, chat relay on 3001. The relay checks the session token on connect since 2026-11-13.

**6. Data and integrity rules (45 s)**
"There are 52 tables. The idea that matters is one balance rule. What a tenant still owes is calculated the same way in SQL, in the React screens and in the deposit settlement, using whole centavos, never floats. Duplicate rent is blocked by a database unique key per tenant and month. Status changes go through single helper functions, so a room and an application can't drift apart."
- Keep ready: `invoice_balance_cents()`, `uq_invoice_rent_period`, `transition_application()`, `end_tenancy()`.

**7. Application to move-in (60 s)**
"A person applies with the documents the admin requires. The admin can't approve until the documents are verified; the system refuses. Approval creates a move-in invoice with advance rent and a deposit, and a draft contract. If the applicant doesn't pay, the approval lapses on its own and the room is released. Once paid, the admin presses Confirm Move-In, the contract becomes active and the person becomes a tenant."
- Keep ready: the approval gate is item 1.7; for the demo it is why a seeded pending application can't be approved.

**8. Billing and payment (60 s)**
"Rent invoices are created seven days before the month starts. A tenant can pay with cash, GCash, bank transfer, QR Ph, or PayMongo online. Manual payments need a reference and a proof, and the admin verifies them. Payments can be split across methods, and a tenant can pay up to six months in advance, tracked as credits that are used month by month."
- Keep ready: `RENT_INVOICE_LEAD_DAYS = 7`, advance maximum 6 months.

**9. Payments you can trust (60 s)**
"Four controls. One: every payment, from the desk or from the webhook, ends in the same settlement function, with row locks. Two: the PayMongo webhook is signed, must be fresh, and must match the checkout and the exact amount. Three: a reference number can't quietly pay two bills; reuse is flagged or blocked. Four: a duplicate or late payment becomes a refund request instead of vanishing. The limit is that the system doesn't poll PayMongo, so a missing webhook needs the admin to check the dashboard."
- Keep ready: `settle_invoice()`, `paymongo_webhook.php`, `find_reference_reuse()`.

**10. Move-out and deposit settlement (60 s)**
"The tenant sends a move-out notice, between 15 and 30 days by default. At clearance the admin lists deductions, such as unpaid rent, damage, or utilities, and the system offsets them against the deposit in one locked transaction. Bills covered are marked paid from the deposit. Any shortfall becomes a Move-out balance invoice. The tenant sees an itemized statement and can request one review. We state plainly that the system can't force collection after the tenant leaves."
- Keep ready: `settle_deposit()`, RA 9653 Section 7 wording, limitation LI-1.

**11. Maintenance and services (45 s)**
"Tenants file maintenance tickets with a category and urgency. Admin moves them through allowed statuses only, and the tenant is notified. Bookable services, like cleaning, come from a catalog the admin controls, and a completed service can be posted onto the next invoice, once. Parking, visitors and CCTV requests follow the same pattern of allowed transitions."
- Keep ready: transitions are defined as maps in `config.php` (maintenance, service, parking).

**12. Chat and notifications (45 s)**
"A signed-out visitor can chat with the office. When they sign up, that same conversation moves into their account. Signed-in chat is tenant to admin only, with a send limit. Notifications are in-app first, with SMS and email queued and retried in the background, so a slow SMS provider never blocks a payment or approval."
- Keep ready: SMS has a live Semaphore driver but is not yet live-verified. Email runs on a dry-run log driver.

**13. Security: what we audited and fixed (60 s)**
"We ran a written security audit and fixed what it found. The most serious was that about forty endpoints trusted a user id sent by the browser. Now identity comes only from the server session, and any forged header is overwritten. We also fixed: an unauthenticated billing lookup, unauthenticated password change, sessions that survived a password change, an open chat socket, readable log files, and unsafe uploads. Each fix has a test."
- Keep ready: findings A-7, A-8, CH-1, L-1, B-7, B-8 in `security_audit.md`.

**14. Security: what remains (45 s)**
"These are still open and we list them ourselves. The seeded admin password is admin123 and the admin skips the login code. Session tokens are stored unhashed in the database and kept in browser storage. No HTTP security headers yet. The database user is root in development. Some endpoints return database error text. All of these have written fixes in the backlog."
- Keep ready: A-1, L3, C-4/E-2/E-3/E-4, A-3, D-8.

**15. Testing and CI (60 s)**
"The API test suite has 2,074 tests in 100 files. It builds a scratch database, so it can never touch dev data, and runs a real PHP server. On our last run, 2,071 passed and 3 failed; those three are in the deposit and contract-end tests that I am still changing. The frontend has 41 unit tests on utilities only, and we have no component tests. CI runs lint, build, PHP syntax checks, PHPStan, a schema check, the API suite, a dependency audit and a secret scan on every push."
- Keep ready: replace "3 failed" with the real number after you rerun the suite.

**16. Results (45 s)**
"The feature checklist has 12 modules and 100 rows. 96 are done and 4 are partial: email and SMS going live, and two chat gaps. The system has 168 PHP files, of which 163 are endpoints, 52 tables, 56 routes and 53 pages. It was built from 30 June to now, about 20 weeks."
- Keep ready: partial rows are 6.6, 6.7, 7.1, 7.6.

**17. Limitations (60 s)**
"Here is what we can't claim. We have no user acceptance data; the usability test kit is ready but not run. SMS and email are not live. PayMongo is in sandbox. The e-signature is an uploaded image; legal force comes from the signed copy. Rent is billed in whole months with no proration. One admin does everything, with no second approver. It's one server with no replication, and backups are a procedure, not yet scheduled."
- Keep ready: LI-1 to LI-13.

**18. Future work (45 s)**
"Next, in order: run the usability session with real tenants and report the score. Force the admin password change and hash session tokens. Add security headers and a least-privilege database user. Go live with SMS and email. Schedule backups and do a restore drill. Then proration, and an accounting export."
- Keep ready: items come from `todo.md` and SPRINT.

**19. Live demo (about 8 min)**
"Now I'll show the system live." Follow `02_walkthrough_and_demo_script.md`.

**20. Thank you and Q&A (15 s)**
"Thank you. I'm happy to take questions. Backup slides on security, the schema and the test list are ready."

## Part 3: Backup slides to have ready (not in the main flow)

- B1: Security findings table (id, severity, fixed or open) from `security_audit.md`.
- B2: ER diagram from `database_schema.md` (only if asked about the data model).
- B3: Test list by module from `api_testing.md`.
- B4: Delimitations and limitations table from the panel audit, Part B.
- B5: CI pipeline diagram from `docs/deployment/cicd_pipeline.md`.
