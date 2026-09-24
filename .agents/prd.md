# Product Requirements Document: Apartment Management System (AMS)

> **Version:** 3.0 — September 2026 (Post-Defense Revision)
> **Stack:** React 19 + Vite 8 (SPA) + PHP 8 API + MySQL / MariaDB 10 (XAMPP)
> **Dev URL:** `http://localhost:8080/ApartmentManagementSystem_React/`
> **Scale:** Small-to-medium residential building · up to 100 units · 1–3 admins · up to 200 active tenants

---

## Product Overview

**Product Vision:**
A web-based apartment management system that replaces paper-based and spreadsheet-driven property operations with a single, structured digital portal. It serves two authenticated roles — a property administrator and registered tenants — plus unauthenticated guests, covering the full lifecycle of a tenancy from initial inquiry through application, active occupancy, and move-out.

**The Problem Being Solved:**
Small-to-medium apartment operators in the Philippines typically manage rent collection, maintenance follow-ups, and tenant documents through paper receipts, chat messages, and manual ledgers. This creates three concrete problems:
1. **Lost records** — paper receipts go missing; payment disputes have no source of truth.
2. **Admin overhead** — the landlord manually reminds every tenant each month, records payments by hand, and has no dashboard.
3. **Tenant opacity** — tenants do not know their billing breakdown, request status, or lease expiry until they ask.

AMS solves all three within the constraints of a residential building deployment.

**Target Users:**
- **Primary:** Building administrator / property manager (single account, non-technical)
- **Secondary:** Current tenants (registered accounts)
- **Tertiary:** Prospective tenants (public-facing room preview, registration, and application)

**Business Objectives:**
1. Digitize 100% of rent applications and monthly invoices — zero paper forms.
2. Give the admin a single screen to see occupancy, pending payments, and open maintenance tickets.
3. Give tenants self-service access to bills, requests, visitor management, and notifications — reducing inbound admin messages.
4. Maintain an auditable trail for every payment, contract, visitor log, and status change.

**Success Metrics:**
- All monthly invoices generated and settled in-system (no offline ledger needed)
- Admin can check any tenant payment status in 30 seconds or less
- Maintenance ticket status always reflects DB state (not lost on page refresh)
- Tenants can track their own requests without messaging the admin directly
- Visitor check-in and overstay alerts visible to admin in real time

---

## User Personas

### Persona 1: Maria — Property Administrator
- **Demographics:** 40 yrs, manages building solo or with small team, low-to-moderate tech proficiency, uses smartphone + laptop
- **Goals:** Know who has paid, approve applications quickly, record maintenance work, generate monthly income summaries, track visitors
- **Pain Points:** Forgetting which tenants are overdue, paper receipts getting lost, no unified view of repairs
- **Key Needs:** Dashboard overview, one-click payment verification, maintenance Kanban, visitor log, downloadable reports

### Persona 2: Juan — Current Tenant
- **Demographics:** 28 yrs, employed, moderate tech proficiency, primary device is smartphone
- **Goals:** Pay rent on time, know what he is being billed for, report problems and track progress, pre-register visitors
- **Pain Points:** Not knowing the billing breakdown, chasing admin for request updates, losing paper receipts
- **Key Needs:** Itemized invoice view, payment proof upload, request tracker, visitor pre-authorization, notification alerts, receipt

### Persona 3: Ana — Prospective Tenant
- **Demographics:** 24 yrs, looking for a unit, uses the system once to apply
- **Goals:** Browse available units, understand pricing, submit application with documents
- **Pain Points:** Not knowing which units are vacant, multi-document collection requirement
- **Key Needs:** Public room preview, simple application form, application status tracker

---

## System Modules

The system is organized into **12 core modules** plus authentication as a shared prerequisite.

---

## Module 0: Authentication and Access Control

### What It Does
Controls who enters the system and what they can see. Two roles exist: `admin` and `user` (tenant).

### Why It Is Needed
Without identity, any tenant could view another tenant's bills or approve their own application. Role separation is the foundation every other module depends on.

### What Is In Scope
- Email and password registration and login (`login.php`, `registration.php`)
- `loggedInUser` stored in `sessionStorage` (tab-scoped; clears on close)
- Role-based routing: admin to `/admin-dashboard`; user to `/home`
- Three route guard levels:
  - `ProtectedRoute` — any authenticated user
  - `TenantProtectedRoute` — authenticated user with an approved and paid rent application
  - `AdminProtectedRoute` — authenticated user with `role === 'admin'`
- `X-User-Id` and `X-Admin-Id` headers injected on every API request via `axiosConfig.js`
- `verify_admin($conn, $admin_id)` server-side guard on all admin endpoints
- Profile edit (name, contact number, avatar) and password change
- **Forgot Password / Reset Password** — token-based (`forgot_password.php`, `reset_password.php`); dev-mode returns raw token in response; production must wire PHPMailer SMTP delivery

### What Is Explicitly Out of Scope
- Social login — unnecessary overhead for a known user base
- Email verification on registration — added friction for a small closed system

### Acceptance Criteria
- Unregistered users cannot access any protected route
- Admin PHP endpoints return 403 if `X-Admin-Id` header is missing or invalid
- Tenants with no approved application are redirected to `/track-application`
- Password reset token expires after 30 minutes; used tokens are deleted from `password_resets`

---

## Module 1: Tenant Management

### What It Does
Manages the lifecycle of a tenant from initial application through active tenancy to move-out and archival.

### Implementation Status
Fully implemented and DB-backed.

---

### 1.1 Tenant Registration and Application

**What:** Multi-step rent application form submitted by a logged-in prospective tenant.

**Why:** Replaces paper forms and walk-in document submissions. Documents are stored digitally so admin can review without a physical meeting.

**In scope:**
- Applicant personal details (name, contact, gender, occupant count)
- Room selection from available vacant units
- Document uploads: Valid ID front/back, NBI Clearance
- `user_id` FK stored on the `rent_applications` row at submission time
- Application submitted as `Pending Review`; admin notified in-app
- Application status pipeline: `Pending Review` → `Approved` / `Rejected` → `pending-move-out` → `moved-out` → `archived`

**Out of scope:**
- Background check integration (done offline by admin)
- Police Clearance, Proof of Billing, employment certificate — future additions

---

### 1.2 Tenant Profile and History

**In scope:**
- View and edit profile (name, contact, avatar) via `profile.php`
- View uploaded verification documents (ID, NBI) via `get_documents.php`
- Occupancy record: room assigned, move-in date, lease start and end
- Tenant list and status visible by admin in `AdminTenants.jsx`

---

### 1.3 Move-In Tracking

**What:** When admin approves a rent application, the room is automatically marked `Occupied`, lease dates are written to the `rooms` table, the initial invoice is generated, and a lease contract is auto-generated.

**In scope:**
- `update_tenant_status.php` handles all four writes atomically on Approve
- Initial invoice = 1 month advance + 1 month security deposit + base rent
- Lease contract record created in `lease_contracts` on approval

---

### 1.4 Move-Out Tracking

**In scope:**
- "Request Move-Out" button/modal in `MyRoom.jsx` calls `record_move_out.php` — sets `status = 'pending-move-out'`
- Admin sees `pending-move-out` flag highlighted in `AdminTenants.jsx`
- Move-out flow: schedule inspection → calculate damage deductions from deposit → settle outstanding invoices → archive tenant → set room `Vacant`
- Archive stores reason, date, and notes for history; record is never deleted

---

### 1.5 Document Upload

**In scope:**
- JPEG, PNG, or PDF uploads for Valid ID front/back and NBI Clearance
- Files stored in `backend/uploads/` organized by document type
- Admin document preview modal in `AdminApplications.jsx` and `AdminTenants.jsx`

---

### 1.6 Application Processing

**In scope:**
- Admin reviews, approves, or rejects applications with rejection reasons
- Admin can restore archived tenants via `restore_tenant.php`

### Acceptance Criteria
- Application status transitions are atomic and persist across page refresh
- Approved application auto-assigns room, generates initial invoice, and creates lease contract
- Archived tenant record is never deleted — only status changes

---

## Module 2: Unit Management

### What It Does
Tracks all physical units — type, floor, price, current status, occupant, condition, furnishing, and lease history.

### Implementation Status
Fully implemented and DB-backed.

---

### 2.1 Room Availability and Status Monitoring

**In scope:**
- Status values: `Vacant`, `Occupied`, `Maintenance`, `Reserved`
- Grid view (visual) and list view (dense) toggle in `AdminUnits.jsx`
- Filter by unit type (Studio, 1BR), floor, and status
- Unit preview displays layout photos
- `Maintenance` flag prevents new assignment during active repair

#### Room Status Values

| Status | Meaning | Trigger |
|---|---|---|
| **Vacant** | No tenant assigned, ready to rent | After move-out + inspection |
| **Occupied** | Active tenant with valid lease | After application approval + payment |
| **Under Maintenance** | Temporarily unavailable | Admin sets during repairs |
| **Reserved** | Approved application awaiting move-in payment | After approval, before payment |

---

### 2.2 Unit Detail and Occupancy Record

**In scope:**
- Current tenant name, lease start and end, monthly rent
- Room condition, furnishing status, last inspection date (`rooms` table columns)
- Occupancy history showing previous tenants and their periods
- Maintenance flag toggle

---

### 2.3 Lease Extension

**In scope:**
- Admin extends lease from `AdminUnits.jsx` detail modal
- Tenant requests extension from `MyRoom.jsx` via `extend_lease.php`
- New end date written to `rooms.lease_end` and `rent_applications`

---

### 2.4 Unit Rate Configuration

**In scope:**
- Set per-unit pricing: base rent, water allocation, electricity allocation, parking fee via `update_room.php`

### Acceptance Criteria
- Only `Vacant`-status units can be assigned to a new approved application
- Lease extension writes to DB and is visible immediately
- Unit status automatically becomes `Occupied` on tenant approval and `Vacant` on archive

---

## Module 3: Rental Payment & Billing

### What It Does
Manages the full billing cycle: generating monthly invoices, recording payments (manual and gateway), uploading payment proofs, admin verification, receipts, overdue flags, and deposit tracking.

### Implementation Status
Core billing wired. PayMongo payment gateway implemented in sandbox mode.

---

### Payment Terms and Billing Structure

| Line Item | Description | When Generated |
|---|---|---|
| **Security Deposit** | Configurable (typically 1 month rent), tracked with deductions | Initial invoice only (on application approval) |
| **1 Month Advance** | 1 month rent prepaid | Initial invoice only |
| **Base Rent** | Monthly unit rent, set per room | Monthly recurring |
| **Water** | Metered or flat-rate charge | Monthly recurring |
| **Electricity** | Metered or flat-rate charge | Monthly recurring |
| **Parking** | Fixed monthly fee if slot reserved | Monthly recurring (if applicable) |
| **Late Fee** | System-calculated on overdue invoices | On overdue |

---

### 3.1 Monthly Invoice Generation

**In scope:**
- Admin generates invoice from `AdminPayments.jsx` per tenant
- Invoice contains: base rent, water, electricity, parking, late fee, billing period, due date
- Invoice ID format: `INV-<uniqid>` (stored as varchar)
- Status values: `pending`, `paid`, `overdue`, `pending-verification`

---

### 3.2 Payment Recording — Four Methods

**In scope:**
- **Cash on Hand** — admin records directly; invoice marked `paid` immediately
- **GCash** — tenant uploads screenshot proof + 13-digit reference number → status `pending-verification` → admin verifies and confirms
- **Bank Transfer** — tenant uploads proof + reference (max 55 chars, not purely numeric) → same `pending-verification` flow
- **PayMongo Gateway** — tenant pays via GCash, Maya, or QR Ph via hosted checkout; webhook auto-marks invoice `paid`
- Admin can record manual payments via `record_payment_admin.php`
- Admin verifies uploaded payment proofs before confirming

---

### 3.3 Payment History and Receipts

**In scope:**
- `UserPaymentHistory.jsx` lists all invoices with status badges
- Receipt modal: billing period, all line items, payment method, reference number, proof of payment, paid date
- Printable official receipts with admin signature placeholder
- Admin views per-tenant invoice history in `AdminPayments.jsx`

---

### 3.4 Balance Monitoring and Overdue Flags

**In scope:**
- `due_date` stored on every invoice
- Overdue flag shown as badge in `AdminPayments.jsx` and `AdminDashboard.jsx`
- Balance tracking with aging ledger: current, 1–15 days, 16–30 days, 60+ days overdue
- Auto-overdue status transition via `check_due_date_reminders.php`

---

### 3.5 Due Date Reminders

**In scope:**
- Automatic countdown alerts in `PayBills.jsx`
- `check_due_date_reminders.php` and `send_payment_reminder.php` for automated dispatch
- Manual admin reminder dispatch available

---

### 3.6 Payment Proof Upload and Reference Number

**In scope:**
- `payment_reference VARCHAR(100)` and `proof_of_payment_path VARCHAR(255)` stored in `invoices` table
- `sender_name VARCHAR(100)` stored for GCash/Bank references
- File upload via `upload_payment_proof.php` in `PaymentUpload.jsx`
- Reference number and proof visible in receipt modal and admin payment view
- GCash: reference must be exactly 13 digits; Bank: max 55 characters, not purely numeric

---

### 3.7 Security Deposit Tracking

**In scope:**
- Deposit tracked in `lease_contracts`: `deposit_amount`, `deposit_status`, `damage_deduction`, `utility_deduction`, `refund_amount`, `refund_date`
- Deductions applied to fixture damage or unpaid utilities
- Refund calculated on move-out after inspection

### Acceptance Criteria
- Initial invoice auto-generated on application approval
- Paying via proof upload sets status to `pending-verification` until admin confirms
- Cash payments mark invoice `paid` immediately
- Overdue invoices are visually distinct from pending ones in all views
- Receipt modal shows full itemized breakdown with method, reference, sender name, and date

---

## Module 4: Maintenance Request

### What It Does
Allows tenants to formally report repair issues, track resolution, and allows admin to manage the repair workflow with Kanban status, assignee, cost, and budget tracking.

### Implementation Status
Fully implemented and DB-backed. Tenant-responsible flag, budget overview, and cost tracking wired.

---

### Issue Classification

| Category | Examples |
|---|---|
| Plumbing | Leaking pipe, clogged drain, broken faucet, toilet issue |
| Electrical | No power outlet, faulty wiring, tripped breaker, lighting failure |
| Structural / Physical | Cracked wall, broken door or window, damaged ceiling, flooring |
| Water Supply | No water, low water pressure, water discoloration |
| General Maintenance | Pest control, repainting, lock replacement, appliance repair |
| Others | Anything not covered by the above categories |

**Priority Levels:**

| Level | Meaning | Expected Response |
|---|---|---|
| Low | Minor inconvenience; not urgent | Within the week |
| Medium | Affects comfort; should be addressed soon | Within 2–3 days |
| High | Affects habitability | Within 24 hours |
| Urgent | Safety risk: flooding, no power, structural hazard | Immediate |

---

### 4.1 Request Submission (Tenant)

**In scope:**
- Issue category, description, location (pre-filled from tenant's room), priority level, preferred schedule
- Photo/video attachment (drag-and-drop, live preview) stored in `backend/uploads/maintenance/`
- `permission_to_enter` flag on the request form
- Submitted as `status = Pending`; stored to DB with `user_id`

---

### 4.2 Request Tracking (Tenant)

**In scope:**
- `/my-requests` lists all submitted requests with current status badge and cancel action
- Date reported shown; date resolved shown when status becomes Completed
- Tenant receives in-app notification on status change

---

### 4.3 Admin Maintenance Management

**In scope:**
- Kanban board: `Pending | In Progress | Approved | Completed | Cancelled`
- Admin assigns technician name (`assigned_to`), records cost (`estimated_cost`), and adds work notes (`work_notes`)
- Admin toggles `tenant_responsible` flag to bill repair to tenant
- Maintenance budget overview: monthly budget vs. spent, category and per-unit breakdown (`maintenanceMonthlyBudget` from `system_settings`)
- All writes persist to DB via `update_maintenance_status.php`

### Database Schema — `maintenance_requests`

All columns present in production schema:
`id`, `user_id`, `issue_category`, `urgency`, `preferred_date`, `preferred_time`, `description`, `permission_to_enter`, `attachment_path`, `status`, `assigned_to`, `estimated_cost`, `work_notes`, `tenant_responsible`, `created_at`

### Acceptance Criteria
- Maintenance ticket stored to DB on submission and survives page refresh
- Admin status changes persist to DB immediately
- Tenant can view the current status of every ticket they submitted

---

## Module 5: Service Management

### What It Does
Provides modular service management for CCTV footage requests, parking reservations, and toggleable add-on services.

### Implementation Status
Partially implemented. CCTV and parking admin views wired. Cleaning/laundry services not yet built.

---

### 5.1 CCTV Access Requests

**In scope:**
- Tenant submits request with incident date, time, location, and reason via `CctvRequest.jsx` → `cctv_request.php`
- Admin reviews and approves/rejects via `AdminCctv.jsx` → `update_cctv_status.php`; status persists to DB
- Tenant can cancel pending requests from `UserMyRequests.jsx`

**Deferred:** Data Privacy consent checkbox; physical footage delivery tracking

---

### 5.2 Parking Reservation

**In scope:**
- Tenant reserves parking with vehicle type, model, plate number, transmission, duration, and OR/CR document upload
- Admin assigns or rejects via `AdminParking.jsx` → `update_parking_status.php`; status persists to DB
- Parking fee linked to monthly invoices via `invoices.parking`
- Available slots checked via `get_available_parking_slots.php`

**Deferred:** Full slot inventory as hard limit; automatic slot release on tenant move-out

---

### 5.3 Service Module Toggles

**In scope:**
- Admin can enable/disable modular services (Bill Payments, Parking, Maintenance, CCTV) via `AdminServicePage.jsx`
- Toggle state persisted to `system_settings` table
- Disabled services hidden in the tenant portal

---

### 5.4 Cleaning and Laundry Services (Implemented)

Admin-managed catalog of priced add-on services in three categories: cleaning,
laundry and other. Admin creates, re-prices, activates or removes catalog entries
from the Service Catalog section of `/admin-services`. Each entry carries a price
and a pricing unit (session, kg, hour or item), a quantity range, and a lead time.

Tenants book from `/services` → `/service-booking`, choosing a date, time slot,
quantity and an optional reference photo. Bookings move through
Pending → Approved → In Progress → Completed (plus Rejected / Cancelled) from the
Service Bookings tab on `/admin-services`.

Marking a booking Completed posts its cost to the tenant invoice for the month of
delivery, accumulating in `invoices.services`. Because the charge lives on a real
invoice it inherits due-date reminders, overdue flags and revenue reporting.
Charges can be reversed while that invoice is still unpaid.

A service is bookable only when both its category toggle
(`service_<category>_active`) and its own `is_active` flag are on.

See `docs/features/service_management_design.md`.

### Acceptance Criteria
- CCTV and parking status changes persist to DB and survive page refresh
- Service toggles persist to `system_settings` and immediately affect tenant portal visibility
- Catalog entries can be created, re-priced, deactivated and removed; removal soft-deletes when bookings reference the entry
- Booking price is re-derived server-side from the catalog; a forged client price is ignored
- Bookings inside a service lead time are rejected
- Completing a booking adds its cost to `invoices.services` exactly once, even if the request is replayed
- Multiple completed bookings in one month accumulate on a single invoice
- Completing with no active lease leaves the booking unbilled and retryable, never partially billed
- Reversal is refused once the invoice is paid, and the status change is refused with it

---

## Module 6: Notification

### What It Does
Keeps tenants and admin informed of important events through in-app notifications. SMS and email are built on a shared dispatcher and queue: SMS through Semaphore (live driver, go-live pending), email on the dry-run driver until SMTP is configured.

### Implementation Status
In-app notifications fully wired. SMS built (Semaphore — the only provider); email built on the `log` dry-run driver. Remaining: SMS go-live, SMTP, sweep-driven rent SMS, tenant SMS/email toggles, announcement channel selection.

---

### Notification Triggers

| Trigger | Recipient | Channel |
|---|---|---|
| Invoice generated | Tenant | In-app |
| Invoice overdue | Tenant | In-app |
| Application approved / rejected | Tenant | In-app |
| Maintenance status changed | Tenant | In-app |
| Announcement posted | All tenants | In-app + SMS/Email (per the building switches and tenant opt-outs) |
| Move-out request received | Admin | In-app |
| CCTV / Parking request status update | Tenant | In-app |
| Due date approaching (3–5 days before) | Tenant | In-app |

---

### 6.1 In-App Notification Center

**In scope:**
- `notifications` table: `user_id`, `title`, `message`, `type`, `is_read`, `created_at`
- TopBar bell shows live unread count from DB
- Notifications page: filter by read/unread; mark all read; individual delete
- Announcement creation auto-inserts notifications for all non-admin users

---

### 6.2 Due Date Reminders and Overdue Alerts

**In scope:**
- `check_due_date_reminders.php` — automatic countdown alerts before due date
- `send_payment_reminder.php` — admin-triggered or automated reminder dispatch
- Overdue alert with recurring in-app notifications and `PayBills.jsx` banner

---

### 6.3 SMS and Email Notifications (Built — SMS go-live pending)

**Current state** (details: `docs/features/sms_email_implementation.md`):
- Status endpoints, payment reminders and announcements dispatch SMS/email through `backend/api/services/send_notification.php` (queue + retries, quiet hours, opt-outs).
- SMS: `send_sms()` with the `log` dry-run driver and the live **Semaphore** driver — the only provider. Settings `sms_provider`, `sms_api_key`, `sms_sender_name`, `sms_sender_approved`, `sms_daily_cap` in Account Settings → Notifications.
- `announcements.channels` records the channels that actually reached someone; SMS and email go out only when ticked on the form (in-app always); a unit picker targets one unit; **Save draft** stores without notifying (fixed 2026-09-24).
- `notification_preferences` table and `get/update_notification_preferences.php` exist; `UserNotifications.jsx` saves in-app toggles only.

**Remaining for SMS:** Semaphore credits + key, `AMS` sender-name approval, the queue drain scheduled, and a verified live send.

**Remaining for Email (PHPMailer):**
- Install PHPMailer via Composer; set the SMTP credentials in Account Settings (`smtp_host`, `smtp_username`, `smtp_password`) and switch the email driver to SMTP
- Wire email into `forgot_password.php` (announcements already dispatch)

### Acceptance Criteria
- Every invoice generation creates an in-app notification for the tenant
- Every announcement automatically creates in-app notifications for all tenants
- Maintenance status changes create in-app notifications for the requesting tenant
- Unread notification count in TopBar bell is always DB-accurate

---

## Module 7: Communication (Two-Way Chat)

### What It Does
Enables direct messaging between admin and individual tenants. Also includes a formal complaints channel.

### Implementation Status
Fully designed — not yet built.

---

### 7.1 Planned Features

| Feature | Design Reference | Status |
|---|---|---|
| Admin to Tenant Messaging | `send_message.php`, `AdminChat.jsx` | Designed |
| Tenant to Admin Messaging | `TenantChat.jsx`, `start_conversation.php` | Designed |
| Conversation History | `get_messages.php`, `ChatWindow.jsx` | Designed |
| Unread Message Badge | `get_conversations.php` unread_count | Designed |
| Admin Inbox | `AdminChat.jsx` sidebar | Designed |
| New Message Notification | Triggers notification row on send | Designed |
| Complaints Management | Dedicated complaint channel and tracking | Designed |

---

## Module 8: Admin Dashboard & Reports

### What It Does
Gives the administrator a consolidated view of property operational status — occupancy, payments, maintenance, revenue streams, utility usage, and system activity.

### Implementation Status
Fully implemented and DB-backed (except demo data seed script).

---

### 8.1 KPI Statistics Cards

**In scope:**
- Total units, occupied units, vacant units, occupancy rate
- Active tenants count
- Monthly revenue (current month total from paid invoices)
- Pending maintenance requests count, pending application count, overdue invoices count

---

### 8.2 Income Reports and Charts

**In scope:**
- 6-month rolling income chart (`AdminDashboard.jsx`); full reports in `AdminReports.jsx`
- `AdminReports.jsx` fully wired to `get_report_data.php`
- Financial report: gross/net operating income, profit margin %, period comparisons (MoM/QoQ/YoY)
- Occupancy report; Maintenance cost report; Revenue stream analysis (Rent, Electricity, Water, Parking, Deposits) with diversification index
- Filter by month, quarter, or year; CSV and Print export

---

### 8.3 Utility Usage Tracking

**In scope:**
- `utility_readings` table; `AdminUtilities.jsx` and `UserUtilities.jsx`
- Water and electricity usage tracked per unit

---

### 8.4 System Activity Logs

**In scope:**
- `activity_logs` table: `category`, `action`, `details`, `performed_by`, `created_at`
- Every admin write calls `log_activity($conn, $admin_id, $type, $action, $detail)` — non-optional
- Viewable in `AdminActivityLogs.jsx` with date filter and search
- Read-only — not editable or deletable

### Acceptance Criteria
- Dashboard KPIs load from live DB data (not hardcoded)
- Income chart renders real monthly totals from `invoices`
- All admin mutations appear in activity logs within the same session

---

## Module 9: Contract & Document Management

### What It Does
Generates, stores, and manages lease contracts. Provides printable/downloadable contract for both admin and tenant.

### Implementation Status
Fully implemented and DB-backed.

---

### 9.1 Contract Generation and Lifecycle

**In scope:**
- Lease contract auto-generated on application approval; status: `Draft` → `Active` → `Expired`
- Admin can upload signed lease PDF (`signed_lease_path`) and notarized lease PDF (`notarized_lease_path`)
- Tenant views contract at `/view-contract` via `ViewContract.jsx` — wired to `lease_contracts` table via `get_my_contract.php`
- Bilingual support (Tagalog / English toggle in `ViewContract.jsx`)
- Printable via `@media print` CSS and `window.print()`

---

### 9.2 Eviction and Deposit Tracking

**In scope:**
- Eviction status tracking as a flag (`eviction_status`) on `lease_contracts`; legal process handled offline
- Security deposit deduction fields: `damage_deduction`, `utility_deduction`, `refund_amount`, `refund_date`

---

### 9.3 Lease Renewal

**In scope:**
- `extend_lease.php` processes lease extension requests; updated contract generated with new end date
- DB logic in `process_tenant_request.php`

### Acceptance Criteria
- Contract can be generated for any tenant with `Approved` status
- `ViewContract.jsx` displays actual signed/notarized document status from `lease_contracts`

---

## Module 10: Parking Reservation

### What It Does
Allows tenants to reserve parking slots with vehicle documentation. Admin assigns or rejects reservations.

### Implementation Status
Submission and listing wired; slot assignment management partially wired.

---

### 10.1 Tenant Parking Flow

**In scope:**
- Submit reservation with vehicle type, model, plate number, transmission, duration, OR/CR upload
- Check slot availability via `get_available_parking_slots.php`
- Cancel pending reservation from `UserMyRequests.jsx`

---

### 10.2 Admin Parking Management

**In scope:**
- `AdminParking.jsx` lists all reservations with approve/reject actions via `update_parking_status.php`
- Parking fee integration into monthly invoice (`invoices.parking`)

**Deferred:** Full slot inventory with hard capacity limit; automatic slot release on move-out

### Acceptance Criteria
- Parking reservation status persists to DB on admin action
- Approved parking fee appears as line item in next monthly invoice

---

## Module 11: Security & Access Control

### What It Does
Enforces role-based access at both the React route level and the PHP API level.

### Implementation Status
Fully implemented. See Security Requirements section for open pre-production items.

---

### 11.1 Role-Based Access Control (RBAC)

**In scope:**
- `AdminProtectedRoute` — only `role === 'admin'` can reach admin pages
- `TenantProtectedRoute` — approved+paid tenant (or admin) can access tenant service pages
- `verify_admin()` called on every admin PHP endpoint — returns 403 on failure
- Tenant endpoints scope data to `X-User-Id` — tenants cannot see other tenants' records

---

### 11.2 Password Management

**In scope:**
- `change_password.php` — current password verification required; bcrypt; minimum 8 characters
- `forgot_password.php` / `reset_password.php` — secure token flow, 30-min TTL

---

## Module 12: Visitor Management

### What It Does
Tracks all building visitors — pre-registered by tenants or logged on walk-in by admin — with overstay alert detection.

### Implementation Status
Fully implemented and DB-backed.

---

### 12.1 Visitor Log Entry

**In scope:**
- `check_in_visitor.php` records: visitor name, contact, ID type, ID number, Gov ID photo, host room, purpose, check-in timestamp
- `visitor_logs` table stores complete audit trail
- Admin logs walk-in visitors; tenants pre-register via `UserVisitors.jsx`

---

### 12.2 Tenant Pre-Authorization

**In scope:**
- Tenant submits visitor info via `UserVisitors.jsx` → status: `pending_approval`
- Admin reviews and approves before visitor arrives; visitor checked in with ID verification

---

### 12.3 Visitor History and Overstay Alerts

**In scope:**
- `get_visitors.php` — role-scoped query; filter by status, date, and unit
- Overstay threshold alerts surfaced to admin when visit duration exceeds configured limit
- Checkout timestamp recorded on visitor departure

### Acceptance Criteria
- Visitor log entry persists immediately and is visible to admin
- Overstay alert triggers when visit duration exceeds threshold
- Tenant can view history of all their pre-registered and approved visitors

---

## Non-Functional Requirements

### Performance

| ID | Requirement | Status |
|---|---|---|
| NFR-1.1 | Page load 2 seconds or less on standard broadband | Implemented |
| NFR-1.2 | Optimistic UI updates for mutations (toggle, approve/reject, status change) | Implemented |
| NFR-1.3 | Inline loading spinners during data fetches — never blocking entire page | Implemented |
| NFR-1.4 | `Promise.all` for parallel independent API calls | Implemented |

---

### Security Requirements

> Pre-production checklist from `docs/security_audit.md`. All **Critical** items must be resolved before any external pilot access.

#### Authentication & Access Control

| Check | Risk | Status |
|---|---|---|
| Change default admin password in DB | Admin account takeover | `[ ]` |
| Change MySQL `root` password on production | Full DB access without credentials | `[ ]` |
| Create least-privilege DB user (`ams_user`) | PHP breach exposes entire DB server | `[ ]` |
| All admin endpoints call `verify_admin()` | Tenants calling admin-only APIs | `[x]` |
| Rate limiting on `login.php` | Brute-force login attempts | `[x]` |

#### File Uploads

| Check | Status |
|---|---|
| Extension allowlist on all upload endpoints (jpg, jpeg, png, pdf) | `[x]` |
| `finfo_file()` MIME detection — not `$_FILES['type']` (client-supplied) | `[x]` |
| `.htaccess` blocking PHP execution in `backend/uploads/` | `[x]` |
| Upload directory permissions: `chown www-data` + `chmod 755` | `[ ]` |

#### Network & Transport

| Check | Status |
|---|---|
| HTTPS via Let's Encrypt (`certbot --apache`) | `[ ]` |
| HTTP to HTTPS redirect in Apache vhost | `[ ]` |
| CORS locked from `*` to exact production domain in `config.php` | `[ ]` |
| `Strict-Transport-Security` (HSTS) response header | `[ ]` |

#### Server & Configuration

| Check | Status |
|---|---|
| `display_errors = Off` and `log_errors = On` in `php.ini` | `[ ]` |
| Credentials moved to `config.env.php` (not committed to Git) | `[ ]` |
| `VITE_API_BASE_URL` env var replaces hardcoded `localhost` strings | `[ ]` |
| `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` headers | `[ ]` |

#### Input Validation

| Check | Status |
|---|---|
| Backend format validation for `contact_no` (PH mobile pattern) | `[x]` |
| Plate number length + alphanumeric check in `parking_reservation.php` | `[x]` |
| All SQL queries use `bind_param` prepared statements | `[x]` |

---

### Compatibility
- Desktop-first; responsive for tablet; mobile is secondary but acceptable
- Browsers: Chrome (latest), Edge (latest), Firefox (latest)
- Screen sizes: 1024px minimum primary; 768px secondary
- Currency displayed in Philippine Peso (PHP) with locale-aware formatting

### Accessibility
- Status badges use text labels, not color alone
- Form inputs have associated `<label>` elements
- All room images have descriptive alt text

### Reliability & Data Integrity
- Optimistic UI updates are reverted and error alerts shown on API failure
- Foreign key constraints with `ON DELETE CASCADE` or `ON DELETE SET NULL`
- DB transactions used where multiple tables are updated atomically (e.g., tenant approval)
- All admin mutations logged to `activity_logs`
- Migration policy: `ADD COLUMN IF NOT EXISTS` only — never drop columns

---

## Technical Specifications

### Frontend

| Item | Detail |
|---|---|
| Framework | React 19, Vite 8, React Router 7 (+ socket.io-client; Node.js Socket.IO chat server) |
| State | `useState` + `useEffect` — no Redux or Zustand |
| HTTP | Axios via `axiosConfig.js` — auto-injects `X-User-Id` and `X-Admin-Id` on every request |
| Styling | Custom CSS with utility classes |
| Storage | `sessionStorage` for `loggedInUser`; `localStorage` for notification preferences and system settings fallback cache |

### Backend

| Item | Detail |
|---|---|
| Language | PHP 8 (procedural, no framework — MySQLi direct) |
| API pattern | REST-like JSON; OPTIONS preflight handled for CORS |
| Shared utilities | `config.php` — provides `$conn`, `verify_admin()`, and `log_activity()` |
| Auth model | Stateless — `X-User-Id` / `X-Admin-Id` headers; no `$_SESSION` |
| CORS | Per-endpoint currently; must be centralized to `config.php` and locked to production domain before deployment |

### Database

| Item | Detail |
|---|---|
| Engine | MySQL / MariaDB 10 (XAMPP) |
| DB name | `ams_db` |
| Migration policy | `ADD COLUMN IF NOT EXISTS` only — never drop |
| Tables | 13 tables (see Database Table Reference) |

### Infrastructure

| Item | Detail |
|---|---|
| Dev | XAMPP (Apache + MariaDB) on localhost:8080; Vite dev server on port 5173 |
| Production | Shared PHP hosting (cPanel class) |
| File storage | `backend/uploads/<type>/` on server filesystem |
| Deployment | Manual — Vite build + upload `dist/`; PHP files uploaded as-is |

---

## External Services

| Service | Provider | Status | Key Setting |
|---|---|---|---|
| **Payment Gateway** | PayMongo (Sandbox to Live) | Implemented (Sandbox) | `paymongo_secret_key`, `paymongo_public_key`, `paymongo_webhook_secret` in `system_settings` |
| **Password Reset Email** | PHPMailer + SMTP | Dev bypass active | Must wire SMTP before production; remove `dev_token` response |
| **Announcement Email** | PHPMailer + SMTP | Built — `log` dry-run driver until SMTP is configured | `smtp_host`, `smtp_username`, `smtp_password`, `email_driver` in `system_settings` |
| **Announcement SMS** | Semaphore API (only provider) | Built — live driver, go-live pending | `sms_provider`, `sms_api_key`, `sms_sender_name`, `sms_sender_approved`, `sms_daily_cap` in `system_settings` |
| **Tenant Notification Preferences** | Internal | Backend wired (`notification_preferences`, global opt-outs); tenant UI saves in-app toggles only | SMS/email toggles in `UserNotifications.jsx` |

### PayMongo Integration Notes
- Webhook delivery requires Ngrok for local testing (`ngrok http 8080`)
- Webhook endpoint: `paymongo_webhook.php` — validates HMAC-SHA256 signature, marks invoice `paid`
- Admin configures keys in **Admin > Account Settings > Payment Gateway Integration**
- Production: switch radio from Sandbox to Live after business account verification; update webhook URL to production domain
- If keys are missing, checkout returns: `"PayMongo is not configured. Please contact administrator."`

### Password Reset (Dev Bypass)
- `forgot_password.php` detects `APP_ENV === 'development'` and returns `dev_token` in the JSON response
- The raw token is displayed in the React UI as a direct link for developer use
- **This `dev_token` response block must be removed before any external user accesses the system**

---

## Database Table Reference

| Table | Purpose | Key Columns / Notes |
|---|---|---|
| `users` | Auth and profile | `id`, `email_address` (UNIQUE), `password` (bcrypt), `role`, `avatar_url`, `is_archived` |
| `rent_applications` | Tenant lifecycle | `user_id` FK (nullable), `room_name` string ref to `rooms.id`, `status`, `rejection_reason`, `archive_*`, `requested_move_out_date` |
| `rooms` | Unit inventory | `id` (varchar letter-coded), `status`, `room_condition`, `furnishing_status`, `last_inspection_date`, `maintenance_flag` |
| `invoices` | Billing records | `id` (varchar `INV-...`), `user_id` FK, `rent_application_id` FK, `payment_reference`, `proof_of_payment_path`, `sender_name`, `status` (`pending`, `paid`, `overdue`, `pending-verification`), `late_fee`, `services` (add-on charges; accumulates, unlike `water`/`electricity` which are overwritten) |
| `lease_contracts` | Signed lease storage | `id` (varchar `LC-...`), `rent_application_id` FK, `deposit_status`, `damage_deduction`, `utility_deduction`, `refund_amount`, `refund_date`, `signed_lease_path`, `notarized_lease_path` |
| `maintenance_requests` | Repair tickets | `assigned_to`, `estimated_cost`, `work_notes`, `tenant_responsible`, `permission_to_enter`, `attachment_path` — all columns present in production schema |
| `cctv_requests` | CCTV footage requests | `user_id` FK nullable, `incident_date`, `incident_time`, `location_details`, `reason_request`, `status` |
| `parking_reservations` | Parking slots | `user_id` FK nullable, `vehicle_type`, `vehicle_model`, `plate_number`, `status` (`Pending`, `Assigned`, `Rejected`, `Cancelled`), `document_path` |
| `service_catalog` | Priced add-on services | `category` (`cleaning`, `laundry`, `other`), `name`, `price`, `pricing_unit` (`session`, `kg`, `hour`, `item`), `min_quantity`/`max_quantity`, `lead_time_days`, `is_active`, `sort_order` |
| `service_requests` | Add-on service bookings | `user_id` FK, `service_id` FK (`ON DELETE SET NULL`), snapshotted `service_name`/`category`/`unit_price`/`pricing_unit`, `quantity`, `total_cost`, `preferred_date`, `preferred_time_slot`, `status` (`Pending`, `Approved`, `In Progress`, `Completed`, `Rejected`, `Cancelled`), `is_invoiced`/`invoice_id`/`billing_period` |
| `announcements` | Broadcasts | `tag`, `channels` (JSON as longtext), `status`, `scheduled_date`, `recipient_count` |
| `notifications` | In-app alerts | `user_id` FK NOT NULL, `type` (`info`, `success`, `warning`, `action`), `is_read` |
| `activity_logs` | Admin audit trail | `category`, `action`, `details`, `performed_by` FK nullable |
| `system_settings` | Config key/value store | `setting_key` (UNIQUE), `setting_value` — stores PayMongo keys, SMS keys, SMTP keys, service toggles, maintenance budget, lease duration |
| `visitor_logs` | Building visitor records | `visitor_name`, `contact`, `id_type`, `id_number`, `gov_id_photo`, `host_room`, `purpose`, `check_in_at`, `check_out_at`, `status` |

---

## Implementation Status Summary

| Module | Features | Done | Partial | Designed | Total |
|---|---|---|---|---|---|
| 1. Tenant Management | 8 | 7 | 0 | 1 | 8 |
| 2. Unit Management | 7 | 7 | 0 | 0 | 7 |
| 3. Payment & Billing | 12 | 10 | 1 | 1 | 12 |
| 4. Maintenance Request | 10 | 9 | 1 | 0 | 10 |
| 5. Service Management | 5 | 2 | 3 | 0 | 5 |
| 6. Notification | 8 | 5 | 1 | 2 | 8 |
| 7. Communication (Chat) | 7 | 0 | 0 | 7 | 7 |
| 8. Dashboard & Reports | 8 | 7 | 0 | 1 | 8 |
| 9. Contract Management | 5 | 5 | 0 | 0 | 5 |
| 10. Parking Reservation | 4 | 2 | 2 | 0 | 4 |
| 11. Security & Access | 5 | 4 | 1 | 0 | 5 |
| 12. Visitor Management | 3 | 3 | 0 | 0 | 3 |
| **TOTAL** | **82** | **59** | **10** | **13** | **82** |

---

## Release Plan

### v1.0 — Shipped (Current State)
Core tenant, admin, payments, contracts, visitor management, and maintenance workflows are live and DB-backed.

**Remaining gaps (partially wired):**
- CCTV admin approval, parking slot assignment — wired but pending full testing
- Tenant notification on maintenance status update — in-app works; external channels pending
- Tenant notification preferences — UI toggles only; `notification_preferences` table not yet created

---

### v1.1 — SMS & Email Notification Activation

**Goal:** Wire SMS and email channels so they actually dispatch.

**Scope:**
- [ ] Configure PHPMailer SMTP in `system_settings` (the SMTP driver is built; PHPMailer is not installed)
- [x] Announcement email/SMS dispatch — via `dispatch_admin_action_broadcast()` — SMS and email go out only when ticked on the form (in-app always); a unit picker targets one unit; **Save draft** stores without notifying (fixed 2026-09-24)
- [x] Semaphore SMS driver — live; [ ] go-live (credits, sender approval, scheduled queue drain)
- [x] `notification_preferences` table + endpoints; [ ] SMS/email toggles in `UserNotifications.jsx` (in-app only today)
- [ ] Remove `dev_token` bypass from `forgot_password.php` and wire full email delivery

---

### v1.2 — Communication Module (Two-Way Chat)

**Goal:** Implement admin to tenant direct messaging and complaints channel.

**Scope:**
- `conversations`, `messages` tables
- `AdminChat.jsx`, `TenantChat.jsx`, `ChatWindow.jsx`
- `send_message.php`, `get_messages.php`, `start_conversation.php`, `get_conversations.php`
- Unread badge in TopBar

---

### v2.0 — Future Backlog (Post-Defense)

- Inquiry handling and reservation tracking (pre-application inquiries, waitlist)
- Lease expiration reminders triggered when fewer than 30 days remain
- Automated invoice generation (cron-triggered monthly billing)
- Application re-submission flow for rejected tenants
- Lease extension conflict detection when room has a competing pending applicant
- Targeted announcements to specific tenants instead of broadcast-all
- Auto-overdue invoice marking via scheduled job
- PayMongo Live mode switch (requires business account verification)
- Garbage collection schedule and house rules pages
- 360-degree room view on Preview page

---

## Open Questions

| No. | Question | Impact | Decision |
|---|---|---|---|
| Q1 | Should occupant count changes require admin approval? | Affects `update_occupants.php` flow | **Yes** (2026-09-16) — every occupant change is a tenant request approved by an admin |
| Q2 | How to handle lease extension when room already has a pending applicant? | Backend conflict check needed | |
| Q3 | Should the parking slot count be tracked as a hard inventory limit? | Needs counter in `system_settings` or a `parking_slots` table | |
| Q4 | Should the expenses field in reports be entered manually or auto-calculated? | Determines whether a separate `expenses` table is needed | **Both** (2026-09-16) — an `expenses` table with manual entry, added to the maintenance costs the report already derives |
| Q5 | Should multiple occupants in one unit share one login or have separate accounts? | Significant schema and billing impact | **One shared lease, one login** (2026-09-16) — the lease holder logs in; co-occupants are listed on a household roster with no accounts |
| Q6 | Should CCTV requests include a Data Privacy consent checkbox? | Required for DPA compliance in the Philippines | |
| Q7 | When should the `dev_token` password reset bypass be removed? | Must be removed before any public user access | |
| Q8 | Should PayMongo sandbox mode be switched to Live before pilot deployment? | Requires PayMongo business account verification | |

Details of the 2026-09-16 decisions are in [`docs/todo.md`](../docs/todo.md) (Account Management, Room & Occupancy, Unit Information, Reports, Open Questions).

---

## Appendix

### Why Each Module Is Needed

| Module | Core Justification |
|---|---|
| Authentication | Every other module requires identity; role separation prevents data leakage |
| Tenant Management | Tenant record is the anchor for billing, contracts, and maintenance; structured lifecycle prevents unit booking errors |
| Unit Management | Source of truth for availability; prevents double-booking; enables occupancy reporting |
| Rental Payment | Core revenue function; digital records replace paper receipts; overdue visibility prevents revenue loss |
| Maintenance Request | Formalizes a chat-based process; creates cost records, priority triage, and accountability |
| Service Management | Centralizes CCTV and parking workflows; modular toggles let admin control tenant features |
| Notification | Reduces admin-to-tenant communication burden; keeps tenants informed without manual follow-up |
| Communication | Provides a structured channel for admin-tenant dialogue and formal complaint tracking |
| Admin Dashboard | Aggregates all module data into one view; operational efficiency for the admin |
| Contract Management | Legal requirement for residential tenancy in PH; signed documents stored and accessible |
| Parking Reservation | Formalizes parking slot allocation; links to billing |
| Visitor Management | Security and audit trail for building access; overstay alerts protect tenants |

### What This System Deliberately Does Not Do (Current Version)

- **No automated invoice generation** — admin creates invoices manually; at current scale this takes minutes per month
- **No multi-building support** — single-building constraint drives all sizing decisions
- **No automated eviction processing** — system flags eviction status; legal action is handled offline
- **No 3D or 360-degree room tours** — static photos only in current version
- **No police clearance or employment certificate upload** — deferred to future additions

### Glossary

| Term | Definition |
|---|---|
| **Pending Review** | Application submitted; awaiting admin decision |
| **Approved** | Application accepted; room assigned; initial invoice generated; lease contract created |
| **Active tenant** | Approved and initial invoice paid; full portal access granted |
| **pending-move-out** | Tenant submitted move-out intent; admin action required to archive |
| **archived** | Tenant has moved out; record retained for history, never deleted |
| **pending-verification** | Invoice payment proof uploaded by tenant; awaiting admin confirmation |
| **TenantProtectedRoute** | Route guard requiring an approved and paid rent application |
| **Initial Invoice** | First invoice: 1 month advance + 1 month security deposit + base rent |
| **log_activity()** | PHP helper that writes every admin mutation to `activity_logs` |
| **X-User-Id / X-Admin-Id** | HTTP headers injected by `axiosConfig.js` for server-side identity verification |
| **verify_admin()** | PHP helper in `config.php` that returns 403 if `X-Admin-Id` header is missing or invalid |
| **paymongo_sandbox** | Payment gateway column value for gateway-paid invoices in sandbox mode |
| **ponytail** | Internal code quality discipline: YAGNI, minimum viable diff, no invented abstractions |
