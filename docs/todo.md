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
* [x] **Wire `AdminServicePage.jsx` parking section to DB** (Priority A — Done):
  * Created `get_parking_reservations.php` and `update_parking_status.php`.
  * Replaced mock `initialParkingReservations` array with live DB data.
  * Persists approve/reject actions.
* [ ] Plate number validation (enforce text length limit in frontend).

---

## Maintenance

* [x] Maintenance request form with issue category, urgency, description, and preferred schedule.
* [x] Attachment file upload on maintenance request (drag & drop, live preview, retake/remove, real API storage).
* [x] Video & photo upload support for maintenance evidence.
* [x] Date / Time tracking (creation timestamp and resolution timestamp `resolved_at`).
* [x] `user_id` stored on maintenance request submission.
* [x] Tenant can view submitted tickets with attached photos, submission date, and resolution timestamps in `/my-requests`.
* [x] Tenant can cancel a `Pending` maintenance request from `/my-requests`.
* [x] Admin `AdminMaintainance.jsx` Kanban board with approval workflow, photo attachment viewing, and resolution timestamp tracking.
* [x] **Wire `AdminMaintainance.jsx` to DB** (Priority A — Done):
  * Created `get_maintenance_requests.php` to fetch live requests.
  * Created `update_maintenance_status.php` to persist status, assignee, cost, notes, tenant responsibility, and `resolved_at`.
  * Wired to backend DB (`assigned_to`, `estimated_cost`, `work_notes`, `resolved_at`).
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
* [x] **Wire `AdminServicePage.jsx` CCTV section to DB** (Priority A — Done):
  * Created `get_cctv_requests.php` and `update_cctv_status.php`.
  * Replaced mock `initialCctvRequests` array with live DB data.
  * Persists approve/reject actions.
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
* [x] **Income Reports (8.2)**: Comprehensive income statement, unit-by-unit income ledger, gross/net operating income, profit margin %, period comparisons (MoM/QoQ/YoY), and CSV/Print export.
* [x] **Revenue Stream Analysis (8.3)**: 5-category stream breakdown (Rent, Electricity, Water, Parking, Deposits), 6-month historical multi-stream trends, diversification metrics, and stream audit table.
* [x] **Wire `AdminReports.jsx` to `get_report_data.php`** (Priority B — Done):
  * Backend endpoint `get_report_data.php` is created and queries real DB data.
  * `AdminReports.jsx` fetches from backend and mock engine has been removed.
  * Extended `get_report_data.php` to return array lists for the detailed tables.
* [ ] Per-module reservation reports (parking, CCTV, maintenance per unit).

---

## Tenant Management

* [x] Archive tenant accounts after move-out with reason and notes.
* [x] Preserve tenant history.
* [x] `AdminTenants.jsx` manages Pending Review, Active, and Archived tenants.
* [x] Move-Out Request (self-service) for tenants (Priority D — Done):
  * [x] Add move-out button/modal to `MyRoom.jsx`.
  * [x] Create `record_move_out.php` to set `status = 'pending-move-out'`.
  * [x] Highlight `pending-move-out` tenants in `AdminTenants.jsx`.

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
* [x] Payment reference number field on invoices (Priority E — Done).
* [x] Proof of payment upload (`upload_payment_proof.php` & `PaymentUpload.jsx`) and admin verification (Priority E — Done).

---

## Maintenance Management

* [x] Maintenance history per unit (shown in `AdminUnits` detail modal).
* [x] Maintenance cost tracking (UI in `AdminMaintainance.jsx`).
* [x] Budget comparison/reporting in `AdminMaintainance.jsx` and `AdminReports.jsx`.
* [x] Maintenance approval workflow (UI in `AdminMaintainance.jsx`).
* [x] **Persist maintenance data to DB** (Priority A — Done via `update_maintenance_status.php` and `get_maintenance_requests.php`).
* [ ] Tenant responsibility/discretion defined in Terms & Conditions.

---

## Lease & Eviction Policy

* [x] Configure overdue payment threshold before eviction (system settings).
* [x] Include signed and notarized lease agreement upload (`AdminContracts.jsx`).
* [x] Automate overdue payment monitoring (UI flags in `AdminPayments.jsx`).
* [x] Contract management with eviction status tracking (`AdminContracts.jsx`).
* [x] Wire `ViewContract.jsx` to read from `lease_contracts` table (Priority C — Done):
  * `get_contracts.php` endpoint fetches `lease_contracts` joined with application and room details.
  * Shows signed/notarized upload status in tenant contract view.

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

* [x] **Wire CCTV request management to DB** (Priority A — Done).
* [x] **Wire parking reservation management to DB** (Priority A — Done).
* [x] Service toggles (cleaning, laundry, wifi, parking) — persisted toggle state to `system_settings` via `update_system_settings.php`.

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
