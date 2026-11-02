<?php
/**
 * Central notification dispatcher and queue drain (checklist 6.6 / 6.7).
 *
 * Usage, AFTER create_notification() has written the in-app row:
 *   require_once __DIR__ . '/services/send_notification.php';
 *   dispatch_external_notification($conn, $user_id, $event_type, $subject, $sms_text, $email_html);
 *
 * A web request must never block on a provider. An announcement to 30 tenants
 * would otherwise mean 30 TCP+TLS round trips inside one POST, which times out
 * the request and ties the admin's success response to a third party being up.
 * So dispatch ENQUEUES by default and returns in microseconds;
 * process_notification_queue() is the only place a provider is contacted.
 * notifications_dispatch_mode = 'sync' restores the blocking path, and exists so
 * a live demo can show a message arriving while the panel watches.
 *
 * Callers dispatch after their business transaction commits. The sender logs
 * provider attempts in notification_log; queue jobs retain retry/error state.
 */

require_once __DIR__ . '/send_sms.php';
require_once __DIR__ . '/send_email.php';
require_once __DIR__ . '/email_templates.php';
require_once __DIR__ . '/sms_templates.php';

// Event types that ignore quiet hours. Rent already overdue, and an announcement
// the admin marked action-required, are the two things worth a 23:00 buzz.
const NOTIFICATION_URGENT_TYPES = ['overdue', 'action'];

// ──────────────────────────────────────────────
//  Dispatch
// ──────────────────────────────────────────────
function dispatch_external_notification($conn, $user_id, $event_type, $subject, $sms_text, $email_html, $force_mode = null) {
    $user_id = (int)$user_id;
    if ($user_id <= 0) return ['sms' => 'skipped', 'email' => 'skipped'];

    $stmt = $conn->prepare("SELECT first_name, email_address, contact_no FROM users WHERE id = ? AND is_archived = 0");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$user) return ['sms' => 'skipped', 'email' => 'skipped'];

    $mode = $force_mode === 'sync' ? 'sync'
          : ($force_mode === 'queue' ? 'queue'
          : (get_setting($conn, 'notifications_dispatch_mode', 'queue') === 'sync' ? 'sync' : 'queue'));
    $out  = ['sms' => 'skipped', 'email' => 'skipped'];

    // user_channel_allowed() in config.php is the single gate: the tenant's own
    // global opt-out first, then the building-wide switch, then the per-category
    // row. That ordering is decided once there, never re-derived per call site.
    if (!empty($user['contact_no']) && $sms_text !== null && $sms_text !== ''
        && user_channel_allowed($conn, $user_id, $event_type, 'sms')) {
        $out['sms'] = $mode === 'sync'
            ? (send_sms($conn, $user['contact_no'], $sms_text, $event_type, $user_id) ? 'sent' : 'failed')
            : (enqueue_notification($conn, $user_id, 'sms', $event_type, [
                   'to'   => $user['contact_no'],
                   'body' => $sms_text,
                   'name' => $user['first_name'],
               ]) ? 'queued' : 'failed');
    }

    if (!empty($user['email_address']) && $email_html !== null && $email_html !== ''
        && user_channel_allowed($conn, $user_id, $event_type, 'email')) {
        $out['email'] = $mode === 'sync'
            ? (send_email($conn, $user['email_address'], $subject, $email_html, $event_type, $user_id) ? 'sent' : 'failed')
            : (enqueue_notification($conn, $user_id, 'email', $event_type, [
                   'to'      => $user['email_address'],
                   'subject' => $subject,
                   'body'    => $email_html,
                   'name'    => $user['first_name'],
               ]) ? 'queued' : 'failed');
    }

    return $out;
}

// Announcements and the daily sweep. Cheap now that each call is one INSERT.
function dispatch_external_broadcast($conn, $user_ids, $event_type, $subject, $sms_text, $email_html, $force_mode = null) {
    $totals = ['sms' => 0, 'email' => 0];
    foreach ($user_ids as $uid) {
        $r = dispatch_external_notification($conn, $uid, $event_type, $subject, $sms_text, $email_html, $force_mode);
        if ($r['sms'] === 'sent' || $r['sms'] === 'queued') $totals['sms']++;
        if ($r['email'] === 'sent' || $r['email'] === 'queued') $totals['email']++;
    }
    return $totals;
}

// ──────────────────────────────────────────────
//  Admin-action dispatch (what the endpoints call)
// ──────────────────────────────────────────────

/**
 * Sync only while both drivers are mocks. A real provider means a TCP+TLS round
 * trip per recipient inside the admin's POST — the reason the queue exists (see
 * the file header). Returning null here falls back to the configured mode, so
 * configuring a provider cannot silently turn the admin UI into a blocking call.
 */
function _admin_action_mode($conn) {
    $mock = get_setting($conn, 'sms_provider', 'log') === 'log'
         && get_setting($conn, 'email_driver', 'log') === 'log';
    return $mock ? 'sync' : null;
}

// Greeting for the email templates. Falls back rather than rendering "Hello ,".
function notify_recipient_name($conn, $user_id) {
    $user_id = (int)$user_id;
    if ($user_id <= 0) return 'Tenant';
    $stmt = $conn->prepare("SELECT first_name FROM users WHERE id = ?");
    if (!$stmt) return 'Tenant';
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return !empty($row['first_name']) ? $row['first_name'] : 'Tenant';
}

/**
 * Dispatch for an admin action and hand back what was rendered, so the endpoint
 * can return it and the browser console can show the message itself.
 *
 * rendered.sms_text is the POST-transform text: send_sms() folds the peso sign
 * and cuts at one GSM-7 segment before any driver sees it, so showing the raw
 * input would misreport both. Both helpers are pure, so running them twice is free.
 */
function dispatch_admin_action_notification($conn, $user_id, $event_type, $subject, $sms_text, $email_html) {
    $out = dispatch_external_notification($conn, $user_id, $event_type, $subject,
                                          $sms_text, $email_html, _admin_action_mode($conn));
    return $out + _admin_action_rendered($conn, $subject, $sms_text, $email_html);
}

// Per-recipient wrapper for non-admin/cron workflows. It preserves the same
// immediate mock preview while real-provider configurations continue to queue.
function dispatch_system_notification($conn, $user_id, $event_type, $subject, $sms_text, $email_html) {
    return dispatch_external_notification($conn, $user_id, $event_type, $subject,
                                          $sms_text, $email_html, _admin_action_mode($conn));
}

function dispatch_admin_action_broadcast($conn, $user_ids, $event_type, $subject, $sms_text, $email_html) {
    $out = dispatch_external_broadcast($conn, $user_ids, $event_type, $subject,
                                       $sms_text, $email_html, _admin_action_mode($conn));
    $out['recipients'] = count($user_ids);
    return $out + _admin_action_rendered($conn, $subject, $sms_text, $email_html);
}

// One rendered sample plus the honesty flag: a 'log' driver recorded the message,
// it did not deliver it, and the console must not let those read the same.
// dry_run_channels says it per channel: with SMS on Semaphore and email still on
// 'log', one message really went out and the other was only recorded.
function _admin_action_rendered($conn, $subject, $sms_text, $email_html) {
    $shown     = sms_single_segment(gsm7_safe((string)$sms_text));
    $sms_dry   = get_setting($conn, 'sms_provider', 'log') === 'log';
    $email_dry = get_setting($conn, 'email_driver', 'log') === 'log';
    return [
        'dry_run'          => $sms_dry && $email_dry,
        'dry_run_channels' => ['sms' => $sms_dry, 'email' => $email_dry],
        'rendered' => [
            'sms_text'   => $shown,
            'sms_length' => mb_strlen($shown),
            'subject'    => $subject,
            'email_html' => $email_html,
        ],
    ];
}

// ──────────────────────────────────────────────
//  Queue
// ──────────────────────────────────────────────
function enqueue_notification($conn, $user_id, $channel, $event_type, $payload) {
    if (!in_array($channel, ['sms', 'email'], true)) return 0;

    $json = json_encode($payload);
    $stmt = $conn->prepare("INSERT INTO notification_queue (user_id, channel, event_type, payload) VALUES (?, ?, ?, ?)");
    if (!$stmt) return 0;
    $stmt->bind_param("isss", $user_id, $channel, $event_type, $json);
    $stmt->execute();
    $id = $stmt->insert_id;
    $stmt->close();
    return $id;
}

/**
 * Drain up to $limit jobs. Safe to run from more than one process at a time.
 * Returns ['processed', 'sent', 'failed', 'deferred', 'pruned'].
 */
function process_notification_queue($conn, $limit = 20, $only_user_id = null) {
    $limit  = max(1, min(500, (int)$limit));
    $counts = ['processed' => 0, 'sent' => 0, 'failed' => 0, 'deferred' => 0, 'pruned' => 0];

    // A crashed run leaves rows in 'processing' forever, so reclaim the stale
    // ones before claiming new work.
    $conn->query("UPDATE notification_queue SET status = 'pending', claim_token = NULL
                  WHERE status = 'processing' AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)");

    // Claim first, then read back what was claimed. Two drains running at once
    // would otherwise SELECT the same pending rows and send them twice; this is
    // the claim-first pattern post_invoice_charge('parking') already uses.
    // $only_user_id keeps a drain to one recipient's jobs: the selftest runs
    // with the 'log' drivers switched on and must not claim real tenants' jobs.
    $only_user_sql = $only_user_id !== null ? " AND user_id = " . (int)$only_user_id : "";
    $token = bin2hex(random_bytes(8));
    $claim = $conn->prepare("UPDATE notification_queue SET status = 'processing', claim_token = ?
                             WHERE status = 'pending' AND next_attempt_at <= NOW()$only_user_sql
                             ORDER BY created_at ASC LIMIT $limit");
    if (!$claim) return $counts;
    $claim->bind_param("s", $token);
    $claim->execute();
    $claim->close();

    $batch = $conn->prepare("SELECT * FROM notification_queue WHERE claim_token = ? ORDER BY created_at ASC");
    $batch->bind_param("s", $token);
    $batch->execute();
    $jobs = $batch->get_result()->fetch_all(MYSQLI_ASSOC);
    $batch->close();

    // Quiet hours. Not a legal requirement for transactional SMS, but holding
    // non-urgent traffic overnight prevents the most common complaint.
    $quiet_start = (int)get_setting($conn, 'notifications_quiet_start', '21');
    $quiet_end   = (int)get_setting($conn, 'notifications_quiet_end', '07');
    // The database clock, not PHP's: XAMPP ships PHP on Europe/Berlin while the
    // DB runs on local time, and next_attempt_at is already compared to NOW().
    $hour        = notification_clock_hour($conn);
    $in_quiet    = $quiet_start > $quiet_end
        ? ($hour >= $quiet_start || $hour < $quiet_end)   // window wraps midnight
        : ($hour >= $quiet_start && $hour < $quiet_end);

    // Same-text SMS jobs (an announcement to every tenant) go out together:
    // Semaphore takes up to 1,000 numbers per POST and recommends that over one
    // call per number. Email, and SMS whose text is unique, go one at a time.
    $sms_groups = [];
    $singles    = [];
    foreach ($jobs as $job) {
        if ($job['channel'] === 'sms' && $in_quiet && !in_array($job['event_type'], NOTIFICATION_URGENT_TYPES, true)) {
            _queue_defer_to_quiet_end($conn, (int)$job['id'], $quiet_end);
            $counts['deferred']++;
            continue;
        }
        $job['_payload'] = json_decode($job['payload'], true) ?: [];
        if ($job['channel'] === 'sms') {
            $sms_groups[$job['event_type'] . "\0" . ($job['_payload']['body'] ?? '')][] = $job;
        } else {
            $singles[] = $job;
        }
    }
    foreach ($sms_groups as $key => $group) {
        if (count($group) === 1) {
            $singles[] = $group[0];
            unset($sms_groups[$key]);
        }
    }

    // Providers rate-limit bursts, so pace the provider calls. Skipped for the
    // dry run, which contacts nothing.
    $pace = get_setting($conn, 'sms_provider', 'log') !== 'log';

    foreach ($sms_groups as $group) {
        $items = [];
        foreach ($group as $job) {
            $items[(int)$job['id']] = ['phone' => $job['_payload']['to'] ?? '', 'user_id' => (int)$job['user_id']];
        }
        // The only place a provider is ever contacted (with send_sms/send_email below).
        $results = send_sms_bulk($conn, $items, $group[0]['_payload']['body'] ?? '', $group[0]['event_type']);
        foreach ($group as $job) _queue_mark_job($conn, $job, !empty($results[(int)$job['id']]), $counts);
        if ($pace) usleep(200000);
    }

    foreach ($singles as $job) {
        $payload = $job['_payload'];
        $ok = $job['channel'] === 'email'
            ? send_email($conn, $payload['to'] ?? '', $payload['subject'] ?? '', $payload['body'] ?? '', $job['event_type'], (int)$job['user_id'])
            : send_sms($conn, $payload['to'] ?? '', $payload['body'] ?? '', $job['event_type'], (int)$job['user_id']);
        _queue_mark_job($conn, $job, $ok, $counts);
        if ($pace) usleep(200000);
    }

    // When a real SMTP driver is in use, hold one PHPMailer instance with
    // SMTPKeepAlive across the batch instead of one handshake per job.

    // Retention: the log holds personal data, so it is not kept without a limit.
    $counts['pruned'] = prune_notification_log($conn);

    return $counts;
}

// Newest logged error for this user and channel, or null.
function _last_delivery_error_for($conn, $user_id, $channel) {
    $stmt = $conn->prepare("SELECT error_message FROM notification_log
                            WHERE user_id <=> ? AND channel = ? ORDER BY id DESC LIMIT 1");
    if (!$stmt) return null;
    $uid = $user_id > 0 ? $user_id : null;
    $stmt->bind_param("is", $uid, $channel);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row['error_message'] ?? null;
}

// Current hour (0-23) on the database clock that the queue schedules against.
function notification_clock_hour($conn) {
    $res = $conn->query("SELECT HOUR(NOW()) AS h");
    return $res ? (int)$res->fetch_assoc()['h'] : (int)date('G');
}

// Hold a quiet-hours SMS until the window ends rather than dropping it. Computed
// in SQL for the same reason as the hour check: next_attempt_at is DB time.
// Record one job's outcome: done, or back to pending with exponential backoff
// until max_attempts, then failed.
function _queue_mark_job($conn, $job, $ok, &$counts) {
    $id = (int)$job['id'];
    $counts['processed']++;
    if ($ok) {
        $done = $conn->prepare("UPDATE notification_queue SET status = 'sent', claim_token = NULL, processed_at = NOW() WHERE id = ?");
        $done->bind_param("i", $id);
        $done->execute();
        $done->close();
        $counts['sent']++;
        return;
    }

    $attempts = (int)$job['attempts'] + 1;
    $status   = $attempts >= (int)$job['max_attempts'] ? 'failed' : 'pending';
    $backoff  = (int)min(60 * pow(2, $attempts), 3600);
    // send_sms()/send_email() log the reason; copy it onto the job so a
    // failed row explains itself without joining notification_log.
    $error = _last_delivery_error_for($conn, (int)$job['user_id'], $job['channel']);
    $retry = $conn->prepare("UPDATE notification_queue
                             SET status = ?, attempts = ?, claim_token = NULL, error_message = ?,
                                 next_attempt_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
                             WHERE id = ?");
    $retry->bind_param("sisii", $status, $attempts, $error, $backoff, $id);
    $retry->execute();
    $retry->close();
    if ($status === 'failed') $counts['failed']++;
}

function _queue_defer_to_quiet_end($conn, $id, $quiet_end) {
    $end = (int)$quiet_end;
    $stmt = $conn->prepare("UPDATE notification_queue
                            SET status = 'pending', claim_token = NULL,
                                next_attempt_at = IF(TIMESTAMP(CURDATE(), MAKETIME(?, 0, 0)) > NOW(),
                                                     TIMESTAMP(CURDATE(), MAKETIME(?, 0, 0)),
                                                     TIMESTAMP(CURDATE() + INTERVAL 1 DAY, MAKETIME(?, 0, 0)))
                            WHERE id = ?");
    $stmt->bind_param("iiii", $end, $end, $end, $id);
    $stmt->execute();
    $stmt->close();
}
