# System walkthrough (5 min) and live demo script (8 min)

Written for: the student presenting. Live demo on local XAMPP, three mostly-IT panelists.

## Part A: Pre-demo setup (do this the day before and 30 minutes before)

The demo data matters more than the script. The standard mock seed's dates stop at 2026-10-02, so "overdue" and "due soon" states look old, and today is later. Pick one:

1. **Recommended: scratch database with the defense scenarios.**
   - Snapshot dev first (`/db-snapshot save`).
   - Load `seed_defense_scenarios.sql` on top of the mock seed. Its dates are relative to today, so it can be run on the defense day. The checklist is in `docs/documentation/date_dependent_testing.md`, "Defense scenario checklist".
   - Restore dev afterwards with `/db-snapshot restore`.
2. **Alternative:** `seed_demo_full.sql` gives 16 demo accounts in every workflow state with dates relative to today (see the header of that file for accounts; its logins use `tenant123`). Safe next to real data; undo with `seed_demo_reset.sql`. If you use it, swap the account names in Part C. This script uses the accounts from `module_verification_guide.md` §1.4.

Then:
- Start MySQL and Apache (Git Bash): `cmd //c "start /B C:\\xampp\\mysql_start.bat"` and `apache_start.bat`.
- Run `cd ams-react && npm run build:local` so `dist/` is current.
- Start the chat relay (`websocket-server`, port 3001) only if you will show live chat.
- Open two browser profiles (or one normal and one private window): one admin, one tenant. Pre-log both in, so no login code or typing mistake costs you time.
- Check one tenant login before the defense. Accounts on `@demo.example` skip the device code outside production only if `DEVICE_OTP_BYPASS_DOMAINS` is set in `config.env.php`. The admin always skips it.
- Set the browser zoom to 110-125% and turn off notifications on your computer.

### Accounts (from `module_verification_guide.md` §1.4)

| Role | Email | Password | Why use it |
|---|---|---|---|
| Admin | `admin@gmail.com` | `admin123` | Everything admin |
| Tenant, clean | `maria.santos@demo.example` | `tenant123` | Room A, every invoice paid; safe first impression |
| Tenant, overdue | `jose.reyes@demo.example` | `tenant123` | Room B, two overdue invoices |
| Applicant to move in | `lita.ramos@demo.example` | `tenant123` | Approved, move-in invoice paid, move-in scheduled; the **Confirm Move-In** fixture |
| Applicant, pending | `gloria.tan@demo.example` | `tenant123` | `Pending Review`; the approval gate will refuse her |
| Tenant moving out | `mark.santiago@demo.example` | `tenant123` | Room L, `pending-move-out`, notice filed |
| Tenant with repair | `pedro.cruz@demo.example` | `tenant123` | Room G, a completed maintenance request |

Warning: do not click **Confirm Move-In** for Lita until the moment you demo it, and snapshot first. A live demo that writes data can't be repeated without a restore.

## Part B: 5-minute system walkthrough script (slides 5 to 12, spoken, no clicking)

Use this as a spoken script over the architecture slide, or as the intro to the demo. It is about 700 words.

"Let me walk you through how a request travels through the system.

When a tenant opens a page, the React app calls one of our PHP endpoints through a single axios file. That file attaches the session token. It sends nothing else about who the user is. On the server, `config.php` looks up the token in the sessions table and decides who is calling and what role they have, reading the role live from the users table. So a forged header does nothing.

The endpoint then does its work with prepared statements. When it changes data, it writes an activity-log entry with a category and the session user. When something should reach the tenant, it creates a notification, and if the tenant opted in, an SMS or email is put in a queue and sent in the background. The action never waits for the SMS provider.

Money has one path. Whether the admin records a cash payment or PayMongo calls our webhook, the result goes through the same settlement function. It locks the invoice row, checks the balance in whole centavos, and marks it paid or partly paid. Because there is one path, there is one set of rules, and one place to test.

The life of a tenant follows the application's status. A person applies and uploads the documents the admin requires. The admin verifies them; the system won't approve without that. Approval creates a move-in invoice and a draft contract. When the invoice is paid and the admin confirms the move-in, the contract is active and the person becomes a tenant. If the invoice is not paid in time, the approval lapses and the room is released automatically.

Each month a rent invoice is created seven days ahead, protected by a unique key so it can't be duplicated. The tenant pays by cash, GCash, bank, QR Ph or PayMongo. Manual payments carry a reference and a proof, and the admin verifies them. A reused reference is flagged.

Maintenance and services are tickets with a fixed set of allowed status changes. A completed service or a billed repair is posted onto the invoice once.

At move-out, the tenant gives notice. At clearance the admin lists deductions, the system offsets bills and deductions against the deposit in one transaction, returns what is left, and invoices any shortfall.

Chat is the one part that is not request and response. A small Node server relays messages in real time, but it first checks the same session token. Messages are saved by the PHP endpoints, so if the relay stops, nothing is lost.

That is the whole system: one session, one money path, one status helper per entity, and a queue for anything slow. Now I'll show it."

## Part C: Live demo script (about 8 minutes)

Total time budget: Tenant 2:30, Admin payments 2:00, Application to move-in 1:30, Move-out 1:30, Wrap 0:30. If you are short on time, skip step 6.

Menu names below are the real sidebar labels from `AdminSidebar.jsx`: Dashboard, Reports, Messages, Notifications, Announcements, Inquiries, Applications, Units, Tenants, Contracts, Payments, Refunds, Utilities, Payment Options, Maintenance, Services, Visitors, Parking, CCTV, Users, Activity Log, Document Requirements, Other Settings. Button text I could not confirm is marked *(rehearse)*; do one dry run so you know the exact wording.

### 1. Tenant view: Maria (clean account) (about 1 min)

1. Browser profile 2 is signed in as `maria.santos@demo.example`.
2. Open **My Room** (`/my-room`). Say: "This is what a tenant sees: their room, contract, household and the next bill."
3. Open **Pay Bills** (`/pay-bills`). Say: "Everything is paid, so the list is clean. The same page handles advance payment and split payments."
4. Open **Payment History**. Say: "Receipts are kept here."

### 2. Tenant view: Jose (overdue) pays by proof (about 1.5 min)

1. Sign out; sign in as `jose.reyes@demo.example`.
2. Open **Pay Bills**. Say: "Jose has two overdue invoices, September and October." Point out the overdue badge.
3. Pick the oldest invoice, choose **GCash** (or the manual QR Ph method), and continue to the proof page (`/upload-payment`). Enter any reference and attach a small image. Submit. *(rehearse)*
4. Say: "The bill is now waiting for verification. The tenant cannot mark it paid themselves."

### 3. Admin: verify the payment (about 2 min)

1. Switch to browser profile 1 (admin). If not signed in: `admin@gmail.com` / `admin123`.
2. Sidebar → **Payments** (`/admin-payments`). Find Jose's invoice with status `pending-verification`. *(use the status filter; the filter's option is labelled "Verify" in the code)*
3. Open it and mark it verified/paid. Say: "The admin sees the reference and proof, and a warning if that reference was used before."
4. Sidebar → **Activity Log**. Say: "Every action is logged with the user and category. This entry was just written."
5. If time allows, open **Record Payment** from the same page and say: "For cash at the desk, the admin records what the tenant declared. Same settlement function."

### 4. Approval gate and move-in (about 1.5 min)

1. Sidebar → **Applications** (`/admin-applications`).
2. Open **Gloria Tan** (`Pending Review`). Try to **Approve**. Say: "The system refuses because no documents are verified. This is a rule, not a bug." Close it.
3. Open **Lita Ramos** (Approved, move-in invoice paid). Press **Confirm Move-In** and confirm the date. Say: "The contract becomes active, the room becomes occupied, and Lita becomes a tenant." *(write action: snapshot first)*

### 5. Move-out and deposit settlement (about 1.5 min)

1. Sidebar → **Tenants** (`/admin-tenants`). Find **Mark Santiago** (`pending-move-out`).
2. Open his profile and open **Move-Out Inspection & Clearance**. Say: "Unpaid bills and deductions for damage or utilities are offset against the deposit."
3. Show the itemized lines and the deposit balance. Do **not** finalize unless you restored beforehand. Say: "The tenant would see an itemized statement and can request one review."

### 6. Maintenance (optional, about 1 min)

1. Sidebar → **Maintenance** (`/admin-maintenance`). Open Pedro Cruz's completed request.
2. Say: "Only allowed status changes are accepted; the tenant is notified at each change."

### 7. Wrap (about 30 s)

"Everything you saw ran on the same session, the same settlement function and the same activity log. Thank you."

## Part D: Fallback plan if something fails live

Prepare these before the defense and keep them in one folder on the desktop, not in the repo:

1. **Screenshots**: take one per step above on the day you do the dry run. Name them `01_tenant_maria.png`, `02_jose_pay.png`, and so on. Put them in a slide titled "Demo backup" at the end of the deck.
2. **A screen recording** (2-3 min, silent is fine) of steps 2 to 5 on a restored database. Test that it plays offline.
3. **A restored database file**: a dump from `/db-snapshot save` after the setup, so you can restore in one command.

Decision rules while presenting:
- If a page errors or hangs for more than 10 seconds, say "This is the live environment; let me show the recorded run of the same step," and switch to the recording. Do not debug in front of the panel.
- If login fails, check you are using the right browser profile before anything else. If XAMPP is down, say so and go to the recording.
- If a write action (Confirm Move-In) already ran and you can't repeat it, say "That was done in the first run, here is the result in the tenant's account," and open the tenant's My Room.
- If the live chat doesn't connect, skip it. REST chat still works; mention the relay is optional and messages are saved by PHP.
- Never press **Finalize** on the move-out unless you want it permanent.

## Part E: Things a panelist may do during the demo

- "Can I see that in the database?" Have a SQL tool (phpMyAdmin or the mysql client) open in a third tab with `ams_db` and a prepared query for `invoices` and `activity_logs`.
- "What if I log in as the tenant and open an admin URL?" Try it: paste `/admin-payments` as a tenant. `AdminProtectedRoute` sends a non-admin to `/home`, and the API refuses with 401/403 as well.
- "Can I change the id in the URL?" Server-side checks use the session, so another tenant's invoice returns an error.
