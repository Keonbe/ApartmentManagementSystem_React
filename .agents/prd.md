# Product Requirements Document: Apartment Management System (AMS)

> **Version:** 2.0 - July 2026 (Defense Revision)
> **Stack:** React 18 + Vite (SPA) + PHP 8 API + MySQL / MariaDB 10 (XAMPP)
> **Dev URL:** `http://localhost:8080/ApartmentManagementSystem_React/`
> **Scale:** Single residential building · 14 units · 1 admin · up to 14 active tenants

---

## Product Overview

**Product Vision:**
A web-based apartment management system that replaces paper-based and spreadsheet-driven property operations with a single, structured digital portal. It serves two roles - a property administrator and registered tenants - covering the full lifecycle of a tenancy from initial application to move-out.

**The Problem Being Solved:**
Small apartment operators in the Philippines typically manage rent collection, maintenance follow-ups, and tenant documents through paper receipts, chat messages, and manual ledgers. This creates three concrete problems:
1. **Lost records** - paper receipts go missing; payment disputes have no source of truth.
2. **Admin overhead** - the landlord manually reminds every tenant each month, records payments by hand, and has no dashboard.
3. **Tenant opacity** - tenants do not know their billing breakdown, request status, or lease expiry until they ask.

AMS solves all three within the constraints of a single-building deployment.

**Target Users:**
- **Primary:** Building administrator / property manager (single account, non-technical)
- **Secondary:** Current tenants (up to 14 registered accounts)
- **Tertiary:** Prospective tenants (public-facing room preview only)

**Business Objectives:**
1. Digitize 100% of rent applications and monthly invoices - zero paper forms.
2. Give the admin a single screen to see occupancy, pending payments, and open maintenance tickets.
3. Give tenants self-service access to bills, requests, and notifications - reducing inbound admin messages.
4. Maintain an auditable trail for every payment, contract, and status change.

**Success Metrics:**
- All monthly invoices generated and settled in-system (no offline ledger needed)
- Admin can check any tenant payment status in 30 seconds or less
- Maintenance ticket status always reflects DB state (not lost on page refresh)
- Tenants can track their own requests without messaging the admin directly

---

## User Personas

### Persona 1: Maria - Property Administrator
- **Demographics:** 40 yrs, manages 14 units solo, low-to-moderate tech proficiency, uses smartphone + laptop
- **Goals:** Know who has paid, approve applications quickly, record maintenance work, generate monthly income summaries
- **Pain Points:** Forgetting which tenants are overdue, paper receipts getting lost, no unified view of repairs
- **Key Needs:** Dashboard overview, one-click payment settlement, maintenance status board, downloadable reports

### Persona 2: Juan - Current Tenant
- **Demographics:** 28 yrs, employed, moderate tech proficiency, primary device is smartphone
- **Goals:** Pay rent on time, know what he is being billed for, report problems and track progress, not miss announcements
- **Pain Points:** Not knowing the billing breakdown, chasing admin for request updates, losing paper receipts
- **Key Needs:** Itemized invoice view, request tracker, notification alerts, payment receipt

### Persona 3: Ana - Prospective Tenant
- **Demographics:** 24 yrs, looking for a unit, uses the system once to apply
- **Goals:** Browse available units, understand pricing, submit application with documents
- **Pain Points:** Not knowing which units are vacant, multi-document collection requirement
- **Key Needs:** Public room preview, simple application form, application status tracker

---

## System Modules

The system is organized into **6 core modules** plus authentication as a shared prerequisite.

---

## Module 0: Authentication and Access Control

### What It Does
Controls who enters the system and what they can see. Two roles exist: `admin` and `user` (tenant).

### Why It Is Needed
Without identity, any tenant could view another tenant's bills or approve their own application. Role separation is the foundation every other module depends on.

### What Is In Scope
- Email and password registration and login
- `loggedInUser` stored in `sessionStorage` (tab-scoped; clears on close)
- Role-based routing: admin to `/admin-dashboard`; user to `/home`
- Three route guard levels: public, tenant-only, admin-only
- Profile edit (name, contact number, avatar) and password change

### What Is Explicitly Out of Scope
- Social login - unnecessary overhead for a known user base
- Multi-admin accounts - single building, single operator
- Email verification on registration - added friction for a small closed system
- Forgotten password email reset - handled manually by admin at this scale

### Acceptance Criteria
- Unregistered users cannot access any protected route
- Admin PHP endpoints return 403 if `X-Admin-Id` header is missing or invalid
- Tenants with no approved application are redirected to `/track-application`

---

## Module 1: Tenant Management

### What It Does
Manages the lifecycle of a tenant from initial application through active tenancy to move-out and archival.

### Why It Is Needed
The admin's core job is knowing who lives in which unit, since when, and under what terms. Without a structured tenant record, billing, contracts, and maintenance all lose their anchor. At 14 units this is manageable manually - but any missed status transition (e.g., forgetting to mark a vacated unit as available) has a direct revenue cost.

---

### 1.1 Tenant Registration and Application

**What:** Multi-step rent application form submitted by a logged-in prospective tenant.

**Why:** Replaces paper forms and walk-in document submissions. Documents are stored digitally so admin can review without a physical meeting.

**In scope:**
- Applicant personal details (name, contact, gender, occupant count)
- Room selection from available vacant units
- Document uploads: Valid ID front/back, NBI Clearance
- Application submitted as `Pending Review`; admin notified in-app

**Out of scope:**
- Background check integration (done offline by admin after reviewing documents)
- Application fee payment at this stage (deposit collected after approval)

---

### 1.2 Tenant Profile and History

**What:** Persistent tenant record showing personal details, linked room, lease dates, and document history.

**Why:** Admin needs a single place to look up any tenant's full record without digging through folders or chat history.

**In scope:**
- View and edit profile (name, contact, avatar)
- View uploaded verification documents (ID, NBI)
- Occupancy record: room assigned, move-in date, lease start and end
- Tenant list and status visible by admin in `AdminTenants`

---

### 1.3 Move-In Tracking

**What:** When admin approves a rent application, the room is automatically marked `Occupied`, lease dates are written to the `rooms` table, and the initial invoice is generated.

**Why:** The approval event is the single trigger for three downstream actions: room status update, invoice creation, and portal access grant. Automating it prevents admin from forgetting a step.

**In scope:**
- `update_tenant_status.php` handles all three writes atomically on Approve
- Initial invoice = 1 month advance + 1 month security deposit + base rent

---

### 1.4 Move-Out Tracking

**What:** Tenant submits a move-out intent from their dashboard; admin confirms and archives the record.

**Why:** Without a formal move-out step, vacated units stay marked `Occupied` and new applications cannot be assigned. The system needs a trigger to free the unit.

**In scope:**
- "Request Move-Out" button/modal in `MyRoom.jsx` sets `status = 'pending-move-out'`
- Admin sees `pending-move-out` flag highlighted in `AdminTenants`
- Admin archives tenant and unit status is set back to `Vacant`
- Archive stores reason, date, and notes for history

---

### 1.5 Document Upload

**What:** File uploads attached to rent applications and stored server-side.

**Why:** NBI Clearance and Valid ID are legal requirements for tenancy. Storing them digitally means admin can verify remotely and reference them later if needed.

**In scope:**
- JPEG, PNG, or PDF uploads for Valid ID front and back, and NBI Clearance
- Files stored in `backend/uploads/` organized by document type
- Admin document preview modal in `AdminApplications` and `AdminTenants`

**Out of scope:**
- Police Clearance, Proof of Billing, employment certificate - future additions
- OCR or automated document validation - no automated ID verification at this scale

### Acceptance Criteria
- Application status transitions: `Pending Review` + `Approved` + active + `pending-move-out` + `archived`
- Approved application auto-assigns room and generates initial invoice
- Archived tenant record is never deleted - only status changes

---

## Module 2: Unit Management

### What It Does
Tracks all 14 physical units - their type, floor, price, current status, occupant, and lease history.

### Why It Is Needed
Unit availability is the source of truth for accepting new applications. If the system does not know a unit is `Occupied`, admin could accidentally assign it to two tenants. At 14 units the risk is low but the cost of a double-booking error is high.

---

### 2.1 Room Availability and Status Monitoring

**What:** A grid and list view of all units with live status badges.

**Why:** Admin needs a single glance to know how many units are vacant vs. occupied vs. under maintenance - to answer "do we have a unit available?" without opening individual records.

**In scope:**
- Status values: `Vacant`, `Occupied`, `Maintenance`
- Grid view (visual) and list view (dense) toggle in `AdminUnits`
- Filter by unit type (Studio, 1BR), floor, and status
- Unit preview displays layout pictures/static photos of the unit, explicitly excluding 3D room tours or VR walkthroughs to match deployment scale
- `Maintenance` flag prevents new assignment during active repair

---

### 2.2 Unit Detail and Occupancy Record

**What:** Per-unit modal showing full details, current tenant, lease dates, and occupancy history.

**Why:** Admin needs to know not just the current occupant but who lived there previously - useful for move-out disputes and damage assessment.

**In scope:**
- Current tenant name, lease start and end, monthly rent
- Occupancy history showing previous tenants and their periods
- Maintenance flag toggle to mark unit as temporarily unavailable

---

### 2.3 Lease Extension

**What:** Admin can extend a tenant's lease end date from the unit detail modal. Tenant can also request extension from `MyRoom.jsx`.

**Why:** Lease renewals are the most common admin operation after payment collection. A form-based extension prevents date errors and logs the change automatically.

**In scope:**
- Admin extends lease from `AdminUnits` detail modal
- Tenant extends lease from `MyRoom.jsx` (no separate admin approval step in v1)
- New end date written to `rooms.lease_end` and `rent_applications`

**Out of scope (deferred to v2):**
- Conflict detection when room already has a pending application from another tenant
- Lease extension history tab

---

### 2.4 Occupancy Tracking

**What:** Tracks the number of people living in a unit.

**Why:** Utility billing (e.g., water) may scale with occupants. Admin also needs this for building capacity awareness.

**In scope:**
- Occupant count field per unit, editable by admin
- Tenant can update occupant count from `MyRoom.jsx` (self-service; no approval gate in v1)

### Acceptance Criteria
- Only `Vacant`-status units can be assigned to a new approved application
- Lease extension writes to DB and is visible immediately on page refresh
- Unit status automatically becomes `Occupied` on tenant approval and `Vacant` on archive

---

## Module 3: Rental Payment

### What It Does
Manages the full billing cycle: generating monthly invoices, recording payments, showing receipts, and flagging overdue balances.

### Why It Is Needed
Payment tracking is the most critical operational function of any landlord. Missed rent equals lost revenue. Without a system, the admin tracks payments in a notebook or messaging app - both of which make it easy to miss an overdue tenant or miscalculate a balance.

---

### Payment Terms and Billing Structure

These are fixed business rules embedded in the system:

| Line Item | Description | When Generated |
|---|---|---|
| **Security Deposit** | 1 month rent, refundable | Initial invoice only (on application approval) |
| **1 Month Advance** | 1 month rent prepaid | Initial invoice only (on application approval) |
| **Base Rent** | Monthly unit rent, set per room | Monthly recurring invoice |
| **Water** | Metered or flat-rate charge | Monthly recurring invoice |
| **Electricity** | Metered or flat-rate charge | Monthly recurring invoice |
| **Parking** | Fixed monthly fee if slot reserved | Monthly recurring invoice (if applicable) |

---

### 3.1 Monthly Invoice Generation

**What:** Admin creates a monthly invoice per tenant with the itemized breakdown above.

**Why:** Each tenant's bill is unique (different room rate, different utility usage, parking or not). A generated invoice creates an immutable record of what was charged and when.

**In scope:**
- Admin generates invoice from `AdminPayments` per tenant
- Invoice contains: base rent, water, electricity, parking, billing period, due date
- Invoice ID format: `INV-<unique>` (stored as varchar)
- Status values: `pending`, `paid`, `overdue`

---

### 3.2 Payment Recording - Three Methods

**What:** Tenant selects a payment method and marks the invoice as paid. Admin can also record payment manually.

**Why:** The three accepted methods - GCash, Cash on Hand, Bank Transfer - are all offline. No payment gateway. The system records the acknowledgement, not the actual money transfer. This is sufficient for a trusted landlord-tenant relationship at small scale.

**In scope:**
- Tenant selects GCash, Cash on Hand, or Bank Transfer and submits; invoice marked `paid`
- Admin records manual payment from `AdminPayments` and marks invoice `paid`
- Payment method stored on the invoice record

**Why no payment gateway:**
At 14 tenants, the integration cost and maintenance overhead of a payment gateway (GCash API, PayMongo, etc.) exceeds the benefit. The current model trusts that the tenant has already transferred - the same way a text acknowledgement works. This is a deliberate scope decision for this scale.

---

### 3.3 Payment History and Receipts

**What:** Tenant can view all past invoices and open a receipt modal per invoice.

**Why:** Tenants frequently lose paper receipts. A digital receipt accessible 24/7 reduces admin support requests to zero.

**In scope:**
- `UserPaymentHistory` lists all invoices with status badges
- Receipt modal: billing period, all line items, payment method, paid date
- Admin views per-tenant invoice history in `AdminPayments`

---

### 3.4 Balance Monitoring and Overdue Flags

**What:** Invoices past their due date are flagged `overdue`. Admin sees a visual alert in the payments panel.

**Why:** The admin's biggest operational risk is a tenant going multiple months without paying. An overdue flag surfaced in the UI creates a prompt to act.

**In scope:**
- `due_date` stored on every invoice
- Overdue flag shown as badge in `AdminPayments` and `AdminDashboard`
- Manual admin check - at 14 tenants the admin can review weekly

**Out of scope:**
- Automated cron script to mark invoices overdue - admin does this on-demand at this scale

---

### 3.5 Due Date Reminders

**What:** In-app notification created when an invoice is generated, so tenant is informed of the due date.

**Why:** Tenants forget due dates. A reminder reduces late payments without the admin needing to message individually.

**In scope:**
- In-app notification created when admin generates invoice (due date included in message body)
- Tenant sees notification in bell icon and `/notifications` page

**Out of scope (deferred):**
- Automated N-day-before reminder (requires a scheduler)
- SMS or email reminders for overdue invoices - see Module 5

---

### 3.6 Payment Proof Upload and Reference Number - Priority E

**What:** Tenant uploads a screenshot or file proving payment transfer, with a reference number.

**Why:** For GCash and bank transfer, the admin cannot verify payment without seeing the transaction screenshot. Adding a reference field and upload creates a verifiable paper trail inside the system.

**In scope (next release):**
- `payment_reference VARCHAR(100)` and `proof_of_payment_path` added to `invoices` table
- File upload field in `PayBills.jsx` stored via `upload_payment_proof.php`
- Visible in receipt modal and admin payment view

### Acceptance Criteria
- Initial invoice auto-generated on application approval (not manually created)
- Paying an invoice marks it `paid` and timestamps `paid_at`
- Overdue invoices are visually distinct from pending ones in all views
- Receipt modal shows full itemized breakdown with method and date

---

## Module 4: Maintenance Request

### What It Does
Allows tenants to formally report repair issues, track resolution, and allows admin to manage the repair workflow with status, assignee, and cost.

### Why It Is Needed
Maintenance is the second most common interaction between landlord and tenant (after rent). Without a structured request, problems are reported via chat messages, get forgotten, and lead to disputes. A ticket system creates accountability: the tenant knows their issue was received; the admin has a record of every repair with its cost.

---

### Issue Classification

**Issue Types:**

| Category | Examples |
|---|---|
| Plumbing | Leaking pipe, clogged drain, broken faucet, toilet issue |
| Electrical | No power outlet, faulty wiring, tripped breaker, lighting failure |
| Structural / Physical | Cracked wall, broken door or window, damaged ceiling, flooring |
| Water Supply | No water, low water pressure, water discoloration |
| General | Pest control, cleaning, furniture damage, locks |
| Others | Anything not covered by the above categories |

**Priority Levels:**

| Level | Meaning | Expected Response |
|---|---|---|
| Low | Minor inconvenience; not urgent | Within the week |
| Medium | Affects comfort; should be addressed soon | Within 2 to 3 days |
| High | Affects habitability | Within 24 hours |
| Urgent | Safety risk: flooding, no power, structural hazard | Immediate |

**Why priority matters:** Admin cannot respond to every ticket instantly at 14 units. Priority levels allow triage - handle the flooded unit before the squeaky door.

---

### 4.1 Request Submission (Tenant)

**In scope:**
- Issue category (dropdown: Plumbing, Electrical, Structural, Water Supply, General, Others)
- Description of the problem (free text, required)
- Location or unit detail (pre-filled from tenant's assigned room; editable for common areas)
- Priority level (Low, Medium, High, Urgent)
- Preferred schedule: date and time
- Photo attachment (optional JPEG or PNG) - visual evidence accelerates diagnosis
- Submitted as `status = Pending`; stored to DB with timestamp and `user_id`

---

### 4.2 Request Tracking (Tenant)

**In scope:**
- `/my-requests` page lists all submitted requests with current status badge
- Tenant can cancel a `Pending` request
- Date reported shown; date resolved shown once status becomes Completed
- Tenant receives in-app notification on status change

---

### 4.3 Admin Maintenance Management

**In scope:**
- Kanban board: `Pending | In Progress | Approved | Completed | Cancelled`
- Admin assigns technician name to a ticket (`assigned_to` column)
- Admin records estimated or actual cost (`estimated_cost` column)
- Admin adds work notes (`work_notes` column) - what was done, materials used
- Status changes persist to DB - this is Priority A; currently in-memory only
- Timestamps: `created_at` for date reported; resolved timestamp when marked Completed

**Why Kanban at 14 units:** Even with few tickets, visual status grouping is faster than a table for a non-technical admin who needs to see what is still open at a glance.

---

### 4.4 Schema Migration Required (Priority A)

The following columns must be added to `maintenance_requests` before admin writes can be persisted:

```sql
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS work_notes TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tenant_responsible TINYINT(1) DEFAULT 0;
```

### Acceptance Criteria
- Maintenance ticket stored to DB on submission and survives page refresh
- Admin status change (Pending to In Progress to Completed) persists to DB immediately
- Date reported equals `created_at`; date resolved equals timestamp set when status becomes Completed
- Tenant can view the current status of every ticket they submitted

---

## Module 5: Notification

### What It Does
Keeps tenants and admin informed of important events without requiring them to manually check every page.

### Why It Is Needed
At 14 tenants, the admin cannot individually message each person every time an invoice is due, a request is updated, or an announcement is posted. Automated in-app notifications reduce this overhead to zero. Tenants benefit because they do not need to log in daily - the bell icon tells them something needs attention.

---

### Notification Triggers

| Trigger | Recipient | Message |
|---|---|---|
| Invoice generated | Tenant | Your bill for [month] is ready. Due: [date] |
| Invoice overdue | Tenant | Your [month] payment is overdue |
| Application approved | Tenant | Your application has been approved |
| Application rejected | Tenant | Your application was not approved |
| Maintenance status changed | Tenant | Your maintenance request is now [status] |
| Announcement posted | All tenants | [Announcement title] |
| Move-out request received | Admin | Tenant [name] has submitted a move-out request |

---

### 5.1 In-App Notification Center

**What:** Bell icon in the top navigation bar with unread count; full notification history page.

**Why:** In-app is the baseline and only reliable channel requiring no external service, no cost, and no configuration. It is the floor on which SMS and email are built later.

**In scope:**
- `notifications` table: `user_id`, `title`, `message`, `type`, `is_read`, `created_at`
- TopBar bell shows unread count loaded live from DB
- Notifications page: filter by read or unread; mark all read; individual delete
- Announcement creation auto-inserts notifications for all non-admin users

---

### 5.2 SMS and Email Notifications

**Why it is in the PRD:**
The defense panel flagged SMS and email as a required communication channel. In the Philippines, SMS remains the most reliable reach channel for non-technical users - if the tenant is not logged in, in-app notifications are invisible.

**Why it is deferred (not in current scope):**
- SMS requires a gateway such as Semaphore or Globe Labs API with per-message cost
- Email requires SMTP configuration via PHPMailer or similar
- At 14 tenants, the operational cost of implementing and maintaining both channels is disproportionate to the scale during the development phase
- The `announcements.channels` field already stores `["in-app", "sms", "email"]` as a JSON string - the data model is ready; only the delivery service needs to be wired

**What is needed to enable SMS and email (future v2):**
- Configure SMTP credentials in `system_settings` (keys: `smtp_host`, `smtp_user`, `smtp_pass`)
- Integrate Semaphore or similar PH SMS gateway (keys: `sms_api_key`, `sms_sender_id`)
- Add `send_notification_external()` helper in `config.php`
- Trigger from `create_announcement.php` and invoice generation endpoints

**Current acceptable alternative:**
Admin uses the Announcements module to broadcast messages that create in-app notifications for all tenants. For urgent individual matters, the admin sends an SMS manually - acceptable at 14 tenants.

### Acceptance Criteria
- Every invoice generation creates an in-app notification for the tenant
- Every announcement automatically creates in-app notifications for all tenants
- Maintenance status changes create in-app notifications for the requesting tenant
- Unread notification count in TopBar bell is always accurate and DB-backed

---

## Module 6: Admin Dashboard

### What It Does
Gives the administrator a single, consolidated view of the property's operational status - without requiring navigation through individual module pages.

### Why It Is Needed
The admin's first action each session should answer: who has not paid, what is broken, and how many units are occupied. A dashboard that answers these questions in seconds saves the admin from opening five different pages. At 14 units this is convenient; the structured habit is worth establishing now.

---

### 6.1 KPI Statistics Cards

**What:** Key numbers shown at the top of the dashboard.

**Why:** Immediate situational awareness without additional navigation.

**In scope:**
- Total units, occupied units, vacant units
- Active tenants count
- Monthly income (current month total from paid invoices)
- Pending maintenance requests count
- Pending application count
- Overdue invoices count

---

### 6.2 Income Reports and Charts

**What:** 6-month rolling income chart; monthly and yearly report views in `AdminReports`.

**Why:** The admin needs to see income trends to know if the building is performing. A chart makes patterns visible - three months of declining collection signals a problem to address.

**In scope:**
- Bar or line chart of monthly income from `invoices` (paid, grouped by month)
- `AdminReports` page: Financial report (income vs. billing), Occupancy report, Maintenance cost report
- Report intervals: Generates summaries on a monthly, quarterly, and yearly basis
- Filter by month, quarter, or year
- Data from `get_report_data.php` (fully wired)

---

### 6.3 Tenant Monitoring

**What:** Recent tenant activity and status changes visible on dashboard.

**Why:** Admin needs to know about pending applications and move-out requests without opening `AdminTenants`.

**In scope:**
- New Tenants feed on dashboard (recently approved)
- Pending application count badge on sidebar and dashboard
- `pending-move-out` status flagged prominently in `AdminTenants`

---

### 6.4 Maintenance Monitoring

**What:** Open maintenance request count surfaced on dashboard.

**Why:** An unresolved urgent ticket is a liability. Surfacing it on the dashboard means it cannot be overlooked.

**In scope:**
- Open maintenance requests count on dashboard KPI card
- Full Kanban board in `AdminMaintenance`
- Status changes persist to DB (Priority A - currently in-memory only)

---

### 6.5 System Activity Logs

**What:** Timestamped record of every admin action - who did what, and when.

**Why:** Even with a single admin, audit logs matter for accountability and debugging. Why did a unit become Vacant last Tuesday? The logs answer it.

**In scope:**
- `activity_logs` table: category, action, detail, performed_by, created_at
- Every admin write calls `log_activity($conn, $admin_id, $type, $action, $detail)`
- Viewable in `AdminActivityLogs` with date filter
- Read-only - not editable or deletable by admin

---

### 6.6 Contract Generation

**What:** Admin generates a lease contract from an approved application, uploads signed and notarized versions, and tracks eviction status.

**Why:** A written lease is a legal requirement for residential tenancy in the Philippines. The system should store the contract record and signed documents so both parties have a retrievable reference.

**In scope:**
- Generate contract record from an approved `rent_application`
- Upload signed lease PDF (`signed_lease_path`)
- Upload notarized lease PDF (`notarized_lease_path`)
- Contract status values: `active`, `expired`, `eviction-pending`
- Eviction status tracking as a flag - legal process is handled offline
- Tenant views their contract at `/view-contract` (Priority C: currently reads room data; to be wired to `lease_contracts` table)

### Acceptance Criteria
- Dashboard KPIs load from live DB data (not hardcoded)
- Income chart renders real monthly totals from `invoices`
- All admin mutations appear in activity logs within the same session
- Contract can be generated for any tenant with `Approved` status

---

## Non-Functional Requirements

### Performance
- Page load: 2 seconds or less on localhost; 4 seconds or less on shared hosting
- API response: 500ms or less per endpoint under normal load (1 to 15 concurrent users)
- Concurrent users: 1 admin plus up to 14 tenants - no high-concurrency architecture needed

### Security
- Authentication: Role enforced at both React route level and PHP endpoint level
- Authorization: `verify_admin()` on every admin endpoint; `X-User-Id` validated on tenant endpoints
- Data protection: Passwords hashed; document uploads stored outside webroot where possible
- Audit: Every admin mutation logged - `log_activity()` is non-optional

### Compatibility
- Devices: Desktop-first; responsive for tablet; mobile is secondary but acceptable
- Browsers: Chrome (latest), Edge (latest), Firefox (latest)
- Screen sizes: 1024px minimum primary; 768px secondary

### Accessibility
- Status badges use text labels, not color alone
- Form inputs have associated `<label>` elements
- All room images have descriptive alt text

---

## Technical Specifications

### Frontend
- Framework: React 18, Vite 5, React Router 6
- State: `useState` and `useEffect` - no Redux or Zustand (single-concern pages at this scale do not need global state)
- HTTP: Axios via `axiosConfig.js` - auto-injects `X-User-Id` and `X-Admin-Id` headers on every request
- Styling: Custom CSS with utility classes

### Backend
- Language: PHP 8 (procedural, no framework - MySQLi direct)
- Why no framework: At 40 endpoints and one developer, a framework adds boot overhead and learning curve without meaningful benefit. Raw PHP is readable, fast, and already in place.
- API pattern: REST-like JSON; OPTIONS preflight handled for CORS
- Shared utilities: `config.php` provides `$conn`, `verify_admin()`, and `log_activity()`

### Database
- Engine: MySQL / MariaDB 10 (XAMPP)
- DB name: `ams_db`
- Migration policy: `ADD COLUMN IF NOT EXISTS` only - never drop columns
- 12 tables: `users`, `rooms`, `rent_applications`, `maintenance_requests`, `cctv_requests`, `parking_reservations`, `invoices`, `lease_contracts`, `announcements`, `notifications`, `activity_logs`, `system_settings`

### Infrastructure
- Dev: XAMPP (Apache + MariaDB) on localhost
- Production: Shared PHP hosting (cPanel class)
- File storage: `backend/uploads/<type>/` on server filesystem
- Deployment: Manual (Vite build + upload dist; PHP files uploaded as-is)

---

## Release Plan

### v1.0 - Shipped (Current State)
Core tenant and admin workflows are live and DB-backed.

**Gaps remaining in v1.0:**
- `AdminMaintainance.jsx` - status writes are in-memory only (lost on page refresh) + Priority A
- `AdminServicePage.jsx` - CCTV and parking approval is fully mocked + Priority A
- `ViewContract.jsx` - reads from room data, not `lease_contracts` table + Priority C
- No payment proof upload or reference number field + Priority E

---

### v1.1 - Priority A: DB Wiring for Maintenance and Services

**Goal:** Eliminate all mock data. Every status change must persist to DB.

**Scope:**
- `get_maintenance_requests.php` and `update_maintenance_status.php`
- Schema: add `assigned_to`, `estimated_cost`, `work_notes` to `maintenance_requests`
- `get_cctv_requests.php` and `update_cctv_status.php`
- `get_parking_reservations.php` and `update_parking_status.php`
- Refactor `AdminMaintainance.jsx` - remove `initialRequests` array
- Refactor `AdminServicePage.jsx` - remove mock arrays

**Done when:** Admin refreshes the page after changing a maintenance status and sees the change still there.

---

### v1.2 - Priority C and E: Contract View and Payment Proof

- `get_my_contract.php` to wire `ViewContract.jsx` to the `lease_contracts` table
- `payment_reference` and `proof_of_payment_path` added to `invoices`
- `upload_payment_proof.php` endpoint
- File upload field in `PayBills.jsx` and `TrackApplication.jsx`

---

### v2.0 - Future Backlog (Post-Defense)

- SMS and email notification delivery via Semaphore gateway and PHPMailer SMTP
- Automated rent due reminders on login or via scheduled check
- Lease expiration reminders triggered when fewer than 30 days remain before lease end
- Application re-submission flow for rejected tenants
- Lease extension conflict detection when room has a competing pending application
- Targeted announcements to specific tenants instead of broadcast-all
- Payment proof admin verification before marking invoice paid
- Auto-overdue invoice marking via cron or on-login check

---

## Open Questions

| No. | Question | Impact |
|---|---|---|
| Q1 | Should occupant count changes require admin approval? | Affects `update_occupants.php` flow |
| Q2 | How to handle lease extension when room already has a pending applicant? | Backend conflict check needed |
| Q3 | Should maintenance status changes auto-notify tenants in-app? | Simple notification insert on every `update_maintenance_status.php` call |
| Q4 | Should the parking slot count be tracked as an inventory limit? | Needs counter in `system_settings` or a `parking_slots` table |
| Q5 | Should the expenses field in reports be entered manually or auto-calculated? | Determines whether a separate `expenses` table is needed |
| Q6 | Should multiple occupants in one unit share one login or have separate accounts? | Significant schema and billing impact |
| Q7 | Is CCTV footage physically delivered to the tenant or just approved in-system? | Approval flow is built; physical delivery method is out of scope |

---

## Appendix

### Why Each Module Is Needed

| Module | Core Justification |
|---|---|
| Authentication | Every other module requires identity; role separation prevents data leakage between tenants and admin |
| Tenant Management | Tenant record is the anchor for billing, contracts, and maintenance; structured lifecycle prevents unit booking errors |
| Unit Management | Source of truth for availability; prevents double-booking; enables occupancy reporting |
| Rental Payment | Core revenue function; digital records replace paper receipts; overdue visibility prevents revenue loss |
| Maintenance Request | Formalizes a previously chat-based process; creates cost records, priority triage, and accountability |
| Notification | Reduces admin-to-tenant communication burden; keeps tenants informed without manual follow-up |
| Admin Dashboard | Aggregates all module data into one view; operational efficiency for a solo admin managing 14 units |

### What This System Deliberately Does Not Do

- **No payment gateway** - offline payment methods at small scale are cheaper and simpler than integration cost
- **No SMS or email in v1** - in-app notification covers the use case; external channels added when scale justifies cost
- **No multi-building support** - single-building constraint drives all sizing decisions
- **No multi-admin accounts** - one operator, one account
- **No automated invoice generation** - admin creates invoices manually; at 14 tenants this takes minutes per month
- **No automated eviction processing** - system flags eviction status; legal action is handled offline

### Database Table Reference

| Table | Purpose | Key Status |
|---|---|---|
| `users` | Auth and profile | Fully wired |
| `rent_applications` | Tenant lifecycle | Fully wired |
| `rooms` | Unit inventory | Fully wired |
| `maintenance_requests` | Repair tickets | Missing: assigned_to, cost, notes; writes currently in-memory |
| `cctv_requests` | CCTV access requests | Admin view fully mocked |
| `parking_reservations` | Parking slots | Admin view fully mocked |
| `invoices` | Billing records | Wired; missing: reference and proof_path |
| `lease_contracts` | Signed lease storage | Admin wired; tenant view reads wrong table |
| `announcements` | Broadcasts | Fully wired |
| `notifications` | In-app alerts | Fully wired |
| `activity_logs` | Admin audit trail | Fully wired |
| `system_settings` | Config key/value store | Fully wired |

### Glossary

| Term | Definition |
|---|---|
| **Pending Review** | Application submitted; awaiting admin decision |
| **Approved** | Application accepted; room assigned; initial invoice generated |
| **Active tenant** | Approved and initial invoice paid; full portal access granted |
| **pending-move-out** | Tenant submitted move-out intent; admin action required to archive |
| **archived** | Tenant has moved out; record retained for history, never deleted |
| **TenantProtectedRoute** | Route guard requiring an approved and paid rent application |
| **Initial Invoice** | First invoice: 1 month advance + 1 month security deposit + base rent |
| **Priority A through E** | Internal sprint priority labels for remaining development backlog |
| **log_activity()** | PHP helper that writes every admin mutation to `activity_logs` |
| **X-User-Id / X-Admin-Id** | HTTP headers injected by `axiosConfig.js` for server-side identity verification |
| **ponytail** | Internal code quality discipline: YAGNI, minimum viable diff, no invented abstractions |
