# AMS — Testing SMS & Email on the mock drivers

> **For:** whoever is running this on XAMPP. Every command is copy-pasteable from Git Bash.
> **Design and build order:** [`sms_email_implementation.md`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/sms_email_implementation.md). This page is only how to drive it.

## 1. What the mock is

`sms_provider = 'log'` and `email_driver = 'log'` run the **entire** pipeline — preferences, opt-outs, dispatch, queue, retries, quiet hours, retention — and contact nothing. Each message is recorded in `notification_log` and written to `backend/logs/notification_outbox/` as a file you can read.

That means the feature is fully demonstrable with **no SMS account, no Gmail credentials, no PHPMailer and no spend**. Switching to a real provider later changes settings, not code.

Nothing in the service layer can reach the network — verify it yourself:

```bash
grep -rn "curl_init" backend/api/services/    # no output
```

The five real SMS drivers (Semaphore, Twilio, Vonage, Movider, iTexMo) are **stubs**. Selecting one makes sends fail with a clear reason rather than pretending to work.

## 2. Turn the channels on

Both ship **off**, so nothing can send by accident:

```bash
/c/xampp/mysql/bin/mysql.exe -u root ams_db -e "
UPDATE system_settings SET setting_value='1'
WHERE setting_key IN ('notifications_sms_enabled','notifications_email_enabled');"
```

Put them back when you are done (§7). Leaving them on is harmless **only** while both drivers are `log` — with a real provider configured, this is the switch that starts spending money.

## 3. Send one message from the console

```bash
# SMS — note the deliberately messy number; it is normalised to +639171234567
/c/xampp/php/php.exe -r "
  require 'backend/config.php';
  require 'backend/api/services/send_sms.php';
  var_dump(send_sms(\$conn, '0917 123 4567', 'AMS: test message', 'test', 1));
"

# Email — built through a real template
/c/xampp/php/php.exe -r "
  require 'backend/config.php';
  require 'backend/api/services/send_email.php';
  require 'backend/api/services/email_templates.php';
  \$html = email_announcement_template('Test', 'This is a test announcement.', 'General');
  var_dump(send_email(\$conn, 'admin@gmail.com', 'AMS Test Email', \$html, 'test', 1));
"
```

`bool(true)` means the pipeline accepted it and wrote the record. `bool(false)` is not a crash — read the reason from `notification_log` (§5).

## 4. Dispatch the way a real endpoint will

This is the part worth understanding, because it is what Phase 2 will call. `dispatch_external_notification()` **does not send** — it resolves the tenant's contact details, applies their opt-outs, and writes rows to `notification_queue`. The request returns immediately.

```bash
# Use a real seeded tenant. (Not $UID — bash reserves that one and the
# assignment fails silently, leaving you dispatching to a user that isn't there.)
TENANT=$(/c/xampp/mysql/bin/mysql.exe -u root ams_db -N -e \
  "SELECT id FROM users WHERE email_address='maria.santos@gmail.com'")

/c/xampp/php/php.exe -r "
  require 'backend/config.php';
  require 'backend/api/services/send_notification.php';
  print_r(dispatch_external_notification(\$conn, $TENANT, 'maintenance_update',
      'Maintenance update', 'AMS: your request is now In Progress.',
      email_status_update_template('Maria', 'maintenance', 'Leaking tap', 'In Progress')));
"
```

Expect `[sms] => queued, [email] => queued`. Two rows are now waiting and nothing has been delivered — the second query counts delivery records for this event type, which must still be zero:

```bash
/c/xampp/mysql/bin/mysql.exe -u root ams_db -e "
SELECT id, channel, event_type, status, attempts FROM notification_queue;
SELECT COUNT(*) AS delivered FROM notification_log WHERE event_type='maintenance_update';"
```

Then drain the queue — the only place a provider is ever contacted:

```bash
/c/xampp/php/php.exe backend/cron/process_queue.php
/c/xampp/php/php.exe backend/cron/process_queue.php --limit=5   # smaller batch
```

The queue rows move to `sent` and `notification_log` gains one row each. On XAMPP this script is a Task Scheduler job (every minute); the header comment has the exact setup.

## 5. Read the results

```bash
/c/xampp/mysql/bin/mysql.exe -u root ams_db -e "
SELECT id, channel, event_type, recipient, status, error_message, sent_at
FROM notification_log ORDER BY id DESC LIMIT 10;"
```

| `status` | What produced it |
|---|---|
| `sent` | The driver accepted the message. On a `log` driver this means "recorded", not "delivered". |
| `skipped` | A guard stopped it before any driver ran — the channel is switched off, or the tenant is opted out. `error_message` says which. |
| `failed` | A driver rejected it: an invalid phone number, a stub provider, missing SMTP credentials. |

`message_body` is truncated to 500 characters and rows older than `notification_log_retention_days` (90 by default) are deleted on each drain — the log holds tenant numbers and addresses, so it is not kept indefinitely.

**The outbox** holds the messages themselves:

```bash
ls backend/logs/notification_outbox/
cat backend/logs/notification_outbox/*-sms-*.txt          # exact text and segment length
start backend/logs/notification_outbox/*-email-*.html     # opens the rendered email
```

Opening the `.html` in a browser is the closest thing to seeing the real email. The directory is gitignored and safe to delete at any time.

## 6. From the admin UI

**Account Settings → Notification Services** carries the same controls, and is the fastest way to see a send:

1. Tick **Email Notifications** and **SMS Notifications**, leave both drivers on **Log**, and **Save**.
2. Make sure your admin account has a contact number and email (Profile section above) — a test cannot reach a blank field.
3. Open devtools (**F12 → Console**), then press **Test SMS**, **Test Email** or **Test Both**.

The toast reports the outcome; the console holds the payload — drivers used, per-channel result, the exact SMS text with its character count, and the full email HTML. A dry run is labelled as such, so a `log` success can never be mistaken for a delivery.

The test always goes to **your own** contact details, never a tenant's, and it reads the **saved** settings — save before testing a change.

## 7. Run the selftest

```bash
/c/xampp/php/php.exe backend/cron/notification_selftest.php
```

17 checks, no spend, exit code 0 on success. It creates its own fixture tenant, flips the switches it needs, and restores everything — safe to run against a database with real data, as often as you like. Add `--keep` to leave the fixtures behind for inspection.

| ID | Proves |
|---|---|
| M6-02 / M6-03 | Phone normalisation accepts real-world formats (`0917 123 4567`, `(0917)123-4567`, `+63…`, `0063…`) and rejects everything else |
| M6-04 / M6-05 | A peso sign, em dash or emoji cannot silently triple the bill; one 160-char segment, hard |
| M6-07 | A switched-off channel records a `skipped` row with the reason |
| M6-08 | A tenant's global `sms_opt_out` stops notification types that belong to **no** preference category — the one a per-category table cannot cover |
| M6-09 | A per-category SMS opt-out leaves email alone |
| M6-10 | A tenant with no contact number produces no SMS row and no error |
| M6-12 | Dispatch enqueues without sending; the drain delivers |
| M6-13 | A failing driver retries with growing backoff, then gives up at `max_attempts` |
| M6-14 | Two drains running at once never send the same job twice |
| M6-15 / M6-16 | Quiet hours hold a non-urgent text; an overdue notice ignores them |
| M6-17 | Template values are escaped — an injected `<img onerror=…>` renders as text |
| M6-18 / C11 | Old log rows are pruned; bodies are truncated to 500 characters |
| DRY | No service file opens a network connection |

## 8. Reset

```bash
/c/xampp/mysql/bin/mysql.exe -u root ams_db -e "
DELETE FROM notification_queue;
DELETE FROM notification_log;
UPDATE system_settings SET setting_value='0'
WHERE setting_key IN ('notifications_sms_enabled','notifications_email_enabled');
UPDATE system_settings SET setting_value='log' WHERE setting_key='sms_provider';
UPDATE system_settings SET setting_value='log' WHERE setting_key='email_driver';
DELETE FROM users WHERE first_name='Selftest';"

rm -rf backend/logs/notification_outbox
```

## 9. Switching to a real provider

The code path does not change. In order:

1. **Email** — install PHPMailer (`cd backend && composer require phpmailer/phpmailer:^6.9`; pin 6.x, PHPMailer 7 needs PHP 8.1 and local XAMPP is 8.0.30), fill the SMTP fields with a Gmail **App Password**, set **Delivery Method** to `SMTP`. Free and no lead time — do this one first.
2. **SMS** — the driver for your provider still has to be written (Appendix C of the implementation guide has the API call for each). Before that matters, start the **sender-ID registration**: Philippine carriers filter unregistered A2P traffic silently, so the API returns success and nothing arrives. Semaphore takes 1–3 business days; Twilio and Vonage take a week or more and want business documents.

Keep both on `log` until the registration is approved. §0.4 of the implementation guide covers the carrier rules, and §0.3 the cost model.
