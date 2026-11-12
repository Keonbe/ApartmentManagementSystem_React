# AMS transactional email: audit and local testing

## Service and existing triggers

Email uses `backend/api/services/send_email.php` (PHPMailer SMTP or a `log` dry-run) and escaped, table-based HTML templates in `email_templates.php`. SMTP has been configured for this deployment, but the code defaults remain `notifications_email_enabled = 0` and `email_driver = 'log'`; check Admin → Settings → Notifications for the active database before expecting inbox delivery. The log driver creates `backend/logs/notification_outbox/*.html` and a `notification_log` row. SMTP reads host, port, username, password, from name and from email from `system_settings`; failures are recorded as failed attempts and PHP errors are sent to the server error log. Never put SMTP credentials in this document.

`notification_log` already fulfils the requested audit table: recipient, subject, `event_type`, status and `sent_at` (plus channel/error). No duplicate `email_logs` table is required.

Before this work, announcements were the primary external email pathway; tenant decision/status endpoints had partial dispatch coverage, while rent application submission/rejection, invoice creation, recurring bill reminders, payment settlement, proof upload/rejection, and maintenance submission had no email dispatch. The mailer itself returned false for globally disabled, invalid recipients and SMTP errors; at the call sites that did not inspect the return this could look like a silent no-op. `notification_log` and the mock outbox were the debugging route.

## Triggers now wired

| Event | Endpoint / job | Email event type | Notes |
|---|---|---|---|
| Application submitted/resubmitted | `rent_application.php` | `application_update` | Includes `APP-<application id>` reference. |
| Application approved/rejected/cancelled | `update_tenant_status.php` | `application_update` | Rejection/cancellation requires a reason. Approval tells next steps; actual date follows after payment. |
| Move-in date set | `schedule_move_in.php` | `application_update` | Separate notice includes the actual mandatory date. |
| Manual new invoice | `create_invoice.php` | `billing` | Displays rent, water, electric, parking, late fee and due date. |
| Recurring rent invoice | daily notification sweep in `config.php` | `billing` | Includes available invoice line items and due date. |
| Payment due/overdue | daily sweep and `send_payment_reminder.php` | `rent_due` / `overdue` | Reminder claim prevents duplicates; full amount/period/due date shown. |
| Confirmed payment / official receipt | `settle_invoice()` / `settle_payment_key()` in `config.php` | `payment` | Groups months into one email for advance payments; receipts remain per invoice in portal. |
| Proof received/rejected | `upload_payment_proof.php`, `reject_payment_proof.php` | `payment` | Rejection includes mandatory admin reason. |
| Maintenance received/status updated | `maintenance_request.php`, `update_maintenance_status.php` | `maintenance_update` | Status update includes rejection notes where supplied. |

Dispatch calls are after commit for transactional endpoints and are wrapped in `try/catch(Throwable)`; mailer failures cannot undo the application/payment/maintenance write. Email-level and error-log failures are also contained.

## Not currently supported by the domain model

Refund requests have a lifecycle (`refund_requests`, in-app notices only; no refund emails yet); the security deposit is refunded per contract (`deposit_refundable`). Utility readings are admin-recorded and can be invoiced, but there is no tenant-uploaded utility-payment-proof workflow or review endpoint. Invoice cancellations caused by applicant cancellation send a void notice; other invoice-cancellation paths do not yet share a centralized void event. Direct-chat unread email digests remain optional and are not implemented. These need actual business rules/endpoints before a reliable trigger can be attached.

## Quick local XAMPP test

1. Start Apache/MySQL and bring an existing database up to date (`php backend/cron/migrate.php`; a fresh `SetupDB.sql` import already has everything). Confirm `notification_log` includes `provider_message_id` and `provider_status`; the shared notification logger requires both columns.
4. For a dry run, in Admin → Settings → Notifications, enable Email Notifications and select Delivery Method = **Log**. For an actual delivery test, enable Email Notifications and select **SMTP** only after confirming the deployment's SMTP settings are present. Or set the dry-run values directly:

   ```powershell
   C:\xampp\mysql\bin\mysql.exe -u root ams_db -e "UPDATE system_settings SET setting_value='1' WHERE setting_key='notifications_email_enabled'; UPDATE system_settings SET setting_value='log' WHERE setting_key='email_driver';"
   ```

   `log` is a dry run: it does not contact SMTP. Use an application account with a valid email address. Check Admin settings and tenant `email_opt_out` / category preferences if no log appears. For SMTP, use only a mailbox you control and check `notification_log` for delivery status/errors.

3. Trigger each workflow using the normal UI:
   - Submit a rent application → `Rental Application Received`.
   - Admin rejects it with a reason, or approves it → corresponding decision email. For move-in date, confirm the initial payment, then schedule a move-in → dated confirmation.
   - Admin creates a tenant invoice → itemized monthly bill. To test an automatically generated bill, run `C:\xampp\php\php.exe backend\cron\daily_sweep.php` with a lease whose next rent period is within 7 days.
   - Payments → Send reminder (an open invoice) → due/overdue reminder. For sweep reminders, adjust the invoice due date/reminder claim carefully in a disposable local database, then run the sweep.
   - Pay Bills: submit proof; admin rejects it with a reason; or admin records/approves payment → proof/receipt email.
   - Tenant Maintenance Request → receipt; admin changes request status → status email.

4. Verify each dispatch and inspect the matching HTML file:

   ```powershell
    C:\xampp\mysql\bin\mysql.exe -u root ams_db -e "SELECT id,event_type,recipient,subject,status,error_message,sent_at FROM notification_log WHERE channel='email' ORDER BY id DESC LIMIT 30;"
   Get-ChildItem backend\logs\notification_outbox\*.html | Sort-Object LastWriteTime -Descending | Select-Object -First 10
   ```

   Open the newest matching `.html` for Log-driver tests. For SMTP tests, select the configured SMTP driver and use only a mailbox you control. With queue mode, run `C:\\xampp\\php\\php.exe backend\\cron\\process_queue.php` to drain queued jobs.

5. Build log example:

   ```sql
   SELECT event_type, status, error_message, COUNT(*) AS total
   FROM notification_log WHERE channel='email'
   GROUP BY event_type, status, error_message ORDER BY MAX(sent_at) DESC;
   ```

6. Database-free template check: `C:\xampp\php\php.exe backend\cron\email_template_selftest.php`. This does not use MySQL, change settings, or contact SMTP.

Restore the previous email switch and driver values after tests. SMTP configuration is deployment-specific; do not assume another local or production database has the same settings.