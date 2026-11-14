# AMS — External Services Integration & Verification Matrix

> **Scope (2026-11-06):** the project is deployed on self-hosted XAMPP/Apache only. The SaaS fallback (Railway, Vercel, Resend and similar) was dropped on 2026-09-20 and its columns, sections and cost tables were removed from this page; git history has them.
>
> **Scope**: Consolidates all modules in the Apartment Management System that depend on third-party external services (Payment Gateway, Email, SMS). Covers the local XAMPP/self-hosted setup.
> **Stack**: React 19 (Vite SPA) + PHP 8 (XAMPP/Apache) + MySQL/MariaDB 10 (`ams_db`)
> **Dev URL**: `http://localhost:8080/ApartmentManagementSystem_React/`
>
> ⚠️ **Verified against the repo (Sept 2026):** the two migration file links below (§2.1, §2.2) pointed at files that no longer exist — `backend/api/migrations/create_password_resets_table.php` and `backend/api/migrations/payment_channels.php` were both deleted in a later "clean completed migrations" commit without being folded into `SetupDB.sql`. In practice this means **the `password_resets` table and PayMongo's `system_settings` seed keys are absent from a fresh install built from `SetupDB.sql`** — the live dev database still has them because it predates that cleanup. Both links below have been corrected to point at `SetupDB.sql`, and the gap itself is called out inline.

---

## 1. External Service Integration Matrix

| Module | Service Type | Provider | Status | Ref |
|---|---|---|---|---|
| **Online Bill Payment** | Payment Gateway | PayMongo (Sandbox / Live) | ✅ Implemented (Sandbox) | [Section 2.1](#21-online-bill-payment-paymongo) · [paymongo_integration_guide.md](../deployment/paymongo_integration_guide.md) |
| **Password Reset Link Delivery** | Email | SMTP configured, but reset email not wired | 🟡 Token flow implemented; email dispatch remains outstanding | [Section 2.2](#22-password-reset-link-delivery-email) |
| **Transactional / Announcement Email** | Email (Transactional) | PHPMailer + configured SMTP (deployment setting) | 🟡 Dispatch wired; runtime delivery depends on `notifications_email_enabled` and `email_driver` in each database | [Section 2.3](#23-announcement-broadcast-email) · [transactional_email_testing.md](../features/transactional_email_testing.md) |
| **Announcement Broadcast — SMS** | SMS Gateway | Semaphore (driver live) | 🟡 Driver live — go-live pending | [Section 2.4](#24-announcement-broadcast-sms) · [sms_email_implementation.md](../features/sms_email_implementation.md) |
| **Tenant Preference: SMS** | SMS Gateway | Semaphore | 🟡 Backend wired — tenant SMS/email toggles not in the UI yet | [Section 2.5](#25-tenant-notification-preferences) |
| **Database** | Data Store | MySQL / MariaDB (XAMPP localhost) | ✅ Running Locally | [Section 2.6](#26-database-mysqlmariadb) |
| **File Storage** | Object Storage | Local disk (`backend/uploads/`) | ✅ Running Locally | [Section 2.7](#27-file-storage-uploads) |
| **Frontend Hosting** | Static CDN | Apache serves `/dist` | ✅ Running Locally | [Section 2.8](#28-frontend-hosting-react-spa) |
| **PHP API Hosting** | App Server | XAMPP Apache + PHP 8 | ✅ Running Locally | [Section 2.9](#29-php-api-hosting) |

---

## 1.1 Architecture Overview

### Current — XAMPP / self-hosted server

```
Tenant / Admin Browser
        │
        ▼
 Home Server (XAMPP)
 ├── Apache HTTP Server     ← serves React SPA static build
 ├── PHP 8 (backend API)    ← all business logic
 ├── MySQL / MariaDB        ← all data
 └── Local File System      ← uploaded documents, photos, proofs
        │
        ├─── PHPMailer → Gmail SMTP    (external — email)
        └─── cURL → Semaphore API      (external — SMS)
```

---

## 2. Module Breakdown

---

### 2.1 Online Bill Payment (PayMongo)

Tenant pays monthly invoice via GCash, Maya, or QR Ph on the tenant portal. Admin receives automatic webhook confirmation.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/create_checkout_session.php`](../../backend/api/create_checkout_session.php) | Creates PayMongo checkout session via cURL, fetches `paymongo_secret_key` from `system_settings` |
| [`backend/api/paymongo_webhook.php`](../../backend/api/paymongo_webhook.php) | Receives async PayMongo event, validates HMAC-SHA256 signature, marks invoice `paid` |
| [`backend/api/get_payment_channels.php`](../../backend/api/get_payment_channels.php) | Returns enabled payment methods from `system_settings` |
| ~~`backend/api/migrations/payment_channels.php`~~ | **File no longer exists** (deleted; not folded into `SetupDB.sql`). These three keys are not seeded anywhere — they're created the first time an admin saves the Payment Gateway form in `AdminAccountSettings.jsx` via `update_system_settings.php`'s `INSERT ... ON DUPLICATE KEY UPDATE`. A fresh install has no PayMongo config until an admin sets it, which the UI already handles gracefully (`create_checkout_session.php` returns "PayMongo is not configured"). |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/UserPages/PayBills.jsx`](../../ams-react/src/UserPages/PayBills.jsx) | Tenant bill payment UI — calls `create_checkout_session.php` and redirects to PayMongo hosted page |
| [`ams-react/src/AdminPages/AdminPayments.jsx`](../../ams-react/src/AdminPages/AdminPayments.jsx) | Displays `PayMongo (Sandbox)` label for gateway-paid invoices |
| [`ams-react/src/AdminPages/AdminAccountSettings.jsx`](../../ams-react/src/AdminPages/AdminAccountSettings.jsx) | Admin form to configure Secret Key, Public Key, Webhook Secret, and Sandbox/Live toggle |

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

**Planned for Production (Self-Hosted):**
1. Verify PayMongo business account to unlock Live keys.
2. In `AdminAccountSettings.jsx`, remove the `disabled={true}` on the "Live" radio button to allow switching.
3. Input `sk_live_...` keys and a new Live webhook URL pointing to the production domain.
4. Full reference: [paymongo_integration_guide.md § 3](../deployment/paymongo_integration_guide.md).

> [!IMPORTANT]
> PayMongo **webhooks require a publicly accessible URL**. On the home server, this means setting up port forwarding (port 80/443) on the router and a dynamic DNS service (e.g., No-IP or DuckDNS).

---

### 2.2 Password Reset Link Delivery (Email)

Allows users who have forgotten their passwords to request a secure, time-limited token to reset their credentials.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/forgot_password.php`](../../backend/api/forgot_password.php) | Validates email, generates `bin2hex(random_bytes(32))` token, stores SHA-256 hash in `password_resets` table (30-min TTL) |
| [`backend/api/reset_password.php`](../../backend/api/reset_password.php) | Verifies token hash, updates `users.password` with bcrypt, deletes used token |
| ~~`backend/api/migrations/create_password_resets_table.php`~~ | **File no longer exists.** Unlike the PayMongo keys above, this is a real gap: `password_resets` does **not** appear in `SetupDB.sql` at all, and nothing else creates it. `forgot_password.php`'s `INSERT INTO password_resets` will hard-fail with a SQL error on any database built fresh from `SetupDB.sql`. **Action needed:** add a `CREATE TABLE IF NOT EXISTS password_resets (email, token_hash, expires_at, ...)` block to `SetupDB.sql` before any fresh deployment (self-hosted migration or SaaS parallel target). |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/UserPages/Login.jsx`](../../ams-react/src/UserPages/Login.jsx) | Forgot Password toggle — shows email form, displays dev-mode reset link when `dev_token` is returned |
| [`ams-react/src/UserPages/ResetPassword.jsx`](../../ams-react/src/UserPages/ResetPassword.jsx) | New password form — reads `?email=...&token=...` from URL, submits to `reset_password.php` |
| [`ams-react/src/App.jsx`](../../ams-react/src/App.jsx) | `<Route path="/reset-password" element={<ResetPassword />} />` |

Password-reset token generation and verification are implemented, but `forgot_password.php` does not send email. In development it returns `dev_token` for UI testing. Do not treat its success response as proof an email was sent; reset-email dispatch and production-safe token handling remain outstanding.

---

### 2.3 Transactional and Announcement Email

Transactional dispatch is wired for the events listed in [transactional_email_testing.md](../features/transactional_email_testing.md). SMTP is configured for the current deployment; actual delivery still depends on that database's email-enabled switch and SMTP driver. Password-reset emails are not wired.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/create_announcement.php`](../../backend/api/create_announcement.php) | Creates announcements and dispatches selected external channels through the shared notification path |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/AdminPages/AdminAnnouncements.jsx`](../../ams-react/src/AdminPages/AdminAnnouncements.jsx) | Admin form with channel toggles: **In-App**, **SMS**, **Email** |

**Verification:** Follow the real-SMTP steps in [transactional_email_testing.md](../features/transactional_email_testing.md). For a no-network test, set `email_driver` to `log` and inspect the notification log/outbox. The announcement email channel must be selected, and global/category opt-outs still apply.

---

### 2.4 Announcement Broadcast — SMS

Same admin announcement flow; after the in-app notices, the message is texted to each recipient's `users.contact_no` through the shared pipeline (`dispatch_admin_action_broadcast()` → queue → `send_sms()` → Semaphore). Implementation and go-live: [sms_email_implementation.md](../features/sms_email_implementation.md) §2.1 and Appendix C.1.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/create_announcement.php`](../../backend/api/create_announcement.php) | Calls `dispatch_admin_action_broadcast()` after the commit; rewrites `announcements.channels` with the channels that reached someone |
| [`backend/api/services/send_sms.php`](../../backend/api/services/send_sms.php) | `log` dry-run driver and the live Semaphore driver |
| [`backend/api/services/send_notification.php`](../../backend/api/services/send_notification.php) | Dispatcher, opt-out checks, queue and drain |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/AdminPages/AdminAnnouncements.jsx`](../../ams-react/src/AdminPages/AdminAnnouncements.jsx) | **SMS** / **Email** channel toggles (in-app always on), unit picker for "Specific unit", **Save draft** |

**Step-by-Step Manual Verification (Dev Mode):**
1. Account Settings → **Notifications** tab: switch **SMS Notifications** on, leave **SMS Provider** on **Log**, save.
2. Log in as Admin → **Announcements** → post an announcement to a tenant who has a mobile number.
3. Verify: `SELECT status, recipient, message_body FROM notification_log WHERE channel='sms' ORDER BY id DESC LIMIT 5;` shows a `sent` row, and a `.txt` file appears in `backend/logs/notification_outbox/`. `announcements.channels` includes `"sms"`.

**Current State:**
- SMS is live through **Semaphore**, the only supported provider (`sms_provider = 'semaphore'`, key `sms_api_key`, sender `sms_sender_name` + `sms_sender_approved`, spend guard `sms_daily_cap`). The default is `log`, which records the message and sends nothing.
- The form's channel selection is honoured: SMS and email go out only when ticked (in-app always). "Specific unit" sends to that unit's current tenants; **Save draft** stores the announcement with `status = 'draft'` and notifies nobody.
- Go-live still needs Semaphore credits and key, sender-name approval, and the queue drain scheduled (`backend/cron/run_queue.bat`).

---

### 2.5 Tenant Notification Preferences

Preferences decide, per tenant and per category, which channels may deliver. The backend is wired; the tenant page currently exposes only the in-app toggles.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/get_notification_preferences.php`](../../backend/api/get_notification_preferences.php) | Per-category `in_app` / `sms` / `email` flags, global opt-outs, reachability |
| [`backend/api/update_notification_preferences.php`](../../backend/api/update_notification_preferences.php) | Saves per-category flags and the global `sms_opt_out` / `email_opt_out` |
| `user_channel_allowed()` in [`backend/config.php`](../../backend/config.php) | Checked by the dispatcher before every SMS/email: global opt-out → building switch → category |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/UserPages/UserNotifications.jsx`](../../ams-react/src/UserPages/UserNotifications.jsx) | Loads and saves the **in-app** toggle per category through the two endpoints. It shows "Email and SMS delivery are not available yet." — SMS/email toggles are not built (implementation guide §3.2) |

**Storage:** `notification_preferences` (`user_id`, `category`, `in_app_enabled`, `sms_enabled`, `email_enabled`; PK `user_id, category`) plus `users.sms_opt_out` / `users.email_opt_out`. Missing rows mean "enabled".

**Step-by-Step Manual Verification (Dev Mode):**
1. Log in as a tenant → **Notifications** → switch a category's in-app toggle off → **Save**.
2. Reload the page: the toggle stays off (it is persisted).
3. SMS opt-outs can be tested only via the API or SQL until the tenant UI has the toggles: `POST update_notification_preferences.php {"sms_opt_out": true}` as the tenant, then post an announcement — no SMS row is written for that tenant (the dispatcher never calls `send_sms()` for them).

---

### 2.6 Database (MySQL / MariaDB)

| Attribute | Self-Hosted (XAMPP MySQL) |
|---|---|
| **Provider** | MariaDB 10.x on localhost |
| **Connection** | `$conn = new mysqli('localhost', ...)` |
| **Schema changes** | Direct SQL migration scripts |
| **File storage** | Local `/uploads/` directory |
| **Cost** | Free (own hardware) |
| **Backup** | Manual |
| **Migration effort** | None |

> [!WARNING]
---

### 2.7 File Storage (Uploads)

Handles tenant ID documents, payment proof images, and profile photos stored in `backend/uploads/`.

| Attribute | Self-Hosted (Local Disk) |
|---|---|
| **Storage path** | `backend/uploads/` directories |
| **Access URL** | `http://server-ip/.../backend/uploads/filename.jpg` |
| **Backup** | Manual |
| **Max size** | Limited by hard drive |
| **CDN delivery** | None |
| **Code change** | None |

> [!IMPORTANT]
> File upload paths hardcoded as `/backend/uploads/...` will break in cloud environments. Before migrating, abstract all file storage behind a PHP function so the storage target (local vs. cloud) can be swapped via a single config flag.

---

### 2.8 Frontend Hosting (React SPA)

| Attribute | Self-Hosted (Apache serves `/dist`) |
|---|---|
| **Provider** | Apache static file serving |
| **Deploy method** | Copy `/dist` to `/htdocs/.../ams-react/dist/` |
| **HTTPS** | Manual (Let's Encrypt or self-signed) |
| **Global CDN** | None — single home IP |
| **Downtime risk** | High (home internet, power, router) |
| **Cost** | Free (own hardware) |
| **`axiosConfig.js` base URL** | `http://homeserver.local/.../backend/api/` |

---

### 2.9 PHP API Hosting

| Attribute | Self-Hosted (XAMPP Apache) |
|---|---|
| **Provider** | Apache 2.4 + PHP 8 on localhost |
| **Deployment** | Copy files to `/htdocs/` |
| **Config** | `config.php` hardcoded |
| **File uploads** | `move_uploaded_file()` to local disk |
| **Cost** | Free (own hardware) |
| **Cold starts** | None |
| **Custom domain** | Requires router port-forwarding |

> [!CAUTION]
---

## 3. Configuration Reference

Keys are stored in `ams_db.system_settings` (not in `.env` — this is a plain PHP/XAMPP stack, not Laravel).

| `setting_key` | Where Set | Used By |
|---|---|---|
| `paymongo_secret_key` | Admin > Account Settings | `create_checkout_session.php`, `paymongo_webhook.php` |
| `paymongo_public_key` | Admin > Account Settings | Stored, not used yet (checkout runs server-side on the secret key) |
| `paymongo_webhook_secret` | Admin > Account Settings | `paymongo_webhook.php` (HMAC validation) |
| `sms_provider`, `sms_api_key`, `sms_sender_name`, `sms_sender_approved`, `sms_daily_cap` | Admin > Account Settings > Notifications | `services/send_sms.php` (every SMS), `get_sms_balance.php` |
| `smtp_host`, `smtp_user`, `smtp_pass` | *(planned)* Admin > Account Settings | `forgot_password.php`, `create_announcement.php` email block |
| `db_host`, `db_user`, `db_pass` | `backend/config.php` | All PHP API files |

Admin settings are read via [`get_system_settings.php`](../../backend/api/get_system_settings.php) and written via [`update_system_settings.php`](../../backend/api/update_system_settings.php).

---

## 3.1 Running Costs (checked 2026-11-13)

> Published rates, **not invoices**. Rates change and the sources below are the providers' pages and third-party listings; confirm each figure at signup and record it here. Every amount excludes anything not stated.

| Cost | Rate | Source | Notes |
|---|---|---|---|
| **Hosting** | Own hardware: ₱0 plus electricity and internet. Shared hosting about $3–10/month, VPS about $5–12/month. | [cicd_pipeline.md](../deployment/cicd_pipeline.md) §Deployment Targets | The full stack (PHP, MariaDB, Node chat server) needs a server, not static hosting. Hosting prices are estimates, not quotes. |
| **PayMongo, online payments** | QR Ph 1.5%, GCash 2.5%, Maya 2.0%, GrabPay 2.2%, cards about 3.5% + ₱15; +1% for foreign cards. VAT included. No setup or monthly fee; charged only on successful payments. | [PayMongo fees and rates](https://developers.paymongo.com/docs/fees-and-rates) | Newer pages quote the same rates without VAT (for example GCash 2.23%). Charged on each online payment, to the merchant. Cash and uploaded proof of payment have no gateway fee. |
| **SMS (Semaphore)** | ₱0.56 per 160-character message, excluding VAT. The priority route (for time-critical texts) uses 2 credits per message. Long texts are billed per segment. The first custom sender name is free. | [semaphore.co](https://www.semaphore.co), [API docs](https://api.semaphore.co/docs), [FAQ](https://api.semaphore.co/faq) | An older third-party listing gave ₱0.50, which is what [sms_email_implementation.md](../features/sms_email_implementation.md) §0.3 uses. Texts with `₱` or emoji bill as several segments; the app converts `₱` to `PHP` (`gsm7_safe()`). |
| **Email** | Not costed. Uses the owner's SMTP mailbox; limits depend on the provider. | — | The email driver ships as `log` (dry run); no provider is configured. |
| **Domain and certificate** | Not recorded in the repository. | — | Needed for the production site. |

**Worked example: 30 tenants paying ₱4,000 rent a month** (volumes from [sms_email_implementation.md](../features/sms_email_implementation.md) §0.3).

| Line | Monthly amount | How |
|---|---|---|
| SMS, if every event type goes by SMS | ₱134–₱286 | 240–510 messages × ₱0.56 |
| SMS, only a few event types (for example overdue rent) | Much lower | The SMS channel ships off (`notifications_sms_enabled` = 0), so the cost starts only when an admin turns it on |
| PayMongo, everyone pays online by GCash | about ₱3,000 | 30 × ₱4,000 × 2.5% |
| PayMongo, everyone pays online by QR Ph | about ₱1,800 | 30 × ₱4,000 × 1.5% |
| PayMongo, everyone pays cash or by uploaded proof | ₱0 | No gateway |
| Hosting | ₱0 to about $12 | Own hardware, or shared hosting or a VPS |

The gateway fee scales with how much is paid online, so the owner decides it by choosing which payment methods to offer. The system itself has no per-user licence cost.

---

## 4. Deployment Decision Guide

| Scenario | Recommended Deployment |
|---|---|
| Demo / panelist presentation only | Self-hosted XAMPP (full control, zero cost, LAN accessible) |
| Production with home server available | Self-hosted + Resend email + Semaphore SMS (already external) |
| Long-term production (>50 tenants) | Dedicated VPS (DigitalOcean, Hetzner) with MySQL + Caddy |

