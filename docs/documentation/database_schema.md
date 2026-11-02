# Database Schema Reference

Authoritative reference for the `ams_db` MySQL/MariaDB schema and the SQL files under
[`backend/api/migrations/`](../../backend/api/migrations/).
This document reflects the schema as actually defined in
[`SetupDB.sql`](../../backend/api/migrations/SetupDB.sql) —
verified table-by-table against that file, not against any earlier design doc.
Last re-checked 2026-09-24: 31 tables in `SetupDB.sql`, including the chat table `messages` (added to `SetupDB.sql` 2026-10-11).

> For workflows, API inventory, and frontend wiring status, see
> [system_design.md](system_design.md). This doc covers only the database layer.

---

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    USERS {
        int id PK
        varchar first_name
        varchar middle_name
        varchar last_name
        varchar suffix
        varchar contact_no
        varchar gender
        varchar email_address UK
        varchar password "bcrypt hash"
        varchar role "user | admin"
        varchar avatar_url
        tinyint is_archived
        tinyint sms_opt_out
        tinyint email_opt_out
        datetime sms_consent_at
    }

    ROOMS {
        varchar id PK "letter-coded: A, B, C..."
        varchar type "Studio"
        varchar floor "1F | 2F | 3F"
        decimal monthly_rent
        varchar status "vacant | occupied | repair"
        varchar tenant_name "display string, not FK"
        date lease_start
        date lease_end
        varchar last_tenant
        tinyint maintenance_flag
        int occupants
        varchar room_condition
        varchar furnishing_status
        date last_inspection_date
        json gallery "showcase images: path strings (legacy) or objects path, alt, fit"
        timestamp created_at
    }

    RENT_APPLICATIONS {
        int id PK
        int user_id FK "nullable, ON DELETE SET NULL"
        varchar first_name
        varchar middle_name
        varchar last_name
        varchar suffix
        varchar contact_no
        varchar email
        varchar gender
        varchar previous_address "nullable; required on new applications"
        int occupants
        int months_of_rent
        varchar room_name FK "-> rooms.id, ON DELETE RESTRICT"
        decimal monthly_rent
        datetime documents_verified_at "admin attested in person (update_room.php)"
        varchar status "Pending Review | Approved | Rejected | pending-move-out | moved-out | archived"
        varchar rejection_reason
        timestamp created_at
        date archive_date
        varchar archive_reason
        text archive_notes
        date requested_move_out_date
    }

    LEASE_CONTRACTS {
        varchar id PK "e.g. CTR-... or LC-..."
        int rent_application_id FK "ON DELETE CASCADE"
        decimal deposit_amount "one month's rent"
        date lease_start
        date lease_end
        enum status "draft | active | expired | terminated | eviction-pending"
        varchar signed_lease_path
        varchar notarized_lease_path
        varchar eviction_status
        varchar deposit_status "Pending | Held | Applied to Rent | Applied to Bills/Damages | Not Collected (default: Pending)"
        decimal damage_deduction
        decimal utility_deduction
        decimal refund_amount
        date refund_date
        timestamp generated_at
    }

    LEASE_RENEWALS {
        int id PK
        varchar contract_id FK "-> lease_contracts.id, ON DELETE CASCADE"
        int added_months
        date previous_lease_end
        date new_lease_end
        decimal rent_at_renewal
        int approved_by "admin user id"
        timestamp created_at
    }

    INVOICES {
        varchar id PK "e.g. INV-YYYYMM-userid"
        int user_id FK "ON DELETE CASCADE"
        int rent_application_id FK "nullable, ON DELETE SET NULL"
        decimal base_rent
        decimal water
        decimal electricity
        decimal parking
        decimal services "accumulates completed service bookings"
        decimal total_amount
        decimal security_deposit
        varchar payment_method "GCash | Bank Transfer | Cash"
        varchar payment_reference
        varchar reference_norm "generated: normalized payment_reference, indexed"
        varchar proof_of_payment_path
        varchar sender_name
        varchar billing_period "e.g. 'January 2026'"
        date rent_period_start "tenancy month a rent invoice bills"
        date rent_period_key "generated: rent_period_start unless cancelled"
        varchar payment_group "ADV-… legacy advance | BND-… combined payment"
        tinyint advance_months "months an advance-rent invoice covers"
        varchar status "pending | paid | overdue | pending-verification"
        timestamp paid_at
        date due_date
        date scheduled_date
        varchar scheduled_time_slot
        varchar checkout_session_id
        varchar checkout_payment_intent_id
        datetime processing_since
        varchar payment_gateway
        timestamp created_at
    }

    ADVANCE_CREDITS {
        int id PK
        varchar advance_invoice_id FK "ON DELETE CASCADE"
        int user_id FK "ON DELETE CASCADE"
        int rent_application_id
        date period_start "tenancy month the credit pays"
        decimal amount
        enum status "reserved | available | applied | cancelled | refund-due"
        date credit_key "generated: period_start unless cancelled"
        varchar applied_invoice_id "the month's rent invoice"
        timestamp applied_at
        timestamp created_at
    }

    MAINTENANCE_REQUESTS {
        int id PK
        int user_id FK "ON DELETE CASCADE"
        varchar issue_category "Plumbing | Electrical | Structural | Appliance | Pest Control | Others"
        varchar urgency "High | Medium | Low"
        date preferred_date
        varchar preferred_time
        text description
        tinyint permission_to_enter
        varchar attachment_path
        varchar status "Pending | In Progress | Completed"
        varchar assigned_to
        decimal estimated_cost
        text work_notes
        tinyint tenant_responsible
        timestamp created_at
    }

    CCTV_REQUESTS {
        int id PK
        int user_id FK "ON DELETE CASCADE"
        date incident_date
        varchar incident_time
        varchar location_details
        text reason_request
        varchar status "Pending | Approved | Rejected"
        timestamp created_at
    }

    PARKING_RESERVATIONS {
        int id PK
        int user_id FK "ON DELETE CASCADE"
        varchar vehicle_type "must match parking_allowed_vehicle_types setting"
        varchar vehicle_model
        varchar plate_number
        varchar status "Pending | Assigned | Approved | Active | Rejected"
        varchar transmission
        int duration_months
        decimal total_cost
        varchar document_path
        timestamp created_at
    }

    SERVICE_CATALOG {
        int id PK
        varchar category "cleaning | laundry | other"
        varchar name
        text description
        decimal price
        varchar pricing_unit "session | kg | hour | item"
        decimal min_quantity
        decimal max_quantity
        int lead_time_days
        varchar icon
        tinyint is_active
        int sort_order
        int created_by FK "admin id, ON DELETE SET NULL"
        timestamp created_at
        timestamp updated_at
    }

    SERVICE_REQUESTS {
        int id PK
        int user_id FK "ON DELETE CASCADE"
        int service_id FK "nullable, ON DELETE SET NULL"
        varchar room_name "soft ref, no FK"
        varchar service_name "snapshotted at booking time"
        varchar category "snapshotted"
        decimal unit_price "snapshotted"
        varchar pricing_unit "snapshotted"
        decimal quantity
        decimal total_cost
        date preferred_date
        varchar preferred_time_slot
        text notes
        varchar attachment_path
        varchar status "Pending | Approved | In Progress | Completed | Rejected | Cancelled"
        text admin_notes
        varchar assigned_to
        tinyint is_invoiced
        varchar invoice_id "soft ref to invoices.id"
        varchar billing_period
        datetime completed_at
        varchar cancelled_reason
        int handled_by
        timestamp created_at
        timestamp updated_at
    }

    UTILITY_READINGS {
        int id PK
        varchar room_name "soft ref, no FK; UNIQUE with billing_period"
        int user_id FK "tenant billed; nullable, ON DELETE SET NULL"
        varchar billing_period "YYYY-MM (invoices use 'September 2026')"
        date reading_date
        decimal water_prev_reading
        decimal water_curr_reading
        decimal water_rate_per_unit
        decimal water_consumption
        decimal water_amount
        decimal water_other_fees
        decimal electric_prev_reading
        decimal electric_curr_reading
        decimal electric_rate_per_unit
        decimal electric_consumption
        decimal electric_amount
        decimal electric_other_fees
        tinyint is_invoiced
        varchar invoice_id "soft ref to invoices.id"
        text notes
        int recorded_by "admin id"
        timestamp created_at
        timestamp updated_at
    }

    VISITOR_LOGS {
        int id PK
        int user_id FK "nullable, ON DELETE SET NULL"
        varchar room_name "soft ref, no FK"
        varchar visitor_name
        varchar contact_number
        varchar id_type
        varchar id_number
        varchar id_photo_path "added Sept 2026; check-in failed without it"
        varchar purpose
        varchar vehicle_plate
        enum status "pending_approval | checked_in | checked_out | overstayed | denied"
        datetime expected_at "tenant pre-registration's expected check-in"
        datetime expected_check_out_at "added Sept 2026; required on new rows"
        datetime check_in_at
        datetime check_out_at
        text checkout_notes
        text admin_notes
        int created_by "admin id"
        timestamp created_at
        timestamp updated_at
    }

    INQUIRIES {
        int id PK
        int user_id FK "nullable, ON DELETE SET NULL"
        varchar full_name
        varchar email
        varchar contact_no
        varchar room_name "soft ref, no FK - inquiry need not name a unit"
        int occupants
        date preferred_move_in
        text message
        varchar source "web | walk-in"
        varchar status "New | Contacted | Scheduled | Reserved | Converted | Closed"
        datetime viewing_date
        text admin_notes
        varchar closed_reason
        int handled_by
        varchar ip_address
        timestamp created_at
        timestamp updated_at
    }

    HOUSEHOLD_MEMBERS {
        int id PK
        int rent_application_id FK
        varchar full_name
        varchar relationship
        varchar contact_no
        varchar status "Pending | Active | Removed | Rejected | Cancelled"
        datetime added_at
        datetime removed_at
        datetime removal_requested_at
    }

    APPLICATION_REQUIREMENTS {
        int id PK
        varchar label "2-60, unique among active"
        varchar label_fil
        tinyint is_required
        tinyint is_active
        int sort_order
    }

    APPLICATION_DOCUMENTS {
        int id PK
        int rent_application_id FK "ON DELETE CASCADE"
        int requirement_id FK "nullable, ON DELETE SET NULL"
        varchar label_snapshot
        varchar file_path
        timestamp uploaded_at
    }
    UNIT_WAITLIST {
        int id PK
        int inquiry_id FK
        int user_id FK
        varchar room_name "soft ref to rooms.id"
        varchar full_name
        varchar status "Waiting | Notified | Removed"
        datetime notified_at
    }
    EXPENSES {
        int id PK
        varchar category
        decimal amount
        date expense_date
        varchar description
        int created_by
    }
    UNIT_RESERVATIONS {
        int id PK
        int inquiry_id FK "nullable, ON DELETE SET NULL"
        int user_id FK "nullable, ON DELETE SET NULL"
        varchar room_name "soft ref, no FK"
        varchar reserved_for_name
        varchar contact_no
        varchar email
        date hold_expires_at
        decimal reservation_fee
        varchar status "Active | Converted | Expired | Cancelled"
        text notes
        datetime released_at
        varchar released_reason
        int created_by "admin id"
        timestamp created_at
        timestamp updated_at
    }

    ANNOUNCEMENTS {
        int id PK
        varchar tag "Maintenance | Reminder | Policy | Urgent"
        varchar title
        text body
        varchar send_to "default: All Tenants"
        longtext channels "JSON array string: SMS, Email"
        varchar status "default: sent"
        datetime scheduled_date
        int recipient_count
        timestamp created_at
    }

    NOTIFICATIONS {
        int id PK
        int user_id FK "NOT NULL, ON DELETE CASCADE"
        varchar title
        text message
        varchar type "system | announcement | rent_application | maintenance_request | cctv_request | parking_reservation | service_request | inquiry | ..."
        tinyint is_read
        varchar status "Pending | Resolved | Approved | Rejected (ALTER-added)"
        varchar metadata_value "ALTER-added, e.g. 'service_request:12'"
        timestamp created_at
    }

    ACTIVITY_LOGS {
        int id PK
        varchar category "auth | user | tenant | unit | contract | billing | utilities | maintenance | service | inquiry | communication | system"
        varchar action
        text details
        int performed_by FK "nullable, ON DELETE SET NULL"
        timestamp created_at
    }

    SYSTEM_SETTINGS {
        int id PK
        varchar setting_key UK
        text setting_value "string, JSON array, or stringified bool/number"
        timestamp updated_at
    }

    PASSWORD_RESETS {
        int id PK
        varchar email
        varchar token_hash
        datetime expires_at
        timestamp created_at
    }

    SESSIONS {
        char token PK "64 hex"
        int user_id FK "ON DELETE CASCADE"
        varchar role "login snapshot only; access uses users.role"
        timestamp created_at
        timestamp expires_at "7 days"
        timestamp last_seen_at
    }

    LOGIN_ATTEMPTS {
        int id PK
        varchar ip_address
        varchar email "lowercased"
        datetime attempt_time
    }

    NOTIFICATION_PREFERENCES {
        int user_id PK
        varchar category PK
        tinyint in_app_enabled
        tinyint sms_enabled
        tinyint email_enabled
        timestamp updated_at
    }

    NOTIFICATION_QUEUE {
        int id PK
        int user_id FK
        enum channel "email | sms"
        varchar event_type
        longtext payload "JSON"
        enum status "pending | processing | sent | failed"
        char claim_token
        tinyint attempts
        tinyint max_attempts
        datetime next_attempt_at
        text error_message
        datetime created_at
        datetime processed_at
    }

    NOTIFICATION_LOG {
        int id PK
        int user_id FK "ON DELETE SET NULL"
        enum channel "in-app | email | sms"
        varchar event_type
        varchar recipient
        varchar subject
        text message_body "truncated to 500"
        enum status "sent | failed | skipped"
        text error_message
        timestamp sent_at
    }

    PARKING_CHARGES {
        int id PK
        int reservation_id FK
        char billing_period "YYYY-MM"
        varchar invoice_id
        decimal amount
        timestamp created_at
    }

    MESSAGES {
        int id PK
        int sender_id FK
        int receiver_id FK
        text message
        tinyint is_read
        timestamp created_at
    }

    USERS ||--o{ RENT_APPLICATIONS : submits
    USERS ||--o{ LEASE_RENEWALS : "approves (approved_by, no FK)"
    USERS ||--o{ MAINTENANCE_REQUESTS : submits
    USERS ||--o{ CCTV_REQUESTS : submits
    USERS ||--o{ PARKING_RESERVATIONS : submits
    USERS ||--o{ SERVICE_REQUESTS : books
    USERS ||--o{ SERVICE_CATALOG : "creates (admin, created_by)"
    USERS ||--o{ INVOICES : owns
    USERS ||--o{ UTILITY_READINGS : "billed for (ON DELETE SET NULL)"
    ROOMS ||--o{ UTILITY_READINGS : "metered (soft ref)"
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ ACTIVITY_LOGS : "performs (performed_by)"
    USERS ||--o{ SESSIONS : "signs in"
    USERS ||--o{ VISITOR_LOGS : "hosts / logs (user_id, created_by)"
    USERS ||--o{ INQUIRIES : "files (optional)"
    USERS ||--o{ UNIT_RESERVATIONS : "holds (optional)"
    ROOMS ||--o{ RENT_APPLICATIONS : "for (FK enforced)"
    RENT_APPLICATIONS ||--o{ INVOICES : generates
    INVOICES ||--o{ ADVANCE_CREDITS : "advance-rent invoice credits"
    RENT_APPLICATIONS ||--o{ LEASE_CONTRACTS : "produces (1 in practice)"
    LEASE_CONTRACTS ||--o{ LEASE_RENEWALS : "extended by"
    INQUIRIES ||--o{ UNIT_RESERVATIONS : "converts to hold"
    INQUIRIES ||--o{ UNIT_WAITLIST : "waits for a unit"
    RENT_APPLICATIONS ||--o{ HOUSEHOLD_MEMBERS : "household of the lease"
    RENT_APPLICATIONS ||--o{ APPLICATION_DOCUMENTS : "uploaded documents"
    APPLICATION_REQUIREMENTS |o--o{ APPLICATION_DOCUMENTS : "asked for by"
    SERVICE_CATALOG ||--o{ SERVICE_REQUESTS : "priced by"
    USERS ||--o{ NOTIFICATION_PREFERENCES : "sets"
    USERS ||--o{ NOTIFICATION_QUEUE : "queued for"
    USERS ||--o{ NOTIFICATION_LOG : "delivered to"
    PARKING_RESERVATIONS ||--o{ PARKING_CHARGES : "billed monthly"
    USERS ||--o{ MESSAGES : "sends / receives"
```

---

## 2. Tables by Domain

### Identity & Property
| Table | Purpose |
|---|---|
| `users` | Single table for both tenants (`role='user'`) and admins (`role='admin'`). `email_address` is unique; auth is bcrypt (`password`). `is_archived` soft-deletes a tenant without breaking FK history. |
| `rooms` | The 14-unit inventory, PK is a letter code (`A`–`N`), not an integer. Current layout: **1F = A–D (4 rooms, ₱4,000)**, **2F = E–H (4 rooms, ₱4,000)**, **3F = I–N (6 rooms, ₱3,500)** — see §4 "Hardcoded room-letter pricing" below before ever renumbering these. `tenant_name`/`lease_start`/`lease_end` are a denormalized display cache kept in sync by the API layer, not derived live from `rent_applications`. `rent_is_custom` marks a rent an admin set by hand, so "apply floor rent" (`apply_floor_rate.php`) skips it; the floor price table is the `floor_rates` setting. |

### Applications & Leasing
| Table | Purpose |
|---|---|
| `rent_applications` | One row per submitted application. `room_name` is the **only** soft-referenced-room column that's actually FK-enforced (`ON DELETE RESTRICT` — a room can't be deleted while it has application history). `status` drives the whole tenant lifecycle (`Pending Review → Approved/Rejected → pending-move-out → moved-out/archived`). `previous_address` (5-255 chars) is required by `rent_application.php` on new submissions. The uploaded documents are in `application_documents`; the old `valid_id_front_path` / `valid_id_back_path` / `nbi_clearance_path` columns were copied there and dropped (2026_10_drop_legacy_document_columns.sql). `documents_verified_at` is set when an admin assigns a tenant in person (`update_room.php`, no uploads in that flow); the follow-up sweep does not flag such a record for missing documents. |
| `application_requirements` | The documents an applicant uploads (Settings → Application Requirements, `manage_application_requirements.php`). `label` (2-60, unique case-insensitively among active rows), optional `label_fil`, `is_required`, `is_active`, `sort_order` (0-999); at most 12 active. Seeded with "Valid ID (front)" and "Valid ID (back)", both required. Never deleted, only deactivated, so old documents keep their link. Approval (`update_tenant_status.php`) and the follow-up sweep need a file for every active + required row. |
| `deposit_deductions` | Itemized move-out deductions: `rent_application_id` (FK, cascade), `contract_id`, `category` (`damage`/`electricity`/`water`/`unpaid_rent`/`other`), `reason` (1-255), `amount`, `recorded_by`. `lease_contracts.damage_deduction` = damage + other, `utility_deduction` = electricity + water + unpaid rent. `restore_tenant.php` deletes the rows when it resets the deductions. |
| `application_documents` | One uploaded file per application and requirement (`UNIQUE (rent_application_id, requirement_id)`). `label_snapshot` keeps the name the applicant uploaded against, so a document stays readable after its requirement is renamed or deactivated; `requirement_id` is `NULL` for a backfilled legacy NBI clearance. `ON DELETE CASCADE` from `rent_applications`, `ON DELETE SET NULL` from `application_requirements`. A resubmission replaces only the rows it sends a new file for. `download_file.php` resolves the owner through this table. |
| `lease_contracts` | One row per approved application, enforced by a `UNIQUE` key on `rent_application_id` (added September 2026 — the admin "Generate Contract" button used to insert a second row with no check). `status` is a real `ENUM`: `draft` (created on approval, not yet admin-reviewed) → `active` → `expired` (auto-swept, see §4) / `eviction-pending` / `terminated` (ends the tenancy — see `update_contract_status.php`'s `terminate` action). Every transition is gated server-side by `CONTRACT_TRANSITIONS` in `config.php`, not just checked at the UI. `termination_reason`/`terminated_at` and `renewal_reminder_sent_at` (a lease-end-reminder claim column) were added the same cycle. `deposit_amount` is one month's rent; there's deliberately no `monthly_rent` column here — the rate is always read live from `rent_applications.monthly_rent`, so it can never drift from the source of truth. `deposit_status` tracks the deposit itself (September 2026 payments audit; it used to default to `Held` before anything was paid): `Pending` on the draft → `Held` when `settle_invoice()` settles the move-in invoice (`security_deposit > 0`) → `Applied to Rent` / `Applied to Bills/Damages` at move-out or termination, or `Not Collected` when a tenancy is terminated before paying it. `template_version_id` (nullable, no FK) is the `contract_template_versions.id` whose clauses the lease was issued under; `NULL` (issued before templates existed) shows the latest clauses. |
| `household_members` | Co-occupants on a lease (decided 2026-09-16: one shared lease, only the lease holder has a login). `status`: `Pending` (tenant request) → `Active` / `Rejected` / `Cancelled` (withdrawn); `Active` → `Removed`. A removal request is `removal_requested_at` on the `Active` row. Requests are `household_request` notifications (metadata `add:<id>` / `remove:<id>`) decided in `process_tenant_request.php`. `rent_applications.occupants` never drops below 1 + active members and never exceeds `max_occupants_per_unit`. `end_household()` removes everyone on move-out, contract termination or archive. `ON DELETE CASCADE` from `rent_applications`. `age` and `age_category` (key into the `age_categories` setting) are captured on add; age is required for a Child. |
| `lease_renewals` | Append-only audit trail for lease extensions. The contract itself is extended **in place** (not versioned as a new row) because every consumer query (`get_contracts.php`, `my_room.php`) assumes one `lease_contracts` row per application; this table exists purely so a renewal's history (old end date, new end date, rate at the time) isn't lost when the contract row is mutated. |
| `contract_template_versions` | The admin-editable lease contract (Admin → *Contracts* → *Contract Template Editor*), append-only: one row per save, the highest `version` is in force, `uniq_template_version` makes two simultaneous saves collide instead of both landing. `content` is the whole JSON document — landlord details, payment accounts, custom `{{placeholder}}` values and the bilingual sections/clauses — shaped and validated by `backend/contract_template.php`. Empty table = the built-in default contract is in force; the first contract issued before any save writes that default as version 1 so it can be pinned. |

### Billing
| Table | Purpose |
|---|---|
| `invoices` | PK is a formatted string (`INV-YYYYMM-<user_id>`), not an int. One row per tenant per billing month. Installments: `amount_paid` is the running sum of the parts received (`payment_transactions`), balance = `total_amount - amount_paid`; `proof_amount` is the part a tenant declared with a proof (NULL = the whole balance). `base_rent`/`water`/`electricity`/`parking`/`services`/`maintenance`/`late_fee` are itemized and summed into `total_amount`; `services` and `maintenance` accumulate (each can hold more than one completed charge's cost in the same month) — `maintenance` is kept separate from `services` so a tenant-caused repair recharge (audit H10) doesn't blend into voluntary add-on bookings. `water`/`electricity` are set once from a single utility reading — `sync_utility_to_invoice.php` refuses to merge into an invoice that already carries them, and adds to `total_amount` rather than recomputing it. A move-in invoice bundles `base_rent + security_deposit` in `total_amount`. Creation is insert-only (`create_invoice.php`, audit H8) — re-issuing an existing id is refused; `adjust_invoice.php` edits only the manual lines (`base_rent`/`water`/`electricity`/`parking`/`late_fee`/`due_date`) and always recomputes `total_amount` from every column, so `services`/`maintenance`/`security_deposit` can never be dropped. **Rent periods (2026-09-26):** a rent invoice's `rent_period_start` is the first day of the tenancy month it bills — the contract's lease-start day in that month, clamped to month end — and its due date. The daily sweep (`generate_due_rent_invoices()`) issues each month 7 days before it starts and never back-bills a month that has already started. `UNIQUE (user_id, rent_period_key)`, where the STORED generated `rent_period_key` is `rent_period_start` except on a cancelled row, stops any writer billing a month twice. Older rent invoices have no `rent_period_start` and are matched by their `billing_period` label. `payment_group` (`ADV-…`) ties the months of a legacy advance payment (before 2026-09-28), or, as `BND-…`, the overdue bills a tenant pays together (combined payment, 2026-09-30; `bundle_payment.php`). A group is paid together but settled and receipted one invoice at a time. **Advance credits (2026-09-28):** an advance payment is now one advance-rent invoice with `advance_months = N`; it is left out of revenue, receivables and arrears and never gets a late fee.  `processing_since` is set when an online checkout claims the bill (`status='processing'`); `void_lapsed_payments()` releases it after `system_settings.payment_window_days` (default 3). |
| `invoice_adjustments` | One row per `adjust_invoice.php` change (manager interview Q13): `invoice_id` (FK, cascade), `admin_id` (FK to `users`, set null), `reason` (required, 5-255), `old_total`, `new_total`, `changes` (JSON `{line: [old, new]}` for the changed lines: `base_rent`, `water`, `electricity`, `parking`, `late_fee`, `due_date`), `created_at`; index on `invoice_id`. Written in the same transaction as the invoice update; returned admin-only by `get_invoices.php` (`adjustments[]`). **Reference lookups (Q22):** `invoices`, `payment_transactions` and `payment_proof_parts` each have a STORED generated column `reference_norm` varchar(100) = `NULLIF(UPPER(<reference> without spaces, dashes, tabs, CR, LF), '')` over `payment_reference` / `reference_number`, indexed as `idx_invoices_reference_norm`, `idx_payment_transactions_reference_norm` and `idx_payment_proof_parts_reference_norm` (they replace the three raw-reference indexes; 2026_10_manager_interview_alignment.sql, section `reference_norm`). It must equal `normalize_payment_reference()` in `config.php` (a test in `reference_reuse.test.js` checks both on the same inputs), so `find_reference_reuse()` / `reference_reuse_for_pending()` seek by it per channel, under `system_settings.duplicate_reference_policy` (`warn` default, or `block`). Never write the column; it follows the reference on insert and update. |
| `advance_credits` | One row per month an advance-rent invoice covers. `reserved` until that invoice is paid (`settle_invoice()`), then `available`; the daily sweep bills the month on its usual date at the credited amount, settles it (`payment_method = 'Advance credit'`) and marks the credit `applied` with `applied_invoice_id`. An advance still unpaid when its first month comes due is cancelled with its credits (`expire_unpaid_advances()`); at move-out `end_tenancy()` turns `available` credits into `refund-due`. `UNIQUE (user_id, credit_key)`, where the STORED `credit_key` is `period_start` except on a cancelled row, stops a month being credited twice. |
| `refund_requests` | A tenant's or admin's request to get advance rent or an overpayment back (`type` `advance` / `overpayment` / `rejected_application` / `rejected_charge` (the last two are raised automatically when an approved application, or a paid service/maintenance charge, is rejected after payment), `amount`, `reason`). `status` runs Pending Review → Approved → Refunded, with Info Requested (admin asks, tenant replies back to Pending Review), Rejected (`decision_reason` required) and Cancelled; transitions are `REFUND_TRANSITIONS` in `config.php`. `payout_method` / `payout_reference` are recorded at payout. The security deposit is not refundable and cannot be requested. Advance credits held by a request carry its id in `advance_credits.refund_request_id` and become `refunded` at payout. |
| `refund_request_events` | The status trail: one row per action (`raised`, `request_info`, `reply`, `approve`, `reject`, `mark_refunded`, `cancel`) with actor, message and timestamp. |
| `expenses` | Building expenses an admin enters by hand (`manage_expenses.php`): utilities, supplies, salaries, common-area upkeep, taxes and fees, insurance, other. `get_report_data.php` adds them to the maintenance costs it derives from `maintenance_requests` — repairs are never entered here, so nothing is counted twice. |
| `utility_readings` | One row per unit per billing month (`UNIQUE (room_name, billing_period)`). `billing_period` is `YYYY-MM`, while invoices label the same month `"September 2026"` — always convert with `utility_period_label()` before matching. Previous/current readings form a chain per unit, so readings are recorded oldest-first and only the latest un-invoiced one may be deleted. `is_invoiced` is claimed atomically before the charge is posted, and `invoice_id` records the invoice it landed on. `entry_mode` is `bill` (the default in the UI: the provider bill amounts in `water_amount` / `electric_amount`, rates NULL, readings and consumption NULL unless a reading was noted), `metered` (readings and rates) or `total` ("record total only": `total_amount` plus a note, readings left at 0; synced to the invoice's `services` column). `bill_file_path` is the provider's bill attached by an admin (`upload_utility_bill.php`); the tenant's proof of payment lives on the linked invoice (`proof_of_payment_path`). |
| `utility_types` | Utilities beyond water and electricity (internet, gas, ...): `billing_mode` `flat` (fee per reading) or `metered` (reading × rate), `default_rate`, `is_active`. Edited in Settings → Utilities. |
| `utility_reading_items` | One row per extra utility on a reading (`UNIQUE (reading_id, type_id)`, cascades with the reading): previous/current reading, rate, amount, other fees. `sync_utility_to_invoice.php` adds their total to `invoices.services`. |

### Requests & Services
| Table | Purpose |
|---|---|
| `maintenance_requests` | Tenant-submitted tickets. `room_name` is **snapshotted** from the tenant's active application when the ticket is created (a soft reference, no FK), so a later move doesn't reattribute the ticket. A ticket completed with `tenant_responsible=1` bills `COALESCE(actual_cost, estimated_cost)` onto `invoices.maintenance` (audit H10) — `is_invoiced`/`invoice_id`/`billing_period` mirror `service_requests`' claim-atomically pattern, so a double-click can't double-bill and clearing the flag (or reopening the ticket) reverses the charge while it's still unpaid. `invoiced_amount` records the amount posted (reversal backs out that, not the current cost). |
| `cctv_requests` | Footage-request tickets tied to an incident date/time/location; `privacy_consent_at` records when the tenant agreed to the Data Privacy terms (required since 2026-10). |
| `parking_charges` | One row per parking reservation per billing month (`UNIQUE (reservation_id, billing_period)`), so a month is never billed twice whether billing is manual ("Bill this month") or automatic (daily sweep). `invoice_id` records where the charge landed. |
| `parking_reservations` | `vehicle_type` must match the JSON array in the `parking_allowed_vehicle_types` setting; the admin-configured `max_parking_slots` cap counts rows in `Pending`/`Assigned`/`Approved`/`Active`. |
| `service_catalog` | Admin-managed price list for add-on services (cleaning, laundry, pest control, ...). `is_active=0` hides an item from the tenant-facing catalog without deleting history. |
| `service_requests` | Bookings against the catalog. Price/name/category are **snapshotted** at booking time (not joined live) so re-pricing the catalog never rewrites past invoices. `is_invoiced` is claimed atomically before the charge is posted to `invoices.services`, so a double-click can't double-bill. `invoiced_amount` (2026_11_invoiced_amount.sql) is the amount that was posted, so reversing backs out exactly that even if `total_cost` is edited later. |

### Communication, Access & Audit
| Table | Purpose |
|---|---|
| `visitor_logs` | Front-desk check-in/out log. `status` is a real `ENUM`: `pending_approval` (tenant pre-registration) → `checked_in` → `checked_out`, or `denied`/`cancelled`; `overstayed` is a **derived display value** computed at read time, not a stored status. `expected_at` (a pre-registration's expected arrival) and `overstay_alerted_at` (the once-per-visit claim for `alert_overstayed_visitors()`) were added September 2026. `expected_check_out_at` (when the visitor is expected to leave) was added late September 2026: nullable for older rows, but `check_in_visitor.php` requires it on every new visit; it is informational only, since overstay still uses `visitor_overstay_hours`. `id_photo_path` (the uploaded government ID) was missing from the schema until September 2026, which made every check-in fail. A tenant's own list is scoped strictly to `user_id` — matching by current room as well used to leak a previous occupant's visitors to the next tenant of the same unit. |
| `inquiries` | Public/walk-in "tell me about a unit" leads. `room_name` is intentionally **not** FK-enforced — an inquiry doesn't have to name a specific unit. |
| `unit_reservations` | A short hold on a room after a promising inquiry. "One active hold per room" is enforced at the application layer (`SELECT ... FOR UPDATE` inside a transaction) rather than a DB constraint, because MySQL has no native partial/conditional unique index. |
| `unit_waitlist` | Basic first-come waitlist for a unit that isn't vacant, added from an inquiry (`manage_waitlist.php`). When the unit is vacated or a hold is released, `notify_unit_waitlist()` marks the first `Waiting` row `Notified`, notifies a tenant account in-app and queues an admin item (`unit_waitlist`). No hold is placed automatically. Converting or closing the inquiry removes its entries. `room_name` is a soft reference, like `inquiries`. |
| `announcements` | Broadcast messages; `channels` is a JSON array stored as `longtext` with a `CHECK (json_valid(...))` constraint. `attachment_path` (2026-10-11, `2026_10_announcement_attachment.sql`) is the one file an admin attached when sending; tenants get the same path on their `notifications.attachment_path` rows, and `download_file.php` lets any recipient (or an admin) open it. |
| `notifications` | Shared inbox row for **both** tenant-facing status updates and admin-facing "new request" alerts — disambiguated by `user_id` (whose inbox) and `status`/`type`, not by a separate table. `status` and `metadata_value` were added via `ALTER TABLE` after the initial `CREATE TABLE` (see the file — they're relied on everywhere but weren't in the original dump). |
| `notification_preferences` | Per-user, per-category channel switches (`in_app_enabled`, `sms_enabled`, `email_enabled`; PK `user_id, category`). A missing row means "enabled". Checked by `user_channel_allowed()` together with `users.sms_opt_out` / `email_opt_out` (global opt-outs) and the building-wide switches. |
| `notification_queue` | Outbound SMS/email jobs. The admin endpoints enqueue; `backend/cron/process_queue.php` claims a batch with `claim_token` (so two drains never send the same job), retries with backoff up to `max_attempts`, defers non-urgent SMS in quiet hours, and copies the failure reason to `error_message`. |
| `notification_log` | One row per SMS/email attempt (`sent` / `failed` / `skipped`, with the reason). SMS rows sent through Semaphore also keep its `provider_message_id` and `provider_status` (`Queued` / `Pending` / `Sent` ...). Only `log_notification_delivery()` writes it; `message_body` is truncated to 500 characters and rows past `notification_log_retention_days` are pruned by the queue drain. Also the source of the daily SMS cap count. |
| `messages` | Two-way chat (PR #8): one flat row per message, `sender_id` → `receiver_id`, `is_read`. There is no `conversations` table — a thread is all messages between two users. Also carries `attachment_path` and `reply_to_id` (no key or constraint on the latter, as on production). Defined in `SetupDB.sql`; `2026_10_chat_and_signature_columns.sql` adds the table or the two columns to a database that lacks them. The endpoints no longer create or alter it at request time. Written by the PHP endpoints and by the Socket.IO server (`websocket-server/server.js`). |
| `activity_logs` | Audit trail (checklist 8.6), append-only. `performed_by` is always the session user when there is one (set by `log_activity()`), and nullable so a deleted account doesn't cascade-delete history. `category` is one of the 12 keys in `LOG_CATEGORIES`; `normalize_log_category()` maps legacy spellings on write. |

### Settings & Auth Support
| Table | Purpose |
|---|---|
| `system_settings` | Generic `setting_key`/`setting_value` pair store. Every admin-configurable value in the app (lease duration, overdue threshold, payment channel toggles, parking caps, etc.) lives here rather than as dedicated columns — see [`ams-react/src/config/systemSettings.js`](../../ams-react/src/config/systemSettings.js) for the full key list and camelCase↔snake_case mapping. JSON-valued keys: `floor_rates` (`{"1F": 5000}`, floor to monthly rent) and `age_categories` (infant / toddler / child / minor ranges with their rules), plus `min_household_age` (default 12: no one younger may live in the apartment). Tenant Glass theme backdrop (2026_11_appearance_settings.sql): `glass_bg_image` (`''` = built-in photo, else `site_assets/glass_bg_<time>_<hex8>.<jpg|png|webp>` from `upload_glass_background.php`; only that generated pattern, with the file present, is accepted), `glass_overlay_opacity` 0-95, `glass_blur` 0-20, `glass_tint` `#rrggbb`. Home page text (same migration): `home_content` JSON `{badge|heading|location|description: {show: bool, en, fil}}`, text up to 60/80/80/400 characters, `""` = the built-in wording. |
| `house_rules` | Admin-editable rules with an English and a Filipino text. `scope` is `house` (general, the default), `parking` (shown before a parking reservation) or `minors` (children and pets, shown on the inquiry, application and contract). `is_active = 0` is a soft delete. |
| `password_resets` | Token storage for `forgot_password.php`/`reset_password.php`. `expires_at` is set by the database (`NOW() + 30 min`) — it used to be PHP's clock, whose timezone differed from MySQL's. |
| `password_reset_requests` | One row per reset request, counted by `password_reset_throttle_message()`: at most 3 per email and 10 per IP per hour. Rows older than a day are purged on insert. |
| `rate_limit_events` | `action`, `rate_key` (usually the IP), `created_at`. Generic counter for public forms with no account to throttle on, read by `rate_limit_exceeded()` / written by `rate_limit_record()`; today only `registration` (5 per IP per hour). Rows older than a day are purged on insert. |
| `sessions` | Server-issued bearer tokens. `role` is a snapshot from login and is **not** used for access decisions — `get_authenticated_user()` joins `users` for the live role and archive state. Rows are deleted by `revoke_user_sessions()` on password change/reset, role change and archive. |
| `login_attempts` | Failed sign-ins and wrong current passwords, counted per account (`email`, lowercased) and per IP over 15 minutes by `login_throttle_message()`. Previously created by `login.php` at request time. |

### Audit (2026-10-28): is 46 tables too many?
No. A scan of dev `ams_db` against the code (`backend/**/*.php` without migrations, `ams-react/src`, `websocket-server`) found:
- **Every table is used.** All 46 are read by at least one endpoint and written by at least one (the busiest: `rent_applications` in 48 PHP files, `users` 57, `invoices` 35, `rooms` 30, `notifications` 28). The whole database is 2.2 MB on dev. Prod also has `schema_migrations` (47 tables), created by `cron/migrate.php`; dev, built from `SetupDB.sql`, does not.
- **Columns never named in code:** only six. `advance_credits.credit_key`, `parking_reservations.active_slot` and `open_user` are generated columns that exist to back unique keys, so they stay. `rent_applications.valid_id_front_path`, `valid_id_back_path` and `nbi_clearance_path` were left over from before `application_documents`; `2026_10_drop_legacy_document_columns.sql` copies any path still only there and drops them.
- **Possible follow-ups, not done:** `login_attempts` and `password_reset_requests` are per-feature throttles that `rate_limit_events` could absorb (46 → 44 tables, but it touches sign-in and password reset). `backend/api/apply_live_schema_fix.php`, `final_schema_patch.php`, `sync_live.php` and `audit_live_schema.php` are CLI-only one-off scripts from 2026-10-20 that nothing references; `cron/migrate.php` replaced them.

---

## 3. Migration Files

`backend/api/migrations/` holds:

| Path | What |
|---|---|
| `SetupDB.sql` | The full current schema; fresh installs need only this |
| `YYYY_MM_*.sql` | The current upgrade migrations: `2026_10_panelist_gaps` (refunds, floor rent, utility bills and types, scoped rules, age categories, all in one file), `2026_10_rent_wording`, `2026_10_room_archiving`, `2026_10_server_database_update`, `2026_10_prod_schema_repair`. `backend/cron/migrate.php` (and the git post-merge hook) runs each one not yet in `schema_migrations`; prod has the first three, the repair is pending there. CI applies them all on a fresh schema to prove they stay idempotent |
| `seeds/` | Demo data and reset helpers: `seed_mock_data.sql` / `seed_reset.sql` / `clear_and_seed.sql` (empty or dev databases only; CI and the API tests load `seed_mock_data.sql`), `seed_defense_scenarios.sql` (extra states on top of the mock seed), `seed_demo_full.sql` / `seed_demo_reset.sql` (the full-coverage demo set, safe on a live database, tracked and CI-tested), and `seed_prod_demo.sql` / `seed_prod_demo_reset.sql` / `prod_wipe_operational.sql` (live-database helpers; local only, gitignored) |

Migrations must run on prod's MySQL 8 as well as local MariaDB. The runner strips `IF NOT EXISTS` from `ADD COLUMN`/`ADD INDEX` (MySQL 8 rejects it) and runs the file one statement at a time: a statement that fails because its change is already there (duplicate column/key/table, MySQL 1060/1061/1050/1091) is skipped and the rest of the file still runs; any other error stops the file and leaves it unrecorded, so it is retried next run. Until 2026-10-07 it sent the whole file through `multi_query()`, where the first duplicate error silently skipped the rest while the file was still recorded as applied; that is how prod ended up half-migrated in October 2026. Guarding each change with an `information_schema` check and a prepared statement, as `2026_10_prod_schema_repair.sql` does, is still the preferred style. Statements are split on `;` outside quotes and comments, so `DELIMITER` blocks (procedures, triggers) are not supported. Once a migration has run everywhere (prod included), delete it: `SetupDB.sql` already has the change and git keeps the file's history (`git log --diff-filter=D -- backend/api/migrations/`). The September 2026 upgrades (`2026_09_*`) were removed this way on 2026-10-03.

### `SetupDB.sql` — the schema, run once per environment
The single source of truth for every `CREATE TABLE`. Structure:
1. `CREATE DATABASE IF NOT EXISTS ams_db` + all `DROP TABLE IF EXISTS` / `CREATE TABLE` statements for the 13 "original" tables (`users`, `rooms`, `invoices`, `lease_contracts`, `maintenance_requests`, `notifications`, `parking_reservations`, `rent_applications`, `cctv_requests`, `announcements`, `activity_logs`, `system_settings`, `visitor_logs`).
2. The one seed row that must exist for the app to be usable at all: the **admin account** (`admin@gmail.com` / `admin123`) and the **14-room inventory**.
3. A block of newer tables added with `CREATE TABLE IF NOT EXISTS` instead of `DROP`+`CREATE` (`lease_renewals`, `inquiries`, `unit_reservations`, `household_members`, `expenses`, `unit_waitlist`, `service_catalog`, `service_requests`, `utility_readings`, `sessions`, `login_attempts`, `password_resets`, `password_reset_requests`, `notification_preferences`, `notification_log`, `notification_queue`, `parking_charges`, `advance_credits`, `payment_transactions`, `house_rules`, `rate_limit_events`, `refund_requests`, `refund_request_events`, `utility_types`, `utility_reading_items`, `application_requirements`, `application_documents`) — additive, so re-running this file against an existing DB won't wipe those.
4. A trailing block of `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements patching columns the API code depends on that were never added to the original `CREATE TABLE` blocks — `notifications` (`status`, `metadata_value`), `invoices` (`services`, `late_fee`, `maintenance`, reminder tracking, `cancel_reason`, ...), and `maintenance_requests` (the timeline columns, `actual_cost`, and the `is_invoiced`/`invoice_id`/`billing_period` billing trio). New columns keep landing here rather than in the original `CREATE TABLE`, so check this block — not just the table's own `CREATE TABLE` — before assuming a column doesn't exist.
5. The default `system_settings` rows.

**Important:** `users` and `rooms` (and every other "original" table) use `DROP TABLE IF EXISTS` — re-importing this file against a database that already has tenant data **destroys it**. Always run `seed_mock_data.sql` (if wanted) immediately after, in the same session — never re-run `SetupDB.sql` alone against a populated DB.

### `seed_mock_data.sql` — realistic demo data, optional
Populates 15 tenant accounts (11 current tenants, one applicant, and the moved-out / rejected / cancelled cases prod has) across 15 rooms (SetupDB's 14 plus prod's extra room `P`) with a history from January to early October 2026: applications, contracts, invoices, maintenance, parking, CCTV, service bookings, visitor logs, inquiries/reservations, announcements, notifications, and activity logs. Uses `INSERT IGNORE` throughout so it's safe to re-run without erroring on the primary keys it already inserted (though it won't update rows that already exist either).

The roster is deliberately split into **scripted accounts** — each built to exercise one specific admin feature (an overdue tenant, one flagged for eviction, one with a draft contract awaiting activation, one with a renewal on file, one still `Pending Review`) — and **bulk accounts** that just add realistic volume. The file's own header comment documents exactly which login belongs to which scenario; see that block rather than duplicating it here, since it's the part most likely to drift out of sync with this doc otherwise.

Must run **after** `SetupDB.sql` in the same import — it resolves the admin's id dynamically (`SET @admin_id = (SELECT id FROM users WHERE role = 'admin' LIMIT 1)`) rather than assuming a literal id, and references `service_catalog` rows that only exist once `SetupDB.sql` has seeded them.

**Never run it on a database that already has data (prod).** It inserts fixed ids and updates rooms and applications by id, so on prod it attaches mock invoices to real users and overwrites real rooms and applications; `seed_reset.sql` cannot undo that. Use `seed_prod_demo.sql` there instead.

### `seed_demo_full.sql` and `seed_demo_reset.sql` — demo data for every module, safe anywhere
Tracked and CI-tested (`demo_seed.test.js`, the "Demo seed" CI step). Adds 16 `@demo.example.com` accounts (password `tenant123`, email and SMS opted out) next to existing data: no fixed ids (users are read back by email into session variables), `INV-DEMO-` / `CTR-DEMO-` ids, dates relative to today, no `USE` line, and nothing addressed to All Tenants. It fills 12 vacant rooms and covers every workflow state: all invoice statuses (paid, pending, overdue, `pending-verification` single and split, `scheduled`, `processing`, `payment-failed`), partial and split payments, a reused reference, an invoice adjustment, advance rent (reserved, available, applied, refund-due), move-in and rejected-after-approval payments, three refund requests with timelines, deposit deductions, every application status, draft/active/expired/eviction-pending contracts and an extension, parking, maintenance, services, CCTV, visitors (including overstayed), inquiries with guest chat, a unit hold and waitlist, household members, tenant-admin chat, notifications with admin queue rows for the pending records, expenses and nine months of rent history for reports. Two optional utility types (internet, gas) are switched on.
A guard at the top stops the script with a duplicate-key error, before anything is written, if there is no admin, fewer than 12 vacant rooms, fewer than two free parking slots, recent meter readings on the target rooms, or the demo accounts already exist. It sets `utf8mb4_general_ci` for the session because user variables take the connection collation and MySQL 8 defaults to `utf8mb4_0900_ai_ci` (error 1267). `seed_demo_reset.sql` removes exactly those rows (`Demo:`-prefixed log rows, the demo announcements and expenses by title and description) and frees the rooms; it restores a fresh database to identical row counts.

### `seed_prod_demo.sql` and `seed_prod_demo_reset.sql` — demo data on a live database (local only)
These two files are gitignored: they target prod and are run by hand there (Adminer or the mysql client), never deployed or run by CI.

The prod-safe sibling of `seed_mock_data.sql`: the same people, scenarios and invoice amounts, added next to real data without touching it. Rules it follows:
- **No fixed ids.** Users, applications and requests take new ids resolved by email; invoices and contracts are prefixed `INV-DEMO-` / `CTR-DEMO-`.
- **Only rooms that were vacant on prod** (B, D, G, H, I, K, L, M, P; J and N stay open). A pre-flight check aborts the import if any is taken, if demo accounts already exist, or if `2026_10_prod_schema_repair.sql` has not run; everything is one transaction, so an abort writes nothing.
- **No outbound messages.** Accounts are `@demo.example.com` (reserved, undeliverable) and opted out of email and SMS.
- **No announcements or `activity_logs` rows**, since those reach real tenants or form the real audit trail.

`seed_prod_demo_reset.sql` removes exactly what the seed added plus anything the demo accounts created afterwards (sweep invoices, requests, notifications, sessions), and puts back only rooms a demo tenant still holds. Tested on a copy of the 2026-10-03 prod dump: seed then reset leaves the data byte-identical to before.

### `2026_10_drop_legacy_document_columns.sql` — the old document path columns
Copies any real file path still only in `rent_applications.valid_id_front_path`, `valid_id_back_path` or `nbi_clearance_path` into `application_documents` (skipping `'placeholder'`, matched on the path), then drops the three columns. Every step is guarded on `information_schema`, so it is a no-op where the columns are already gone (a fresh `SetupDB.sql`).

### `2026_10_manager_interview_alignment.sql` — removed 2026-10-28
Applied on prod 2026-10-20 and folded into `SetupDB.sql`; deleted because it read the dropped columns unguarded (git keeps it). What it did, for reference: round-2 manager-interview workstream (`docs/features/manager_interview_comparison.md`), one section per change under a `-- ===== name =====` header; every statement is guarded, so the file can be re-run after a section is appended. Section `application_requirements`: creates `application_requirements` (seeds "Valid ID (front)" and "Valid ID (back)" only on an empty table) and `application_documents`, backfills the legacy `valid_id_front_path` / `valid_id_back_path` / `nbi_clearance_path` files into it (skipping `'placeholder'`; matched on the path, so a re-run adds nothing; NBI gets `requirement_id` NULL and label "NBI Clearance"), makes those three columns nullable, adds `rent_applications.previous_address` and `documents_verified_at`, and stamps `documents_verified_at` on `'placeholder'` records that got past approval (admin in-person assignments).

### `2026_10_chat_and_signature_columns.sql` — chat and signature columns
Idempotent catch-up for databases older than 2026-10-11: creates `messages` if missing, adds `messages.attachment_path` and `reply_to_id`, `lease_contracts.tenant_signature_path` and `owner_signature_path`, and `invoices.late_fee_waived`. Every statement is guarded on `information_schema`, so it does nothing on production (which already had the chat columns) or on a fresh `SetupDB.sql` install. It replaces `create_messages_table.sql`, which the migration runner never picked up.

### `clear_and_seed.sql` and `seed_reset.sql`
Both were rewritten in September 2026 to match the current schema and `seed_mock_data.sql`, and CI (`.github/workflows/ci.yml`, the `database` job) imports and runs both on every push to prove they stay in sync:

- **`clear_and_seed.sql`** truncates every table `SetupDB.sql` creates and re-inserts exactly its default rows: the admin account (`admin@gmail.com` / `admin123`), the 14 rooms in the current 4/4/6 layout, the service catalog, and `system_settings`. It never drops or creates a table, so — unlike `SetupDB.sql` — it's safe to run against a database that already has the current schema. **Never run it against production**: the admin password it restores is the shared demo password, not a real credential.
- **`seed_reset.sql`** removes exactly what `seed_mock_data.sql` inserts (matched by tenant email, announcement title and audit timestamp, not by id range, so it stays correct however ids were assigned) and resets the rooms it occupied back to vacant (and drops its room `P` if nothing else uses it). It leaves the admin account, `system_settings` and the service catalog untouched, and `seed_mock_data.sql` can be re-run afterward to restore the demo.

Both files carry a comment that they must be kept in sync with `seed_mock_data.sql`; when that file's tenant list, rooms or announcement titles change, update these two in the same commit.

### Recommended fresh-setup order
```bash
mysql -u root < backend/api/migrations/SetupDB.sql
mysql -u root < backend/api/migrations/seeds/seed_mock_data.sql   # optional, for demo/dev data
```
See the root [README.md](../../README.md) ("Installation & Setup" section) for the full local setup walkthrough, including default login credentials.

---

## 4. Notable Design Conventions

- **Soft references vs. enforced FKs on `room_name`.** Only `rent_applications.room_name` is a real foreign key. `maintenance_requests`, `visitor_logs`, `inquiries`, `unit_reservations`, `service_requests`, and `utility_readings` store `room_name` as a plain string with no constraint, by design (an inquiry or a service booking doesn't have to name a committed unit). Don't assume referential integrity on those columns.
- **Snapshotting over live joins.** `service_requests` copies `service_name`/`category`/`unit_price`/`pricing_unit` from `service_catalog` at booking time instead of joining live, so re-pricing a catalog item never silently rewrites a tenant's past invoice history. The same reasoning is why `lease_contracts` has no `monthly_rent` column — leases intentionally do the opposite (always read live) because the rate is meant to track the tenant's current application, not freeze at signing.
- **Contact numbers are PH mobiles, normalized on save.** Every `contact_no` / `contact_number` column is a free-text `varchar(30)`, but since 2026-09-26 each endpoint that writes one runs `normalize_ph_mobile()` and stores `+639XXXXXXXXX` (the forms have a fixed +63 prefix). Rows written earlier keep their old format (`+63 9…`, `09…`); the frontend's `toPhLocal10()` and the SMS sender both read every format. `unit_reservations.contact_no` keeps an older inquiry's number as-is when it isn't a PH mobile.
- **Status-as-lifecycle, not boolean flags.** Nearly every operational table drives its workflow off a `status` string/`ENUM` column (`rent_applications.status`, `lease_contracts.status`, `invoices.status`, `visitor_logs.status`, `unit_reservations.status`, ...) rather than separate boolean columns — check the relevant PHP endpoint for the exact allowed transitions before writing a query that filters on status.
- **`system_settings` over schema columns.** Any value an admin might reasonably want to change (thresholds, toggles, payment channels) is a row in `system_settings`, not a dedicated column somewhere — extending an existing setting rather than adding a new column is usually the right move. The exception is the lease contract: its landlord details, payment account numbers and clauses moved to `contract_template_versions` (September 2026) because they need versioning, and because `get_system_settings.php` is public while account numbers should only reach signed-in users. The old `landlord_*`/`property_address` rows remain only as the seed for the built-in default.
- **Hardcoded room-letter pricing.** [`RentApplication.jsx`](../../ams-react/src/UserPages/RentApplication.jsx) derives the ₱3,500 3rd-floor rate from a hardcoded `['I','J','K','L','M','N']` letter check instead of querying `rooms.floor`/`rooms.monthly_rent` — it's only a fallback used before the room's real `monthly_rent` loads, not the permanent source of truth. `process_tenant_request.php` and `update_tenant_status.php` were previously named here too, but both now read the rate live from `rooms.monthly_rent`; this note used to be stale about that. If the room layout is ever changed again, either keep 3F as exactly those six letters, or update `getRoomPriceFallback()`.
- **Auto-expiry and auto-overdue are opportunistic sweeps, not triggers.** `expire_lapsed_contracts()` and the "mark overdue" `UPDATE invoices SET status='overdue' WHERE ...due_date < CURDATE()` logic both run as plain PHP functions called at the top of read endpoints (`get_contracts.php`, `my_room.php`, `get_invoices.php`), not as MySQL triggers or a cron job. A contract or invoice can display a stale status until the next time a relevant page is loaded. (Other periodic work does run from cron: `backend/cron/daily_sweep.php` — reminders and automatic parking billing via `run_notification_sweep()` — and `backend/cron/process_queue.php`, which delivers queued SMS/email every minute.)
