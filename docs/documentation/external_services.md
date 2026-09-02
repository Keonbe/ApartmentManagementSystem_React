# AMS — External Services Integration & Verification Matrix

> **Scope**: Consolidates all modules in the Apartment Management System that depend on third-party external services (Payment Gateway, Email, SMS). Excludes standard in-app notifications handled by the `notifications` DB table.
> **Stack**: React 18 (Vite SPA) + PHP 8 (XAMPP/Apache) + MySQL/MariaDB 10 (`ams_db`)
> **Dev URL**: `http://localhost:8080/ApartmentManagementSystem_React/`

---

## 1. External Service Integration Matrix

| Module | Service Type | Provider / Driver | Status | Ref |
|---|---|---|---|---|
| **Online Bill Payment** | Payment Gateway | PayMongo (Sandbox / Live) | ✅ Implemented (Sandbox) | [Section 2.1](#21-online-bill-payment-paymongo) · [paymongo_integration_guide.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/paymongo_integration_guide.md) |
| **Password Reset Link Delivery** | Email | None configured — Dev token bypass | ✅ Implemented (Dev Bypass) | [Section 2.2](#22-password-reset-link-delivery-email) |
| **Announcement Broadcast — Email** | Email (Transactional) | PHPMailer + SMTP (Planned) | 🟡 UI Built — Backend Stubbed | [Section 2.3](#23-announcement-broadcast-email) · [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |
| **Announcement Broadcast — SMS** | SMS Gateway | Semaphore (Planned) | 🟡 UI Built — Backend Stubbed | [Section 2.4](#24-announcement-broadcast-sms) · [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |
| **Tenant Preference: SMS** | SMS Gateway | Semaphore (Planned) | 🔴 UI Toggle Only — Not Wired | [Section 2.5](#25-tenant-notification-preferences) |

---

## 2. Module Breakdown

---

### 2.1 Online Bill Payment (PayMongo)

Tenant pays monthly invoice via GCash, Maya, or QR Ph on the tenant portal. Admin receives automatic webhook confirmation.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/create_checkout_session.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/create_checkout_session.php) | Creates PayMongo checkout session via cURL, fetches `paymongo_secret_key` from `system_settings` |
| [`backend/api/paymongo_webhook.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/paymongo_webhook.php) | Receives async PayMongo event, validates HMAC-SHA256 signature, marks invoice `paid` |
| [`backend/api/get_payment_channels.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_payment_channels.php) | Returns enabled payment methods from `system_settings` |
| [`backend/api/migrations/payment_channels.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/migrations/payment_channels.php) | Seeds `system_settings` with `paymongo_secret_key`, `paymongo_public_key`, `paymongo_webhook_secret` |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/UserPages/PayBills.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/PayBills.jsx) | Tenant bill payment UI — calls `create_checkout_session.php` and redirects to PayMongo hosted page |
| [`ams-react/src/AdminPages/AdminPayments.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminPayments.jsx) | Displays `PayMongo (Sandbox)` label for gateway-paid invoices |
| [`ams-react/src/AdminPages/AdminAccountSettings.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminAccountSettings.jsx) | Admin form to configure Secret Key, Public Key, Webhook Secret, and Sandbox/Live toggle |

**Step-by-Step Manual Verification (Sandbox):**
1. Log in to [PayMongo Dashboard](https://dashboard.paymongo.com/) → enable **Test Mode** → copy `sk_test_...`, `pk_test_...`.
2. Download [Ngrok](https://ngrok.com/) and run: `ngrok http 8080`.
3. In PayMongo Dashboard → **Developers > Webhooks** → create webhook URL: `https://<NGROK_URL>/ApartmentManagementSystem_React/backend/api/paymongo_webhook.php`.
4. Subscribe to `checkout_session.payment.paid` and `payment.failed`. Copy the generated `whsk_...` secret.
5. In AMS → **Admin > Account Settings > Payment Gateway Integration** → select "Sandbox", enter your keys, and Save.
6. Log in as a tenant → **Pay Bills** → select GCash or Maya → click Pay.
7. Use PayMongo's test card numbers or sandbox GCash credentials to complete payment.
8. Verify: invoice in `ams_db.invoices` updates to `status = 'paid'` and `payment_gateway = 'paymongo_sandbox'`.

**Current Dev Mode State:**
- PayMongo is fully wired in **Sandbox** mode using test keys stored in `system_settings`.
- Webhook delivery requires Ngrok for local testing because PayMongo cannot reach `localhost` directly.
- If keys are missing, `create_checkout_session.php` returns: `"PayMongo is not configured. Please contact administrator."`.

**Planned for Production:**
1. Verify PayMongo business account to unlock Live keys.
2. In `AdminAccountSettings.jsx`, remove the `disabled={true}` on the "Live" radio button to allow switching.
3. Input `sk_live_...` keys and a new Live webhook URL pointing to the production domain.
4. Full reference: [paymongo_integration_guide.md § 3](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/paymongo_integration_guide.md).

---

### 2.2 Password Reset Link Delivery (Email)

Allows users who have forgotten their passwords to request a secure, time-limited token to reset their credentials.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/forgot_password.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/forgot_password.php) | Validates email, generates `bin2hex(random_bytes(32))` token, stores SHA-256 hash in `password_resets` table (30-min TTL) |
| [`backend/api/reset_password.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/reset_password.php) | Verifies token hash, updates `users.password` with bcrypt, deletes used token |
| [`backend/api/migrations/create_password_resets_table.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/migrations/create_password_resets_table.php) | Creates `password_resets` table (`email`, `token_hash`, `expires_at`) |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/UserPages/Login.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/Login.jsx) | Forgot Password toggle — shows email form, displays dev-mode reset link when `dev_token` is returned |
| [`ams-react/src/UserPages/ResetPassword.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/ResetPassword.jsx) | New password form — reads `?email=...&token=...` from URL, submits to `reset_password.php` |
| [`ams-react/src/App.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/App.jsx) | `<Route path="/reset-password" element={<ResetPassword />} />` |

**Step-by-Step Manual Verification (Dev Mode):**
1. Open `http://localhost:5173/#/login`.
2. Click **Forgot Password?**.
3. Enter a valid email from `ams_db.users.email_address`.
4. Click **Send Reset Link**.
5. A green `[DEV MODE]` box appears with a direct "Click here to reset password" link — click it.
6. On the Reset Password page, enter a new password (min 6 chars) and confirm it.
7. Click **Reset Password** — you should see "Password successfully reset."
8. Verify: `ams_db.users.password` is updated (bcrypt hash); `ams_db.password_resets` row for that email is deleted; `ams_db.activity_logs` has a new entry for `Reset Password`.

**Current Dev Mode State:**
- `forgot_password.php` detects `APP_ENV === 'development'` (set in `backend/config.php`) and includes `dev_token` in the JSON response.
- The raw token is displayed in the React UI as a direct link. **This dev_token response must NOT exist in production.**

**Planned for Production:**
- Install [PHPMailer](https://github.com/PHPMailer/PHPMailer) via Composer: `composer require phpmailer/phpmailer`.
- Configure SMTP credentials (Gmail App Password, SendGrid, or AWS SES).
- In `forgot_password.php`, replace the `dev_token` response with a PHPMailer call to send an email with the reset link.
- Remove the `APP_ENV === 'development'` dev bypass block.
- The reset link format: `https://yourdomain.com/#/reset-password?email=...&token=<raw_token>`

---

### 2.3 Announcement Broadcast — Email

Admin creates announcements with the `email` channel selected. Intended to deliver the announcement body to all tenants' registered email addresses.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/create_announcement.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/create_announcement.php) | Inserts into `announcements`, auto-creates `notifications` rows for all tenants. Email delivery block: **not yet implemented** |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/AdminPages/AdminAnnouncements.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminAnnouncements.jsx) | Admin form with channel toggles: **In-App**, **SMS**, **Email** |

**Step-by-Step Manual Verification (Dev Mode):**
1. Log in as Admin → **Announcements** → Create Announcement.
2. Enable the **Email** channel toggle.
3. Submit the announcement.
4. Verify: `ams_db.announcements.channels` contains `"email"` in its JSON array.
5. Verify: `ams_db.notifications` rows are created for each tenant (in-app works).
6. **Email is NOT dispatched** — no outbound email occurs in the current implementation.

**Current Dev Mode State:**
- `create_announcement.php` stores the `channels` JSON field including `"email"` but has no email-sending logic. The `email` toggle in the UI is cosmetic only.

**Planned for Production:**
- After PHPMailer setup (see Section 2.2), add a loop in `create_announcement.php`:
  ```php
  // After announcement is inserted, fetch all non-archived tenant emails:
  $tenants = $conn->query("SELECT u.email_address, u.first_name FROM users u WHERE u.role = 'user' AND u.is_archived = 0");
  while ($row = $tenants->fetch_assoc()) {
      send_announcement_email($row['email_address'], $row['first_name'], $title, $body);
  }
  ```
- Add rate-limiting or queuing to avoid hitting SMTP send limits on large tenant lists.

---

### 2.4 Announcement Broadcast — SMS

Same admin announcement flow, but routes the message body as an SMS to all tenants' registered phone numbers in `users.contact_no`.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/create_announcement.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/create_announcement.php) | SMS dispatch block: **not yet implemented** |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/AdminPages/AdminAnnouncements.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminAnnouncements.jsx) | **SMS** channel toggle in announcement form |

**Step-by-Step Manual Verification (Dev Mode):**
1. Log in as Admin → **Announcements** → enable the **SMS** channel toggle.
2. Submit the announcement.
3. Verify: `ams_db.announcements.channels` contains `"sms"`.
4. **No SMS is dispatched** — the toggle is currently cosmetic only.

**Current Dev Mode State:**
- No SMS library or API client is installed. The `"sms"` channel flag is saved to the DB but PHP does nothing with it.

**Planned for Production:**
- Register at [Semaphore.co](https://semaphore.co/) (Philippine SMS provider) and get an API key.
- In `create_announcement.php`, add a cURL call per tenant phone number:
  ```php
  // Semaphore SMS dispatch (planned)
  curl_setopt($ch, CURLOPT_URL, "https://api.semaphore.co/api/v4/messages");
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
      'apikey'   => $settings['semaphore_api_key'],
      'number'   => $tenant_phone,
      'message'  => $announcement_body,
      'sendername' => 'AMS'
  ]));
  ```
- Store `semaphore_api_key` and `semaphore_sender_name` in `system_settings` and expose via `AdminAccountSettings.jsx`.
- Full provider comparison: [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md).

---

### 2.5 Tenant Notification Preferences

Tenants can toggle SMS and Email preferences from their Notification Center. These preferences are stored locally and are intended to gate SMS/Email dispatch per tenant.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/get_notifications.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_notifications.php) | Returns in-app notifications only — no preference-aware channel logic |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/UserPages/UserNotifications.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/UserNotifications.jsx) | Toggle switches for **In-App**, **SMS** (`smsChannel`), and **Email** preferences |
| [`ams-react/src/AdminPages/AdminNotifications.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminNotifications.jsx) | Admin-side notification preferences (`smsEnabled`) |

**Step-by-Step Manual Verification (Dev Mode):**
1. Log in as a tenant → **Notifications** → toggle the SMS preference on or off.
2. Observe the toggle changes state visually.
3. **Preference is not persisted to DB** — no API call is made.

**Current Dev Mode State:**
- Preference toggles are React `useState` only. They reset on page refresh. No `notification_preferences` table exists yet.

**Planned for Production:**
- Create `notification_preferences` table:
  ```sql
  CREATE TABLE notification_preferences (
      user_id INT FK REFERENCES users(id),
      channel ENUM('in-app', 'sms', 'email'),
      enabled TINYINT DEFAULT 1,
      PRIMARY KEY (user_id, channel)
  );
  ```
- Wire `UserNotifications.jsx` toggles to a `POST /update_notification_preferences.php` endpoint.
- During SMS/email dispatch in `create_announcement.php`, join `notification_preferences` to skip opted-out tenants.
- Schema reference: [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md).

---

## 3. Configuration Reference

Keys are stored in `ams_db.system_settings` (not in `.env` — this is a plain PHP/XAMPP stack, not Laravel).

| `setting_key` | Where Set | Used By |
|---|---|---|
| `paymongo_secret_key` | Admin > Account Settings | `create_checkout_session.php`, `paymongo_webhook.php` |
| `paymongo_public_key` | Admin > Account Settings | (frontend display reference only) |
| `paymongo_webhook_secret` | Admin > Account Settings | `paymongo_webhook.php` (HMAC validation) |
| `semaphore_api_key` | *(planned)* Admin > Account Settings | `create_announcement.php` SMS block |
| `smtp_host`, `smtp_user`, `smtp_pass` | *(planned)* Admin > Account Settings | `forgot_password.php`, `create_announcement.php` email block |

Admin settings are read via [`get_system_settings.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_system_settings.php) and written via [`update_system_settings.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/update_system_settings.php).
