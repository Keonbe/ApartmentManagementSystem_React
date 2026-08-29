# PayMongo Integration Guide

This document serves as the technical reference and setup guide for the PayMongo integration within the Apartment Management System (AMS). 

## 1. System Architecture
The integration handles digital payments (GCash, Maya, QR Ph) through PayMongo's Checkout Sessions API and listens for asynchronous payment updates via Webhooks.

### Frontend Flow
1. **User Request**: In `PayBills.jsx`, the tenant selects a digital payment method.
2. **Checkout API**: The frontend sends an AJAX request to the backend's `/api/create_checkout_session.php`.
3. **Redirection**: The backend returns a secure `checkout_url`. The frontend redirects the tenant to PayMongo's hosted checkout page.
4. **Return**: After authorization (or cancellation), PayMongo redirects the tenant back to `/#/pay-bills?status=success` (or `cancelled`). 

### Backend Endpoints
- `create_checkout_session.php`: 
  - Retrieves the `paymongo_secret_key` from the `system_settings` table.
  - Constructs the payload and sends a `cURL POST` to `https://api.paymongo.com/v1/checkout_sessions`.
  - Updates the invoice `status` to `processing` and saves the `checkout_session_id`.
- `paymongo_webhook.php`: 
  - Receives `POST` events from PayMongo.
  - Calculates the HMAC-SHA256 hash using the `paymongo_webhook_secret` and compares it against the `paymongo-signature` header for security.
  - Updates the invoice status to `paid` or `payment-failed` automatically.

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
6. Subscribe to `checkout_session.payment.paid` and `payment.failed`. 
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
