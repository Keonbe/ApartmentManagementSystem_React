# AMS — External Services Integration & Verification Matrix

> ⚠️ **Dropped (2026-09-20):** the SaaS cloud-hosted target (Railway/Vercel) is no longer part of the deployment plan — the project is deployed locally (self-hosted XAMPP) only. SaaS-equivalent columns/notes below are historical.
>
> **Scope**: Consolidates all modules in the Apartment Management System that depend on third-party external services (Payment Gateway, Email, SMS). Covers the local XAMPP/self-hosted setup; SaaS cloud-hosted equivalents noted below are historical.
> **Stack**: React 19 (Vite SPA) + PHP 8 (XAMPP/Apache) + MySQL/MariaDB 10 (`ams_db`)
> **Dev URL**: `http://localhost:8080/ApartmentManagementSystem_React/`
> **Related**: [saas_fallback_strategy.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/deployment/saas_fallback_strategy.md) — full deployment architecture & migration runbook
>
> ⚠️ **Verified against the repo (Sept 2026):** the two migration file links below (§2.1, §2.2) pointed at files that no longer exist — `backend/api/migrations/create_password_resets_table.php` and `backend/api/migrations/payment_channels.php` were both deleted in a later "clean completed migrations" commit without being folded into `SetupDB.sql`. In practice this means **the `password_resets` table and PayMongo's `system_settings` seed keys are absent from a fresh install built from `SetupDB.sql`** — the live dev database still has them because it predates that cleanup. Both links below have been corrected to point at `SetupDB.sql`, and the gap itself is called out inline.

---

## 1. External Service Integration Matrix

| Module | Service Type | Self-Hosted Provider | SaaS Provider (Fallback) | Status | Ref |
|---|---|---|---|---|---|
| **Online Bill Payment** | Payment Gateway | PayMongo (Sandbox / Live) | PayMongo *(unchanged)* | ✅ Implemented (Sandbox) | [Section 2.1](#21-online-bill-payment-paymongo) · [paymongo_integration_guide.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/paymongo_integration_guide.md) |
| **Password Reset Link Delivery** | Email | SMTP configured, but reset email not wired | Resend.com / Mailgun | 🟡 Token flow implemented; email dispatch remains outstanding | [Section 2.2](#22-password-reset-link-delivery-email) |
| **Transactional / Announcement Email** | Email (Transactional) | PHPMailer + configured SMTP (deployment setting) | Resend.com / Mailgun | 🟡 Dispatch wired; runtime delivery depends on `notifications_email_enabled` and `email_driver` in each database | [Section 2.3](#23-announcement-broadcast-email) · [transactional_email_testing.md](../features/transactional_email_testing.md) |
| **Announcement Broadcast — SMS** | SMS Gateway | Semaphore (driver live) | Semaphore *(unchanged — the only supported provider)* | 🟡 Driver live — go-live pending | [Section 2.4](#24-announcement-broadcast-sms) · [notification_services.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/notification_services.md) |
| **Tenant Preference: SMS** | SMS Gateway | Semaphore | Semaphore *(unchanged)* | 🟡 Backend wired — tenant SMS/email toggles not in the UI yet | [Section 2.5](#25-tenant-notification-preferences) |
| **Database** | Data Store | MySQL / MariaDB (XAMPP localhost) | Railway MySQL / PlanetScale | ✅ Running Locally | [Section 2.6](#26-database-mysqlmariadb) |
| **File Storage** | Object Storage | Local disk (`backend/uploads/`) | Supabase Storage / Cloudinary | ✅ Running Locally | [Section 2.7](#27-file-storage-uploads) |
| **Frontend Hosting** | Static CDN | Apache serves `/dist` | Vercel / Netlify | ✅ Running Locally | [Section 2.8](#28-frontend-hosting-react-spa) |
| **PHP API Hosting** | App Server | XAMPP Apache + PHP 8 | Railway / Render | ✅ Running Locally | [Section 2.9](#29-php-api-hosting) |

---

## 1.1 Architecture Overview

### Self-Hosted (Current — XAMPP Home Server)

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

### Full SaaS Fallback (Cloud-Hosted)

```
Tenant / Admin Browser
        │
        ▼
 Vercel / Netlify (React SPA)
        │
        ▼
 Railway / Render (PHP API)
        │
 ├── Railway MySQL / PlanetScale (Database)
 ├── Supabase Storage / Cloudinary (File Storage)
 ├── Resend / Mailgun (Email)
 ├── Semaphore (SMS)
 └── PayMongo (Payment Gateway — unchanged)
```

> [!NOTE]
> Services that are **already external** on both deployment models: PayMongo (payment), Semaphore (SMS), Gmail SMTP (email). The SaaS fallback primarily replaces **infrastructure services** (database, file storage, web server hosting) that currently run on local hardware.

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
| ~~`backend/api/migrations/payment_channels.php`~~ | **File no longer exists** (deleted; not folded into `SetupDB.sql`). These three keys are not seeded anywhere — they're created the first time an admin saves the Payment Gateway form in `AdminAccountSettings.jsx` via `update_system_settings.php`'s `INSERT ... ON DUPLICATE KEY UPDATE`. A fresh install has no PayMongo config until an admin sets it, which the UI already handles gracefully (`create_checkout_session.php` returns "PayMongo is not configured"). |

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

**Planned for Production (Self-Hosted):**
1. Verify PayMongo business account to unlock Live keys.
2. In `AdminAccountSettings.jsx`, remove the `disabled={true}` on the "Live" radio button to allow switching.
3. Input `sk_live_...` keys and a new Live webhook URL pointing to the production domain.
4. Full reference: [paymongo_integration_guide.md § 3](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/paymongo_integration_guide.md).

**SaaS Alternative:**

| Attribute | Self-Hosted | SaaS |
|---|---|---|
| **Provider** | PayMongo (test mode) | PayMongo (production mode) |
| **Code change** | None | None |
| **Webhook endpoint** | Requires public IP or ngrok tunnel | Public URL available immediately |
| **Production mode** | Requires PayMongo business verification | Same |
| **Cost** | 2.9% + ₱15 per transaction (production) | Same |

> [!IMPORTANT]
> PayMongo **webhooks require a publicly accessible URL**. On the home server, this means setting up port forwarding (port 80/443) on the router and a dynamic DNS service (e.g., No-IP or DuckDNS). On SaaS hosting, the API URL is already public with no router configuration required. This is one of the most compelling reasons to use cloud hosting for production payment processing.

**SaaS Migration Step:** Register the new public API URL (e.g., `https://ams-api.railway.app/paymongo_webhook.php`) as the PayMongo webhook endpoint and test a sandbox payment end-to-end.

---

### 2.2 Password Reset Link Delivery (Email)

Allows users who have forgotten their passwords to request a secure, time-limited token to reset their credentials.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/forgot_password.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/forgot_password.php) | Validates email, generates `bin2hex(random_bytes(32))` token, stores SHA-256 hash in `password_resets` table (30-min TTL) |
| [`backend/api/reset_password.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/reset_password.php) | Verifies token hash, updates `users.password` with bcrypt, deletes used token |
| ~~`backend/api/migrations/create_password_resets_table.php`~~ | **File no longer exists.** Unlike the PayMongo keys above, this is a real gap: `password_resets` does **not** appear in `SetupDB.sql` at all, and nothing else creates it. `forgot_password.php`'s `INSERT INTO password_resets` will hard-fail with a SQL error on any database built fresh from `SetupDB.sql`. **Action needed:** add a `CREATE TABLE IF NOT EXISTS password_resets (email, token_hash, expires_at, ...)` block to `SetupDB.sql` before any fresh deployment (self-hosted migration or SaaS parallel target). |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/UserPages/Login.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/Login.jsx) | Forgot Password toggle — shows email form, displays dev-mode reset link when `dev_token` is returned |
| [`ams-react/src/UserPages/ResetPassword.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/ResetPassword.jsx) | New password form — reads `?email=...&token=...` from URL, submits to `reset_password.php` |
| [`ams-react/src/App.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/App.jsx) | `<Route path="/reset-password" element={<ResetPassword />} />` |

Password-reset token generation and verification are implemented, but `forgot_password.php` does not send email. In development it returns `dev_token` for UI testing. Do not treat its success response as proof an email was sent; reset-email dispatch and production-safe token handling remain outstanding.

**SaaS Alternative (Email Provider):**

| Attribute | Self-Hosted (PHPMailer + Gmail SMTP) | SaaS (Resend / Mailgun) |
|---|---|---|
| **Provider** | Gmail SMTP relay | Resend.com or Mailgun |
| **Free tier** | 500 emails/day (Gmail limit) | Resend: 3,000/mo free · Mailgun: 100/day free |
| **Setup** | Gmail app password + Less Secure App toggle | API key only; no SMTP config needed |
| **Code change** | None on self-hosted | Swap PHPMailer transport to API call, or use Resend SMTP relay (`smtp.resend.com`, port 465) with PHPMailer — **no code change** |
| **Deliverability** | Low — Gmail SMTP from home IP often spam-flagged | High — dedicated sending domain + SPF/DKIM |
| **Sender domain** | `gmail.com` (looks personal) | Custom domain (`noreply@yourapartment.com`) |
| **Cost at scale** | Free but limited and unreliable | Resend: $20/mo for 50k emails |

> [!TIP]
> **Recommendation:** Use Resend.com even on the self-hosted setup. PHPMailer supports Resend's SMTP relay. This removes Gmail's 500/day cap and spam risk without requiring any code changes — only SMTP host/credentials change in `system_settings`.

---

### 2.3 Transactional and Announcement Email

Transactional dispatch is wired for the events listed in [transactional_email_testing.md](../features/transactional_email_testing.md). SMTP is configured for the current deployment; actual delivery still depends on that database's email-enabled switch and SMTP driver. Password-reset emails are not wired.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/create_announcement.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/create_announcement.php) | Creates announcements and dispatches selected external channels through the shared notification path |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/AdminPages/AdminAnnouncements.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminAnnouncements.jsx) | Admin form with channel toggles: **In-App**, **SMS**, **Email** |

**Verification:** Follow the real-SMTP steps in [transactional_email_testing.md](../features/transactional_email_testing.md). For a no-network test, set `email_driver` to `log` and inspect the notification log/outbox. The announcement email channel must be selected, and global/category opt-outs still apply.

**SaaS Alternative:** Same provider comparison as [Section 2.2 — SaaS Alternative](#22-password-reset-link-delivery-email). Resend.com's free tier (3,000/mo) is sufficient for most apartment complexes. For larger tenant lists, Resend's paid tier ($20/mo for 50k) or Mailgun ($35/mo for 50k) applies. The same PHPMailer + Resend SMTP configuration covers both password reset emails and announcement broadcasts.

---

### 2.4 Announcement Broadcast — SMS

Same admin announcement flow; after the in-app notices, the message is texted to each recipient's `users.contact_no` through the shared pipeline (`dispatch_admin_action_broadcast()` → queue → `send_sms()` → Semaphore). Implementation and go-live: [sms_email_implementation.md](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/sms_email_implementation.md) §2.1 and Appendix C.1.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/create_announcement.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/create_announcement.php) | Calls `dispatch_admin_action_broadcast()` after the commit; rewrites `announcements.channels` with the channels that reached someone |
| [`backend/api/services/send_sms.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/services/send_sms.php) | `log` dry-run driver and the live Semaphore driver |
| [`backend/api/services/send_notification.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/services/send_notification.php) | Dispatcher, opt-out checks, queue and drain |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/AdminPages/AdminAnnouncements.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/AdminPages/AdminAnnouncements.jsx) | **SMS** / **Email** channel toggles (in-app always on), unit picker for "Specific unit", **Save draft** |

**Step-by-Step Manual Verification (Dev Mode):**
1. Account Settings → **Notifications** tab: switch **SMS Notifications** on, leave **SMS Provider** on **Log**, save.
2. Log in as Admin → **Announcements** → post an announcement to a tenant who has a mobile number.
3. Verify: `SELECT status, recipient, message_body FROM notification_log WHERE channel='sms' ORDER BY id DESC LIMIT 5;` shows a `sent` row, and a `.txt` file appears in `backend/logs/notification_outbox/`. `announcements.channels` includes `"sms"`.

**Current State:**
- SMS is live through **Semaphore**, the only supported provider (`sms_provider = 'semaphore'`, key `sms_api_key`, sender `sms_sender_name` + `sms_sender_approved`, spend guard `sms_daily_cap`). The default is `log`, which records the message and sends nothing.
- The form's channel selection is honoured: SMS and email go out only when ticked (in-app always). "Specific unit" sends to that unit's current tenants; **Save draft** stores the announcement with `status = 'draft'` and notifies nobody.
- Go-live still needs Semaphore credits and key, sender-name approval, and the queue drain scheduled (`backend/cron/run_queue.bat`).

**SaaS Alternative:**

> Only Semaphore is implemented in AMS (the Twilio / Vonage / Movider / iTexMo stubs were removed 2026-09-24). The Vonage / Twilio column is a reference comparison; switching would need a new driver in `backend/api/services/send_sms.php`.

| Attribute | Self-Hosted (Semaphore PH) | SaaS Alternative (Vonage / Twilio) |
|---|---|---|
| **Provider** | Semaphore (Philippines) | Vonage (global) or Twilio (global) |
| **Target market** | PH local numbers — best delivery rates | Global, but PH delivery rates vary |
| **Free credits** | ₱50 trial credits | $10 trial credits (Twilio) |
| **Cost per SMS** | ₱0.50–₱1.00 per message | ~$0.05 USD (~₱2.80) per message |
| **Integration** | `cURL POST` to `https://api.semaphore.co/api/v4/messages` | `cURL POST` to Vonage/Twilio API (different URL + auth) |
| **Code change** | None — already external | Endpoint URL + auth header change only |

> [!NOTE]
> SMS is already an external API call on both deployment models. **This service does not change** between self-hosted and full SaaS. Semaphore is the better choice for a Philippine-based apartment system due to local carrier relationships and pricing.

---

### 2.5 Tenant Notification Preferences

Preferences decide, per tenant and per category, which channels may deliver. The backend is wired; the tenant page currently exposes only the in-app toggles.

**PHP Backend Files:**
| File | Role |
|---|---|
| [`backend/api/get_notification_preferences.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_notification_preferences.php) | Per-category `in_app` / `sms` / `email` flags, global opt-outs, reachability |
| [`backend/api/update_notification_preferences.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/update_notification_preferences.php) | Saves per-category flags and the global `sms_opt_out` / `email_opt_out` |
| `user_channel_allowed()` in [`backend/config.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/config.php) | Checked by the dispatcher before every SMS/email: global opt-out → building switch → category |

**Frontend Files:**
| File | Role |
|---|---|
| [`ams-react/src/UserPages/UserNotifications.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/UserPages/UserNotifications.jsx) | Loads and saves the **in-app** toggle per category through the two endpoints. It shows "Email and SMS delivery are not available yet." — SMS/email toggles are not built (implementation guide §3.2) |

**Storage:** `notification_preferences` (`user_id`, `category`, `in_app_enabled`, `sms_enabled`, `email_enabled`; PK `user_id, category`) plus `users.sms_opt_out` / `users.email_opt_out`. Missing rows mean "enabled".

**Step-by-Step Manual Verification (Dev Mode):**
1. Log in as a tenant → **Notifications** → switch a category's in-app toggle off → **Save**.
2. Reload the page: the toggle stays off (it is persisted).
3. SMS opt-outs can be tested only via the API or SQL until the tenant UI has the toggles: `POST update_notification_preferences.php {"sms_opt_out": true}` as the tenant, then post an announcement — no SMS row is written for that tenant (the dispatcher never calls `send_sms()` for them).

**SaaS Note:** Notification preferences are application-level logic stored in the database. They work identically on both self-hosted and SaaS deployments — no migration impact.

---

### 2.6 Database (MySQL / MariaDB)

| Attribute | Self-Hosted (XAMPP MySQL) | SaaS (Railway MySQL / PlanetScale) |
|---|---|---|
| **Provider** | MariaDB 10.x on localhost | Railway MySQL plugin or PlanetScale (MySQL-compatible) |
| **Connection** | `$conn = new mysqli('localhost', ...)` | Same `mysqli` driver — only host/credentials change |
| **Schema changes** | Direct SQL migration scripts | Same migration scripts via platform SQL console |
| **File storage** | Local `/uploads/` directory | See [Section 2.7](#27-file-storage-uploads) |
| **Cost** | Free (own hardware) | Railway: included in $5/mo hobby plan · PlanetScale: free up to 5 GB |
| **Backup** | Manual | Railway: daily snapshots · PlanetScale: automatic |
| **Migration effort** | None | **Low** — export with `mysqldump`, import to Railway MySQL. No dialect change needed |

> [!WARNING]
> Avoid using **Supabase** (PostgreSQL) as a drop-in replacement — it introduces significant MySQL → PostgreSQL dialect differences (`AUTO_INCREMENT` → `SERIAL`, `TINYINT(1)` → `BOOLEAN`, `DATE_FORMAT()` → `TO_CHAR()`, etc.). Use **Railway MySQL** or **PlanetScale** to avoid rewriting queries.

---

### 2.7 File Storage (Uploads)

Handles tenant ID documents, payment proof images, and profile photos stored in `backend/uploads/`.

| Attribute | Self-Hosted (Local Disk) | SaaS (Supabase Storage / Cloudinary) |
|---|---|---|
| **Storage path** | `backend/uploads/` directories | Supabase Storage bucket or Cloudinary cloud |
| **Access URL** | `http://server-ip/.../backend/uploads/filename.jpg` | `https://xxxx.supabase.co/storage/v1/object/public/uploads/filename.jpg` |
| **Backup** | Manual | Automatic (Supabase) |
| **Max size** | Limited by hard drive | Supabase: 1 GB free · Cloudinary: 25 GB free |
| **CDN delivery** | None | Yes (Cloudinary has global CDN) |
| **Code change** | None | `move_uploaded_file()` → `supabase_upload()` wrapper |

> [!IMPORTANT]
> File upload paths hardcoded as `/backend/uploads/...` will break in cloud environments. Before migrating, abstract all file storage behind a PHP function so the storage target (local vs. cloud) can be swapped via a single config flag.

---

### 2.8 Frontend Hosting (React SPA)

| Attribute | Self-Hosted (Apache serves `/dist`) | SaaS (Vercel / Netlify) |
|---|---|---|
| **Provider** | Apache static file serving | Vercel or Netlify CDN |
| **Deploy method** | Copy `/dist` to `/htdocs/.../ams-react/dist/` | `npm run build` → `vercel --prod` or GitHub auto-deploy |
| **HTTPS** | Manual (Let's Encrypt or self-signed) | Automatic (free TLS) |
| **Global CDN** | None — single home IP | Yes — edge nodes worldwide |
| **Downtime risk** | High (home internet, power, router) | Very low (99.99% SLA) |
| **Cost** | Free (own hardware) | Free (Vercel Hobby / Netlify Free) |
| **`axiosConfig.js` base URL** | `http://homeserver.local/.../backend/api/` | `https://ams-api.railway.app/` |

---

### 2.9 PHP API Hosting

| Attribute | Self-Hosted (XAMPP Apache) | SaaS (Railway / Render) |
|---|---|---|
| **Provider** | Apache 2.4 + PHP 8 on localhost | Railway (PHP via Nixpacks) or Render (Docker) |
| **Deployment** | Copy files to `/htdocs/` | Push to GitHub → auto-deploy |
| **Config** | `config.php` hardcoded | Environment variables in platform dashboard |
| **File uploads** | `move_uploaded_file()` to local disk | Must redirect to external storage (Supabase Storage or Cloudinary) |
| **Cost** | Free (own hardware) | Railway: $5/mo credit (hobby) · Render: free tier with cold starts |
| **Cold starts** | None | Render free tier sleeps after 15 min inactivity — 30–60s wakeup delay |
| **Custom domain** | Requires router port-forwarding | Built-in custom domain support |

> [!CAUTION]
> Do **not** use the Render.com free tier for production. Cold starts (30–60 second delays after inactivity) will make the system appear broken to tenants trying to log in after a period of no activity. Use Railway's always-on hobby plan instead.

---

## 3. Configuration Reference

Keys are stored in `ams_db.system_settings` (not in `.env` — this is a plain PHP/XAMPP stack, not Laravel). On SaaS deployments, platform environment variables supplement or replace `system_settings` for infrastructure credentials.

| `setting_key` | Where Set | Used By | SaaS Equivalent |
|---|---|---|---|
| `paymongo_secret_key` | Admin > Account Settings | `create_checkout_session.php`, `paymongo_webhook.php` | Same (unchanged) |
| `paymongo_public_key` | Admin > Account Settings | Stored, not used yet (checkout runs server-side on the secret key) | Same (unchanged) |
| `paymongo_webhook_secret` | Admin > Account Settings | `paymongo_webhook.php` (HMAC validation) | Same (unchanged) |
| `sms_provider`, `sms_api_key`, `sms_sender_name`, `sms_sender_approved`, `sms_daily_cap` | Admin > Account Settings > Notifications | `services/send_sms.php` (every SMS), `get_sms_balance.php` | Same (unchanged) |
| `smtp_host`, `smtp_user`, `smtp_pass` | *(planned)* Admin > Account Settings | `forgot_password.php`, `create_announcement.php` email block | Resend SMTP: `smtp.resend.com` / port 465 / API key as password |
| `db_host`, `db_user`, `db_pass` | `backend/config.php` | All PHP API files | Railway/PlanetScale host + credentials (set as env vars) |

Admin settings are read via [`get_system_settings.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/get_system_settings.php) and written via [`update_system_settings.php`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/backend/api/update_system_settings.php).

---

## 4. Self-Hosted vs. SaaS Comparison Summary

| Dimension | Self-Hosted (XAMPP Home Server) | Full SaaS Stack |
|---|---|---|
| **Uptime** | Depends on home power + internet (95–98%) | 99.9%+ (provider SLA) |
| **Cost** | Near zero (electricity only) | $0–$15/mo on free tiers; $30–$80/mo at production scale |
| **Setup complexity** | High — port forwarding, DDNS, SSL, Apache config | Low — GitHub push deploys, auto HTTPS |
| **MySQL dialect** | Native | PlanetScale/Railway = native MySQL (no migration) |
| **File uploads** | Simple `move_uploaded_file()` | Requires storage SDK integration |
| **Webhooks (PayMongo)** | Requires port forwarding + public IP | Works out of the box |
| **Email deliverability** | Low (Gmail SMTP from home IP) | High (Resend / Mailgun with SPF/DKIM) |
| **SMS** | Unchanged (Semaphore API) | Unchanged (Semaphore API) |
| **HTTPS / TLS** | Manual (Certbot / Let's Encrypt) | Automatic |
| **Data sovereignty** | Full — data stays on your hardware | Data in provider data centers |
| **Recovery time** | High — requires physical access | Minutes — redeploy from Git |

---

## 5. Recommended SaaS Provider Stack

| Service | Recommended Provider | Tier | Est. Cost/Month |
|---|---|---|---|
| **Frontend (React)** | Vercel | Hobby (free) | ₱0 |
| **PHP API** | Railway | Hobby ($5 credit/mo) | ~₱0–₱280 |
| **Database** | Railway MySQL plugin | Included in plan | ₱0 |
| **File Storage** | Supabase Storage | Free (1 GB) | ₱0 |
| **Email** | Resend.com | Free (3,000/mo) | ₱0 |
| **SMS** | Semaphore | Pay-per-use | ₱0.50–₱1.00/msg |
| **Payment** | PayMongo | Per-transaction | 2.9% + ₱15/txn |
| **Total (light usage)** | — | — | **~₱0–₱560/mo** |

---

## 6. Deployment Decision Guide

| Scenario | Recommended Deployment |
|---|---|
| Demo / panelist presentation only | Self-hosted XAMPP (full control, zero cost, LAN accessible) |
| Production with home server available | Self-hosted + Resend email + Semaphore SMS (already external) |
| Home server fails or unreliable | Railway (API + DB) + Vercel (frontend) + Resend (email) |
| Long-term production (>50 tenants) | Dedicated VPS (DigitalOcean, Hetzner) with MySQL + Caddy |

> For the full SaaS migration runbook (phased day-by-day steps), see [saas_fallback_strategy.md § 6](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/deployment/saas_fallback_strategy.md).
