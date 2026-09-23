# AMS Testing Guide — Date-Dependent & End-to-End Module Workflows

This guide documents how to manually test every major module in the AMS, including workflows that span multiple steps across days or months. Where a test depends on a date (late fees, billing cycles, lease expiry, overdue detection), the setup SQL is provided inline.

> **Companion document:** for audited modules, [`documentation/module_verification_guide.md`](documentation/module_verification_guide.md) carries the full API contract, workflow diagrams and a numbered test-condition matrix. This guide stays focused on **date manipulation**; that one covers everything else.
>
> **Endpoint testing now requires a session token.** Auth is a server-issued bearer token (`Authorization: Bearer …`), not the old `X-User-Id` header — so any curl-based test must log in first. See the verification guide's §3 for the recipe.

---

## Table of Contents

1. [Where Dates Live in This System](#1-where-dates-live-in-this-system)
2. [Date Manipulation Methods](#2-date-manipulation-methods)
3. [Module: Registration & Rent Application](#3-module-registration--rent-application)
4. [Module: Payments — Initial Lease Payment](#4-module-payments--initial-lease-payment)
5. [Module: Payments — Monthly Invoices & Late Fees](#5-module-payments--monthly-invoices--late-fees)
6. [Module: Lease — Extension & Expiry](#6-module-lease--extension--expiry)
7. [Module: Maintenance Requests](#7-module-maintenance-requests)
8. [Module: Parking Reservations](#8-module-parking-reservations)
9. [Module: CCTV Footage Requests](#9-module-cctv-footage-requests)
10. [Module: Announcements & Notifications](#10-module-announcements--notifications)
11. [Module: Move-Out & Archival](#11-module-move-out--archival)
12. [Module: Contracts (ViewContract)](#12-module-contracts-viewcontract)
13. [Quick Reference — Common Scenarios](#13-quick-reference--common-scenarios)
14. [Tips & Gotchas](#14-tips--gotchas)

---

## 1. Where Dates Live in This System

| Feature | Source of truth | Key column(s) |
|---|---|---|
| Overdue promotion | `promote_overdue_invoices()` in `backend/config.php` | `invoices.due_date`, `invoices.status`, `invoices.scheduled_date` |
| Late fee (configurable) | `promote_overdue_invoices()` in `backend/config.php` | `invoices.late_fee`; settings `late_fee_enabled`, `late_fee_type`, `late_fee_value` |
| Reminder cadence | `check_due_date_reminders.php` | `invoices.last_reminder_date`, `invoices.reminder_count`; settings `rent_due_reminder_days`, `overdue_reminder_interval_days` |
| Overdue badge (frontend) | `AdminTenants.jsx` | `invoices.due_date`, `invoices.status` |
| Lease start / end | `record_payment_admin.php` | `rooms.lease_start`, `rooms.lease_end` |
| Reservation hold expiry | `release_expired_reservations()` in `backend/config.php` | `unit_reservations.hold_expires_at` |
| Contract expiry | `expire_lapsed_contracts()` in `backend/config.php` | `lease_contracts.lease_end` |
| Monthly billing period label | `invoices.billing_period` | `invoices.billing_period` (display string) |
| Dashboard due invoices | `AdminDashboard.jsx` | `invoices.due_date` |
| Lease expiry warning | `MyRoom.jsx`, `AdminUnits` | `rooms.lease_end` |
| Parking reservation duration | `parking_reservations` | `start_date`, `end_date` |
| CCTV incident date | `cctv_requests` | `incident_date` |
| Maintenance preferred schedule | `maintenance_requests` | `preferred_date`, `preferred_time` |

The backend uses PHP's `date('Y-m-d')` and `strtotime()` — there is **no injectable clock**. The two practical approaches are:

1. **Move the row, not the clock** — change `due_date` / `lease_end` in the DB to a past/future date. *(Recommended)*
2. **Move the clock** — change the Windows system date temporarily.

---

## 2. Date Manipulation Methods

### Method A: Move the Row (Recommended)

Edit date columns directly in MySQL via phpMyAdmin or HeidiSQL. Safe, reversible, does not affect anything outside `ams_db`.

### Method B: Move the System Clock

Use only when you need PHP's `date('Y-m-d')` itself to return a different value.

> **Caution** — Changing the system clock affects XAMPP's MySQL timestamps, Windows scheduled tasks, and any other date-sensitive process on the machine. **Restore immediately after testing.**

**In PowerShell (run as Administrator):**
```powershell
# Save current date first
$realDate = Get-Date

# Jump to a specific date (e.g. next month's 1st)
Set-Date -Date "2026-09-01 10:00:00"

# ... run your test ...

# Restore
Set-Date -Date $realDate
```

**Verify PHP sees the change** — create a temp file:
```php
<?php echo date('Y-m-d H:i:s'); ?>
```
URL: `http://localhost:8080/ApartmentManagementSystem_React/backend/api/what_date.php`
Delete the file afterwards.

---

## 3. Module: Registration & Rent Application

### Full workflow

```
Register → Login → Preview rooms → Submit Rent Application → Track Application
```

**Step 1 — Register a new user**
- URL: `/register`
- Fill: first name, last name, email, password, confirm password.
- Expected: redirect to Login (or Home).

**Step 2 — Submit a Rent Application**
- URL: `/rent-application` (choose a room from `/preview` first)
- Fill: all personal details, occupant count (1–4), months of rent, upload Valid ID front/back + NBI Clearance.
- Tick the Terms & Conditions checkbox → Submit. **The checkbox is required** — submission is refused without it, and the timestamp is stored in `rent_applications.terms_agreed_at`.
- Expected: `SuccessModal` "Application Submitted Successfully" → redirected to `/track-application`.

**Check DB after submit:**
```sql
SELECT id, user_id, status, room_name, terms_agreed_at,
       valid_id_front_path, valid_id_back_path, nbi_clearance_path
FROM rent_applications ORDER BY id DESC LIMIT 1;
```
Expected: `user_id` populated, **`status = 'Pending Review'`** (not `'Pending'` — that value is never used), all three file paths set, `terms_agreed_at` non-null, `room_name` = chosen room.

**Step 3 — Admin reviews and approves**
- Admin page: `AdminApplications` → find the applicant → Approve. (`AdminTenants` deliberately excludes `Pending Review` rows; the Applications page owns this pipeline.)
- Expected: `rent_applications.status` = `'Approved'`, move-in invoice and `draft` contract created, notification sent to tenant.

```sql
SELECT status FROM rent_applications ORDER BY id DESC LIMIT 1;
-- Should return 'Approved'
```

> **Approval is gated (checklist 1.7).** `update_tenant_status.php` refuses to approve unless all three document paths are real (not the literal `'placeholder'`) **and** `terms_agreed_at` is set. Every row in `seed_mock_data.sql` predates this gate and carries placeholder documents, so **no seeded application can be approved** — that is correct behaviour, not a bug. To test a successful approval, create a fixture with real paths and a `terms_agreed_at` value; see the verification guide's M1-02.

**Step 4 — Room is marked occupied**
```sql
SELECT tenant_name, status FROM rooms WHERE id = '<room_id>';
-- status should be 'occupied', tenant_name populated
```

---

## 4. Module: Payments — Initial Lease Payment

### Full workflow

```
Application Approved → Track Application (pay advance + deposit) → Admin settles → Lease starts
```

**Step 1 — Tenant pays initial invoice**
- URL: `/track-application`
- If application is Approved: "Proceed to Payment" button appears.
- Upload payment proof (if feature is enabled) + submit.
- Expected: invoice status → `'pending-verification'` or `'paid'` depending on flow.

**Step 2 — Admin records/settles payment**
- Admin page: `AdminPayments` → find the invoice → Mark as Settled / Record Payment.
- Expected: `invoices.status` = `'Paid'`, `rooms.lease_start` and `rooms.lease_end` are written.

**Check after settlement:**
```sql
SELECT lease_start, lease_end, tenant_name, status FROM rooms WHERE id = '<room_id>';
```

**Step 3 — Tenant can now access tenant portal**
- TopBar: Services, My Room links appear.
- URL `/my-room` shows room details, lease dates, and current month's bill.

---

## 5. Module: Payments — Monthly Invoices & Late Fees

### 5a. Simulate "Next Month's Invoice"

Monthly invoices are created manually by the admin from `AdminPayments`. To test without waiting:

```sql
-- 1. Find the tenant's approved rent application
SELECT id, user_id, monthly_rent, room_name FROM rent_applications WHERE status = 'Approved';

-- 2. Insert a new monthly invoice (replace <APP_ID> and <USER_ID>)
INSERT INTO invoices (
  id,
  user_id,
  rent_application_id,
  base_rent,
  water,
  electricity,
  parking,
  late_fee,
  security_deposit,
  total_amount,
  status,
  due_date,
  billing_period,
  created_at
)
SELECT
  CONCAT('INV-', DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%Y%m'), '-', user_id),
  user_id,
  id,
  monthly_rent,
  500,    -- sample water bill
  800,    -- sample electricity bill
  0,
  0,
  0,
  monthly_rent + 500 + 800,   -- total_amount must equal the sum of the line items
  'pending',
  DATE_ADD(CURDATE(), INTERVAL 1 MONTH),
  DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%M %Y'),
  NOW()
FROM rent_applications
WHERE id = <APP_ID>;
```

> **Corrected September 2026.** `invoices.id` is a **VARCHAR primary key you must supply** — there is no `invoice_number` column (that name never existed in the schema). Always set `total_amount` to the sum of the line items; the tenant's bill breakdown is rendered from the individual columns, so a total that disagrees with them shows the tenant one number and charges another.

- Expected: The new invoice appears in tenant's `PayBills` page and admin's `AdminPayments` page with the correct billing period label (e.g. "September 2026").

### 5b. Test Late Fee Trigger

> **Rewritten September 2026.** The old hardcoded `+500` computed on the fly in `get_invoices.php` no longer exists. The late fee is now a real `invoices.late_fee` column, applied **once per invoice** by `promote_overdue_invoices()` in `backend/config.php` and configurable through `system_settings`.

**How it works now**

1. Any invoice listing (`get_invoices.php`) or the admin reminder sweep (`check_due_date_reminders.php`) calls `promote_overdue_invoices()`.
2. That promotes anything still owed and past its `due_date` to `overdue` — including `processing`, `payment-failed`, and `scheduled` invoices whose booked date has passed.
3. It then applies the configured fee to overdue invoices **where `late_fee = 0`**, writing `late_fee` and adding the same amount to `total_amount`. The `late_fee = 0` guard is what makes it idempotent.

**Settings**

| Key | Values | Meaning |
|---|---|---|
| `late_fee_enabled` | `true` / `false` | Master switch. Ships **disabled** |
| `late_fee_type` | `flat` / `percent` | Peso amount, or % of recurring charges (deposit excluded) |
| `late_fee_value` | number | ₱ amount, or the percentage |

**Trigger a late fee**

```sql
-- 1. Enable (defaults: flat ₱200)
UPDATE system_settings SET setting_value='true' WHERE setting_key='late_fee_enabled';

-- 2. Record the originals BEFORE changing anything
SELECT id, status, due_date, late_fee, total_amount FROM invoices WHERE id = '<INVOICE_ID>';

-- 3. Back-date it
UPDATE invoices SET due_date = DATE_SUB(CURDATE(), INTERVAL 5 DAY) WHERE id = '<INVOICE_ID>';
```

Load `/admin-payments` (or call `get_invoices.php`), then:

```sql
SELECT id, status, late_fee, total_amount FROM invoices WHERE id = '<INVOICE_ID>';
-- status → 'overdue', late_fee → 200.00, total_amount → 200.00 higher
```

**Percent mode** — `5` on a ₱5,340 invoice yields `267.00`:

```sql
UPDATE system_settings SET setting_value='percent' WHERE setting_key='late_fee_type';
UPDATE system_settings SET setting_value='5'       WHERE setting_key='late_fee_value';
UPDATE invoices SET late_fee = 0, total_amount = total_amount - late_fee WHERE id = '<INVOICE_ID>';
```

**Confirm it does not double-charge** — reload the page a second time; `late_fee` must not move. This is the single most useful assertion here, because the fee is applied on a read path that runs constantly.

**No fee when not overdue**

```sql
UPDATE invoices SET due_date = DATE_ADD(CURDATE(), INTERVAL 10 DAY), status='pending',
                    late_fee = 0 WHERE id = '<INVOICE_ID>';
```

Promotion requires `due_date < CURDATE()`, so an invoice due **today** is not yet overdue and attracts no fee.

**Restore**

```sql
UPDATE invoices SET total_amount = total_amount - late_fee, late_fee = 0 WHERE late_fee <> 0;
UPDATE invoices SET due_date = '<original>', status = '<original>' WHERE id = '<INVOICE_ID>';
UPDATE system_settings SET setting_value='false' WHERE setting_key='late_fee_enabled';
UPDATE system_settings SET setting_value='flat'  WHERE setting_key='late_fee_type';
UPDATE system_settings SET setting_value='200'   WHERE setting_key='late_fee_value';
```

### 5c. Test Overdue Badge (AdminTenants)

Frontend check in `AdminTenants.jsx`:
```js
const overdueCount = tenantInvoices.filter(inv =>
  inv.status === 'overdue' ||
  (inv.status === 'pending' && new Date(inv.due_date) < new Date())
).length;
```

Set any pending invoice's `due_date` to yesterday → refresh AdminTenants → the tenant card should show the overdue badge.

### 5d. Full Pay-Bill Flow (Tenant Side)

```
Invoice appears in PayBills → Tenant uploads proof → Status: pending-verification
→ Admin reviews proof → Admin marks Paid → Invoice status: Paid
→ Next invoice is created by admin for next month
```

**Test payment proof upload:**
- URL: `/pay-bills` → click Pay on a pending invoice → upload an image → submit.
- Expected: `invoices.proof_of_payment_path` set, status → `'pending-verification'`.

```sql
SELECT status, proof_of_payment_path, payment_reference FROM invoices WHERE id = <ID>;
```

---

## 6. Module: Lease — Extension & Expiry

### 6a. Simulate a Lease Expiring Soon

```sql
UPDATE rooms
SET lease_end = DATE_ADD(CURDATE(), INTERVAL 7 DAY)
WHERE id = 'A';
```
- Expected: `MyRoom.jsx` shows a lease expiry warning banner. `AdminUnits` detail modal shows the upcoming expiry.

### 6b. Simulate Already-Expired Lease

```sql
UPDATE rooms
SET lease_end = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
WHERE id = 'A';
```
- Expected: Expired status shown in admin and tenant views.

### 6c. Full Lease Extension Flow

```
Tenant clicks "Extend Lease" in MyRoom → selects additional months → submits
→ rooms.lease_end updated → admin sees updated lease end in AdminUnits
```

- URL: `/my-room` → Extend Lease button → choose 3 months → submit.
- Check:
```sql
SELECT lease_start, lease_end FROM rooms WHERE id = '<room_id>';
-- lease_end should be advanced by chosen months
```

**Restore lease dates after testing:**
```sql
UPDATE rooms SET lease_end = '2027-08-01' WHERE id = 'A';
```

> **Warning** — An expired lease may affect badge colours and move-out prompts. Always note the original value before patching.

---

## 7. Module: Maintenance Requests

### Full workflow

```
Tenant submits request → Admin starts work → Admin completes (or rejects with a reason) →
Tenant notified on every status change → Timeline and costs recorded
```

> The full API contract and test matrix for this module are in the verification guide's §7.

**Step 1 — Tenant submits**
- URL: `/maintenance-request` → category (Plumbing, Electrical, Structural/Physical, Water Supply, General Maintenance, Others), description, preferred date and time, optional photo or video → submit. There is no priority field — the tenant does not choose urgency.
- Only tenants with an active lease can submit.
- Check:
```sql
SELECT id, user_id, room_name, issue_category, urgency, status FROM maintenance_requests ORDER BY id DESC LIMIT 1;
-- user_id and room_name set, urgency = 'Needs Triage', status = 'Pending'
```

**Step 2 — Admin triages and works the ticket**
- Admin page: `AdminMaintainance` → open the ticket → set **Priority** (Low/Medium/High/Urgent, saves immediately) → *Start Work* (assignee, optional estimate) → *Mark Completed* (actual cost). *Reject* from Pending requires a reason.
- Setting a priority is optional before starting work — an admin may begin work on a still-`Needs Triage` ticket.
- Assignee, priority, estimated cost, work notes and the tenant-responsible toggle each save independently.
- Check:
```sql
SELECT status, assigned_to, estimated_cost, actual_cost, work_notes, tenant_responsible,
       acknowledged_at, started_at, resolved_at, rejection_reason
FROM maintenance_requests WHERE id = <ID>;
```

**Step 3 — Tenant cancels (before admin action)**
- URL: `/my-requests` → find Pending request → Cancel.
- Expected: `status = 'Cancelled'`; it moves to the admin board's Rejected / Cancelled column.

### Testing with a past preferred schedule date

There is no `preferred_schedule` column — the schedule is split across **`preferred_date`** (DATE) and **`preferred_time`** (VARCHAR):

```sql
UPDATE maintenance_requests
SET preferred_date = DATE_SUB(CURDATE(), INTERVAL 3 DAY),
    preferred_time = 'morning'
WHERE id = <ID>;
```
- Expected: schedule shows as past in admin view (no special frontend logic currently, but useful for regression testing).

### Testing resolution time

Total resolution time is `resolved_at − created_at`. To see a multi-day figure without waiting, back-date the report before completing the ticket:

```sql
UPDATE maintenance_requests SET created_at = DATE_SUB(NOW(), INTERVAL 3 DAY) WHERE id = <ID>;
```

Complete it from the admin board, then open the detail modal — it should show roughly "3 days". Restore `created_at` afterwards.

---

## 8. Module: Parking Reservations

### Full workflow

```
Tenant submits parking reservation → Admin approves/rejects → Tenant sees status update
```

**Step 1 — Tenant submits**
- URL: `/services` → Parking → fill vehicle type, model, plate number, transmission, duration, upload OR/CR → submit.
- Check:
```sql
SELECT * FROM parking_reservations ORDER BY id DESC LIMIT 1;
-- status = 'Pending', user_id set
```

**Step 2 — Admin processes**
- Admin page: `AdminServicePage` → Parking tab → Approve or Reject.
- Check:
```sql
SELECT status FROM parking_reservations WHERE id = <ID>;
-- 'Assigned' or 'Rejected'
```

**Step 3 — Tenant cancels (while Pending)**
- URL: `/my-requests` → Parking tab → Cancel.
- Expected: `status = 'Cancelled'`.

### Testing reservation duration boundaries

```sql
-- Make reservation appear to start today
UPDATE parking_reservations
SET start_date = CURDATE(), end_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY)
WHERE id = <ID>;
```

---

## 9. Module: CCTV Footage Requests

### Full workflow

```
Tenant submits request (incident date/time/reason) → Admin approves/rejects → Tenant sees update
```

**Step 1 — Tenant submits**
- URL: `/services` → CCTV → fill incident date, time, location, reason → submit.
- Check:
```sql
SELECT * FROM cctv_requests ORDER BY id DESC LIMIT 1;
-- status = 'Pending', user_id set
```

**Step 2 — Admin processes**
- Admin page: `AdminServicePage` → CCTV tab → Approve or Reject.
- Check:
```sql
SELECT status FROM cctv_requests WHERE id = <ID>;
-- 'Approved' or 'Rejected'
```

**Step 3 — Tenant cancels (while Pending)**
- URL: `/my-requests` → CCTV tab → Cancel.

### Testing with a past incident date

```sql
UPDATE cctv_requests
SET incident_date = DATE_SUB(CURDATE(), INTERVAL 14 DAY)
WHERE id = <ID>;
```
The system does not currently enforce a lookback window, so any past date should be accepted.

---

## 10. Module: Announcements & Notifications

### Full workflow

```
Admin creates announcement → notifications auto-created for all tenants
→ Tenant sees bell badge → reads notification → bell count decreases
```

**Step 1 — Admin creates announcement**
- Admin page: `AdminAnnouncements` → New Announcement → fill title + body → Publish.
- Check:
```sql
SELECT * FROM announcements ORDER BY id DESC LIMIT 1;

SELECT * FROM notifications
WHERE type = 'announcement'
ORDER BY id DESC LIMIT 5;
-- One row per non-admin user
```

**Step 2 — Tenant sees notification**
- Log in as tenant → bell icon should show unread count.
- Click bell → notification appears.

**Step 3 — Mark as read**
- Click a notification → `notifications.is_read` → 1.
- Bell count should decrease.

```sql
SELECT is_read FROM notifications WHERE id = <ID>;
```

---

## 11. Module: Move-Out & Archival

### Full workflow

```
Tenant requests move-out → Admin sees pending-move-out flag → Admin archives tenant
→ rooms.status = 'vacant' → tenant account archived
```

**Step 1 — Tenant submits move-out request**
- URL: `/my-room` → Move Out button → fill reason → submit.
- Check:
```sql
SELECT status FROM rent_applications WHERE user_id = <USER_ID> AND status = 'Approved';
-- status should change to 'pending-move-out'
```

**Step 2 — Admin archives**
- Admin page: `AdminTenants` → find pending-move-out tenant → Archive.
- Check:
```sql
SELECT status FROM rooms WHERE id = '<room_id>';
-- 'vacant'

SELECT * FROM users WHERE id = <USER_ID>;
-- role or archival flag updated
```

---

## 12. Module: Contracts (ViewContract)

### Full workflow

```
Admin uploads signed/notarized lease contract → Tenant views via ViewContract
```

**Step 1 — Admin uploads contract**
- Admin page: `AdminContracts` → find tenant → upload signed PDF.
- Check — `lease_contracts` has **no `user_id`**; it links through `rent_application_id`, and the file columns are `signed_lease_path` / `notarized_lease_path`:
```sql
SELECT lc.id, lc.status, lc.signed_lease_path, lc.notarized_lease_path
FROM lease_contracts lc
JOIN rent_applications ra ON ra.id = lc.rent_application_id
WHERE ra.user_id = <USER_ID>
ORDER BY lc.id DESC LIMIT 1;
```

**Step 2 — Tenant views contract**
- URL: `/view-contract`
- Expected: contract details load from `lease_contracts` (not `rent_applications`), signed/notarized upload status visible.

---

## 13. Quick Reference — Common Scenarios

| Scenario | Setup SQL | What to check in UI |
|---|---|---|
| Invoice overdue — late fee applies | Enable `late_fee_enabled`, then `SET due_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)` on an open invoice | `status` → `overdue`, `late_fee` set, `total_amount` raised by the same amount |
| Late fee is not charged twice | Same as above, then reload | `late_fee` unchanged on the second read |
| Invoice due today — no fee | `SET due_date = CURDATE()` | Not yet overdue (promotion needs `due_date < CURDATE()`) |
| Invoice due in future — no fee | `SET due_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY)` | Late fee = 0 |
| Abandoned online checkout still chased | `SET status='processing', due_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)` | Promoted to `overdue`; stale `checkout_session_id` cleared |
| Missed in-person booking | `SET status='scheduled', scheduled_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`, past `due_date` | Promoted to `overdue` |
| Reservation hold expires | `SET hold_expires_at = DATE_SUB(CURDATE(), INTERVAL 1 DAY)` on an `Active` row, then load `/preview` | Reservation → `Expired` |
| Overdue badge on tenant card | Same as "overdue" above | `overdueCount > 0` badge in AdminTenants |
| Lease expiring in 7 days | `SET rooms.lease_end = DATE_ADD(CURDATE(), INTERVAL 7 DAY)` | Expiry warning in MyRoom & AdminUnits |
| Lease already expired | `SET rooms.lease_end = DATE_SUB(CURDATE(), INTERVAL 1 DAY)` | Expired status shown |
| New monthly invoice | INSERT with next month's `billing_period` and `due_date` (see §5a) | Invoice in PayBills and AdminPayments |
| Second month invoice (recurring) | Repeat §5a INSERT after first is paid | Billing period label advances by 1 month |
| Maintenance request — cancel | Submit request, then cancel from `/my-requests` | `status = 'Cancelled'` in DB |
| Parking — approve | Admin: Approve in AdminServicePage | `status = 'Assigned'` in DB |
| CCTV — reject | Admin: Reject in AdminServicePage | `status = 'Rejected'` in DB |
| Move-out → vacant room | Tenant submits move-out, admin archives | `rooms.status = 'vacant'` |
| Announcement → notification fan-out | Admin creates announcement | One `notifications` row per non-admin user |

---

## 14. Tips & Gotchas

- **`due_date < today` is strict** — an invoice due *today* is not yet overdue. Set it to yesterday or earlier to trigger promotion.
- **The late fee is applied once, guarded by `late_fee = 0`.** To re-test, zero it *and* subtract it back out of `total_amount`, or the next run compounds the total.
- **Promotion covers every open status, not just `pending`.** `processing`, `payment-failed`, and `scheduled` (whose booked date has passed) are all promoted. The authoritative list is `BILLING_OPEN_STATUSES` in `backend/config.php` — `paid` and `cancelled` are terminal and are never promoted.
- **Nothing runs on a timer.** There is no scheduler: overdue promotion happens when an invoice list is requested or the admin runs the reminder sweep; reservation expiry happens when rooms are listed; contract expiry happens when `my_room.php` is called. If a date-dependent change has not happened, it is usually because nothing invoked the endpoint that performs it.
- **`billing_period` is a display string** — never parsed by the backend. Safe to set to any human-readable value (`"September 2026"`).
- **`rooms.id` is VARCHAR** — always quote it: `WHERE id = 'A'`, not `WHERE id = A`.
- **`lease_start` / `lease_end` are set by `record_payment_admin.php`** using `date('Y-m-d')` at first-payment approval. To test a specific start date, `UPDATE rooms` directly after approval.
- **No auto-scheduler exists yet** — monthly invoices do not generate automatically. All invoice creation is admin-initiated. See `docs/todo.md` Priority B for the planned automation.
- **Restore all date patches after testing** — always note the original value before patching a `due_date`, `lease_end`, or any date column. Keep a scratchpad of originals.
- **`rooms.id` in examples** — substitute real IDs from your `rooms` table (e.g. `'A'`, `'B'`, `'1'`, etc.) wherever the examples use `'A'` or `<room_id>`.
- **Multiple invoices** — a tenant can have several invoices (initial + monthly). Always filter by `id` rather than `user_id` alone when patching a specific invoice to avoid unintended changes.
