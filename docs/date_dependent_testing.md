# AMS Testing Guide — Date-Dependent & End-to-End Module Workflows

This guide documents how to manually test every major module in the AMS, including workflows that span multiple steps across days or months. Where a test depends on a date (late fees, billing cycles, lease expiry, overdue detection), the setup SQL is provided inline.

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
| Late fee (+500) | `get_invoices.php` | `invoices.due_date`, `invoices.status` |
| Overdue badge (frontend) | `AdminTenants.jsx` | `invoices.due_date`, `invoices.status` |
| Lease start / end | `record_payment_admin.php` | `rooms.lease_start`, `rooms.lease_end` |
| Monthly billing period label | `invoices.billing_period` | `invoices.billing_period` (display string) |
| Dashboard due invoices | `AdminDashboard.jsx` | `invoices.due_date` |
| Lease expiry warning | `MyRoom.jsx`, `AdminUnits` | `rooms.lease_end` |
| Parking reservation duration | `parking_reservations` | `start_date`, `end_date` |
| CCTV incident date | `cctv_requests` | `incident_date` |
| Maintenance preferred schedule | `maintenance_requests` | `preferred_schedule` |

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
- Tick terms checkbox → Submit.
- Expected: `SuccessModal` "Application Submitted Successfully" → redirected to `/track-application`.

**Check DB after submit:**
```sql
SELECT * FROM rent_applications ORDER BY id DESC LIMIT 1;
```
Expected columns: `user_id` populated, `status = 'Pending'`, file paths set, `room_name` = chosen room.

**Step 3 — Admin reviews and approves**
- Admin page: `AdminTenants` → Pending tab → find the applicant → Approve.
- Expected: `rent_applications.status` = `'Approved'`, notification sent to tenant.

```sql
SELECT status FROM rent_applications ORDER BY id DESC LIMIT 1;
-- Should return 'Approved'
```

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
  user_id,
  rent_application_id,
  invoice_number,
  base_rent,
  water,
  electricity,
  parking,
  security_deposit,
  status,
  due_date,
  billing_period,
  created_at
)
SELECT
  user_id,
  id,
  CONCAT('INV-', UNIX_TIMESTAMP(), '-', id),
  monthly_rent,
  500,    -- sample water bill
  800,    -- sample electricity bill
  0,
  0,
  'pending',
  DATE_ADD(CURDATE(), INTERVAL 1 MONTH),
  DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%M %Y'),
  NOW()
FROM rent_applications
WHERE id = <APP_ID>;
```

- Expected: The new invoice appears in tenant's `PayBills` page and admin's `AdminPayments` page with the correct billing period label (e.g. "September 2026").

### 5b. Test Late Fee Trigger

The late fee rule in `get_invoices.php`:
```php
// +500 if status=pending AND due_date < today
$late_fee = ($row['status'] === 'pending'
    && !empty($row['due_date'])
    && strtotime($row['due_date']) < strtotime(date('Y-m-d'))) ? 500.00 : 0.00;
```

**Trigger a late fee:**
```sql
UPDATE invoices
SET due_date = DATE_SUB(CURDATE(), INTERVAL 5 DAY)
WHERE id = <INVOICE_ID> AND status = 'pending';
```
Reload Payments page → `total_amount` should be 500 higher.

**No late fee (future due date):**
```sql
UPDATE invoices
SET due_date = DATE_ADD(CURDATE(), INTERVAL 10 DAY)
WHERE id = <INVOICE_ID> AND status = 'pending';
```
Reload → late fee = 0.

**Due today — no fee** (the condition is strict `<`, not `<=`):
```sql
UPDATE invoices SET due_date = CURDATE() WHERE id = <INVOICE_ID>;
```
Reload → late fee should be 0.

**Restore:**
```sql
UPDATE invoices SET due_date = '2026-09-05' WHERE id = <INVOICE_ID>;
-- Replace with the original due date
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
Tenant submits request → Admin sees in Kanban → Admin updates status →
Tenant notified (future) → Cost/notes recorded
```

**Step 1 — Tenant submits**
- URL: `/services` → Maintenance → fill issue category, urgency, description, preferred schedule, optional attachment → submit.
- Check:
```sql
SELECT * FROM maintenance_requests ORDER BY id DESC LIMIT 1;
-- user_id set, status = 'Pending'
```

**Step 2 — Admin updates in Kanban**
- Admin page: `AdminMaintainance` → drag card to In Progress / Resolved.
- Fill: assigned_to, estimated_cost, work_notes, tenant_responsible toggle.
- Check:
```sql
SELECT status, assigned_to, estimated_cost, work_notes, tenant_responsible
FROM maintenance_requests WHERE id = <ID>;
```

**Step 3 — Tenant cancels (before admin action)**
- URL: `/my-requests` → find Pending request → Cancel.
- Expected: `status = 'Cancelled'`, no longer shows in admin Kanban pending column.

### Testing with a past preferred schedule date

```sql
UPDATE maintenance_requests
SET preferred_schedule = DATE_SUB(CURDATE(), INTERVAL 3 DAY)
WHERE id = <ID>;
```
- Expected: schedule shows as past in admin view (no special frontend logic currently, but useful for regression testing).

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
- Check:
```sql
SELECT * FROM lease_contracts WHERE user_id = <USER_ID> ORDER BY id DESC LIMIT 1;
-- signed_contract_path and/or notarized_contract_path set
```

**Step 2 — Tenant views contract**
- URL: `/view-contract`
- Expected: contract details load from `lease_contracts` (not `rent_applications`), signed/notarized upload status visible.

---

## 13. Quick Reference — Common Scenarios

| Scenario | Setup SQL | What to check in UI |
|---|---|---|
| Invoice overdue — late fee applies | `SET due_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)` on a `pending` invoice | `total_amount` +500 in PayBills / AdminPayments |
| Invoice due today — no fee | `SET due_date = CURDATE()` on `pending` invoice | Late fee = 0 (condition is strict `<`) |
| Invoice due in future — no fee | `SET due_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY)` | Late fee = 0 |
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

- **`due_date < today` is strict** — an invoice due *today* does **not** incur a late fee. Set to yesterday or earlier to trigger it.
- **`status` must stay `'pending'`** — a `paid` or `pending-verification` invoice never gets a late fee, even if `due_date` is in the past.
- **`billing_period` is a display string** — never parsed by the backend. Safe to set to any human-readable value (`"September 2026"`).
- **`rooms.id` is VARCHAR** — always quote it: `WHERE id = 'A'`, not `WHERE id = A`.
- **`lease_start` / `lease_end` are set by `record_payment_admin.php`** using `date('Y-m-d')` at first-payment approval. To test a specific start date, `UPDATE rooms` directly after approval.
- **No auto-scheduler exists yet** — monthly invoices do not generate automatically. All invoice creation is admin-initiated. See `docs/todo.md` Priority B for the planned automation.
- **Restore all date patches after testing** — always note the original value before patching a `due_date`, `lease_end`, or any date column. Keep a scratchpad of originals.
- **`rooms.id` in examples** — substitute real IDs from your `rooms` table (e.g. `'A'`, `'B'`, `'1'`, etc.) wherever the examples use `'A'` or `<room_id>`.
- **Multiple invoices** — a tenant can have several invoices (initial + monthly). Always filter by `id` rather than `user_id` alone when patching a specific invoice to avoid unintended changes.
