# Move-In / Move-Out Tracking — Workflow Design

> **Stack context:** React 19 + Vite 8 → PHP 8 (XAMPP) → MySQL/MariaDB  
> **Core Requirement:** Safe, admin-controlled lifecycle transitions. **No user self-service completion** of move-in or move-out.

---

## 1. Introduction & Operational Context

In a small-to-medium scale apartment management system, the movements of tenants (move-in and move-out) carry operational and financial consequences (occupancy levels, utility handovers, deposit clearance, and unit key returns). 

To prevent security gaps, unauthorized room occupancy, or premature deposit payouts:
* **Tenants cannot perform self-service move-in.**
* **Tenants cannot perform self-service move-out.**
* Every transition must follow a **Tenant Requests, Admin Approves/Completes** workflow pattern.

---

## 2. The Move-In Workflow

A tenant is only registered as occupied in a room after passing screening and confirming payment terms (1 month advance, 1 month deposit, security deposit).

### Step-by-Step Flow

```
   1. REGISTRATION & SCREENING
   Tenant submits rent application
   ├── Upload government ID
   ├── Upload NBI Clearance
   └── Preference of room
              │
              ▼
   2. APPLICATION REVIEW (ADMIN)
   Admin inspects credentials in AdminApplications.jsx
   ├── Approve: Status -> Approved (moves to step 3)
   └── Reject: Status -> Rejected (rejection reason sent)
              │
              ▼
   3. BILLING GENERATION & VERIFICATION
   System generates invoice (Base Rent + Security Deposit)
   ├── Tenant uploads proof of payment (screenshot)
   └── Admin verifies payment in AdminPayments.jsx
              │
              ▼
   4. OCCUPANCY ACTIVATION (ADMIN-CONTROLLED)
   Admin confirms first payment receipt
   ├── Room status changes: Vacant -> Occupied
   ├── Lease contract generated and activated
   └── Occupancy is formally recorded
```

### Transition States

| Actor | Action | DB Transition | Result |
|---|---|---|---|
| Tenant | Submit Form | `rent_applications.status = 'Pending Review'` | Awaiting admin review |
| Admin | Approve App | `rent_applications.status = 'Approved'` | Invoice generated; room reserved |
| Tenant | Upload Proof | `invoices.status = 'pending-verification'` | Awaiting payment check |
| Admin | Verify Payment | `invoices.status = 'paid'` & `rooms.status = 'occupied'` | Occupancy activated |

---

## 3. The Move-Out Workflow

A tenant requesting to end their lease triggers a workflow that flags their intent, requires an inspection, and finishes with admin approval.

### Step-by-Step Flow

```
   1. TENANT INITIATES REQUEST
   Tenant clicks "End Rent Term" in MyRoom.jsx
   ├── Validates 15–30 day notice requirement (minimum 15 days, maximum 30 days prior notice)
   └── status -> 'pending-move-out' (tenant retains room access during notice period)
              │
              ▼
   2. INSPECTION & CLEARANCE (ADMIN)
   Admin sees tenant under "Pending Move-Out" tab in AdminTenants.jsx
   ├── Inspects physical room for damages & records damage notes
   ├── Calculates security deposit deductions (Deposit − Damages − Utilities)
   └── Settles any unpaid utility balances (electricity, water)
              │
              ▼
   3. COMPLETE MOVE-OUT (ADMIN)
   Admin clicks "Complete Move Out" & submits Move-Out Clearance Modal in AdminTenants.jsx
   ├── room status changes: Occupied -> Vacant (tenant_name cleared, last_tenant logged)
   ├── tenant status changes: pending-move-out -> moved-out
   ├── clearance breakdown stored in archive_notes & audit activity logs
   └── lingering pending invoices for past application set to 'cancelled'
              │
              ▼
   4. ARCHIVING (ADMIN)
   Admin records final clearance notes and archives user
   ├── user.is_archived -> 1 (blocks future login)
   └── History preserved for reports
```

### Transition States

| Actor | Action | DB Transition | Result |
|---|---|---|---|
| Tenant | Request End | `rent_applications.status = 'pending-move-out'` & `requested_move_out_date` | Notice countdown active; tenant retains room portal access |
| Admin | Complete Out | `rent_applications.status = 'moved-out'` & `rooms.status = 'vacant'` | Deposit deductions logged; room released; past pending invoices cancelled |
| Admin | Archive | `users.is_archived = 1` | Account deactivated, history kept |

---

## 4. Database Schema Alignment

These workflows utilize three tables: `users`, `rent_applications`, and `rooms`.

```
        users
   ┌───────────────┐
   │ id            │ ◄──────────┐
   │ first_name    │            │
   │ email_address │            │ user_id
   │ is_archived   │            │
   └───────────────┘            │
                                │
   rent_applications            │
   ┌─────────────────────┐      │
   │ id                  │      │
   │ user_id             │ ─────┘
   │ room_name (FK)      │ ───────────┐
   │ status              │            │
   │ archive_date        │            │
   └─────────────────────┘            │
                                      │ room_name matches id
        rooms                         │
   ┌───────────────────┐              │
   │ id                │ ◄────────────┘
   │ status            │ ("vacant", "occupied", "maintenance")
   │ tenant_name       │
   │ lease_start/end   │
   │ occupants         │
   └───────────────────┘
```

---

## 5. API Endpoints Map

### 5.1 `record_move_out.php` (Tenant request)
Sets application status to `pending-move-out` so that the admin is notified of the move-out intent.

### 5.2 `update_tenant_status.php` (Admin control)
* **For Move-In (`Approved`)**: Assigns tenant to the room, flags the room as `occupied`, sets lease start/end dates, and generates the initial invoice.
* **For Move-Out (`moved-out`)**: Releases the room back to `vacant`, records the `last_tenant` metadata for tracking, and clears active occupant variables.

### 5.3 `archive_tenant.php` (Admin final audit)
Deactivates user authentication (`is_archived = 1`) and stores final security deposit resolution notes, ensuring historical records remain readable.

---

## 6. Pre-deployment Checklist for Move-In/Out

- [ ] Verify `update_tenant_status.php` properly vacates room on `moved-out`.
- [ ] Confirm `archive_tenant.php` toggles `is_archived` in the `users` table correctly.
- [ ] Ensure `MyRoom.jsx` disables the "End Rent Term" button once status becomes `pending-move-out`.
- [ ] Test the full pipeline: Apply → Approve → Pay → Active Occupancy → Request Move-Out → Admin Inspection → Complete Move-out → Archive.

## My Room panels and household roster (2026-11)
The tenant's My Room page ([tenant_pages.md](tenant_pages.md) §3) now leads with an **important info panel** (overdue bill, moving out, rent ending within 30 days, household requests in review), a **rent term card** (start, end, progress, Extend), the **household panel** and a **house rules card**.
- **Household.** One shared contract; only the lease holder signs in (decision 2026-09-16). Members are added or removed through `household_members.php` and every change waits for admin approval (cards show "Awaiting approval" / "Removal requested", with Withdraw). Age is required for a child (17 or less); the dialog previews the rent change from the per-person surcharge above 4 occupants. Rows: `household_members` with `age` and `age_category`.
- **Move-in date.** The admin confirms it with `schedule_move_in.php` (today to +365 days; tenant notified, `move_in_notified_at`); it becomes the contract `lease_start` at move-in. Track Application shows the six steps from submitted to moved in.
- **Extending** is blocked while a bill is overdue (the card links to Pay Bills) and honours `extension_deadline_days`; reminders before the end use `send_lease_end_reminders()` and `renewal_reminder_sent_at`.
