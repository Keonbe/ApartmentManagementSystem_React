# AMS — Panelist Feature Checklist

> **Project:** Apartment Management System  
> **Stack:** React 18 + Vite → PHP 8 → MySQL/MariaDB (XAMPP)  
> **Context:** Small-to-medium scale apartment building (15–100 units)  
> **Last Updated:** August 2026

---

## System Context

This system manages the **day-to-day operations of a small-to-medium apartment building**, covering the full tenant lifecycle from application through move-out. The target scale determines which features are essential vs. nice-to-have:

| Scale | Units | Tenants | Admin Staff | Monthly Transactions |
|---|---|---|---|---|
| **Small** | 5–20 | 10–40 | 1 admin | 20–80 payments |
| **Medium** | 20–100 | 40–200 | 1–3 admins | 80–400 payments |

### Core Operational Flow

```
1. PROCESSING              2. ACCEPTANCE               3. PAYMENT & OCCUPANCY
─────────────────          ─────────────────            ─────────────────────
Tenant applies             Admin reviews:               Tenant pays:
├── Personal info          ├── Valid ID verified         ├── 1 month advance rent
├── Valid ID upload         ├── Employment/income        ├── 1 month deposit
├── Contact details        ├── Background check         └── Security deposit
└── Room preference        └── Room availability
                                    │                          │
                                    ▼                          ▼
                              LEASE CONTRACT              MOVE-IN
                           (auto-generated)           (occupancy recorded)
```

---


## Master Checklist — Implementation Status

### Legend

| Symbol | Meaning |
|---|---|
| ✅ | Implemented and functional |
| 🔧 | Partially implemented / needs wiring |
| 📋 | Designed but not yet built |
| ❌ | Not started |

---

### Module 1 — Tenant Management

| # | Feature | Status | Priority | Notes |
|---|---|---|---|---|
| 1.1 | Tenant Registration | ✅ | Critical | `registration.php` + React form |
| 1.2 | Tenant Profile | ✅ | Critical | `profile.php` with edit |
| 1.3 | ID / Document Upload | ✅ | Critical | `upload_lease_document.php` |
| 1.4 | Occupancy Record | ✅ | Critical | Via `rent_applications` approval |
| 1.5 | Move-In / Move-Out Tracking | ✅ | High | Tenant initiates, admin inspects and approves |
| 1.6 | Application Processing Flow | ✅ | Critical | Pending → Approved/Rejected |
| 1.7 | Acceptance Criteria Enforcement | ✅ | Medium | Terms not yet enforced in flow |

### Module 2 — Apartment / Unit Management

| # | Feature | Status | Priority | Notes |
|---|---|---|---|---|
| 2.1 | Room / Unit Listing | ✅ | Critical | `get_rooms.php` |
| 2.2 | Unit Availability Dashboard | ✅ | Critical | Room status in admin panel |
| 2.3 | Set Occupancy | ✅ | Critical | Via application approval |
| 2.4 | Unit Status Monitoring | ✅ | Medium | DB-backed condition, furnishing, inspection logs & inline edit |
| 2.5 | Occupancy Tracking | ✅ | Medium | Dynamic stay durations, active counts, and 6-mo trend points |
| 2.6 | Extended Rent / Lease Renewal | ✅ | High | `extend_lease.php` |
| 2.7 | Unit Rate Configuration | ✅ | High | `update_room.php` |

### Module 3 — Rental Payment & Billing

| # | Feature | Status | Priority | Notes |
|---|---|---|---|---|
| 3.1 | Monthly Billing / Invoice Generation | ✅ | Critical | `invoices` table |
| 3.2 | Payment Recording | ✅ | Critical | `record_payment_admin.php` |
| 3.3 | Payment History | ✅ | Critical | `get_invoices.php` |
| 3.4 | Receipt Generation | ✅ | High | Printable official receipts with admin signature placeholder |
| 3.5 | Balance Monitoring | ✅ | High | Status filter select and full balance tracking metrics & aging ledger |
| 3.6 | Due Date Reminders | 📋 | High | Depends on notification module |
| 3.7 | Overdue Alerts | 📋 | High | Depends on notification module |
| 3.8 | Payment Proof Upload | ✅ | High | `upload_payment_proof.php` |
| 3.9 | Security Deposit Tracking | ✅ | Medium | Non-refundable deposit tracking applied to rent, bills, or damages |
| 3.10 | Extended Rent Terms | 🔧 | Medium | Lease extension exists; billing adjustment pending |

### Module 4 — Maintenance Request

| # | Feature | Status | Priority | Notes |
|---|---|---|---|---|
| 4.1 | Submit Maintenance Request | ✅ | Critical | `maintenance_request.php` |
| 4.2 | Issue Categories | ✅ | Critical | `issue_category` field |
| 4.3 | Priority Levels | ✅ | Critical | `urgency` field |
| 4.4 | Photo Upload | 🔧 | High | Field exists; UI upload pending |
| 4.5 | Status Tracking | ✅ | Critical | Pending → In Progress → Completed |
| 4.6 | Date / Time Tracking | 🔧 | High | `created_at` exists; resolution timestamps pending |
| 4.7 | Admin Assignment | ✅ | Medium | `assigned_to` field |
| 4.8 | Cost Estimation | ✅ | Medium | `estimated_cost`, `tenant_responsible` fields |
| 4.9 | Work Notes | ✅ | Medium | `work_notes` field |
| 4.10 | Tenant Notification on Update | 🔧 | High | In-app works; email/SMS pending |

### Module 5 — Service Management

| # | Feature | Status | Priority | Notes |
|---|---|---|---|---|
| 5.1 | Service Request Submission | ❌ | Low | Medium-scale feature |
| 5.2 | Service Catalog | ❌ | Low | Medium-scale feature |
| 5.3 | Service Status Tracking | ❌ | Low | Medium-scale feature |
| 5.4 | Service Billing Integration | ❌ | Low | Medium-scale feature |

### Module 6 — Notification Module

| # | Feature | Status | Priority | Notes |
|---|---|---|---|---|
| 6.1 | In-App Notifications | ✅ | Critical | Bell icon + notification center |
| 6.2 | Rent Due Reminders | 📋 | High | Architecture designed |
| 6.3 | Overdue Alerts | 📋 | High | Architecture designed |
| 6.4 | Maintenance Status Updates | 🔧 | High | In-app works; external channels pending |
| 6.5 | Building Announcements | ✅ | Critical | `create_announcement.php` |
| 6.6 | Email Notifications | 📋 | High | PHPMailer + Gmail SMTP designed |
| 6.7 | SMS Notifications | 📋 | Medium | Semaphore API designed |
| 6.8 | Notification Preferences | 📋 | Medium | Schema designed |

### Module 7 — Communication (Two-Way Chat)

| # | Feature | Status | Priority | Notes |
|---|---|---|---|---|
| 7.1 | Admin → Tenant Messaging | 📋 | High | Design complete |
| 7.2 | Tenant → Admin Messaging | 📋 | High | Design complete |
| 7.3 | Conversation History | 📋 | High | Design complete |
| 7.4 | Unread Message Badge | 📋 | High | Design complete |
| 7.5 | Admin Inbox | 📋 | High | Design complete |
| 7.6 | New Message Notification | 📋 | High | Design complete |

### Module 8 — Admin Dashboard & Reports

| # | Feature | Status | Priority | Notes |
|---|---|---|---|---|
| 8.1 | Dashboard Statistics | ✅ | Critical | `dashboard_stats.php` |
| 8.2 | Income Reports | ✅ | High | Financial income statement, unit income rankings, period comparisons, CSV/Print export (`get_report_data.php` + `AdminReports.jsx`) |
| 8.3 | Revenue Stream Analysis | ✅ | Medium | Category stream breakdown (Rent, Utilities, Parking, Deposits), multi-stream 6-month historical trends, diversification index |
| 8.4 | Tenant Monitoring | ✅ | Critical | `get_tenants.php` |
| 8.5 | Maintenance Monitoring | ✅ | High | `get_maintenance_requests.php` |
| 8.6 | System Activity Logs | ✅ | High | `activity_logs` table |
| 8.7 | Utility Usage Tracking | 📋 | Low | Medium-scale feature |
| 8.8 | Sampling Data / Demo Data | 📋 | High | Needed for demo |

### Module 9 — Contract & Document Generation

| # | Feature | Status | Priority | Notes |
|---|---|---|---|---|
| 9.1 | Lease Contract Generation | 🔧 | High | `create_contract.php` exists; template pending |
| 9.2 | Contract Viewing | 🔧 | High | `ViewContract.jsx` exists; not wired to `lease_contracts` |
| 9.3 | Contract Status Management | 🔧 | Medium | `update_contract_status.php` |
| 9.4 | Contract Renewal | 📋 | Medium | Depends on extend_lease flow |
| 9.5 | Downloadable / Printable | 📋 | Medium | PDF export pending |

### Module 10 — Parking Reservation

| # | Feature | Status | Priority | Notes |
|---|---|---|---|---|
| 10.1 | Parking Slot Listing | ✅ | High | `get_available_parking_slots.php` |
| 10.2 | Reservation Request | ✅ | High | `parking_reservation.php` |
| 10.3 | Parking Fee Integration | 📋 | Medium | Not yet linked to invoices |
| 10.4 | Slot Assignment Management | ✅ | High | Status: Pending → Assigned/Rejected |

### Module 11 — Security & Access Control

| # | Feature | Status | Priority | Notes |
|---|---|---|---|---|
| 11.1 | Role-Based Access Control | ✅ | Critical | Admin/tenant route guards |
| 11.2 | Admin Authentication | ✅ | Critical | `login.php` |
| 11.3 | Tenant Authentication | ✅ | Critical | `login.php` |
| 11.4 | Password Management | ✅ | High | `change_password.php` |
| 11.5 | CCTV Access Requests | ✅ | Medium | `cctv_request.php` |

### Module 12 — Visitor Management

| # | Feature | Status | Priority | Notes |
|---|---|---|---|---|
| 12.1 | Visitor Log Entry | ❌ | Low | Medium-scale feature |
| 12.2 | Tenant Pre-Authorization | ❌ | Low | Medium-scale feature |
| 12.3 | Visitor History | ❌ | Low | Medium-scale feature |

---

## Summary — Implementation Progress

| Module | Total Features | ✅ Done | 🔧 Partial | 📋 Designed | ❌ Not Started |
|---|---|---|---|---|---|
| 1. Tenant Management | 7 | 6 | 0 | 1 | 0 |
| 2. Unit Management | 7 | 7 | 0 | 0 | 0 |
| 3. Payment & Billing | 10 | 7 | 1 | 2 | 0 |
| 4. Maintenance Request | 10 | 7 | 3 | 0 | 0 |
| 5. Service Management | 4 | 0 | 0 | 0 | 4 |
| 6. Notification | 8 | 2 | 1 | 5 | 0 |
| 7. Communication | 6 | 0 | 0 | 6 | 0 |
| 8. Dashboard & Reports | 8 | 4 | 1 | 3 | 0 |
| 9. Contracts | 5 | 0 | 3 | 2 | 0 |
| 10. Parking | 4 | 3 | 0 | 1 | 0 |
| 11. Security & Access | 5 | 5 | 0 | 0 | 0 |
| 12. Visitor Management | 3 | 0 | 0 | 0 | 3 |
| **TOTAL** | **77** | **41** | **9** | **20** | **7** |

### Core Functionality Coverage

| Core Requirement | Covered By |
|---|---|
| Payment Tracking & Billing | Module 3 (10 features) |
| Communication Management | Module 7 (6 features) + Module 6 (8 features) |
| Maintenance Request | Module 4 (10 features) |
| Inquiry and Reservation | Module 1.6, Module 10, Module 11.5 |
| Report Generation | Module 8 (8 features) |
| Modular Services | Module 5 (4 features) |

---

## Module 1 — Tenant Management

**Context:** In a small/medium apartment, the admin personally handles tenant screening. The system must track the full tenant lifecycle: application → screening → approval → occupancy → move-out.

### Features

| # | Feature | Details | Scale | Implementation | Related Doc |
|---|---|---|---|---|---|
| 1.1 | **Tenant Registration** | Online application form: personal info (name, contact, email), emergency contact, employment/income details | Small+ | `registration.php`, `rent_application.php` | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |
| 1.2 | **Tenant Profile** | View/edit tenant details, profile photo, contact info, lease status, room assignment | Small+ | `profile.php`, `get_tenants.php` | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |
| 1.3 | **ID / Document Upload** | Upload valid government ID (front/back), proof of income, other supporting docs; stored securely on server | Small+ | `upload_lease_document.php`, `get_documents.php` | — |
| 1.4 | **Occupancy Record** | Track which tenant occupies which unit, move-in date, expected stay duration, number of occupants | Small+ | `rent_applications` table (status: Approved), `update_occupants.php` | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |
| 1.5 | **Move-In / Move-Out Tracking** | Record move-in date on approval, move-out with unit inspection notes, deposit refund status, archive tenant record | Small+ | `record_move_out.php`, `archive_tenant.php`, `restore_tenant.php` | [move_in_move_out_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/move_in_move_out_design.md) |
| 1.6 | **Application Processing Flow** | Status pipeline: Pending → Reviewed → Approved/Rejected. Admin sees pending applications, reviews documents, sets acceptance criteria | Small+ | `rent_application.php`, `get_applications.php` | — |
| 1.7 | **Acceptance Criteria Enforcement** | Before approval: verify valid ID uploaded, confirm payment terms agreed (1 month advance + 1 month deposit + security deposit) | Medium | Terms stored in `lease_contracts` or `system_settings` | — |

### Acceptance Terms (Small/Medium Scale)

| Term | Amount | When Due | Purpose |
|---|---|---|---|
| **1 Month Advance Rent** | Base rent amount | Before move-in | First month payment |
| **1 Month Deposit** | Base rent amount | Before move-in | Damage/unpaid rent coverage |
| **Security Deposit** | Configurable (typically 1 month) | Before move-in | Property damage guarantee |

---

## Module 2 — Apartment / Unit Management

**Context:** Small/medium apartments have a fixed number of units with varying types (studio, 1BR, 2BR). The admin needs a real-time view of which units are occupied, vacant, or under maintenance.

### Features

| # | Feature | Details | Scale | Implementation | Related Doc |
|---|---|---|---|---|---|
| 2.1 | **Room / Unit Listing** | List all units with: room ID, type, floor, capacity, monthly rate, current status | Small+ | `get_rooms.php`, `rooms` table | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |
| 2.2 | **Unit Availability Dashboard** | Visual overview: which rooms are Vacant / Occupied / Under Maintenance / Reserved | Small+ | `get_rooms.php` returns status per room | — |
| 2.3 | **Set Occupancy** | Assign tenant to unit on approval, update room status to Occupied, record max occupants allowed | Small+ | `rent_application.php` (approval flow), `update_room.php` | — |
| 2.4 | **Unit Status Monitoring** | Track room condition, last inspection date, maintenance history per unit, furnishing status | Medium | `rooms` table + `maintenance_requests` join | — |
| 2.5 | **Occupancy Tracking** | Dashboard: occupancy rate, average stay duration, vacancy rate trends per month | Medium | `get_report_data.php` | — |
| 2.6 | **Extended Rent / Lease Renewal** | Admin extends lease end date, generates updated contract, adjusts rent if rate changed | Small+ | `extend_lease.php` | — |
| 2.7 | **Unit Rate Configuration** | Set per-unit pricing: base rent, water allocation, electricity allocation, parking fee (if applicable) | Small+ | `update_room.php`, room rate fields | — |

### Room Status Values

| Status | Meaning | Trigger |
|---|---|---|
| **Vacant** | No tenant assigned, ready to rent | After move-out + inspection |
| **Occupied** | Active tenant with valid lease | After application approval + payment |
| **Under Maintenance** | Temporarily unavailable for occupancy | Admin sets during repairs |
| **Reserved** | Approved application, awaiting move-in payment | After application approval, before payment |

---

## Module 3 — Rental Payment & Billing

**Context:** In a small/medium apartment, billing is monthly. Each tenant's total rent includes base rent plus utilities and optional charges. The admin needs to track who has paid, who is overdue, and generate receipts.

### Features

| # | Feature | Details | Scale | Implementation | Related Doc |
|---|---|---|---|---|---|
| 3.1 | **Monthly Billing / Invoice Generation** | Auto-generate monthly invoice per tenant: base rent + water + electricity + parking (if applicable) | Small+ | `invoices` table, invoice generation in admin panel | — |
| 3.2 | **Payment Recording** | Admin records payment: amount, date, method (GCash / Cash / Bank Transfer), reference number | Small+ | `record_payment_admin.php`, `pay_bill.php` | — |
| 3.3 | **Payment History** | Tenant views their payment history; admin views all payments with filters by date, tenant, status | Small+ | `get_invoices.php` | — |
| 3.4 | **Receipt Generation** | Generate printable/downloadable receipt after payment confirmation: invoice #, amount, date, method, admin signature | Small+ | React print/PDF component from invoice data | — |
| 3.5 | **Balance Monitoring** | Dashboard showing: total receivables, overdue amounts, per-tenant balance summary | Small+ | `get_invoices.php` (filter by status: Pending) | — |
| 3.6 | **Due Date Reminders** | Automatic in-app notification before rent due date (e.g., 3 days before). Optional SMS/email | Small+ | Notification trigger or cron job | [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |
| 3.7 | **Overdue Alerts** | Flag overdue invoices, notify tenant, escalate to admin dashboard. Optional late fee calculation | Small+ | Invoice status check + notification dispatch | [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |
| 3.8 | **Payment Proof Upload** | Tenant uploads screenshot/photo of GCash/bank transfer receipt for admin verification | Small+ | `upload_payment_proof.php` | [todo.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/todo.md) |
| 3.9 | **Security Deposit Tracking** | Record deposit on move-in, track deductions (damages, unpaid rent), calculate refund on move-out | Medium | Deposit fields in `lease_contracts` or `invoices` | — |
| 3.10 | **Extended Rent Terms** | Handle lease extension billing: prorated amounts, adjusted rates, updated payment schedule | Medium | `extend_lease.php` + new invoice generation | — |

### Billing Breakdown Structure

| Line Item | Source | Frequency | Notes |
|---|---|---|---|
| **Base Rent** | `rooms.monthly_rate` | Monthly | Fixed per unit type |
| **Water** | Meter reading or flat rate | Monthly | Per-unit or shared allocation |
| **Electricity** | Meter reading or flat rate | Monthly | Per-unit sub-meter preferred |
| **Parking** | Assigned slot fee | Monthly | Optional — only if tenant has parking |
| **Late Fee** | System-calculated | On overdue | Configurable % or flat amount |

### Payment Methods

| Method | How It Works | Verification |
|---|---|---|
| **Cash** | Tenant pays at admin office | Admin records directly |
| **GCash** | Tenant transfers via GCash | Tenant uploads proof screenshot; admin verifies |
| **Bank Transfer** | Tenant transfers to building bank account | Tenant uploads proof + reference number; admin verifies |

---

## Module 4 — Maintenance Request

**Context:** Tenants in a small/medium apartment report issues (plumbing, electrical, structural) through the system rather than informal messages. The admin tracks resolution from report to completion.

### Features

| # | Feature | Details | Scale | Implementation | Related Doc |
|---|---|---|---|---|---|
| 4.1 | **Submit Maintenance Request** | Tenant fills form: issue category, description, location (unit/common area), priority level, photo upload | Small+ | `maintenance_request.php` | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |
| 4.2 | **Issue Categories** | Plumbing, Electrical, Structural/Physical, Water Supply, General Maintenance, Others | Small+ | `issue_category` field in `maintenance_requests` | — |
| 4.3 | **Priority Levels** | Low, Medium, High, Urgent — determines order in admin queue | Small+ | `urgency` field | — |
| 4.4 | **Photo Upload** | Tenant attaches photo of the issue to help admin assess severity before dispatching | Small+ | File upload to `backend/uploads/maintenance/` | — |
| 4.5 | **Status Tracking** | Pipeline: Pending → In Progress → Completed. Admin updates status as work proceeds | Small+ | `update_maintenance_status.php` | — |
| 4.6 | **Date/Time Tracking** | Record: date reported, date acknowledged, date work started, date resolved, total resolution time | Small+ | `created_at`, `updated_at` + new timestamp columns | — |
| 4.7 | **Admin Assignment** | Admin assigns maintenance worker/contractor to the request, tracks who handled it | Medium | `assigned_to` field in `maintenance_requests` | — |
| 4.8 | **Cost Estimation** | Admin enters estimated cost; flag if tenant-responsible (e.g., tenant-caused damage) | Medium | `estimated_cost`, `tenant_responsible` fields | — |
| 4.9 | **Work Notes** | Admin/worker adds resolution notes: what was done, materials used, follow-up needed | Medium | `work_notes` field | — |
| 4.10 | **Tenant Notification on Update** | When status changes, tenant receives in-app notification (+ optional SMS/email) | Small+ | `process_tenant_request.php` → notification dispatch | [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |

### Issue Category Reference

| Category | Examples |
|---|---|
| **Plumbing** | Leaking faucet, clogged drain, toilet issue, pipe burst |
| **Electrical** | Power outlet failure, flickering lights, circuit breaker trip |
| **Structural / Physical** | Cracked wall, broken window, door hinge, ceiling damage |
| **Water Supply** | No water, low pressure, discolored water, water heater issue |
| **General Maintenance** | Pest control, repainting, lock replacement, appliance repair |
| **Others** | Anything not covered above — tenant describes in free text |

---

## Module 5 — Service Management

**Context:** Some small/medium apartments offer add-on services (cleaning, laundry). These are separate from maintenance — they're optional paid services tenants can request.

### Features

| # | Feature | Details | Scale | Implementation | Related Doc |
|---|---|---|---|---|---|
| 5.1 | **Service Request Submission** | Tenant requests a service: type (Cleaning, Laundry, Others), preferred date/time, special instructions | Medium | New `service_requests` table + endpoint | — |
| 5.2 | **Service Catalog** | Admin configures available services with pricing and availability schedule | Medium | `system_settings` or new `services` table | — |
| 5.3 | **Service Status Tracking** | Pipeline: Requested → Scheduled → In Progress → Completed. Admin updates as work proceeds | Medium | Status field in `service_requests` | — |
| 5.4 | **Service Billing Integration** | Completed services auto-generate an invoice line item or separate charge on next month's bill | Medium | Link `service_requests` to `invoices` | — |

> [!NOTE]
> Service management is a **medium-scale feature**. For a small apartment (5–20 units), the admin typically handles service requests informally. Include the architecture but mark as optional for the demo.

---

## Module 6 — Notification Module

**Context:** Tenants need to be informed about rent due dates, overdue payments, maintenance updates, and building announcements. The system supports three channels: in-app, email, and SMS.

### Features

| # | Feature | Details | Scale | Implementation | Related Doc |
|---|---|---|---|---|---|
| 6.1 | **In-App Notifications** | Bell icon with unread count; notification center listing all notifications with read/unread status | Small+ | `notifications` table, `get_notifications.php`, TopBar bell | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |
| 6.2 | **Rent Due Reminders** | Automatic notification 3–5 days before rent due date: "Your ₱12,500 rent for Unit H is due on Aug 15" | Small+ | Cron job or manual trigger → `send_notification.php` | [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |
| 6.3 | **Overdue Alerts** | When invoice passes due date: "Your rent payment is overdue. Please settle immediately." | Small+ | Invoice status check → notification | [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |
| 6.4 | **Maintenance Status Updates** | When admin changes maintenance request status: "Your request REQ-003 is now In Progress" | Small+ | `process_tenant_request.php` triggers notification | [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |
| 6.5 | **Building Announcements** | Admin broadcasts to all tenants: building maintenance schedule, policy updates, emergency alerts | Small+ | `create_announcement.php` → creates notification per tenant | — |
| 6.6 | **Email Notifications** | Send email via PHPMailer + Gmail SMTP for important events (payment receipt, lease expiry, announcements) | Small+ | `send_email.php`, PHPMailer + Gmail SMTP | [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |
| 6.7 | **SMS Notifications** | Send SMS via Semaphore API for urgent alerts (overdue rent, emergency announcements) | Medium | `send_sms.php`, Semaphore cURL | [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |
| 6.8 | **Notification Preferences** | Tenant opts in/out per channel: "I want email but not SMS for payment reminders" | Medium | `notification_preferences` table | [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |

---

## Module 7 — Communication (Two-Way Chat)

**Context:** Instead of tenants calling or texting the admin's personal phone, the system provides a built-in messaging feature. Admin can message individual tenants; tenants can message admin.

### Features

| # | Feature | Details | Scale | Implementation | Related Doc |
|---|---|---|---|---|---|
| 7.1 | **Admin → Tenant Messaging** | Admin selects a tenant and sends a direct message through the chat interface | Small+ | `send_message.php`, `AdminChat.jsx` | [chat_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/chat_design.md) |
| 7.2 | **Tenant → Admin Messaging** | Tenant opens chat, messages the property manager. No need to select — fixed admin partner | Small+ | `TenantChat.jsx` → `start_conversation.php` | [chat_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/chat_design.md) |
| 7.3 | **Conversation History** | Full message thread preserved; scrollable chat window with timestamps | Small+ | `get_messages.php`, `ChatWindow.jsx` | [chat_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/chat_design.md) |
| 7.4 | **Unread Message Badge** | Nav shows unread message count; updates on poll cycle | Small+ | `get_conversations.php` → unread_count | [chat_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/chat_design.md) |
| 7.5 | **Admin Inbox** | Admin sees list of all tenant conversations, sorted by most recent, with unread badges | Small+ | `AdminChat.jsx` sidebar | [chat_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/chat_design.md) |
| 7.6 | **New Message Notification** | When a message arrives, the recipient gets an in-app notification | Small+ | `send_message.php` creates notification row | [chat_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/chat_design.md) |

---

## Module 8 — Admin Dashboard & Reports

**Context:** The admin needs a single-screen overview of building operations: occupancy, income, pending maintenance, and recent activity. Reports support decision-making for a small/medium apartment.

### Features

| # | Feature | Details | Scale | Implementation | Related Doc |
|---|---|---|---|---|---|
| 8.1 | **Dashboard Statistics** | Cards showing: total tenants, occupancy rate, total revenue (this month), pending maintenance, overdue payments | Small+ | `dashboard_stats.php` | — |
| 8.2 | **Income Reports** | Monthly/quarterly revenue breakdown: rent collected, utilities, parking fees, outstanding balances | Small+ | `get_report_data.php` | [todo.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/todo.md) |
| 8.3 | **Revenue Stream Analysis** | Breakdown by source: base rent vs. water vs. electricity vs. parking vs. service fees | Medium | `get_report_data.php` with category breakdown | — |
| 8.4 | **Tenant Monitoring** | List view: all tenants with lease status, payment status (current/overdue), lease end date | Small+ | `get_tenants.php` | — |
| 8.5 | **Maintenance Monitoring** | Overview: open requests by priority, average resolution time, requests by category | Small+ | `get_maintenance_requests.php` with aggregation | — |
| 8.6 | **System Activity Logs** | Audit trail: who did what, when. Admin actions logged (tenant approved, payment recorded, settings changed) | Small+ | `get_activity_logs.php`, `activity_logs` table | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |
| 8.7 | **Utility Usage Tracking** | Track water/electricity consumption per unit over time; identify unusual usage patterns | Medium | New `utility_readings` table or extend `invoices` | — |
| 8.8 | **Sampling Data / Demo Data** | Pre-populated realistic data for demo: 10–20 tenants, 6 months of payment history, maintenance records | Small+ | SQL seed script in `backend/api/migrations/` | — |

---

## Module 9 — Contract & Document Generation

**Context:** When a tenant is approved, the system auto-generates a lease contract with terms, rates, and duration. This replaces manual Word document editing.

### Features

| # | Feature | Details | Scale | Implementation | Related Doc |
|---|---|---|---|---|---|
| 9.1 | **Lease Contract Generation** | Auto-fill contract template: tenant name, unit, rate, lease dates, deposit amounts, terms & conditions | Small+ | `create_contract.php`, `lease_contracts` table | [todo.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/todo.md) |
| 9.2 | **Contract Viewing** | Tenant can view their active contract in-app; admin can view any tenant's contract | Small+ | `get_contracts.php`, `ViewContract.jsx` | — |
| 9.3 | **Contract Status Management** | Track: Draft → Active → Expired → Terminated. Auto-expire when lease end date passes | Small+ | `update_contract_status.php` | — |
| 9.4 | **Contract Renewal** | On lease extension, generate updated contract with new end date and any rate changes | Medium | `extend_lease.php` → new contract row | — |
| 9.5 | **Downloadable / Printable** | Export contract as PDF or printable HTML for tenant/admin records | Medium | React print view or PDF library | — |

---

## Module 10 — Parking Reservation

**Context:** Small/medium apartments with limited parking spaces need a system to fairly assign and manage parking slots.

### Features

| # | Feature | Details | Scale | Implementation | Related Doc |
|---|---|---|---|---|---|
| 10.1 | **Parking Slot Listing** | View all parking slots with status: Available / Assigned / Reserved / Under Maintenance | Small+ | `get_available_parking_slots.php` | — |
| 10.2 | **Reservation Request** | Tenant requests a parking slot; admin approves/rejects based on availability | Small+ | `parking_reservation.php` | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |
| 10.3 | **Parking Fee Integration** | Assigned parking adds a monthly line item to tenant's invoice | Small+ | Parking fee in invoice generation | — |
| 10.4 | **Slot Assignment Management** | Admin assigns specific slot to tenant; handles transfers when tenants move out | Small+ | `parking_reservations` table (status: Assigned) | — |

---

## Module 11 — Security & Access Control

**Context:** The system has two roles (admin and tenant) with strict separation of what each can see and do.

### Features

| # | Feature | Details | Scale | Implementation | Related Doc |
|---|---|---|---|---|---|
| 11.1 | **Role-Based Access Control** | Admin sees admin pages; tenant sees tenant pages. Routes guarded by role check | Small+ | `loggedInUser.role` check, `verify_admin()` in PHP | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |
| 11.2 | **Admin Authentication** | Admin login with email/password; session-based auth via `sessionStorage` | Small+ | `login.php`, `axiosConfig.js` (X-Admin-Id header) | — |
| 11.3 | **Tenant Authentication** | Tenant login with email/password; same auth mechanism, different role | Small+ | `login.php`, `axiosConfig.js` (X-User-Id header) | — |
| 11.4 | **Password Management** | Change password functionality for both roles | Small+ | `change_password.php` | — |
| 11.5 | **CCTV Access Requests** | Tenant requests to view CCTV footage; admin approves/rejects with conditions | Medium | `cctv_request.php` | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) |

---

## Module 12 — Visitor Management

**Context:** Track visitors to the apartment building for security purposes.

### Features

| # | Feature | Details | Scale | Implementation | Related Doc |
|---|---|---|---|---|---|
| 12.1 | **Visitor Log Entry** | Record visitor: name, purpose, tenant being visited, time in/out | Medium | New `visitors` table + endpoint | — |
| 12.2 | **Tenant Pre-Authorization** | Tenant notifies admin of expected visitor in advance | Medium | Visitor request form in tenant portal | — |
| 12.3 | **Visitor History** | Admin views visitor log filtered by date, tenant, or purpose | Medium | GET endpoint with filters | — |

> [!NOTE]
> Visitor management is a **medium-scale feature**. For a small apartment, a physical logbook may suffice. Include the data model but prioritize other modules for the demo.

---

## Related Documentation

| Document | Path | Content |
|---|---|---|
| System Design | [system_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/system_design.md) | DB schema, API inventory, auth design |
| Todo / Backlog | [todo.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/todo.md) | Prioritized backlog (A–E priorities) |
| Chat Design | [chat_design.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/chat_design.md) | Two-way chat architecture, schema, endpoints, React components |
| Notification Services | [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) | SMS/email provider comparison, architecture, implementation plan |
