# AMS — Development Todo

> **Historical backlog.** The current open-work list is [consolidated_todo.md](consolidated_todo.md). Items below were re-checked against the code on 2026-09-24.

---

## Account Management

* [x] Add **middle name** field during registration.
* [x] Allow users to **preview uploaded profile images/documents** before submission.
* [x] Support **retake image** functionality before upload.
* [x] Add **Notification Center** for all user notifications (DB-backed).
  * [x] Notification page with history, filters, read/unread, and delete.
  * [x] TopBar notification bell reads live from `notifications` table.
  * [x] Creating an announcement auto-creates notifications for all tenants.
* [x] Clarify password reset/change policy — **decided 2026-09-16 (light policy):**
  * No cap on the number of password changes, no cooldown between changes, no forced expiry.
  * The new password must differ from the current one (change, reset and admin reset).
  * At most **3 reset requests per email per hour**, plus a per-IP ceiling; the response stays generic so it doesn't reveal whether the email exists.
  * Unchanged: 8-character minimum (`PASSWORD_MIN_LENGTH`), lockout after 5 failures per account / 20 per IP for 15 minutes, 30-minute single-use reset link, all sessions ended after a reset, other devices signed out after a change.
* [x] Enforce the password policy (built 2026-09-17):
  * [x] Reject a new password equal to the current one in `change_password.php`, `reset_password.php` and the admin reset in `manage_users.php`.
  * [x] Throttle `forgot_password.php` to 3 requests per email per hour, plus 10 per IP (`password_reset_requests` table).

---

## Registration & Application

* [x] Submit rent application with file uploads (Valid ID front/back, NBI Clearance).
* [x] Store `user_id` FK on `rent_applications` when submitting application.
* [x] Track application status via `/track-application` page with pending invoice payment.
* [x] Add application re-submission or update flow (if rejected, allow user to fix and resubmit). *(done — `rent_application.php` updates the existing application, logged as "Resubmitted Rental Application")*
* [x] Validate all input fields with min/max limits (plate numbers, contact numbers, etc.). *(done — `LIMITS` in `utils/validation.js`, used across the forms)*

---

## Room & Occupancy

* [x] DB-backed rooms via `rooms` table (14 seeded units).
* [x] `AdminUnits` reads and writes rooms from DB via `get_rooms.php` / `update_room.php`.
* [x] Room occupancy history and lease history modals in `AdminUnits`.
* [x] Syncing `rooms.tenant_name` / `lease_start` / `lease_end` from approved applications.
* [x] Define occupant change workflow *(done — tenant request → admin approval in `process_tenant_request.php`)*:
  * User requests an occupant count change (form in `MyRoom.jsx`).
  * Admin approval step before count is updated.
* [x] Decide the model for multiple occupants — **decided 2026-09-16: one shared lease, lease holder plus household roster.**
  * Only the lease holder has a login and is responsible for rent and the unit. Co-occupants don't get accounts.
  * Co-occupants are recorded as household members (name, relationship, contact, status, added/removed dates).
  * Adding, removing or replacing a member is a tenant request that needs admin approval (same flow as today's occupant-count change); the >4 occupant surcharge is recalculated on approval.
  * Move-out or archive ends the whole household.
* [x] Build the household roster (built 2026-09-17):
  * [x] Migration: `household_members` table linked to `rent_applications` (`2026_09_decisions_features.sql`, mirrored into `SetupDB.sql`).
  * [x] `household_members.php` lists the roster and files add/remove requests (replace = remove + add); admins approve in Notifications through `process_tenant_request.php`.
  * [x] Household section in `MyRoom.jsx`; read-only list in the `AdminTenants` profile.
  * [x] Occupant count never drops below the lease holder + active members and never exceeds `max_occupants_per_unit` (default 8, set in Settings → Leasing). Naming someone already counted doesn't change the rent.
  * [x] Move-out, contract termination and archive end the household.
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
* [x] Handle lease extension conflicts:
  * `create_reservation.php` rejects a hold when the room is not `vacant`, already has an `Active` reservation, or has a `Pending Review` rent application for the same room.
* [x] Inquiry & reservation module — see [inquiry_reservation_design.md](features/inquiry_reservation_design.md).
* [x] Send lease expiration reminders *(done — `send_lease_end_reminders()` in `config.php`, run by the daily sweep)*:
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
* [x] Add **reference number** field for payments *(done — `invoices.payment_reference`)*:
  * Add `payment_reference VARCHAR(100)` to `invoices` table.
  * Display in `UserPaymentHistory.jsx` receipts.
* [x] Upload proof of payment *(done — `upload_payment_proof.php`)*:
  * File upload field in `PayBills.jsx` and `TrackApplication.jsx`.
  * New `upload_payment_proof.php` endpoint to store path.
* [x] Cross-reference uploaded proof with payment reference number (admin verification step). *(done — admin verifies or rejects in Payments; `reject_payment_proof.php`)*
* [x] Auto-mark invoices as `overdue` when `due_date` passes. *(done — `promote_overdue_invoices()`)*

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
* [x] Room images included in Preview page and `AdminUnits` modals — now admin-uploaded showcase images (`upload_room_images.php`, `rooms.gallery`).
* [x] Decide on 360° room view — **decided 2026-09-16: not planned.** There are no panorama images to show; revisit only if they become available.
* [x] `room_preview_mode` setting (`images` or `floor_plan`), switched in Settings → Leasing; `RoomPreviewModal.jsx` shows only the selected panel (built 2026-09-17).

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
* [x] Plate number validation (enforce text length limit in frontend). *(done — `LIMITS.plate` in `ParkingReservation.jsx`)*

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
* [x] Tenant responsibility / discretion defined in Terms & Conditions. *(done — Terms of Service §6 "Maintenance and repairs", English and Filipino, written from the rent contract clauses)*
* [x] Maintenance approval workflow — notify tenant when status changes (insert to `notifications`). *(done — `update_maintenance_status.php`, plus SMS/email dispatch)*

---

## Housekeeping

* [ ] Garbage collection schedule page or announcement.
* [x] House rules page. *(done — admin-edited in Settings → House Rules via `house_rules.php`, shown to users in `HouseRulesModal.jsx`)*

---

## CCTV Footage Request

* [x] CCTV request form with incident date, time, location, and reason.
* [x] `user_id` stored on CCTV request submission.
* [x] Tenant can cancel a `Pending` CCTV request from `/my-requests`.
* [x] **Wire `AdminServicePage.jsx` CCTV section to DB** (Priority A — Done):
  * Created `get_cctv_requests.php` and `update_cctv_status.php`.
  * Replaced mock `initialCctvRequests` array with live DB data.
  * Persists approve/reject actions.
* [x] Add **Data Privacy consent checkbox** to the CCTV request form. *(done — `CctvRequest.jsx`)*
* [x] Restrict CCTV requests to incident-related purposes only. *(done — required incident type from a fixed list (`cctv_requests.incident_type`), "other" needs a 20+ character description, incidents older than the footage window (default 60 days) are refused; the admin queue shows the type next to the reason; locations, types, window and shortest reason are editable in Settings → CCTV)*
* [x] Hand approved footage to the tenant. *(done — the admin attaches a short clip or a private link from the details modal (`attach_cctv_footage.php`); the tenant opens it from My Requests until it expires (`cctv_footage_days`, default 14), opens are logged, `purge_expired_cctv_footage()` deletes it; tests in `cctv_footage.test.js`)*

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
* [x] **Expenses table with manual entry** (decided 2026-09-16, built 2026-09-17):
  * [x] Migration: `expenses` table (category, amount, expense_date, description, created_by, created_at).
  * [x] `manage_expenses.php` + the "Manage" button on the Reports income statement add, edit and delete building expenses, each write logged.
  * [x] `get_report_data.php`: expenses = maintenance actual costs (still derived from `maintenance_requests`, not copied) + expense rows in the period + the optional `report_overhead_pct`, with a per-category breakdown and CSV lines.
* [x] **Inquiry conversion-rate report** in `AdminReports.jsx` (Reservations tab, built 2026-09-17) — see [inquiry_reservation_design.md §8](features/inquiry_reservation_design.md#8-planned-and-deferred).

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
* [x] Tenant responsibility/discretion defined in Terms & Conditions. *(done — Terms of Service §6 "Maintenance and repairs", English and Filipino, written from the rent contract clauses)*

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
* [x] Allow admin to schedule announcements for future delivery. *(done 2026-11-03 — "Schedule for later" in the composer stores a `scheduled` row; `send_due_announcements()` sends it once from the poll in `get_notifications.php` and `cron/process_queue.php`; History offers Edit, Send now and Back to draft)*
* [~] Allow admin to target specific tenants. *(One unit's current tenants can be targeted; individual tenants cannot.)*

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

## Chat

* [x] Two-way tenant ↔ admin chat (Socket.IO + `messages`, PR #8) — see [chat_design.md](features/chat_design.md) "As built".
* [ ] Admin starts a thread with any tenant; notification row on new message; authenticate the socket server — tracked in [consolidated_todo.md](consolidated_todo.md).
* [ ] Complaints (7.7).

---

# Open Questions

* ~~Should occupant changes require admin approval or allow direct self-service?~~ **Decided 2026-09-16:** admin approval (see Room & Occupancy).
* ~~How should lease extension conflicts be resolved when a room is already reserved by another applicant?~~ **Decided 2026-11-03:** an extension is refused while another applicant (Pending Review / Action Required / Approved) wants the unit before the new rent end; the admin can override from Units → Extend Rent, which notifies the applicant (`extension_competing_applications()`).
* ~~What is the password change/reset policy (max changes, cooldown period)?~~ **Decided 2026-09-16:** light policy — no cap or cooldown, new ≠ current, 3 reset requests per email per hour (see Account Management).
* ~~Is CCTV request approval manual (admin reviews) or automatic?~~ **Answered in code:** manual — the admin approves or denies in CCTV requests (`update_cctv_status.php`).
* ~~Should 360° room viewing be required or optional for listing?~~ **Decided 2026-09-16:** not planned; admin chooses images or floor plan (see Unit Information).
* ~~Should multiple occupants share one lease or have individual agreements?~~ **Decided 2026-09-16:** one shared lease; lease holder has the only login; co-occupants go on a household roster (see Room & Occupancy).
* ~~Should parking/CCTV/maintenance status change notifications be sent automatically when admin updates status?~~ **Answered in code:** yes — each `update_*_status.php` notifies the tenant in-app and dispatches SMS/email per their preferences.
* ~~Should the `expenses` field in reports be manually entered by admin or calculated from a separate `expenses` table?~~ **Decided 2026-09-16:** an `expenses` table with manual entry, added to the derived maintenance costs (see Reports).
* ~~Should the inquiry module add a waitlist, conversion-rate reporting, or email/SMS on new inquiries?~~ **Decided 2026-09-16:** conversion report yes, basic waitlist yes, email/SMS TBA (see [inquiry_reservation_design.md §8](features/inquiry_reservation_design.md#8-planned-and-deferred)).
* ~~Feature branches or direct pushes to `main`?~~ **Decided 2026-09-16:** routine work and bug fixes go straight to `main`; big implementations use a `feature/` branch (see [cicd_pipeline.md](deployment/cicd_pipeline.md#git-branching-strategy)).
