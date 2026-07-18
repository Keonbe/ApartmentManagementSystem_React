# AMS — Development Todo

---

## Account Management

* [x] Add **middle name** field during registration.
* [x] Allow users to **preview uploaded profile images/documents** before submission.
* [x] Support **retake image** functionality before upload.
* [x] Add **Notification Center** for all user notifications (DB-backed).
  * [x] Notification page with history, filters, read/unread, and delete.
  * [x] TopBar notification bell reads live from `notifications` table.
  * [x] Creating an announcement auto-creates notifications for all tenants.
* [ ] Clarify and enforce password reset/change policy.
  * Maximum number of password changes?
  * Cooldown period between resets?

---

## Registration & Application

* [x] Submit rent application with file uploads (Valid ID front/back, NBI Clearance).
* [x] Store `user_id` FK on `rent_applications` when submitting application.
* [x] Track application status via `/track-application` page with pending invoice payment.
* [ ] Add application re-submission or update flow (if rejected, allow user to fix and resubmit).
* [ ] Validate all input fields with min/max limits (plate numbers, contact numbers, etc.).

---

## Room & Occupancy

* [x] DB-backed rooms via `rooms` table (14 seeded units).
* [x] `AdminUnits` reads and writes rooms from DB via `get_rooms.php` / `update_room.php`.
* [x] Room occupancy history and lease history modals in `AdminUnits`.
* [x] Syncing `rooms.tenant_name` / `lease_start` / `lease_end` from approved applications.
* [ ] Define occupant change workflow:
  * User requests an occupant count change (form in `MyRoom.jsx`).
  * Admin approval step before count is updated.
* [ ] Support multiple user accounts linked to a single room.
  * Example: 3 occupants = 3 separate accounts under one unit.
* [ ] Add occupancy Terms & Conditions:
  * Shared occupancy responsibilities.
  * Separation of occupants.
  * Replacement procedures.
* [ ] Lease extension history tab in `AdminUnits` detail modal.
* [ ] Configurable minimum lease duration (default: 3 months — currently enforced at 6 months in `AdminUnits`).

---

## Reservation & Lease

* [x] Lease extension via `extend_lease.php` from `MyRoom.jsx`.
* [x] Admin can extend lease from `AdminUnits` detail modal.
* [ ] Handle lease extension conflicts:
  * When current tenant requests extension but room is already reserved.
  * Backend should check for a pending `rent_application` for the same room.
* [ ] Send lease expiration reminders:
  * Check lease end date on login; insert a notification if < 30 days remaining.
  * Display a reminder banner on `MyRoom.jsx` when lease is expiring soon.
* [ ] Define minimum and maximum rental duration settings.

---

## Payment

* [x] Initial lease payment (advance + security deposit) via `TrackApplication.jsx`.
* [x] Monthly bill payment via `PayBills.jsx` (reads pending invoice from `invoices` table).
* [x] Payment recorded to `invoices` table via `pay_bill.php`.
* [x] Payment history visible in `UserPaymentHistory.jsx` with receipt viewer.
* [x] Admin settlement and manual payment recording via `AdminPayments.jsx`.
* [ ] Add **reference number** field for payments:
  * Add `payment_reference VARCHAR(100)` to `invoices` table.
  * Display in `UserPaymentHistory.jsx` receipts.
* [ ] Upload proof of payment:
  * File upload field in `PayBills.jsx` and `TrackApplication.jsx`.
  * New `upload_payment_proof.php` endpoint to store path.
* [ ] Cross-reference uploaded proof with payment reference number (admin verification step).
* [ ] Auto-mark invoices as `overdue` when `due_date` passes (scheduled PHP script or on-demand check).

---

## Documents

* [x] NBI Clearance upload (required for rent application).
* [x] Valid ID (front and back) upload (required for rent application).
* [x] View uploaded verification documents via `DocumentsModal.jsx` in `ProfileSettings`.
* [ ] Support upload of Police Clearance and Utility Bill (Proof of Billing) in application or profile.
* [ ] Allow admin to request additional documents from tenant (notify via `notifications` table).

---

## Unit Information

* [x] Rooms seeded in DB with type, floor, monthly rent, and status.
* [x] Room images included in Preview page and `AdminUnits` modals.
* [ ] Support for 360° room view (optional enhancement for the Preview page).

---

## Parking Reservation

* [x] Parking reservation form with vehicle type, model, plate number, transmission, and duration.
* [x] OR/CR document upload on parking reservation.
* [x] `status` column added to `parking_reservations` table.
* [x] `user_id` stored on parking reservation submission.
* [x] Tenant can cancel a `Pending` parking reservation from `/my-requests`.
* [ ] **Wire `AdminServicePage.jsx` parking section to DB** (Priority A):
  * Create `get_parking_reservations.php` and `update_parking_status.php`.
  * Replace mock `initialParkingReservations` array with live DB data.
  * Persist approve/reject actions.
* [ ] Plate number validation (enforce text length limit in frontend).

---

## Maintenance

* [x] Maintenance request form with issue category, urgency, description, and preferred schedule.
* [x] Attachment file upload on maintenance request.
* [x] `user_id` stored on maintenance request submission.
* [x] Tenant can cancel a `Pending` maintenance request from `/my-requests`.
* [x] Admin `AdminMaintainance.jsx` Kanban board with approval workflow.
* [ ] **Wire `AdminMaintainance.jsx` to DB** (Priority A — Critical):
  * Create `get_maintenance_requests.php` to replace `initialRequests` mock array.
  * Create `update_maintenance_status.php` to persist status, assignee, and cost.
  * Add schema columns: `assigned_to`, `estimated_cost`, `work_notes`.
* [ ] Video upload support for maintenance evidence.
* [ ] Tenant responsibility / discretion defined in Terms & Conditions.
* [ ] Maintenance approval workflow — notify tenant when status changes (insert to `notifications`).

---

## Housekeeping

* [ ] Garbage collection schedule page or announcement.
* [ ] House rules page (can be a static page or served via `UserAnnouncements`).

---

## CCTV Footage Request

* [x] CCTV request form with incident date, time, location, and reason.
* [x] `user_id` stored on CCTV request submission.
* [x] Tenant can cancel a `Pending` CCTV request from `/my-requests`.
* [ ] **Wire `AdminServicePage.jsx` CCTV section to DB** (Priority A):
  * Create `get_cctv_requests.php` and `update_cctv_status.php`.
  * Replace mock `initialCctvRequests` array with live DB data.
  * Persist approve/reject actions.
* [ ] Add **Data Privacy consent checkbox** to the CCTV request form.
* [ ] Restrict CCTV requests to incident-related purposes only (enforce via form validation and admin review).

---

## Reports

Generate reports by:

* [x] Monthly
* [x] Yearly
* [x] Occupancy
* [x] Payments
* [x] Maintenance
* [ ] **Wire `AdminReports.jsx` to `get_report_data.php`** (Priority B — Critical):
  * Backend endpoint `get_report_data.php` is already created and queries real DB data.
  * `AdminReports.jsx` still uses deterministic mock engine — swap it out.
  * Extend `get_report_data.php` to return per-month breakdown arrays for yearly charts.
* [ ] Per-module reservation reports (parking, CCTV, maintenance per unit).

---

## Tenant Management

* [x] Archive tenant accounts after move-out with reason and notes.
* [x] Preserve tenant history.
* [x] `AdminTenants.jsx` manages Pending Review, Active, and Archived tenants.
* [ ] Move-Out Request (self-service) for tenants (Priority D):
  * Add move-out button/modal to `MyRoom.jsx`.
  * Create `record_move_out.php` to set `status = 'pending-move-out'`.
  * Highlight `pending-move-out` tenants in `AdminTenants.jsx`.

---

## Unit Management

* [x] Unit occupancy history.
* [x] Lease history.
* [x] DB-backed room CRUD via `get_rooms.php` / `update_room.php`.
* [x] Room sync from approved rent applications (`update_tenant_status.php`).
* [ ] Lease extension history tab in unit detail modal.
* [ ] Configurable minimum lease duration (default: 3 months).

---

## Payment Management

* [x] Payment history management (`AdminPayments.jsx`).
* [x] Payment tracking per tenant via `invoices` table.
* [x] User-accessible payment records (`UserPaymentHistory.jsx`).
* [x] Admin manual payment settlement via `record_payment_admin.php`.
* [ ] Payment reference number field on invoices.
* [ ] Proof of payment upload and admin verification.

---

## Maintenance Management

* [x] Maintenance history per unit (shown in `AdminUnits` detail modal).
* [x] Maintenance cost tracking (UI in `AdminMaintainance.jsx`).
* [x] Budget comparison/reporting (mocked in `AdminReports.jsx`).
* [x] Maintenance approval workflow (UI in `AdminMaintainance.jsx`).
* [ ] **Persist maintenance data to DB** (Priority A — all UI changes are currently in-memory only).
* [ ] Tenant responsibility/discretion defined in Terms & Conditions.

---

## Lease & Eviction Policy

* [x] Configure overdue payment threshold before eviction (system settings).
* [x] Include signed and notarized lease agreement upload (`AdminContracts.jsx`).
* [x] Automate overdue payment monitoring (UI flags in `AdminPayments.jsx`).
* [x] Contract management with eviction status tracking (`AdminContracts.jsx`).
* [ ] Wire `ViewContract.jsx` to read from `lease_contracts` table (Priority C):
  * Create `get_my_contract.php`.
  * Show signed/notarized upload status in tenant contract view.

---

## Announcements

* [x] Admin can create and send announcements via `AdminAnnouncements.jsx`.
* [x] Announcements persisted to `announcements` table.
* [x] Creating an announcement auto-creates in-app notifications for all non-admin users.
* [x] Tenant announcement board at `/announcements` (`UserAnnouncements.jsx`).
* [ ] Allow admin to schedule announcements for future delivery.
* [ ] Allow admin to target specific tenants (currently sends to all non-admin users).

---

## Admin Services Page

* [ ] **Wire CCTV request management to DB** (Priority A).
* [ ] **Wire parking reservation management to DB** (Priority A).
* [ ] Service toggles (cleaning, laundry, wifi, parking) — consider persisting toggle state to `system_settings` table instead of in-memory.

---

# Business Rules

## Standard Apartment Policies

* [x] Support **1-month advance payment**.
* [x] Support **1-month security deposit**.
* [x] Payment settlement tracking/history.
* [x] Outstanding balance monitoring.
* [x] Admin can record payments and mark invoices as paid.

---

# Open Questions

* Should occupant changes require admin approval or allow direct self-service?
* How should lease extension conflicts be resolved when a room is already reserved by another applicant?
* What is the password change/reset policy (max changes, cooldown period)?
* Is CCTV request approval manual (admin reviews) or automatic?
* Should 360° room viewing be required or optional for listing?
* Should multiple occupants share one lease or have individual agreements?
* Should parking/CCTV/maintenance status change notifications be sent automatically when admin updates status?
* Should the `expenses` field in reports be manually entered by admin or calculated from a separate `expenses` table?
