# PayMongo Integration Guide

This document serves as the technical reference and setup guide for the PayMongo integration within the Apartment Management System (AMS). 

## 1. System Architecture
The integration handles digital payments (GCash, Maya, QR Ph) through PayMongo's Checkout Sessions API and listens for asynchronous payment updates via Webhooks.

### Frontend Flow
1. **User Request**: In `PayBills.jsx`, the tenant selects a digital payment method.
2. **Checkout API**: The frontend sends an AJAX request to the backend's `/api/create_checkout_session.php`.
3. **Redirection**: The backend returns a secure `checkout_url`. The frontend redirects the tenant to PayMongo's hosted checkout page.
4. **Return**: After authorization (or cancellation), PayMongo redirects the tenant back to `/pay-bills?status=success&invoice_id=…` (or `cancelled`). 

### Backend Endpoints
- `create_checkout_session.php`: 
  - Retrieves the `paymongo_secret_key` from the `system_settings` table.
  - Constructs the payload and sends a `cURL POST` to `https://api.paymongo.com/v1/checkout_sessions`.
  - Updates the invoice `status` to `processing` and saves the `checkout_session_id`.
- `paymongo_webhook.php`: 
  - Receives `POST` events from PayMongo.
  - Calculates the HMAC-SHA256 hash using the `paymongo_webhook_secret` and compares it against the `paymongo-signature` header for security. The signature header carries **both** a `te` (test) and `li` (live) key, with whichever mode isn't active sent as an *empty string* — the key to verify against is chosen by the event's own `livemode` flag, not by which key happens to be non-null (fixed 2026-09-20, audit H9a; the old `??`-based lookup 401'd every real live-mode event).
  - Before marking an invoice paid, compares `payments[0].attributes.amount` (centavos) against the invoice's current `total_amount` — a mismatch (e.g. the total changed after checkout because a late fee was added) leaves the invoice `pending-verification` and queues it for manual review instead of trusting the stale total (audit H9b).
  - Settles a matched payment through the same `settle_invoice()` helper the front desk uses, so an online move-in payment activates the room/application/contract just like a desk payment (audit M12).
  - Updates the invoice status to `paid` or `payment-failed` automatically.
  - Stores the PayMongo payment id (`pay_…`, `invoices.paymongo_payment_id`) on every invoice it settles; a refund needs it.
  - A paid event AMS cannot apply (bill cancelled while at the checkout, bill already paid by another payment, older checkout than the one open, settle cascade failed) is not dropped: it becomes an `online_payment` refund request and an admin notice, once per payment id.
  - Refund events update `refund_requests.gateway_status`; a `failed` refund notifies the admin.
- `update_refund_request.php` (`action: mark_refunded`, `gateway: true`): refunds through `POST /v1/refunds` (`payment_id`, `amount` in centavos, `reason: others`, `notes`, `Idempotency-Key: ams-refund-<id>`) on the payment the money came in on (`refund_source_payment()`); claims the request first, so a second click cannot refund twice, and leaves it Approved if PayMongo refuses. Money that did not come in through PayMongo is paid back by hand (method + reference). Shared cURL/TLS code for both calls is in `backend/paymongo_gateway.php`.

### Database Schema
The `invoices` table requires two columns for tracking:
- `checkout_session_id` (VARCHAR): Stores the active PayMongo session ID.
- `payment_gateway` (VARCHAR): Set to `'paymongo_sandbox'` or `'paymongo_live'` for auditing.

---

## 2. Testing Locally (Sandbox Mode)
Because PayMongo needs a public URL to send webhooks to, testing on a local XAMPP server requires a secure tunnel.

### Step-by-Step Local Setup
1. Log in to your [PayMongo Dashboard](https://dashboard.paymongo.com/) and toggle **Test Mode**.
2. Go to **Developers > API Keys** to retrieve your `sk_test_...` and `pk_test_...` keys.
3. Download [Ngrok](https://ngrok.com/) and expose your local Apache server:
   ```bash
   ngrok http 8080
   ```
4. Copy the generated Ngrok HTTPS URL.
5. In the PayMongo Dashboard, go to **Developers > Webhooks** and create a webhook pointing to:
   `https://<YOUR_NGROK_URL>/ApartmentManagementSystem_React/backend/api/paymongo_webhook.php`
6. Subscribe to `checkout_session.payment.paid`, `payment.failed` and the refund events (`payment.refunded` / `payment.refund.updated`; the webhook accepts any event whose name contains `refund`, so tick every refund event your dashboard lists).
7. Copy the generated Webhook Secret (`whsk_...`).

### Application Configuration
1. Log in to the AMS as an Admin.
2. Go to **Account Settings > Payment Gateway Integration**.
3. Ensure the environment is set to **Sandbox**.
4. Input your Secret Key, Public Key, and Webhook Secret. Save the settings.

---

## 3. Production Deployment
When deploying the application to a live server (e.g., Hostinger, AWS, VPS), follow these steps to securely migrate from Sandbox to Live operations.

1. Secure your live domain with an SSL Certificate (HTTPS is mandatory for webhooks).
2. Complete your PayMongo business verification to unlock live transactions.
3. Retrieve your **Live Keys** (`sk_live_...`, `pk_live_...`) from the dashboard.
4. Create a new webhook in the PayMongo Live Dashboard pointing directly to your live server domain:
   `https://yourdomain.com/backend/api/paymongo_webhook.php`
5. **Developer Unlock**: Open `ams-react/src/AdminPages/AdminAccountSettings.jsx` and locate the environment radio buttons. Remove the `disabled={true}` and `checked={false}` hardcodes on the "Live" option to allow administrators to switch modes.
6. As an Admin, switch the environment to **Live**, input the live keys, and save the settings.
7. Conduct a final test by pushing a ₱1.00 payment using a personal GCash/Maya account.
