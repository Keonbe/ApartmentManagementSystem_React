# Apartment Management System (AMS) — React & PHP

A modern, full-featured Apartment Management System built with a **React 18 + Vite** frontend, a **PHP 8** REST API backend, and **MySQL / MariaDB** database. Designed for streamlined tenant self-service and comprehensive property administration.

---

## 📑 Documentation Index

Comprehensive system documentation and technical guides can be found in the [docs/](docs/) directory:

- **System Architecture & Design:**
  - [System Design Specification](docs/documentation/system_design.md) — Authoritative data model, table schemas, entity relationships, workflows, and API inventory.
  - [System Diagrams & Visual Flows](docs/documentation/system_diagrams.md) — Mermaid visual diagrams for auth, applications, billing, maintenance, and visitor workflows.
- **Feature Specifications:**
  - [Chat & Support System Design](docs/features/chat_design.md) — Real-time and polling-based tenant-to-admin communication.
  - [Notification Services](docs/features/notification_services.md) — In-app notification center, announcement broadcasting, and activity triggers.
  - [Payment System & Invoicing Design](docs/features/payment_system_design.md) — Billing lifecycle, 1-month advance/deposit rules, proof upload, and receipt generation.
  - [Move-In & Move-Out Workflow](docs/features/move_in_move_out_design.md) — Tenant lifecycle, clearance, deposit refund, and room archiving.
  - [Mobile Responsive Layout Guidelines](docs/features/mobile_responsive.md) — Viewport standards, touch navigation, and responsive component design.
  - [Panelist Feature Checklist](docs/features/panelist_feature_checklist.md) — Defense presentation checklist and feature completion verification.
- **Deployment & Testing:**
  - [Localhost to Production Deployment Guide](docs/deployment/localhost_to_production.md) — Step-by-step instructions for deploying frontend, backend, and DB to production.
  - [Date-Dependent Testing Guide](docs/date_dependent_testing.md) — Guide for simulating overdue payments, expiring leases, and billing cycles.
  - [Security Audit & Hardening](docs/security_audit.md) — SQL injection defense, auth validation, access control, and upload sanitization.
  - [Development Backlog & Todo](docs/todo.md) — Completed milestones, active priorities, and feature roadmap.

---

## 🏗️ Folder Structure

```
ApartmentManagementSystem_React/
├── ams-react/                      # Frontend Application (React 18 + Vite + Tailwind CSS)
│   ├── public/                     # Static public assets
│   ├── src/
│   │   ├── AdminPages/             # Admin management portals (Dashboard, Units, Tenants, Payments, etc.)
│   │   │   ├── AdminDashboard.jsx
│   │   │   ├── AdminUnits.jsx
│   │   │   ├── AdminTenants.jsx
│   │   │   ├── AdminPayments.jsx
│   │   │   ├── AdminMaintainance.jsx
│   │   │   ├── AdminContracts.jsx
│   │   │   ├── AdminReports.jsx
│   │   │   ├── AdminVisitors.jsx
│   │   │   ├── AdminAnnouncements.jsx
│   │   │   ├── AdminNotifications.jsx
│   │   │   ├── AdminApplications.jsx
│   │   │   ├── AdminCctv.jsx
│   │   │   ├── AdminParking.jsx
│   │   │   ├── AdminUsers.jsx
│   │   │   ├── AdminActivityLogs.jsx
│   │   │   ├── AdminAccountSettings.jsx
│   │   │   └── AdminServicePage.jsx
│   │   ├── UserPages/              # Tenant & public views (Home, Services, Requests, Bills, etc.)
│   │   │   ├── Home.jsx
│   │   │   ├── Preview.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── Registration.jsx
│   │   │   ├── Services.jsx
│   │   │   ├── MyRoom.jsx
│   │   │   ├── PayBills.jsx
│   │   │   ├── PaymentUpload.jsx
│   │   │   ├── UserPaymentHistory.jsx
│   │   │   ├── MaintenanceRequest.jsx
│   │   │   ├── ParkingReservation.jsx
│   │   │   ├── CctvRequest.jsx
│   │   │   ├── RentApplication.jsx
│   │   │   ├── TrackApplication.jsx
│   │   │   ├── ViewContract.jsx
│   │   │   ├── UserVisitors.jsx
│   │   │   ├── UserAnnouncements.jsx
│   │   │   ├── UserNotifications.jsx
│   │   │   ├── UserMyRequests.jsx
│   │   │   └── ProfileSettings.jsx
│   │   ├── Components/             # Shared UI components (TopBar, Sidebar, Modals, etc.)
│   │   ├── api/                    # Axios client configuration with auto-injected auth headers
│   │   │   └── axiosConfig.js
│   │   ├── assets/                 # Component images, icons, and media
│   │   ├── config/                 # System configuration and constants
│   │   ├── App.jsx                 # Client-side router and route guards
│   │   ├── main.jsx                # Application entry point
│   │   └── index.css               # Global styling and Tailwind directives
│   ├── package.json                # Frontend dependencies and scripts
│   └── vite.config.js              # Vite bundler configuration
├── backend/                        # Backend REST API (PHP 8 + MySQL)
│   ├── api/                        # API endpoint handlers
│   │   ├── migrations/             # Database initialization and seed SQL scripts
│   │   │   ├── SetupDB.sql         # Master database schema and base tables
│   │   │   ├── seed_mock_data.sql  # Comprehensive demo seed data
│   │   │   └── ...
│   │   ├── login.php               # Tenant authentication
│   │   ├── registration.php        # Tenant registration
│   │   ├── rent_application.php    # Application submission & file handling
│   │   ├── get_tenants.php         # Tenant listing & status lookup
│   │   ├── get_rooms.php           # Unit inventory and occupancy
│   │   ├── get_invoices.php        # Billing and payment records
│   │   ├── get_maintenance_requests.php # Maintenance tickets
│   │   ├── get_report_data.php     # Financial and occupancy reporting engine
│   │   └── ... (50+ dedicated REST endpoints)
│   ├── config.php                  # Database connection, verify_admin(), and log_activity()
│   ├── config.env.example.php      # Environment configuration template
│   ├── config.env.php              # Local environment credentials (ignored by Git)
│   └── uploads/                    # Server-side storage for uploaded documents and media
│       ├── applications/           # IDs, NBI clearance files
│       ├── maintenance/            # Ticket photo/video attachments
│       ├── documents/              # Vehicle OR/CR and lease documents
│       └── payments/               # Proof of payment receipts
└── docs/                           # Documentation and technical specifications
    ├── documentation/              # Core architecture and system design
    ├── features/                   # Feature blueprints and specifications
    └── deployment/                 # Hosting and server deployment guides
```

---

## ⚙️ Installation & Setup

### Prerequisites

- **PHP 8.0+** with `mysqli`, `pdo`, and `fileinfo` extensions enabled.
- **MySQL 5.7+** or **MariaDB 10.4+**.
- **Node.js 18+** & **npm**.
- Local web server environment such as **XAMPP**, **WAMP**, or **Laragon**.

---

### Step 1: Clone Repository

Place the project directory inside your local web server's root folder:
- **XAMPP (Windows):** `C:\xampp\htdocs\ApartmentManagementSystem_React`
- **Linux / macOS:** `/var/www/html/ApartmentManagementSystem_React`

---

### Step 2: Database & Environment Configuration

1. Start **Apache** and **MySQL** via your XAMPP Control Panel.
2. Open **phpMyAdmin** (`http://localhost/phpmyadmin`) or your preferred MySQL client.
3. Import the master schema and seed data:
   - Import [backend/api/migrations/SetupDB.sql](backend/api/migrations/SetupDB.sql) to create the database `ams_db` and all tables.
   - *(Optional for testing)* Import [backend/api/migrations/seed_mock_data.sql](backend/api/migrations/seed_mock_data.sql) to populate sample units, tenants, invoices, and logs.
4. Set up the environment configuration file:
   - Copy `backend/config.env.example.php` to `backend/config.env.php` (if not already present):
     ```bash
     cp backend/config.env.example.php backend/config.env.php
     ```
   - Adjust your database credentials in `backend/config.env.php`:
     ```php
     <?php
     define('DB_HOST', 'localhost');
     define('DB_USER', 'root');
     define('DB_PASS', '');
     define('DB_NAME', 'ams_db');
     define('APP_ENV', 'development'); // 'development' | 'production'
     ```
   - [backend/config.php](backend/config.php) will automatically load `config.env.php` to establish the database connection with fallback defaults.

---

### Step 3: Frontend Setup & Run

1. Navigate to the `ams-react` directory:
   ```bash
   cd ams-react
   ```
2. Install all frontend dependencies:
   ```bash
   npm install
   ```
3. Verify the API base URL in [ams-react/src/api/axiosConfig.js](ams-react/src/api/axiosConfig.js):
   ```javascript
   const api = axios.create({
       baseURL: "http://localhost:8080/ApartmentManagementSystem_React/backend/api/",
       headers: {
           "Content-Type": "application/json"
       }
   });
   ```
   *(Adjust port/path if your Apache server runs on port 80 or a custom port).*

4. Start the Vite development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to the displayed local server URL (typically `http://localhost:5173`).

---

## 🔑 Default Accounts (Seed Data)

If [seed_mock_data.sql](backend/api/migrations/seed_mock_data.sql) is imported, you can log in using the following test accounts:

| Role | Email Address | Password | Portal URL |
|---|---|---|---|
| **Administrator** | `admin@apartment.com` | `admin123` | `/login` → `/admin-dashboard` |
| **Tenant** | `tenant1@gmail.com` | `password123` | `/login` → `/services` / `/my-room` |
| **Applicant** | `applicant@gmail.com` | `password123` | `/login` → `/track-application` |

---

## 🚀 Key Features

- **Tenant Self-Service Portal:**
  - Online unit preview and application submission with valid ID and NBI document uploads.
  - Live application tracking and move-in invoice payment with proof upload.
  - Interactive **My Room** view for unit details, roommate listings, lease extension, and move-out requests.
  - In-app **Maintenance Tickets** with photo/video attachments and status tracking.
  - **Parking Space Reservations** and **CCTV Footage Request** submissions.
  - Digital **Visitor Pre-Registration** with QR/entry pass tracking.
  - Notification Center and Announcement Board.
- **Admin Management Panel:**
  - Executive **Dashboard** with real-time occupancy rates, revenue metrics, and maintenance summaries.
  - **Unit Inventory & Monitoring** with custom pricing, status toggling, and lease history.
  - **Tenant Directory** with active leases, archived records, and move-out processing.
  - **Payment & Invoice Management** supporting advance/deposit tracking, manual receipt issuance, and proof verification.
  - **Maintenance Kanban Board** with urgency filters, contractor assignment, and cost recording.
  - **Comprehensive Reports Engine** generating Monthly, Yearly, Occupancy, Maintenance, Income Statements, and Revenue Diversification analysis with CSV/Print export.
  - Audit Trail and System Activity Logs.

---

## 🛡️ Tech Stack & Security

- **Frontend:** React 18, React Router v6, Axios, Lucide React / React Icons, Tailwind CSS & Vanilla CSS modules.
- **Backend:** PHP 8+ REST API endpoints, prepared statements with MySQLi to prevent SQL injection.
- **Auth & Authorization:** Session storage identity management with auto-injected request headers (`X-User-Id`, `X-Admin-Id`) validated server-side by `verify_admin()`.
- **Audit Logging:** Centralized event tracking in `activity_logs` via `log_activity()`.
