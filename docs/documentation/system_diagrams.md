# AMS — System Diagrams

> **Document Version:** 2.0 — September 2026
> **Stack:** React 19 (Vite 8) SPA → plain PHP 8 endpoints → MariaDB 10.4 (XAMPP); Node Socket.IO sidecar for chat
> **Database:** `ams_db` — 31 tables in `backend/api/migrations/SetupDB.sql` (including chat `messages`)
> **Source of truth:** the schema file and `backend/config.php`. [`database_schema.md`](database_schema.md) explains each table in prose; if a diagram and the code disagree, the code wins.

---

## Table of Contents

1. [Entity Relationship Diagram (ERD)](#1-entity-relationship-diagram-erd)
   - 1.1 [Overview — all entities and relationships](#11-overview--all-entities-and-relationships)
   - 1.2 [Identity, Property & Leasing](#12-identity-property--leasing)
   - 1.3 [Billing & Payments](#13-billing--payments)
   - 1.4 [Requests & Services](#14-requests--services)
   - 1.5 [Leads & Visitors](#15-leads--visitors)
   - 1.6 [Communication](#16-communication)
   - 1.7 [Audit, Settings & Auth Support](#17-audit-settings--auth-support)
   - 1.8 [Relationship reference](#18-relationship-reference)
2. [Use Case Diagrams](#2-use-case-diagrams)
   - 2.1 [Actors](#21-actors)
   - 2.2 [System-wide overview](#22-system-wide-overview)
   - 2.3 [Guest](#23-guest)
   - 2.4 [Applicant (registered, no unit yet)](#24-applicant-registered-no-unit-yet)
   - 2.5 [Tenant](#25-tenant)
   - 2.6 [Administrator — leasing & tenancy](#26-administrator--leasing--tenancy)
   - 2.7 [Administrator — operations, finance & system](#27-administrator--operations-finance--system)
   - 2.8 [System actors (scheduler & gateways)](#28-system-actors-scheduler--gateways)
3. [Data Flow Diagrams (DFD)](#3-data-flow-diagrams-dfd)
   - 3.0 [Notation and data stores](#30-notation-and-data-stores)
   - 3.1 [Context diagram (Level 0)](#31-context-diagram-level-0)
   - 3.2 [Level 1 — core processes](#32-level-1--core-processes)
   - 3.3 [Level 2 — 2.0 Leads & rent applications](#33-level-2--20-leads--rent-applications)
   - 3.4 [Level 2 — 3.0 Tenancy lifecycle](#34-level-2--30-tenancy-lifecycle)
   - 3.5 [Level 2 — 4.0 Billing & payments](#35-level-2--40-billing--payments)
   - 3.6 [Level 2 — 5.0 Maintenance](#36-level-2--50-maintenance)
   - 3.7 [Level 2 — 6.0 Tenant services (CCTV, parking, add-ons)](#37-level-2--60-tenant-services-cctv-parking-add-ons)
   - 3.8 [Level 2 — 7.0 Visitor management](#38-level-2--70-visitor-management)
   - 3.9 [Level 2 — 8.0 Communication & notification delivery](#39-level-2--80-communication--notification-delivery)

---

## 1. Entity Relationship Diagram (ERD)

**Conventions**

- Solid line (`--`): foreign key enforced by the database.
- Dotted line (`..`): soft reference. The column holds the other table's key, but there is no FK constraint (e.g. `room_name` everywhere except `rent_applications`, and every `invoice_id` claim column).
- `users` holds both tenants (`role = 'user'`) and admins (`role = 'admin'`); columns such as `created_by`, `handled_by`, `approved_by`, `recorded_by` point to an admin row.
- Columns added by `ALTER TABLE` further down `SetupDB.sql` (e.g. `invoices.services`, `notifications.status`) are shown on their tables like any other column.

### 1.1 Overview — all entities and relationships

Attributes are omitted here; each domain diagram below shows them.

```mermaid
erDiagram
    USERS ||--o{ SESSIONS : "signs in with"
    USERS ||--o{ RENT_APPLICATIONS : "submits"
    ROOMS ||--o{ RENT_APPLICATIONS : "applied for"
    RENT_APPLICATIONS ||--o| LEASE_CONTRACTS : "produces"
    LEASE_CONTRACTS ||--o{ LEASE_RENEWALS : "extended by"
    RENT_APPLICATIONS ||--o{ HOUSEHOLD_MEMBERS : "houses"

    USERS ||--o{ INVOICES : "billed"
    RENT_APPLICATIONS ||--o{ INVOICES : "tenancy of"
    USERS ||--o{ UTILITY_READINGS : "billed for"
    ROOMS ||..o{ UTILITY_READINGS : "metered"

    USERS ||--o{ MAINTENANCE_REQUESTS : "files"
    USERS ||--o{ CCTV_REQUESTS : "files"
    USERS ||--o{ PARKING_RESERVATIONS : "reserves"
    PARKING_RESERVATIONS ||--o{ PARKING_CHARGES : "billed monthly"
    SERVICE_CATALOG ||--o{ SERVICE_REQUESTS : "priced by"
    USERS ||--o{ SERVICE_REQUESTS : "books"

    INVOICES ||..o{ PARKING_CHARGES : "carries"
    INVOICES ||..o{ SERVICE_REQUESTS : "carries"
    INVOICES ||..o{ MAINTENANCE_REQUESTS : "carries recharge"
    INVOICES ||..o{ UTILITY_READINGS : "carries"

    USERS |o--o{ INQUIRIES : "files"
    INQUIRIES |o--o{ UNIT_RESERVATIONS : "converts to hold"
    INQUIRIES |o--o{ UNIT_WAITLIST : "waits via"
    ROOMS ||..o{ UNIT_RESERVATIONS : "held"
    ROOMS ||..o{ UNIT_WAITLIST : "awaited"
    USERS |o--o{ VISITOR_LOGS : "hosts"
    ROOMS ||..o{ VISITOR_LOGS : "visited"

    USERS ||--o{ NOTIFICATIONS : "receives"
    USERS ||--o{ NOTIFICATION_PREFERENCES : "sets"
    USERS ||--o{ NOTIFICATION_QUEUE : "queued for"
    USERS |o--o{ NOTIFICATION_LOG : "delivered to"
    USERS ||--o{ MESSAGES : "sends / receives"

    USERS |o--o{ ACTIVITY_LOGS : "performs"
    USERS |o..o{ EXPENSES : "records"

    ANNOUNCEMENTS
    SYSTEM_SETTINGS
    LOGIN_ATTEMPTS
    PASSWORD_RESETS
    PASSWORD_RESET_REQUESTS
```

`ANNOUNCEMENTS`, `SYSTEM_SETTINGS` and the three auth-throttle tables have no foreign keys. An announcement becomes `notifications` and `notification_queue` rows when it is sent (see [3.9](#39-level-2--80-communication--notification-delivery)); the throttle tables are keyed by email and IP, not by user id.

### 1.2 Identity, Property & Leasing

```mermaid
erDiagram
    USERS {
        int id PK
        varchar first_name
        varchar middle_name
        varchar last_name
        varchar suffix
        varchar contact_no
        tinyint sms_opt_out
        tinyint email_opt_out
        datetime sms_consent_at
        varchar gender
        varchar email_address UK
        varchar password "bcrypt hash"
        varchar role "user | admin"
        varchar avatar_url
        tinyint is_archived "soft delete"
    }

    SESSIONS {
        char token PK "64-char bearer token"
        int user_id FK
        varchar role "snapshot, not used for access"
        timestamp created_at
        timestamp expires_at
        timestamp last_seen_at
    }

    ROOMS {
        varchar id PK "letter code A-N"
        varchar type
        varchar floor
        decimal monthly_rent
        varchar status "vacant | reserved | occupied | maintenance"
        varchar tenant_name "display cache"
        date lease_start "display cache"
        date lease_end "display cache"
        varchar last_tenant
        tinyint maintenance_flag
        int occupants
        varchar room_condition
        varchar furnishing_status
        date last_inspection_date
        json gallery "image paths"
        timestamp created_at
    }

    RENT_APPLICATIONS {
        int id PK
        int user_id FK "SET NULL"
        varchar first_name
        varchar middle_name
        varchar last_name
        varchar suffix
        varchar contact_no
        varchar email
        varchar gender
        int occupants
        int months_of_rent
        varchar room_name FK "RESTRICT"
        decimal monthly_rent
        varchar status "Pending Review | Approved | Rejected | Declined | active | pending-move-out | moved-out | archived"
        varchar pre_archive_status
        varchar rejection_reason
        date archive_date
        varchar archive_reason
        text archive_notes
        date requested_move_out_date
        timestamp terms_agreed_at
        timestamp created_at
    }

    LEASE_CONTRACTS {
        varchar id PK "CTR-uniqid"
        int rent_application_id FK,UK "CASCADE, one per application"
        decimal deposit_amount "one month's rent"
        date lease_start
        date lease_end
        enum status "draft | active | expired | eviction-pending | terminated"
        varchar signed_lease_path
        varchar notarized_lease_path
        varchar eviction_status
        text termination_reason
        datetime terminated_at
        datetime renewal_reminder_sent_at "claim column"
        varchar deposit_status "Held | Refunded ..."
        decimal damage_deduction
        decimal utility_deduction
        decimal refund_amount
        date refund_date
        timestamp generated_at
    }

    LEASE_RENEWALS {
        int id PK
        varchar contract_id FK "CASCADE"
        int added_months
        date previous_lease_end
        date new_lease_end
        decimal rent_at_renewal
        int approved_by "admin users.id, no FK"
        timestamp created_at
    }

    HOUSEHOLD_MEMBERS {
        int id PK
        int rent_application_id FK "CASCADE"
        varchar full_name
        varchar relationship
        varchar contact_no
        varchar status "Pending | Active | Rejected | Cancelled | Removed"
        datetime added_at
        datetime removed_at
        datetime removal_requested_at
        timestamp created_at
    }

    USERS ||--o{ SESSIONS : "signs in with"
    USERS |o--o{ RENT_APPLICATIONS : "submits"
    ROOMS ||--o{ RENT_APPLICATIONS : "applied for"
    RENT_APPLICATIONS ||--o| LEASE_CONTRACTS : "produces"
    LEASE_CONTRACTS ||--o{ LEASE_RENEWALS : "extended by"
    RENT_APPLICATIONS ||--o{ HOUSEHOLD_MEMBERS : "houses"
```

### 1.3 Billing & Payments

```mermaid
erDiagram
    INVOICES {
        varchar id PK "INV-..."
        int user_id FK "CASCADE"
        int rent_application_id FK "SET NULL"
        decimal base_rent
        decimal water
        decimal electricity
        decimal parking
        decimal services "accumulates"
        decimal maintenance "tenant-caused recharge"
        decimal late_fee
        decimal security_deposit
        decimal total_amount
        varchar payment_method
        varchar payment_reference
        varchar proof_of_payment_path
        varchar proof_rejection_reason
        varchar sender_name
        varchar billing_period "Month YYYY"
        date rent_period_start
        date rent_period_key "generated, UK with user_id"
        varchar payment_group "ADV-... advance payment"
        varchar status "pending | overdue | pending-verification | scheduled | processing | payment-failed | paid | cancelled"
        varchar cancel_reason
        timestamp paid_at
        date due_date
        date scheduled_date
        varchar scheduled_time_slot
        varchar checkout_session_id "PayMongo"
        varchar payment_gateway
        date last_reminder_date
        int reminder_count
        timestamp created_at
    }

    UTILITY_READINGS {
        int id PK
        varchar room_name "soft ref rooms.id, UK with billing_period"
        int user_id FK "SET NULL"
        varchar billing_period "YYYY-MM"
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
        tinyint is_invoiced "claim flag"
        varchar invoice_id "soft ref invoices.id"
        text notes
        int recorded_by "admin users.id"
        timestamp created_at
        timestamp updated_at
    }

    PARKING_CHARGES {
        int id PK
        int reservation_id FK "CASCADE, UK with billing_period"
        char billing_period "YYYY-MM"
        varchar invoice_id "soft ref invoices.id"
        decimal amount
        timestamp created_at
    }

    EXPENSES {
        int id PK
        varchar category
        decimal amount
        date expense_date
        varchar description
        int created_by "admin users.id, no FK"
        timestamp created_at
        timestamp updated_at
    }

    USERS ||--o{ INVOICES : "billed"
    RENT_APPLICATIONS |o--o{ INVOICES : "tenancy of"
    USERS |o--o{ UTILITY_READINGS : "billed for"
    ROOMS ||..o{ UTILITY_READINGS : "metered"
    INVOICES |o..o{ UTILITY_READINGS : "carries"
    PARKING_RESERVATIONS ||--o{ PARKING_CHARGES : "billed monthly"
    INVOICES |o..o{ PARKING_CHARGES : "carries"
    USERS |o..o{ EXPENSES : "records"
```

`expenses` has no link to invoices. Reports add it to the maintenance cost taken from `maintenance_requests`.

### 1.4 Requests & Services

```mermaid
erDiagram
    MAINTENANCE_REQUESTS {
        int id PK
        int user_id FK "CASCADE"
        varchar room_name "snapshot, soft ref"
        varchar title
        varchar issue_category
        varchar urgency "Needs Triage | Low | Medium | High | Urgent"
        date preferred_date
        varchar preferred_time
        text description
        tinyint permission_to_enter
        varchar attachment_path
        varchar status "Pending | In Progress | Completed | Rejected | Cancelled"
        varchar assigned_to
        decimal estimated_cost
        decimal actual_cost
        text work_notes
        varchar rejection_reason
        tinyint tenant_responsible
        tinyint is_invoiced "claim flag"
        varchar invoice_id "soft ref"
        varchar billing_period
        datetime acknowledged_at
        datetime started_at
        datetime resolved_at
        timestamp created_at
    }

    CCTV_REQUESTS {
        int id PK
        int user_id FK "CASCADE"
        date incident_date
        varchar incident_time
        varchar location_details
        text reason_request
        varchar status "Pending | Approved | Rejected | Cancelled"
        timestamp created_at
    }

    PARKING_RESERVATIONS {
        int id PK
        int user_id FK "CASCADE"
        varchar vehicle_type
        varchar vehicle_model
        varchar plate_number
        varchar transmission
        int duration_months "max 6"
        decimal total_cost
        varchar document_path "OR/CR"
        varchar status "Pending | Assigned | Rejected | Cancelled | Released"
        int slot_number
        datetime assigned_at
        datetime released_at
        varchar release_reason
        varchar rejection_reason
        int active_slot UK "generated: slot while Assigned"
        int open_user UK "generated: one open per tenant"
        timestamp created_at
    }

    SERVICE_CATALOG {
        int id PK
        varchar category "UK with name"
        varchar name
        text description
        decimal price
        varchar pricing_unit
        decimal min_quantity
        decimal max_quantity
        int lead_time_days
        varchar icon
        tinyint is_active
        int sort_order
        int created_by FK "SET NULL"
        timestamp created_at
        timestamp updated_at
    }

    SERVICE_REQUESTS {
        int id PK
        int user_id FK "CASCADE"
        int service_id FK "SET NULL"
        varchar room_name "soft ref"
        varchar service_name "snapshot"
        varchar category "snapshot"
        decimal unit_price "snapshot"
        varchar pricing_unit
        decimal quantity
        decimal total_cost
        date preferred_date
        varchar preferred_time_slot
        text notes
        varchar attachment_path
        varchar status "Pending | Approved | In Progress | Completed | Rejected | Cancelled"
        text admin_notes
        varchar assigned_to
        tinyint is_invoiced "claim flag"
        varchar invoice_id "soft ref"
        varchar billing_period
        datetime completed_at
        varchar cancelled_reason
        int handled_by "admin users.id"
        timestamp created_at
        timestamp updated_at
    }

    USERS ||--o{ MAINTENANCE_REQUESTS : "files"
    USERS ||--o{ CCTV_REQUESTS : "files"
    USERS ||--o{ PARKING_RESERVATIONS : "reserves"
    USERS |o--o{ SERVICE_CATALOG : "maintains"
    USERS ||--o{ SERVICE_REQUESTS : "books"
    SERVICE_CATALOG |o--o{ SERVICE_REQUESTS : "priced by"
    ROOMS ||..o{ MAINTENANCE_REQUESTS : "located in"
    ROOMS ||..o{ SERVICE_REQUESTS : "delivered to"
    INVOICES |o..o{ MAINTENANCE_REQUESTS : "carries recharge"
    INVOICES |o..o{ SERVICE_REQUESTS : "carries"
```

### 1.5 Leads & Visitors

```mermaid
erDiagram
    INQUIRIES {
        int id PK
        int user_id FK "SET NULL, optional"
        varchar full_name
        varchar email
        varchar contact_no
        varchar room_name "soft ref, optional"
        int occupants
        date preferred_move_in
        text message
        varchar source "web | walk-in ..."
        varchar status "New ..."
        datetime viewing_date
        text admin_notes
        varchar closed_reason
        int handled_by "admin users.id"
        varchar ip_address
        timestamp created_at
        timestamp updated_at
    }

    UNIT_RESERVATIONS {
        int id PK
        int inquiry_id FK "SET NULL"
        int user_id FK "SET NULL"
        varchar room_name "soft ref"
        varchar reserved_for_name
        varchar contact_no
        varchar email
        date hold_expires_at
        decimal reservation_fee
        varchar status "Active | Converted | Cancelled | Expired"
        text notes
        datetime released_at
        varchar released_reason
        int created_by "admin users.id"
        timestamp created_at
        timestamp updated_at
    }

    UNIT_WAITLIST {
        int id PK
        int inquiry_id FK "SET NULL"
        int user_id FK "SET NULL"
        varchar room_name "soft ref"
        varchar full_name
        varchar contact_no
        varchar email
        varchar status "Waiting | Notified ..."
        datetime notified_at
        int created_by "admin users.id"
        timestamp created_at
    }

    VISITOR_LOGS {
        int id PK
        int user_id FK "host tenant, SET NULL"
        varchar room_name "soft ref"
        varchar visitor_name
        varchar contact_number
        varchar id_type
        varchar id_number
        varchar id_photo_path
        varchar purpose
        varchar vehicle_plate
        enum status "pending_approval | checked_in | checked_out | denied | cancelled"
        datetime expected_at
        datetime check_in_at
        datetime check_out_at
        text checkout_notes
        datetime overstay_alerted_at "claim column"
        text admin_notes
        int created_by "users.id"
        timestamp created_at
        timestamp updated_at
    }

    USERS |o--o{ INQUIRIES : "files"
    INQUIRIES |o--o{ UNIT_RESERVATIONS : "converts to hold"
    INQUIRIES |o--o{ UNIT_WAITLIST : "waits via"
    USERS |o--o{ UNIT_RESERVATIONS : "holds"
    USERS |o--o{ UNIT_WAITLIST : "waits"
    ROOMS |o..o{ INQUIRIES : "asked about"
    ROOMS ||..o{ UNIT_RESERVATIONS : "held"
    ROOMS ||..o{ UNIT_WAITLIST : "awaited"
    USERS |o--o{ VISITOR_LOGS : "hosts"
    ROOMS ||..o{ VISITOR_LOGS : "visited"
```

`overstayed` is computed when visitor rows are read; it is never stored as a status.

### 1.6 Communication

```mermaid
erDiagram
    ANNOUNCEMENTS {
        int id PK
        varchar tag "Urgent | Reminder | General"
        varchar title
        text body
        varchar send_to "All Tenants ..."
        longtext channels "JSON: in-app, sms, email"
        varchar status
        datetime scheduled_date "unused by the UI"
        int recipient_count
        timestamp created_at
    }

    NOTIFICATIONS {
        int id PK
        int user_id FK "CASCADE, whose inbox"
        varchar title
        text message
        varchar type "event type, e.g. rent_due, payment_verification"
        varchar audience "tenant | admin"
        varchar status "Pending = admin queue item | Resolved"
        varchar metadata_value "id of the related record"
        tinyint is_read
        timestamp created_at
    }

    NOTIFICATION_PREFERENCES {
        int user_id PK,FK "CASCADE"
        varchar category PK
        tinyint in_app_enabled
        tinyint sms_enabled
        tinyint email_enabled
        timestamp updated_at
    }

    NOTIFICATION_QUEUE {
        int id PK
        int user_id FK "CASCADE"
        enum channel "email | sms"
        varchar event_type
        longtext payload "to, subject, body, template, vars"
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
        int user_id FK "SET NULL"
        enum channel "in-app | email | sms"
        varchar event_type
        varchar recipient
        varchar subject
        text message_body "max 500 chars"
        enum status "sent | failed | skipped"
        text error_message
        varchar provider_message_id "Semaphore"
        varchar provider_status
        timestamp sent_at
    }

    MESSAGES {
        int id PK
        int sender_id FK "CASCADE"
        int receiver_id FK "CASCADE"
        text message
        tinyint is_read
        int reply_to_id "soft ref messages.id"
        timestamp created_at
    }

    USERS ||--o{ NOTIFICATIONS : "receives"
    USERS ||--o{ NOTIFICATION_PREFERENCES : "sets"
    USERS ||--o{ NOTIFICATION_QUEUE : "queued for"
    USERS |o--o{ NOTIFICATION_LOG : "delivered to"
    USERS ||--o{ MESSAGES : "sends"
    USERS ||--o{ MESSAGES : "receives"
    MESSAGES |o..o{ MESSAGES : "replied to by"
```

There is no `conversations` table: a chat thread is every `messages` row between two users.

### 1.7 Audit, Settings & Auth Support

```mermaid
erDiagram
    ACTIVITY_LOGS {
        int id PK
        varchar category "one of LOG_CATEGORIES"
        varchar action "Title Case Action"
        text details
        int performed_by FK "SET NULL"
        timestamp created_at
    }

    SYSTEM_SETTINGS {
        int id PK
        varchar setting_key UK
        text setting_value
        timestamp updated_at
    }

    LOGIN_ATTEMPTS {
        int id PK
        varchar ip_address
        varchar email "lowercased"
        datetime attempt_time
    }

    PASSWORD_RESETS {
        int id PK
        varchar email
        varchar token_hash
        datetime expires_at "NOW() + 30 min"
        timestamp created_at
    }

    PASSWORD_RESET_REQUESTS {
        int id PK
        varchar email
        varchar ip_address
        datetime requested_at
    }

    USERS |o--o{ ACTIVITY_LOGS : "performs"
    USERS ||..o{ LOGIN_ATTEMPTS : "by email"
    USERS ||..o{ PASSWORD_RESETS : "by email"
    USERS ||..o{ PASSWORD_RESET_REQUESTS : "by email"
```

### 1.8 Relationship reference

| Parent → Child | Via | Cardinality | Enforced | On delete |
|---|---|---|---|---|
| users → sessions | `user_id` | 1 : N | FK | CASCADE |
| users → rent_applications | `user_id` | 0..1 : N | FK | SET NULL |
| rooms → rent_applications | `room_name` | 1 : N | FK | RESTRICT |
| rent_applications → lease_contracts | `rent_application_id` (unique) | 1 : 0..1 | FK | CASCADE |
| lease_contracts → lease_renewals | `contract_id` | 1 : N | FK | CASCADE |
| rent_applications → household_members | `rent_application_id` | 1 : N | FK | CASCADE |
| users → invoices | `user_id` | 1 : N | FK | CASCADE |
| rent_applications → invoices | `rent_application_id` | 0..1 : N | FK | SET NULL |
| users → utility_readings | `user_id` | 0..1 : N | FK | SET NULL |
| users → maintenance_requests / cctv_requests / parking_reservations / service_requests | `user_id` | 1 : N | FK | CASCADE |
| parking_reservations → parking_charges | `reservation_id` | 1 : N (one per month) | FK | CASCADE |
| service_catalog → service_requests | `service_id` | 0..1 : N | FK | SET NULL |
| users → service_catalog | `created_by` | 0..1 : N | FK | SET NULL |
| users → inquiries / unit_reservations / unit_waitlist / visitor_logs | `user_id` | 0..1 : N | FK | SET NULL |
| inquiries → unit_reservations / unit_waitlist | `inquiry_id` | 0..1 : N | FK | SET NULL |
| users → notifications / notification_preferences / notification_queue | `user_id` | 1 : N | FK | CASCADE |
| users → notification_log | `user_id` | 0..1 : N | FK | SET NULL |
| users → messages | `sender_id`, `receiver_id` | 1 : N (each) | FK | CASCADE |
| users → activity_logs | `performed_by` | 0..1 : N | FK | SET NULL |
| rooms → utility_readings / maintenance_requests / service_requests / visitor_logs / inquiries / unit_reservations / unit_waitlist | `room_name` | 1 : N | soft | — |
| invoices → utility_readings / parking_charges / maintenance_requests / service_requests | `invoice_id` | 0..1 : N | soft | — |
| users (admin) → lease_renewals, expenses, inquiries, unit_reservations, unit_waitlist, service_requests, utility_readings, visitor_logs | `approved_by` / `created_by` / `handled_by` / `recorded_by` | 0..1 : N | soft | — |

---

## 2. Use Case Diagrams

Mermaid has no UML use-case type, so these diagrams are flowcharts. Actors are rectangles. Use cases are ovals inside a box that stands for the system boundary. A dotted arrow labelled «include» is a step the base use case always performs; one labelled «extend» is optional.

### 2.1 Actors

| Actor | Who | How the system tells them apart |
|---|---|---|
| **Guest** | Anyone not signed in | No session token |
| **Applicant** | Signed-in user with no active tenancy | `role = 'user'`, no `Approved`/`active`/`pending-move-out` application; `ProtectedRoute` pages only |
| **Tenant** | Signed-in user with a unit | `role = 'user'` + active tenancy; unlocks `TenantProtectedRoute` pages |
| **Administrator** | Property staff | `role = 'admin'`; every admin endpoint calls `require_admin()` |
| **Scheduler** | Windows Task Scheduler | Runs `backend/cron/daily_sweep.php` and `process_queue.php` (`run_queue.bat`) |
| **PayMongo** | Online payment gateway | Hosted checkout + `paymongo_webhook.php` |
| **Semaphore / SMTP** | SMS and email providers | Called by the notification queue drain |

A Tenant can do everything an Applicant can; an Applicant can do everything a Guest can once signed out.

### 2.2 System-wide overview

```mermaid
flowchart LR
    Guest["👤 Guest"]
    Applicant["👤 Applicant"]
    Tenant["👤 Tenant"]
    Admin["👤 Administrator"]
    Sched["⏱ Scheduler"]
    PM["💳 PayMongo"]
    Prov["📨 Semaphore / SMTP"]

    subgraph AMS["Apartment Management System"]
        direction TB
        A1(["Browse units & inquire"])
        A2(["Register / log in / reset password"])
        A3(["Apply for a unit"])
        A4(["Pay bills"])
        A5(["Manage tenancy<br/>(room, contract, household, move-out)"])
        A6(["Request maintenance & services<br/>(CCTV, parking, add-ons)"])
        A7(["Register visitors"])
        A8(["Communicate<br/>(notifications, announcements, chat)"])
        A9(["Administer leasing & tenants"])
        A10(["Administer billing, utilities & expenses"])
        A11(["Administer requests & visitors"])
        A12(["Reports, activity log, users & settings"])
        A13(["Run daily sweep & send queued SMS/email"])
    end

    Guest --- A1
    Guest --- A2
    Applicant --- A3
    Applicant --- A4
    Applicant --- A8
    Tenant --- A4
    Tenant --- A5
    Tenant --- A6
    Tenant --- A7
    Tenant --- A8
    Admin --- A8
    Admin --- A9
    Admin --- A10
    Admin --- A11
    Admin --- A12
    Sched --- A13
    A4 --- PM
    A13 --- Prov
```

### 2.3 Guest

```mermaid
flowchart LR
    Guest["👤 Guest"]

    subgraph AMS["AMS — public pages"]
        direction TB
        G1(["View home & unit listings<br/>/home, /preview"])
        G2(["View unit gallery & details"])
        G3(["Submit inquiry<br/>/inquire → submit_inquiry.php"])
        G4(["Register account<br/>/register → registration.php"])
        G5(["Log in<br/>/login → login.php"])
        G6(["Request password reset<br/>forgot_password.php"])
        G7(["Reset password with emailed link<br/>/reset-password"])
        G8(["Accept SMS consent & password policy"])
        G9(["Throttle failed attempts"])
    end

    Guest --- G1
    Guest --- G3
    Guest --- G4
    Guest --- G5
    Guest --- G6
    Guest --- G7

    G2 -.->|"«extend»"| G1
    G3 -.->|"«extend»"| G1
    G4 -.->|"«include»"| G8
    G5 -.->|"«include»"| G9
    G6 -.->|"«include»"| G9
```

### 2.4 Applicant (registered, no unit yet)

```mermaid
flowchart LR
    App["👤 Applicant"]

    subgraph AMS["AMS — signed-in pages"]
        direction TB
        P1(["Submit rent application<br/>/rent-application"])
        P2(["Upload valid ID (front/back) & NBI clearance"])
        P3(["Agree to terms"])
        P4(["Track application status<br/>/track-application"])
        P5(["Resubmit after rejection"])
        P6(["Pay move-in invoice<br/>(first month + deposit)"])
        P7(["View draft contract<br/>/view-contract"])
        P8(["Manage profile & password<br/>/profile-settings"])
        P9(["Read notifications<br/>/notifications"])
        P10(["Set notification preferences"])
        P11(["Chat with admin"])
    end

    App --- P1
    App --- P4
    App --- P6
    App --- P7
    App --- P8
    App --- P9
    App --- P11

    P1 -.->|"«include»"| P2
    P1 -.->|"«include»"| P3
    P5 -.->|"«extend»"| P4
    P6 -.->|"«extend»"| P4
    P10 -.->|"«extend»"| P8
```

Paying the move-in invoice turns the Applicant into a Tenant: `settle_invoice()` sets the application to `active`, the contract from `draft` to `active` and fixes the room's lease dates.

### 2.5 Tenant

```mermaid
flowchart LR
    Tenant["👤 Tenant"]
    PM["💳 PayMongo"]

    subgraph AMS["AMS — tenant portal"]
        direction TB

        subgraph Home["Unit & lease"]
            T1(["View my room & lease<br/>/my-room"])
            T2(["View / download contract"])
            T3(["Request lease extension"])
            T4(["Request occupancy change"])
            T5(["Add / remove household member"])
            T6(["Give move-out notice"])
        end

        subgraph Pay["Billing"]
            T7(["View bills<br/>/pay-bills"])
            T8(["Pay online via PayMongo<br/>(GCash, Maya, card, bank)"])
            T9(["Pay manually with proof<br/>(GCash / bank transfer)"])
            T10(["Declare cash payment"])
            T11(["Schedule a payment"])
            T12(["Pay months in advance (max 6)"])
            T13(["View payment history & receipts"])
            T14(["View utility readings<br/>/user-utilities"])
        end

        subgraph Req["Requests"]
            T15(["File maintenance request<br/>+ photo/video"])
            T16(["Request CCTV footage"])
            T17(["Reserve parking + OR/CR"])
            T18(["Book add-on service<br/>/service-catalog"])
            T19(["Track & cancel my requests<br/>/my-requests"])
            T20(["Pre-register visitor<br/>/visitor-management"])
        end

        subgraph Comm["Communication & account"]
            T21(["Read announcements"])
            T22(["Read / clear notifications"])
            T23(["Chat with admin"])
            T24(["Manage profile, password,<br/>notification preferences"])
        end
    end

    Tenant --- T1
    Tenant --- T7
    Tenant --- T13
    Tenant --- T14
    Tenant --- T15
    Tenant --- T16
    Tenant --- T17
    Tenant --- T18
    Tenant --- T19
    Tenant --- T20
    Tenant --- T21
    Tenant --- T22
    Tenant --- T23
    Tenant --- T24

    T2 -.->|"«extend»"| T1
    T3 -.->|"«extend»"| T1
    T4 -.->|"«extend»"| T1
    T5 -.->|"«extend»"| T1
    T6 -.->|"«extend»"| T1
    T8 -.->|"«extend»"| T7
    T9 -.->|"«extend»"| T7
    T10 -.->|"«extend»"| T7
    T11 -.->|"«extend»"| T7
    T12 -.->|"«extend»"| T7
    T8 --- PM
```

Service pages respect the admin's service toggles in `system_settings`; a disabled module is hidden and its endpoint refuses new requests.

### 2.6 Administrator — leasing & tenancy

```mermaid
flowchart LR
    Admin["👤 Administrator"]

    subgraph AMS["AMS — admin panel: leasing"]
        direction TB
        L1(["Manage inquiries<br/>/admin-inquiries"])
        L2(["Schedule viewing"])
        L3(["Place / release unit hold"])
        L4(["Add to unit waitlist"])
        L5(["Review rent applications<br/>/admin-applications"])
        L6(["Approve application"])
        L7(["Reject / decline with reason"])
        L8(["Claim room, create move-in invoice<br/>& draft contract"])
        L9(["Manage units<br/>/admin-units"])
        L10(["Upload unit gallery"])
        L11(["Manage tenants<br/>/admin-tenants"])
        L12(["Decide tenant requests<br/>(extension, occupancy, household)"])
        L13(["Record move-out<br/>(deductions & deposit refund)"])
        L14(["Archive / restore tenant"])
        L15(["Manage contracts<br/>/admin-contracts"])
        L16(["Activate / edit / flag eviction / terminate"])
        L17(["Upload signed & notarized lease"])
        L18(["Vacate room & notify waitlist"])
    end

    Admin --- L1
    Admin --- L5
    Admin --- L9
    Admin --- L11
    Admin --- L15

    L2 -.->|"«extend»"| L1
    L3 -.->|"«extend»"| L1
    L4 -.->|"«extend»"| L1
    L6 -.->|"«extend»"| L5
    L7 -.->|"«extend»"| L5
    L6 -.->|"«include»"| L8
    L10 -.->|"«extend»"| L9
    L12 -.->|"«extend»"| L11
    L13 -.->|"«extend»"| L11
    L14 -.->|"«extend»"| L11
    L16 -.->|"«extend»"| L15
    L17 -.->|"«extend»"| L15
    L13 -.->|"«include»"| L18
```

### 2.7 Administrator — operations, finance & system

```mermaid
flowchart LR
    Admin["👤 Administrator"]

    subgraph AMS["AMS — admin panel: operations"]
        direction TB

        subgraph Fin["Finance"]
            F1(["Manage payments<br/>/admin-payments"])
            F2(["Create / adjust invoice"])
            F3(["Verify or reject payment proof"])
            F4(["Record cash / manual payment"])
            F5(["Send payment reminder"])
            F6(["Record utility readings<br/>/admin-utilities"])
            F7(["Post reading to invoice"])
            F8(["Manage expenses"])
        end

        subgraph Ops["Requests & visitors"]
            O1(["Maintenance board<br/>/admin-maintenance"])
            O2(["Triage, assign, set cost, complete"])
            O3(["Bill tenant-caused repair"])
            O4(["Review CCTV requests"])
            O5(["Assign / reject / release parking"])
            O6(["Bill parking month"])
            O7(["Manage service catalog & bookings<br/>/admin-services"])
            O8(["Bill completed service"])
            O9(["Visitor log<br/>/admin-visitors"])
            O10(["Approve / deny pre-registration,<br/>walk-in check-in, check-out"])
        end

        subgraph Sys["Communication & system"]
            S1(["Create announcement<br/>(in-app / SMS / email)"])
            S2(["Work admin notification queue"])
            S3(["Chat with tenants<br/>/admin-messages"])
            S4(["Generate reports<br/>/admin-reports"])
            S5(["View activity log"])
            S6(["Manage admin & user accounts<br/>/admin-users"])
            S7(["Configure settings, service toggles,<br/>payment channels, SMS/email"])
            S8(["Send test notification / check SMS balance"])
        end
    end

    Admin --- F1
    Admin --- F6
    Admin --- F8
    Admin --- O1
    Admin --- O4
    Admin --- O5
    Admin --- O7
    Admin --- O9
    Admin --- S1
    Admin --- S2
    Admin --- S3
    Admin --- S4
    Admin --- S5
    Admin --- S6
    Admin --- S7

    F2 -.->|"«extend»"| F1
    F3 -.->|"«extend»"| F1
    F4 -.->|"«extend»"| F1
    F5 -.->|"«extend»"| F1
    F7 -.->|"«extend»"| F6
    O2 -.->|"«extend»"| O1
    O3 -.->|"«extend»"| O2
    O6 -.->|"«extend»"| O5
    O8 -.->|"«extend»"| O7
    O10 -.->|"«extend»"| O9
    S8 -.->|"«extend»"| S7
```

Every admin write above also calls `log_activity()`, which records it in the activity log. That step is left out of the diagram.

### 2.8 System actors (scheduler & gateways)

```mermaid
flowchart LR
    Sched["⏱ Scheduler<br/>(daily_sweep.php)"]
    Drain["⏱ Scheduler<br/>(process_queue.php)"]
    PM["💳 PayMongo"]
    Prov["📨 Semaphore / SMTP"]

    subgraph AMS["AMS — automated"]
        direction TB
        X1(["Run notification sweep<br/>run_notification_sweep()"])
        X2(["Mark overdue invoices"])
        X3(["Issue next month's rent invoice<br/>7 days ahead"])
        X4(["Send rent-due & overdue reminders"])
        X5(["Post monthly parking charges /<br/>release expired parking"])
        X6(["Expire lapsed contracts &<br/>send lease-end reminders"])
        X7(["Drain SMS/email queue<br/>(claim, retry, quiet hours)"])
        X8(["Receive payment webhook"])
        X9(["Settle invoice"])
    end

    Sched --- X1
    X1 -.->|"«include»"| X2
    X1 -.->|"«include»"| X3
    X1 -.->|"«include»"| X4
    X1 -.->|"«include»"| X5
    X1 -.->|"«include»"| X6
    Drain --- X7
    X7 --- Prov
    PM --- X8
    X8 -.->|"«include»"| X9
```

The sweep also runs at most once a day when a user's notification poll happens to trigger it (claimed through `system_settings.notification_sweep_last_run`), so reminders still go out if the scheduled task is not installed.

---

## 3. Data Flow Diagrams (DFD)

### 3.0 Notation and data stores

| Shape | Meaning |
|---|---|
| `[ Rectangle ]` | External entity |
| `( Rounded, numbered )` | Process |
| `[( Cylinder )]` | Data store |
| Arrow label | Data flowing in that direction |

The Level 1 and Level 2 diagrams share these data stores:

| Store | Tables / location |
|---|---|
| D1 Users | `users` |
| D2 Auth | `sessions`, `login_attempts`, `password_resets`, `password_reset_requests` |
| D3 Rooms | `rooms` |
| D4 Leads | `inquiries`, `unit_reservations`, `unit_waitlist` |
| D5 Applications | `rent_applications` |
| D6 Household | `household_members` |
| D7 Contracts | `lease_contracts`, `lease_renewals` |
| D8 Invoices | `invoices` |
| D9 Utilities | `utility_readings` |
| D10 Parking | `parking_reservations`, `parking_charges` |
| D11 Maintenance | `maintenance_requests` |
| D12 CCTV | `cctv_requests` |
| D13 Services | `service_catalog`, `service_requests` |
| D14 Visitors | `visitor_logs` |
| D15 Announcements | `announcements` |
| D16 Notifications | `notifications` (tenant inbox + admin queue) |
| D17 Delivery | `notification_queue`, `notification_log`, `notification_preferences` |
| D18 Messages | `messages` |
| D19 Activity log | `activity_logs` |
| D20 Settings | `system_settings` |
| D21 Expenses | `expenses` |
| F1 Uploads | `backend/uploads/` (IDs, proofs, attachments, leases, gallery) |

### 3.1 Context diagram (Level 0)

```mermaid
flowchart LR
    Guest["Guest"]
    Tenant["Applicant / Tenant"]
    Admin["Administrator"]
    Sched["Scheduler"]
    PM["PayMongo"]
    SMS["Semaphore SMS"]
    Mail["SMTP email server"]

    AMS(("0<br/>Apartment<br/>Management<br/>System"))

    Guest -->|"inquiry, registration,<br/>credentials, reset request"| AMS
    AMS -->|"unit listings, gallery,<br/>session token, reset link"| Guest

    Tenant -->|"application + documents, payments + proof,<br/>maintenance / CCTV / parking / service requests,<br/>visitor pre-registrations, tenancy requests,<br/>chat messages, profile & preferences"| AMS
    AMS -->|"application status, invoices & receipts,<br/>room / lease / contract, utility readings,<br/>request status, notifications, announcements,<br/>chat messages"| Tenant

    Admin -->|"decisions (approve / reject / assign),<br/>units, invoices, readings, payments,<br/>announcements, settings, accounts"| AMS
    AMS -->|"dashboard KPIs, admin queue, reports,<br/>tenant & unit records, activity log"| Admin

    Sched -->|"daily trigger, queue drain trigger"| AMS

    AMS -->|"checkout session request"| PM
    PM -->|"checkout URL, payment webhook event"| AMS

    AMS -->|"SMS message"| SMS
    SMS -->|"message id, status, balance"| AMS

    AMS -->|"email message"| Mail
    Mail -->|"send result"| AMS
```

### 3.2 Level 1 — core processes

```mermaid
flowchart TB
    Guest["Guest"]
    Tenant["Applicant / Tenant"]
    Admin["Administrator"]
    Sched["Scheduler"]
    PM["PayMongo"]
    Prov["Semaphore / SMTP"]

    P1("1.0<br/>Authenticate &<br/>manage accounts")
    P2("2.0<br/>Leads &<br/>rent applications")
    P3("3.0<br/>Tenancy<br/>lifecycle")
    P4("4.0<br/>Billing &<br/>payments")
    P5("5.0<br/>Maintenance")
    P6("6.0<br/>Tenant services<br/>(CCTV, parking, add-ons)")
    P7("7.0<br/>Visitor<br/>management")
    P8("8.0<br/>Communication &<br/>notification delivery")
    P9("9.0<br/>Reports, audit<br/>& settings")

    D1[("D1 Users")]
    D2[("D2 Auth")]
    D3[("D3 Rooms")]
    D4[("D4 Leads")]
    D5[("D5 Applications")]
    D7[("D7 Contracts")]
    D8[("D8 Invoices")]
    D11[("D11 Maintenance")]
    D10_13[("D10 / D12 / D13<br/>Parking, CCTV, Services")]
    D14[("D14 Visitors")]
    D16[("D16 Notifications")]
    D17[("D17 Delivery")]
    D19[("D19 Activity log")]
    D20[("D20 Settings")]

    Guest -->|"credentials, registration"| P1
    Tenant -->|"credentials, profile"| P1
    Admin -->|"admin / user accounts"| P1
    P1 -->|"session token"| Tenant
    P1 <-->|"user rows"| D1
    P1 <-->|"tokens, attempts"| D2

    Guest -->|"inquiry"| P2
    Tenant -->|"application + documents"| P2
    Admin -->|"hold, waitlist, approve / reject"| P2
    P2 <--> D4
    P2 <--> D5
    P2 -->|"room claimed"| D3
    P2 -->|"move-in invoice"| D8
    P2 -->|"draft contract"| D7

    Tenant -->|"extension, occupancy,<br/>household, move-out"| P3
    Admin -->|"decisions, move-out record,<br/>contract actions"| P3
    Sched -->|"expiry trigger"| P3
    P3 <--> D5
    P3 <--> D7
    P3 <--> D3

    Tenant -->|"payment, proof"| P4
    Admin -->|"invoices, readings,<br/>verification, cash"| P4
    Sched -->|"sweep trigger"| P4
    PM -->|"webhook event"| P4
    P4 -->|"checkout request"| PM
    P4 <--> D8
    P4 -->|"activate tenancy"| D5
    P4 -->|"receipt, balance"| Tenant

    Tenant -->|"ticket + attachment"| P5
    Admin -->|"triage, assign, cost, status"| P5
    P5 <--> D11
    P5 -->|"repair recharge"| D8

    Tenant -->|"CCTV / parking / service request"| P6
    Admin -->|"decisions, slots, catalog"| P6
    P6 <--> D10_13
    P6 -->|"parking / service charge"| D8

    Tenant -->|"pre-registration"| P7
    Admin -->|"approve, check-in / out"| P7
    P7 <--> D14

    Admin -->|"announcement, chat"| P8
    Tenant -->|"chat, preferences"| P8
    P2 & P3 & P4 & P5 & P6 & P7 -->|"events"| P8
    P8 <--> D16
    P8 <--> D17
    P8 -->|"SMS / email"| Prov
    P8 -->|"notifications"| Tenant
    P8 -->|"admin queue"| Admin

    Admin -->|"report filters, settings"| P9
    P9 -->|"reports, KPIs, activity log"| Admin
    P9 <--> D20
    P9 -->|"reads"| D19
    P1 & P2 & P3 & P4 & P5 & P6 & P7 & P8 -->|"audit entry"| D19
```

Process 9.0 reads from almost every store (D3, D5, D8, D9, D11, D13, D21) to build reports; those read-only flows are omitted to keep the diagram legible.

### 3.3 Level 2 — 2.0 Leads & rent applications

```mermaid
flowchart TB
    Guest["Guest"]
    App["Applicant"]
    Admin["Administrator"]

    P21("2.1<br/>Record inquiry")
    P22("2.2<br/>Hold unit /<br/>add to waitlist")
    P23("2.3<br/>Validate & store<br/>application")
    P24("2.4<br/>Store uploaded<br/>documents")
    P25("2.5<br/>Review application")
    P26("2.6<br/>Claim room")
    P27("2.7<br/>Create move-in invoice<br/>(rent + deposit)")
    P28("2.8<br/>Create draft<br/>contract")

    D1[("D1 Users")]
    D3[("D3 Rooms")]
    D4[("D4 Leads")]
    D5[("D5 Applications")]
    D7[("D7 Contracts")]
    D8[("D8 Invoices")]
    D16[("D16 Notifications")]
    D19[("D19 Activity log")]
    F1[("F1 Uploads")]

    Guest -->|"name, contact, unit, move-in date"| P21
    P21 -->|"inquiry (status New)"| D4
    P21 -->|"admin queue item: inquiry"| D16
    Admin -->|"hold / waitlist decision"| P22
    D4 -->|"inquiry"| P22
    P22 -->|"unit_reservations / unit_waitlist row"| D4
    P22 -->|"status reserved"| D3

    App -->|"personal info, unit, months,<br/>occupants, terms"| P23
    D3 -->|"vacancy & rent"| P23
    D1 -->|"user_id"| P23
    P23 -->|"application (Pending Review)"| D5
    P23 -->|"admin queue item: rent_application"| D16
    App -->|"valid ID front/back, NBI clearance"| P24
    P24 -->|"files"| F1
    P24 -->|"file paths"| D5

    D5 -->|"pending application"| P25
    Admin -->|"approve / reject + reason"| P25
    P25 -->|"new status"| D5
    P25 -->|"decision notice"| D16
    P25 -->|"Approve / Reject"| D19
    P25 -->|"application status"| App

    P25 -->|"if approved"| P26
    P26 -->|"occupied, tenant_name, lease dates<br/>(only if vacant / reserved)"| D3
    P26 -->|"hold → Converted"| D4
    P25 -->|"if approved"| P27
    P27 -->|"INV-…, pending, due +7 days"| D8
    P25 -->|"if approved"| P28
    P28 -->|"CTR-…, status draft"| D7
```

The approval writes in 2.6–2.8 run in one transaction. If another approval already claimed the room, the whole approval fails and nothing is written.

### 3.4 Level 2 — 3.0 Tenancy lifecycle

```mermaid
flowchart TB
    Tenant["Tenant"]
    Admin["Administrator"]
    Sched["Scheduler"]

    P31("3.1<br/>Schedule & confirm<br/>move-in (after payment)")
    P32("3.2<br/>Request extension /<br/>occupancy / household change")
    P33("3.3<br/>Decide tenant<br/>request")
    P34("3.4<br/>Give move-out<br/>notice")
    P35("3.5<br/>Record move-out &<br/>settle deposit")
    P36("3.6<br/>Contract actions<br/>(activate, edit, flag, terminate)")
    P37("3.7<br/>Expire lapsed contracts &<br/>remind lease end")
    P38("3.8<br/>Vacate room &<br/>notify waitlist")

    D3[("D3 Rooms")]
    D4[("D4 Leads")]
    D5[("D5 Applications")]
    D6[("D6 Household")]
    D7[("D7 Contracts")]
    D8[("D8 Invoices")]
    D16[("D16 Notifications")]
    F1[("F1 Uploads")]

    Admin -->|"move-in date, confirm occupancy"| P31
    D8 -->|"move-in invoice paid (from 4.0)"| P31
    P31 -->|"Approved → active"| D5
    P31 -->|"draft → active, lease dates"| D7
    P31 -->|"lease dates"| D3

    Tenant -->|"request details"| P32
    P32 -->|"Pending household row"| D6
    P32 -->|"admin queue item"| D16
    D16 -->|"pending request"| P33
    Admin -->|"approve / reject"| P33
    P33 -->|"lease_end + months,<br/>lease_renewals row"| D7
    P33 -->|"occupants, monthly_rent"| D5
    P33 -->|"Active / Rejected / Removed"| D6
    P33 -->|"decision notice"| D16

    Tenant -->|"move-out date"| P34
    P34 -->|"pending-move-out,<br/>requested_move_out_date"| D5
    P34 -->|"admin queue item: move_out_request"| D16

    Admin -->|"damage & utility deductions"| P35
    D7 -->|"deposit held"| P35
    P35 -->|"refund, deposit_status"| D7
    P35 -->|"moved-out"| D5
    P35 --> P38

    Admin -->|"action + reason, signed / notarized lease"| P36
    P36 -->|"lease files"| F1
    P36 -->|"status per CONTRACT_TRANSITIONS"| D7
    P36 -->|"terminate → moved-out"| D5
    P36 -->|"terminate"| P38

    Sched -->|"daily trigger"| P37
    D7 -->|"active contracts"| P37
    P37 -->|"active → expired,<br/>renewal_reminder_sent_at"| D7
    P37 -->|"lease-end reminder"| D16

    P38 -->|"vacant, last_tenant,<br/>clear lease cache"| D3
    P38 -->|"end household"| D6
    P38 -->|"first Waiting → Notified"| D4
    P38 -->|"waitlist + admin notice"| D16
```

Archiving a tenant (`archive_tenant.php`) follows the same vacate path and saves `pre_archive_status` so `restore_tenant.php` can undo it.

### 3.5 Level 2 — 4.0 Billing & payments

```mermaid
flowchart TB
    Tenant["Tenant"]
    Admin["Administrator"]
    Sched["Scheduler"]
    PM["PayMongo"]

    P41("4.1<br/>Issue rent invoices<br/>& mark overdue")
    P42("4.2<br/>Create / adjust<br/>invoice")
    P43("4.3<br/>Record utility reading<br/>& post to invoice")
    P44("4.4<br/>Online checkout<br/>(PayMongo)")
    P45("4.5<br/>Manual payment<br/>+ proof")
    P46("4.6<br/>Declare cash /<br/>schedule payment")
    P47("4.7<br/>Verify / reject proof,<br/>record cash")
    P48("4.8<br/>Settle invoice<br/>& issue receipt")
    P49("4.9<br/>Send reminders")

    D5[("D5 Applications")]
    D7[("D7 Contracts")]
    D8[("D8 Invoices")]
    D9[("D9 Utilities")]
    D16[("D16 Notifications")]
    D19[("D19 Activity log")]
    D20[("D20 Settings")]
    F1[("F1 Uploads")]

    Sched -->|"daily trigger"| P41
    D7 -->|"active leases, lease-start day"| P41
    D5 -->|"monthly_rent"| P41
    P41 -->|"next month's invoice (7 days ahead),<br/>pending → overdue"| D8

    Admin -->|"line items, due date"| P42
    P42 -->|"insert-only invoice / adjusted lines,<br/>total recomputed"| D8

    Admin -->|"meter readings, rates"| P43
    P43 -->|"reading (UNIQUE room + month)"| D9
    D9 -->|"un-invoiced reading (claimed)"| P43
    P43 -->|"water, electricity"| D8

    D8 -->|"open invoices"| Tenant
    Tenant -->|"invoice / advance months"| P44
    D20 -->|"enabled channels, keys"| P44
    P44 -->|"checkout session request"| PM
    PM -->|"checkout URL"| Tenant
    P44 -->|"processing, checkout_session_id,<br/>payment_group"| D8
    PM -->|"webhook: paid / failed"| P44
    P44 -->|"paid"| P48
    P44 -->|"payment-failed or<br/>amount mismatch → pending-verification"| D8

    Tenant -->|"method, reference,<br/>sender name, proof image"| P45
    P45 -->|"proof file"| F1
    P45 -->|"pending-verification"| D8
    P45 -->|"admin queue: payment_verification"| D16

    Tenant -->|"cash declaration / date & slot"| P46
    P46 -->|"method cash / scheduled"| D8
    P46 -->|"admin queue: cash_payment_declared"| D16

    D8 -->|"pending-verification / cash"| P47
    Admin -->|"confirm, reject + reason, cash amount"| P47
    P47 -->|"proof_rejection_reason → back to open"| D8
    P47 -->|"confirmed"| P48

    P48 -->|"paid, paid_at<br/>(each month of a payment group)"| D8
    P48 -->|"move-in invoice → activate tenancy (3.1)"| D5
    P48 -->|"receipt / payment notice"| D16
    P48 -->|"Payment Settled"| D19

    Sched -->|"daily trigger"| P49
    D8 -->|"due soon / overdue"| P49
    D20 -->|"reminder days & interval"| P49
    P49 -->|"rent_due / overdue notices,<br/>last_reminder_date"| D16
    Admin -->|"manual reminder"| P49
```

An invoice counts as still owed while its status is in `BILLING_OPEN_STATUSES` (`pending`, `unpaid`, `overdue`, `pending-verification`, `scheduled`, `processing`, `payment-failed`).

### 3.6 Level 2 — 5.0 Maintenance

```mermaid
flowchart TB
    Tenant["Tenant"]
    Admin["Administrator"]

    P51("5.1<br/>Submit request")
    P52("5.2<br/>Triage<br/>(urgency, accept / reject)")
    P53("5.3<br/>Assign & estimate")
    P54("5.4<br/>Update progress<br/>(In Progress ⇄ Pending,<br/>Completed, reopen)")
    P55("5.5<br/>Bill tenant-caused<br/>repair")
    P56("5.6<br/>Cancel pending<br/>request")
    P57("5.7<br/>Cost & budget<br/>reporting")

    D5[("D5 Applications")]
    D8[("D8 Invoices")]
    D11[("D11 Maintenance")]
    D16[("D16 Notifications")]
    D19[("D19 Activity log")]
    D20[("D20 Settings")]
    F1[("F1 Uploads")]

    Tenant -->|"title, category, description,<br/>preferred date/time, entry permission,<br/>photo / video"| P51
    D5 -->|"current room (snapshot)"| P51
    P51 -->|"attachment"| F1
    P51 -->|"Pending, urgency Needs Triage"| D11
    P51 -->|"admin queue: maintenance_request"| D16

    D11 -->|"pending tickets"| P52
    Admin -->|"urgency, reject reason"| P52
    P52 -->|"urgency, acknowledged_at /<br/>Rejected + reason"| D11

    Admin -->|"technician, estimated cost, notes"| P53
    P53 -->|"assigned_to, estimated_cost,<br/>work_notes, In Progress, started_at"| D11

    Admin -->|"status, actual cost"| P54
    P54 -->|"status per MAINTENANCE_TRANSITIONS,<br/>actual_cost, resolved_at"| D11
    P54 -->|"status update"| D16
    P54 -->|"Maintenance status"| D19

    P54 -->|"Completed + tenant_responsible"| P55
    D11 -->|"claim is_invoiced"| P55
    P55 -->|"COALESCE(actual, estimated)<br/>→ invoices.maintenance"| D8
    P55 -->|"invoice_id, billing_period"| D11

    Tenant -->|"cancel"| P56
    P56 -->|"Cancelled (only while Pending)"| D11

    D11 -->|"costs by category & unit"| P57
    D20 -->|"monthly budget"| P57
    P57 -->|"budget used, spend breakdown"| Admin
```

Clearing `tenant_responsible` or reopening the ticket reverses the recharge, but only while the invoice it went to is unpaid.

### 3.7 Level 2 — 6.0 Tenant services (CCTV, parking, add-ons)

```mermaid
flowchart TB
    Tenant["Tenant"]
    Admin["Administrator"]
    Sched["Scheduler"]

    subgraph CCTV["CCTV footage"]
        P61("6.1<br/>Request footage")
        P62("6.2<br/>Approve / reject")
    end

    subgraph Parking["Parking"]
        P63("6.3<br/>Reserve slot<br/>+ OR/CR")
        P64("6.4<br/>Assign slot / reject /<br/>release")
        P65("6.5<br/>Post monthly<br/>parking charge")
    end

    subgraph Addon["Add-on services"]
        P66("6.6<br/>Maintain catalog")
        P67("6.7<br/>Book service")
        P68("6.8<br/>Process booking")
        P69("6.9<br/>Bill completed<br/>service")
    end

    P60("6.0.1<br/>Cancel own<br/>pending request")

    D8[("D8 Invoices")]
    D10[("D10 Parking")]
    D12[("D12 CCTV")]
    D13[("D13 Services")]
    D16[("D16 Notifications")]
    D20[("D20 Settings")]
    F1[("F1 Uploads")]

    Tenant -->|"incident date/time, location, reason"| P61
    D20 -->|"service enabled?"| P61
    P61 -->|"Pending"| D12
    P61 -->|"admin queue: cctv_request"| D16
    Admin -->|"decision"| P62
    D12 -->|"pending"| P62
    P62 -->|"Approved / Rejected"| D12
    P62 -->|"decision notice"| D16

    Tenant -->|"vehicle, plate, transmission,<br/>months, OR/CR"| P63
    D20 -->|"allowed vehicle types,<br/>max slots, rate"| P63
    P63 -->|"OR/CR file"| F1
    P63 -->|"Pending (one open per tenant)"| D10
    P63 -->|"admin queue: parking_reservation"| D16
    Admin -->|"slot / reason"| P64
    P64 -->|"Assigned + slot (unique) /<br/>Rejected / Released"| D10
    P64 -->|"decision notice"| D16
    Sched -->|"daily trigger"| P65
    Admin -->|"Bill this month"| P65
    D10 -->|"Assigned reservations"| P65
    P65 -->|"parking_charges row<br/>(UNIQUE reservation + month)"| D10
    P65 -->|"invoices.parking"| D8

    Admin -->|"name, price, unit, lead time, active"| P66
    P66 --> D13
    D13 -->|"active catalog"| Tenant
    Tenant -->|"service, quantity, date/slot,<br/>notes, attachment"| P67
    P67 -->|"price & name snapshot, Pending"| D13
    P67 -->|"admin queue: service_request"| D16
    Admin -->|"approve, assign, progress"| P68
    P68 -->|"status per SERVICE_TRANSITIONS"| D13
    P68 -->|"status notice"| D16
    P68 -->|"Completed"| P69
    P69 -->|"claim is_invoiced"| D13
    P69 -->|"invoices.services"| D8

    Tenant -->|"cancel"| P60
    P60 -->|"Cancelled"| D12
    P60 -->|"Cancelled"| D10
    P60 -->|"Cancelled"| D13
```

### 3.8 Level 2 — 7.0 Visitor management

```mermaid
flowchart TB
    Tenant["Tenant"]
    Admin["Administrator"]

    P71("7.1<br/>Pre-register<br/>visitor")
    P72("7.2<br/>Approve / deny<br/>pre-registration")
    P73("7.3<br/>Walk-in<br/>check-in")
    P74("7.4<br/>Check out")
    P75("7.5<br/>Detect overstay")
    P76("7.6<br/>Cancel own<br/>pre-registration")

    D3[("D3 Rooms")]
    D14[("D14 Visitors")]
    D16[("D16 Notifications")]
    F1[("F1 Uploads")]

    Tenant -->|"visitor name, contact, purpose,<br/>expected time, vehicle, ID"| P71
    D3 -->|"host room"| P71
    P71 -->|"ID photo"| F1
    P71 -->|"pending_approval"| D14
    P71 -->|"admin queue: visitor_registration"| D16

    Admin -->|"approve / deny + notes"| P72
    D14 -->|"pending"| P72
    P72 -->|"checked_in + check_in_at / denied"| D14
    P72 -->|"decision notice"| Tenant

    Admin -->|"visitor details, host unit, ID photo"| P73
    P73 -->|"ID photo"| F1
    P73 -->|"checked_in"| D14

    Admin -->|"checkout notes"| P74
    P74 -->|"checked_out, check_out_at"| D14

    D14 -->|"checked_in past allowed stay"| P75
    P75 -->|"overstay_alerted_at (once)"| D14
    P75 -->|"visitor_overstay → admin & host"| D16

    Tenant -->|"cancel"| P76
    P76 -->|"cancelled"| D14
```

### 3.9 Level 2 — 8.0 Communication & notification delivery

```mermaid
flowchart TB
    Tenant["Applicant / Tenant"]
    Admin["Administrator"]
    Drain["Scheduler<br/>(process_queue.php)"]
    SMS["Semaphore SMS"]
    Mail["SMTP email"]
    Sock["Socket.IO server<br/>(:3001)"]

    Events["Events from<br/>2.0 – 7.0"]

    P81("8.1<br/>Create<br/>announcement")
    P82("8.2<br/>Create notification<br/>create_notification()")
    P83("8.3<br/>Check channel<br/>permission")
    P84("8.4<br/>Enqueue<br/>SMS / email")
    P85("8.5<br/>Drain queue<br/>(claim, send, retry)")
    P86("8.6<br/>Work admin queue<br/>(resolve item)")
    P87("8.7<br/>Read / clear<br/>notifications")
    P88("8.8<br/>Chat")

    D1[("D1 Users")]
    D15[("D15 Announcements")]
    D16[("D16 Notifications")]
    D17[("D17 Delivery")]
    D18[("D18 Messages")]
    D20[("D20 Settings")]

    Admin -->|"tag, title, body,<br/>audience, channels"| P81
    P81 -->|"announcement, recipient_count"| D15
    P81 -->|"per recipient"| P82
    Events -->|"event type, user, title,<br/>message, record id"| P82

    P82 -->|"inbox row (Pending only for<br/>admin-queue types, else Resolved)"| D16
    P82 --> P83
    D1 -->|"contact, sms/email opt-out"| P83
    D17 -->|"per-category preferences"| P83
    D20 -->|"building-wide channel switches,<br/>daily SMS cap"| P83
    P83 -->|"allowed channels"| P84
    P83 -->|"skipped + reason"| D17
    P84 -->|"notification_queue row (pending)"| D17

    Drain -->|"every few minutes"| P85
    D17 -->|"due pending jobs"| P85
    P85 -->|"claim_token, attempts,<br/>sent / failed, log row"| D17
    P85 -->|"SMS"| SMS
    SMS -->|"message_id, status"| P85
    P85 -->|"email"| Mail

    D16 -->|"Pending admin-queue items"| P86
    Admin -->|"act on request"| P86
    P86 -->|"Resolved"| D16

    D16 -->|"my notifications (polled)"| P87
    Tenant -->|"mark read, delete, clear all"| P87
    P87 -->|"is_read / delete"| D16

    Tenant -->|"message"| P88
    Admin -->|"message"| P88
    P88 <-->|"real-time relay"| Sock
    P88 <-->|"history, is_read, reply_to_id"| D18
```

Notification types that are not in `NOTIFICATION_PREF_CATEGORIES` (e.g. overdue alerts, application decisions, contract notices) ignore the per-category switches in 8.3. Only the global opt-outs and the building-wide switches can stop them.

---

> **Note:** These diagrams reflect `SetupDB.sql` and `backend/config.php` as of September 2026. When a migration adds a table or column, or a status transition map in `config.php` changes, update the matching ERD section and DFD process here in the same change.
