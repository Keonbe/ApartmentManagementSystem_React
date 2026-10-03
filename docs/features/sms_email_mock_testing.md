# AMS — Testing SMS & Email on the mock drivers

> **For:** whoever is running this on XAMPP. Every command is copy-pasteable from Git Bash.
> **Design and build order:** [`sms_email_implementation.md`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/sms_email_implementation.md). This page is only how to drive it.
>
> **Start at [§6](#6-from-the-admin-ui)** if you just want to see it work: admin actions print the message to the browser console, no command line involved. Sections 2–5 are the command-line equivalents, for debugging and for reading what the UI recorded.

## 1. What the mock is

`sms_provider = 'log'` and `email_driver = 'log'` run the **entire** pipeline — preferences, opt-outs, dispatch, queue, retries, quiet hours, retention — and contact nothing. Each message is recorded in `notification_log` and written to `backend/logs/notification_outbox/` as a file you can read.

That means the feature is fully demonstrable with **no SMS account, no Gmail credentials, no PHPMailer and no spend**. Switching to a real provider later changes settings, not code.

Nothing on the dry-run path can reach the network. The only network calls in the service layer are inside the Semaphore driver (`_semaphore_request()` in `send_sms.php`), which runs only when `sms_provider = 'semaphore'`; the selftest's `DRY` check enforces that every network call sits in a provider-driver function.

**Semaphore is the only real SMS provider** — selecting it spends real credits (go-live steps: §9). The Twilio / Vonage / Movider / iTexMo stubs were removed (2026-09-24); a building saved on one of them falls back to `log`.

## 2. Turn the channels on

Both ship **off**, so nothing can send by accident:

```bash
/c/xampp/mysql/bin/mysql.exe -u root ams_db -e "
UPDATE system_settings SET setting_value='1'
WHERE setting_key IN ('notifications_sms_enabled','notifications_email_enabled');"
```

Put them back when you are done (§7). Leaving them on is harmless **only** while both drivers are `log` — with a real provider configured, this is the switch that starts spending money.

## 3. Send one message from the console

> **Only with `sms_provider = 'log'`.** `0917 123 4567` below is a made-up number; with Semaphore selected it is a real stranger's phone and a real charge. On a live provider use **Send test** (§6.3), which only ever texts your own number.

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
| `failed` | A driver rejected it: an invalid phone number, Semaphore refusing it (bad key, rate limit, `Failed`/`Refunded`), missing SMTP credentials. `error_message` says which. |

`message_body` is truncated to 500 characters and rows older than `notification_log_retention_days` (90 by default) are deleted on each drain — the log holds tenant numbers and addresses, so it is not kept indefinitely.

**The outbox** holds the messages themselves:

```bash
ls backend/logs/notification_outbox/
cat backend/logs/notification_outbox/*-sms-*.txt          # exact text and segment length
start backend/logs/notification_outbox/*-email-*.html     # opens the rendered email
```

Opening the `.html` in a browser is the closest thing to seeing the real email. The directory is gitignored and safe to delete at any time.

## 6. From the admin UI

This is the normal way to work. Sections 3 and 4 above are the command-line equivalents, kept for debugging; nothing here needs them.

**Set up once:** Account Settings → **Notifications** tab → tick **Email Notifications** and **SMS Notifications**, leave both drivers on **Log**, **Save**. Then open devtools (**F12 → Console**) and leave it open.

### 6.1 Real admin actions

Every admin action that notifies a tenant now also dispatches SMS and email, and prints what it sent to the console — collapsed group, headed `AMS notification — <endpoint>`. Expand it for the per-channel result, the exact SMS text with its character count, the email subject and the full email HTML.

| Do this | Event type | You should see |
|---|---|---|
| Maintenance → change a request's status | `maintenance_update` | The status update text, plus the rejection reason if you gave one |
| Payments → **Send reminder** on one invoice | `rent_due` / `overdue` | The amount, unit and due date; overdue wording past the due date |
| Payments → **Send to all** | `rent_due` / `overdue` | Aggregate counts plus one rendered sample — not one block per invoice |
| Announcements → post one | `info` / `warning` / `action` | `Recipients: N`, and the tag in the SMS prefix |
| CCTV / Parking / Service → change a status | that request's type | The request label and its new status |
| Notifications → approve or decline a tenant request | the request's own type | The decision wording, including any invoices created |

Nothing is delivered. `(DRY RUN, nothing sent)` in the group heading is the proof — it appears whenever both drivers are `log`, so a mock can never be misread as a real send. With one live driver and one mock (e.g. SMS on Semaphore, email on `log`) the heading instead names the mocked channel — `(email: dry run)` — from the response's `dry_run_channels`.

### 6.2 What the console is actually showing you

Two things are worth looking for, because they are invisible anywhere else:

- **The SMS is the text from `sms_templates.php`** (implementation guide §1.5a), not the in-app message. It fits in one 160-character ASCII segment. When it is too long, only the free-text part (a title, label, reason or announcement body) is shortened, at a word boundary with `...`. The status, amount and due date are always whole, and links in free text are removed. Do not raise the limit: a second segment doubles the per-message cost.
- **`SMS: skipped` with `Email: sent`** means the gate worked. The tenant is opted out of SMS (or that category), and the dispatcher stopped it — a different thing from the channel being switched off building-wide, which skips both.

### 6.3 The test-send button

The same section has **Test SMS / Test Email / Test Both**, which go to **your own** contact details rather than a tenant's. Use them to check credentials and templates without touching a real record. They read the **saved** settings, so save before testing a change, and your admin account needs a contact number and email.

### 6.4 Why the queue looks empty

While both drivers are `log`, admin actions dispatch **synchronously** — the send completes inside the request, which is why the result is in the console at all. Nothing reaches `notification_queue`.

Configure a real provider and that reverses automatically: admin actions go back to enqueuing, the console reports `queued`, and `process_queue.php` (§4) does the sending. That switch is deliberate — a real provider means a network round trip per recipient, and an announcement to thirty tenants must not happen inside the admin's POST.

## 7. Run the selftest

```bash
/c/xampp/php/php.exe backend/cron/notification_selftest.php
```

26 checks, no spend, exit code 0 on success. It forces both drivers to `log` before sending anything, so it is safe to run while Semaphore is configured. It creates its own fixture tenant, flips the switches it needs, and restores everything — safe to run against a database with real data, as often as you like. Add `--keep` to leave the fixtures behind for inspection.

| ID | Proves |
|---|---|
| M6-02 / M6-03 | Phone normalisation accepts real-world formats (`0917 123 4567`, `(0917)123-4567`, `+63…`, `0063…`) and rejects everything else |
| M6-04 / M6-05 | A peso sign, em dash or emoji cannot silently triple the bill; one 160-char segment, hard |
| M6-07 | A switched-off channel records a `skipped` row with the reason |
| M6-08 | A tenant's global `sms_opt_out` stops notification types that belong to **no** preference category — the one a per-category table cannot cover |
| M6-09 | A per-category SMS opt-out leaves email alone |
| M6-10 | A tenant with no contact number produces no SMS row and no error |
| M6-12 | Dispatch enqueues without sending; the drain delivers |
| M6-13 | A failing driver retries with growing backoff, then gives up at `max_attempts`, with the reason copied to `notification_queue.error_message` |
| M6-14 | Two drains running at once never send the same job twice |
| M6-15 / M6-16 | Quiet hours hold a non-urgent text until the window's end hour on the **database** clock; an overdue notice ignores them |
| M6-17 | Template values are escaped — an injected `<img onerror=…>` renders as text |
| M6-18 / C11 | Old log rows are pruned; bodies are truncated to 500 characters |
| M6-35 | `sms_provider = 'log'` writes the outbox file and a `sent` row |
| M6-39 | A text starting with "TEST" (even after a stripped emoji) goes out as `AMS: Test…` — Semaphore silently drops messages that start with TEST |
| M6-41 / M6-42 | Same-text SMS jobs go out as one bulk send; Semaphore's answer maps back to each recipient |
| M6-43 | Every SMS template stays one ASCII segment starting with `AMS`, even with oversized, accented input |
| M6-44 / M6-45 | The overdue SMS keeps amount, date and its last word; a long reason is shortened, the status never cut |
| M6-46 | The lease-end reminder goes out by SMS and email |
| M6-47 | Links are stripped from free text; no invoice ID in an SMS |
| DRY | Network calls live only in provider-driver functions, never on the dry-run path |

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
2. **SMS (Semaphore — built)** — full steps in [Appendix C.1](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/docs/features/sms_email_implementation.md#c1-semaphore-sms--philippine-local). In short:
   1. Make sure the database has the Semaphore settings (`sms_sender_approved`, `sms_daily_cap`; the dropped providers' settings removed). `SetupDB.sql` has them; an existing database gets them from `php backend/cron/migrate.php`.
   2. **Schedule the queue drain** — with a real provider, admin actions enqueue (the console shows `queued`, §6.4) and nothing is delivered until it runs:
      ```bat
      schtasks /create /tn "AMS Notification Queue" /sc minute /mo 1 /tr "\"C:\xampp\htdocs\ApartmentManagementSystem_React\backend\cron\run_queue.bat\""
      ```
      Output goes to `backend/logs/queue_drain.log`.
   3. Give your admin account a mobile number, then in Account Settings pick **Semaphore**, paste the API key, save, and press **Check balance**. Semaphore allows 2 balance checks a minute, so a repeat within 60 s shows the cached answer ("as of HH:MM"); going over the limit shows "Semaphore rate limit reached (retry after Ns)".
   4. Enable SMS, save, **Send test** (SMS). Confirm the handset and the `notification_log` row.
   5. Tick **Sender name approved by Semaphore** only once the dashboard shows `AMS` approved; until then messages use the shared `SEMAPHORE` sender. Philippine carriers filter unregistered sender names silently.
   6. **Daily SMS Cap** (default 100) stops runaway spend; over-cap sends are `skipped`, not charged.

Semaphore is the only SMS provider; there are no other drivers.

To stop spending at any time, set SMS Provider back to **Log** or switch SMS Notifications off. §0.4 of the implementation guide covers the carrier rules, and §0.3 the cost model.
