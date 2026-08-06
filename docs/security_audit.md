# Security & Input Validation Audit Report

We scanned the entire workspace files, focusing on user-facing forms, parameter handling, and file upload handlers on the backend. Here are the findings and key gaps identified.

---

## 1. Critical Gaps: Unrestricted File Uploads (RCE Risks)

Several file upload endpoints lack validation for file extensions and MIME types. An attacker could potentially upload a malicious script (e.g., a `.php` web shell) and execute arbitrary code on the server.

### 🔴 [parking_reservation.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/parking_reservation.php)
- **Vulnerability:** Uploads the vehicle registration file (`uploadedFile`) directly to `../uploads/documents/` without validating its extension or MIME type.
- **Remediation:** Enforce validation to restrict file types only to `['jpg', 'jpeg', 'png', 'pdf']`.

### 🔴 [upload_lease_document.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/upload_lease_document.php)
- **Vulnerability:** Uploads signed or notarized lease contracts (`file`) to `../uploads/documents/` without any file type checks.
- **Remediation:** Restrict to `['pdf', 'jpg', 'jpeg', 'png']`.

### 🔴 [upload_payment_proof.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/upload_payment_proof.php)
- **Vulnerability:** Uploads screenshots (`proof`) to `../uploads/payment_proofs/` without type validation.
- **Remediation:** Restrict to standard image extensions (`['jpg', 'jpeg', 'png']`).

---

## 2. Moderate Gaps: Missing Format Validation

### 🟡 [profile.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/profile.php)
- **Validation Gap:** Updates the user's `contact_no` column without validating format checks on the backend.
- **Remediation:** Add backend validation to verify that `contact_no` matches the valid Philippine mobile format (`+63 9XXXXXXXXX` or `+63 8XXXXXXXXX`).

### 🟡 [parking_reservation.php](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/parking_reservation.php)
- **Validation Gap:** Plate numbers are accepted directly as raw strings without checking length or alphanumeric pattern.
- **Remediation:** Check plate number length and basic format on submission.

---

## 3. Correct & Secure Implementations Found

- **`rent_application.php` (Valid ID / NBI Clearance):** Correctly checks file sizes ($<10$ MB), verifies file extensions (`allowed_extensions`), and checks MIME types using `mime_content_type()`.
- **`registration.php` and `change_password.php`:** Verify matching confirmation passwords and enforce minimum length checks ($>= 8$ characters).
- **`get_report_data.php`:** Safely casts all year, month, and quarter filters to `(int)` before string interpolating them into SQL queries.
- **Database Safety:** Standard database transactions and parameter binding are strictly performed using prepared statements (`bind_param`), preventing general SQL injection vectors.
