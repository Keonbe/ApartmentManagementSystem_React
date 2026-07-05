# Apartment Management System (React + PHP)

This project is an apartment management web application built with a React + Vite frontend and a PHP backend. It supports tenant registration, login, maintenance requests, parking reservations, rent applications, CCTV footage requests, and basic admin views.

## Repository Structure

- `ams-react/` - frontend application built with React, Tailwind CSS utility classes, React Router, and Axios.
- `backend/` - PHP backend API scripts and database configuration.
- `backend/api/` - PHP endpoint files.
- `backend/config.php` - MySQL connection configuration.
- `backend/uploads/` - uploaded files storage folders created by backend scripts.

## Frontend Setup

### Requirements

- Node.js 18+ (or compatible)
- npm

### Install and run

```bash
cd ams-react
npm install
npm run dev
```

The frontend is served by Vite and expects the backend API to be available at:

- `http://localhost/ApartmentManagementSystem_React/backend/api/`

## Backend Setup

### Requirements

- PHP 8+ with `mysqli` enabled
- MySQL / MariaDB
- A local web server such as XAMPP, WAMP, or similar

### Configure the database

Edit `backend/config.php` if your MySQL credentials differ.

```php
<?php
    $servername = "localhost";
    $username = "root";
    $password = "";
    $dbname = "ams_db";

    $conn = new mysqli($servername, $username, $password, $dbname);

    if ($conn->connect_error) {
        die("Connection failed: " . $conn->connect_error);
    }
?>
```

### Create `ams_db` schema

Use the following SQL to build the expected tables for the backend scripts.

```sql
CREATE DATABASE IF NOT EXISTS ams_db;
USE ams_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email_address VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  isAdmin TINYINT(1) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  issue_category VARCHAR(100) NOT NULL,
  urgency VARCHAR(50) NOT NULL,
  preferred_date DATE NOT NULL,
  preferred_time VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  permission_to_enter TINYINT(1) NOT NULL DEFAULT 0,
  attachment_path VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cctv_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  incident_date DATE NOT NULL,
  incident_time VARCHAR(50) NOT NULL,
  location_details VARCHAR(255) NOT NULL,
  reason_request TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parking_reservations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_type VARCHAR(100) NOT NULL,
  vehicle_model VARCHAR(255) NOT NULL,
  plate_number VARCHAR(100) NOT NULL,
  transmission VARCHAR(50) NOT NULL,
  duration_months INT NOT NULL,
  total_cost DECIMAL(12,2) NOT NULL,
  document_path VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rent_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  suffix VARCHAR(50) DEFAULT NULL,
  contact_no VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  gender VARCHAR(50) NOT NULL,
  occupants INT NOT NULL,
  months_of_rent INT NOT NULL,
  room_name VARCHAR(100) NOT NULL,
  monthly_rent DECIMAL(12,2) NOT NULL,
  valid_id_path VARCHAR(255) NOT NULL,
  nbi_clearance_path VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### File upload directories

The backend code writes uploads to:

- `backend/uploads/maintenance/`
- `backend/uploads/documents/`
- `backend/uploads/applications/`

Ensure the web server user has write permission for `backend/uploads/` and its subfolders.

## Frontend Pages and Routes

The routing configuration is defined in `ams-react/src/App.jsx`.

### Public / Tenant pages

- `/home` - `Home.jsx`
  - Landing page with welcome panel and Explore button.
- `/preview` - `Preview.jsx`
  - Room availability cards and location map.
- `/login` - `Login.jsx`
  - Tenant login form that calls `login.php`.
- `/register` - `Registration.jsx`
  - Tenant registration form that calls `registration.php`.
- `/services` - `Services.jsx`
  - Menu to access payments, reservations, maintenance, and CCTV requests.
- `/pay-bills` - `PayBills.jsx`
  - Static payment breakdown UI; no backend call.
- `/parking-reservation` - `ParkingReservation.jsx`
  - Reservation form with file upload; submits to `parking_reservation.php`.
- `/maintenance-request` - `MaintenanceRequest.jsx`
  - Maintenance ticket form with optional file upload; submits to `maintenance_request.php`.
- `/cctv-request` - `CctvRequest.jsx`
  - CCTV request form; submits to `cctv_request.php`.
- `/rent-application` - `RentApplication.jsx`
  - Rent application form with document uploads; submits to `rent_application.php`.
- `/profile-settings` - `ProfileSettings.jsx`
  - Profile details and controls for documents/password updates.

### Admin pages

The app includes placeholder admin routes that appear in the frontend router.

- `/admin-dashboard` - `AdminDashboard.jsx`
- `/admin-units` - `AdminUnits.jsx`
- `/admin-tenants` - `AdminTenants.jsx`
- `/admin-payments` - `AdminPayments.jsx`
- `/admin-maintenance` - `AdminMaintainance.jsx`
- `/admin-announcements` - `AdminAnnouncements.jsx`
- `/admin-reports` - `AdminReports.jsx`
- `/admin-notifications` - `AdminNotifications.jsx`
- `/admin-contracts` - `AdminContracts.jsx`
- `/admin-services` - `AdminServicePage.jsx`

> Note: Most admin pages are frontend route placeholders in this repository and currently do not have matching backend API implementations.

## API Endpoints and Behavior

The frontend uses `ams-react/src/api/axiosConfig.js` to send requests to the backend API.

### `backend/api/login.php`

- Method: `POST`
- Accepts JSON payload:
  - `email_address`
  - `password`
- Authenticates tenant users against `users` table.
- Returns JSON with `valid`, `message`, and `user` data.

### `backend/api/adminLogin.php`

- Method: `POST`
- Accepts JSON payload:
  - `email_address`
  - `password`
- Authenticates admin users by checking `isAdmin = true`.
- Returns JSON with `valid`, `message`, and `user` session data.

> Note: `adminLogin.php` currently prepares a SQL statement that selects admin records, but it also binds a parameter without a placeholder. Review the file if you extend admin authentication.

### `backend/api/registration.php`

- Method: `POST`
- Accepts JSON payload:
  - `first_name`
  - `last_name`
  - `email_address`
  - `password`
  - `conPassword`
- Validates password length and confirmation.
- Hashes the password using `password_hash()`.
- Inserts a new tenant into `users`.
- Returns JSON success or failure.

### `backend/api/change_password.php`

- Method: `POST`
- Accepts JSON payload:
  - `email_address`
  - `current_password`
  - `new_password`
  - `confirm_password`
- Verifies current password and updates the hashed password in `users`.

### `backend/api/maintenance_request.php`

- Method: `POST` (form-data)
- Accepts fields:
  - `issueType`
  - `urgency`
  - `preferredDate`
  - `preferredTime`
  - `description`
  - `permissionToEnter`
  - `uploadedFile` (optional file)
- Stores requests in `maintenance_requests` and saves uploaded attachment to `backend/uploads/maintenance/`.

### `backend/api/cctv_request.php`

- Method: `POST`
- Accepts JSON payload:
  - `incidentDate`
  - `incidentTime`
  - `locationDetails`
  - `reasonRequest`
- Stores requests in `cctv_requests`.

### `backend/api/parking_reservation.php`

- Method: `POST` (form-data)
- Accepts fields:
  - `vehicleType`
  - `vehicleModel`
  - `plateNumber`
  - `transmission`
  - `durationMonths`
  - `uploadedFile`
- Calculates `total_cost` as `durationMonths * 300`.
- Saves uploaded document to `backend/uploads/documents/`.
- Inserts record into `parking_reservations`.

### `backend/api/rent_application.php`

- Method: `POST` (form-data)
- Accepts fields:
  - `firstName`
  - `lastName`
  - `suffix`
  - `contactNo`
  - `email`
  - `gender`
  - `occupants`
  - `monthsOfRent`
  - `roomName`
  - `monthlyRent`
  - `validIdFile`
  - `nbiFile`
- Saves uploaded documents to `backend/uploads/applications/`.
- Inserts record into `rent_applications`.

## PHP Backend Overview

### `backend/config.php`

- Establishes a MySQL connection with `mysqli`.
- Provides `$conn` to every endpoint via `require_once "../config.php"`.

### Common backend behavior

- Most API scripts return JSON and support CORS with `Access-Control-Allow-Origin: *`.
- File-upload endpoints use `multipart/form-data` and manually create upload directories if they do not exist.
- Passwords are stored hashed with PHP `password_hash()`.
- Some endpoint scripts accept JSON using `file_get_contents("php://input")` and `json_decode()`.

## Notes and Improvements

- Add `session_start()` in login-related PHP scripts if you intend to persist PHP sessions server-side.
- Verify admin authentication logic in `adminLogin.php` and add a frontend admin login form if required.
- Expand backend security by validating file types and disallowing dangerous uploads.
- Implement proper authenticated routes on the frontend before exposing admin views.

## Development Tips

- Use Chrome/Firefox dev tools to inspect Axios requests and verify response payloads.
- If backend returns `No data received`, verify the request body format and `Content-Type` header.
- If file uploads fail, confirm write permission for `backend/uploads/`.

---

This documentation describes the current implementation and can be extended as your application evolves.
