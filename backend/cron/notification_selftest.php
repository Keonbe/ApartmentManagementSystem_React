<?php
// SMS/Email dry-run selftest (checklist 6.6 / 6.7). Command line only.
//
//   php backend/cron/notification_selftest.php          run every check
//   php backend/cron/notification_selftest.php --keep   leave the fixtures behind
//
// Exercises the whole pipeline against the 'log' drivers: helpers, guards,
// opt-outs, dispatch, queue, retry, quiet hours and retention. Contacts nothing
// and costs nothing. Test IDs match docs/features/sms_email_implementation.md
// §4.3, so a failure here names the behaviour that regressed.
//
// The script creates its own fixture tenant, flips the channel switches on for
// the duration, and restores everything it touched — run it as often as you
// like, on a database with real data, without leaving a trace.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "Forbidden";
    exit;
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../api/services/send_notification.php';

$keep = in_array('--keep', $argv, true);

$results = [];
$failures = 0;

function check($id, $description, $passed, $detail = '') {
    global $results, $failures;
    if (!$passed) $failures++;
    $results[] = ['id' => $id, 'desc' => $description, 'ok' => (bool)$passed, 'detail' => $detail];
}

// ── Fixtures ────────────────────────────────────────────────
$saved_settings = [];
foreach (['notifications_sms_enabled', 'notifications_email_enabled', 'notifications_dispatch_mode',
          'sms_provider', 'email_driver', 'notifications_quiet_start', 'notifications_quiet_end',
          'notification_log_retention_days'] as $key) {
    $saved_settings[$key] = get_setting($conn, $key, null);
}

function put_setting($conn, $key, $value) {
    $stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
                            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
    $stmt->bind_param("ss", $key, $value);
    $stmt->execute();
    $stmt->close();
}

// While the drivers are switched to 'log' below, the scheduled "AMS Notification
// Queue" task must not drain real jobs through them (they would be marked sent
// without reaching a provider). process_queue.php skips while this lock is fresh.
put_setting($conn, 'notification_selftest_lock', (string)time());

$fixture_email = 'ams-selftest-' . bin2hex(random_bytes(4)) . '@example.com';
$stmt = $conn->prepare("INSERT INTO users (first_name, last_name, contact_no, email_address, password, role)
                        VALUES ('Selftest', 'Fixture', '0917 123 4567', ?, 'x', 'user')");
$stmt->bind_param("s", $fixture_email);
$stmt->execute();
$uid = $stmt->insert_id;
$stmt->close();

if (!$uid) {
    echo "Could not create the fixture user. Aborting.\n";
    exit(1);
}

// Helpers that read back what the pipeline recorded.
function log_rows($conn, $uid, $channel = null) {
    $sql = "SELECT * FROM notification_log WHERE user_id = ?" . ($channel ? " AND channel = ?" : "") . " ORDER BY id";
    $stmt = $conn->prepare($sql);
    $channel ? $stmt->bind_param("is", $uid, $channel) : $stmt->bind_param("i", $uid);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
}
function clear_state($conn, $uid) {
    $conn->query("DELETE FROM notification_log WHERE user_id = $uid");
    $conn->query("DELETE FROM notification_queue WHERE user_id = $uid");
}
function queue_rows($conn, $uid) {
    $r = $conn->query("SELECT * FROM notification_queue WHERE user_id = $uid ORDER BY id");
    return $r ? $r->fetch_all(MYSQLI_ASSOC) : [];
}

try {
    // ── M6-02 / M6-03 — phone normalisation (C12) ───────────
    $valid = ['09171234567', '0917 123-4567', '+63 917 123 4567', '639171234567', '9171234567', '(0917) 123 4567'];
    $bad = [];
    foreach ($valid as $v) {
        if (normalize_ph_mobile($v) !== '+639171234567') $bad[] = $v;
    }
    check('M6-02', 'normalize_ph_mobile() accepts every real-world PH format', !$bad, $bad ? 'failed: ' . implode(', ', $bad) : '6 formats');

    $invalid = ['12345', '', '+14155551234', 'abc', '0817 123 4567', null];
    $bad = [];
    foreach ($invalid as $v) {
        if (normalize_ph_mobile($v) !== null) $bad[] = var_export($v, true);
    }
    check('M6-03', 'normalize_ph_mobile() rejects non-PH-mobile values', !$bad, $bad ? 'accepted: ' . implode(', ', $bad) : '6 values');

    // ── M6-04 / M6-05 — GSM-7 and one segment ───────────────
    $safe = gsm7_safe("AMS: \u{20B1}4,500 rent \u{2014} due Oct 5 \u{2705} \u{201C}unit 101\u{201D}");
    $clean = strpos($safe, "\u{20B1}") === false
          && strpos($safe, "\u{2014}") === false
          && strpos($safe, "\u{2705}") === false
          && strpos($safe, "\u{201C}") === false;
    check('M6-04', 'gsm7_safe() removes the characters that force UCS-2', $clean, $safe);

    $long = str_repeat('AMS rent reminder for unit 101. ', 10);
    $one = sms_single_segment($long);
    check('M6-05', 'sms_single_segment() caps at one 160-char segment', mb_strlen($one) <= 160, mb_strlen($one) . ' chars');

    // ── M6-07 — building-wide switch off ────────────────────
    put_setting($conn, 'sms_provider', 'log');
    put_setting($conn, 'email_driver', 'log');
    put_setting($conn, 'notifications_sms_enabled', '0');
    put_setting($conn, 'notifications_email_enabled', '0');
    clear_state($conn, $uid);

    send_sms($conn, '09171234567', 'AMS switch test', 'test', $uid);
    $rows = log_rows($conn, $uid, 'sms');
    check('M6-07', 'Channel switched off logs a skipped row with a reason',
        count($rows) === 1 && $rows[0]['status'] === 'skipped' && strpos($rows[0]['error_message'], 'globally disabled') !== false,
        $rows ? $rows[0]['status'] . ' / ' . $rows[0]['error_message'] : 'no row');

    // Everything from here on runs with both channels on.
    put_setting($conn, 'notifications_sms_enabled', '1');
    put_setting($conn, 'notifications_email_enabled', '1');
    put_setting($conn, 'notifications_dispatch_mode', 'sync');

    // ── M6-08 — global opt-out beats a category-less type (C2) ──
    clear_state($conn, $uid);
    $conn->query("UPDATE users SET sms_opt_out = 1 WHERE id = $uid");
    // maintenance_update belongs to no preference category, so only the global
    // flag can stop it. This is the regression that C2 exists to prevent.
    dispatch_external_notification($conn, $uid, 'maintenance_update', 'Test', 'AMS: test', '<p>test</p>');
    $sms = log_rows($conn, $uid, 'sms');
    $email = log_rows($conn, $uid, 'email');
    check('M6-08', 'sms_opt_out stops a notification type that has no category', count($sms) === 0 && count($email) === 1,
        count($sms) . ' sms row(s), ' . count($email) . ' email row(s)');
    $conn->query("UPDATE users SET sms_opt_out = 0 WHERE id = $uid");

    // ── M6-09 — per-category SMS off ────────────────────────
    clear_state($conn, $uid);
    $stmt = $conn->prepare("INSERT INTO notification_preferences (user_id, category, in_app_enabled, sms_enabled, email_enabled)
                            VALUES (?, 'announcements', 1, 0, 1)
                            ON DUPLICATE KEY UPDATE sms_enabled = 0, email_enabled = 1");
    $stmt->bind_param("i", $uid);
    $stmt->execute();
    $stmt->close();
    dispatch_external_notification($conn, $uid, 'info', 'Announcement', 'AMS: announcement', '<p>announcement</p>');
    check('M6-09', 'Per-category SMS opt-out leaves email alone',
        count(log_rows($conn, $uid, 'sms')) === 0 && count(log_rows($conn, $uid, 'email')) === 1,
        count(log_rows($conn, $uid, 'sms')) . ' sms row(s), ' . count(log_rows($conn, $uid, 'email')) . ' email row(s)');
    $conn->query("DELETE FROM notification_preferences WHERE user_id = $uid");

    // ── M6-10 — unreachable tenant ──────────────────────────
    clear_state($conn, $uid);
    $conn->query("UPDATE users SET contact_no = NULL WHERE id = $uid");
    dispatch_external_notification($conn, $uid, 'maintenance_update', 'Test', 'AMS: test', '<p>test</p>');
    check('M6-10', 'No contact number means no SMS row and no error',
        count(log_rows($conn, $uid, 'sms')) === 0 && count(log_rows($conn, $uid, 'email')) === 1,
        count(log_rows($conn, $uid, 'email')) . ' email row(s)');
    $conn->query("UPDATE users SET contact_no = '0917 123 4567' WHERE id = $uid");

    // ── M6-12 — dispatch enqueues, drain sends ──────────────
    clear_state($conn, $uid);
    put_setting($conn, 'notifications_dispatch_mode', 'queue');
    put_setting($conn, 'notifications_quiet_start', '23');
    put_setting($conn, 'notifications_quiet_end', '23');   // effectively no quiet window
    dispatch_external_notification($conn, $uid, 'maintenance_update', 'Queued', 'AMS: queued test', '<p>queued</p>');
    $queued = queue_rows($conn, $uid);
    $enqueued_only = count($queued) === 2 && count(log_rows($conn, $uid)) === 0;

    $drain = process_notification_queue($conn, 10, $uid);
    $after = queue_rows($conn, $uid);
    $sent_states = array_column($after, 'status');
    check('M6-12', 'Dispatch enqueues without sending, then the drain delivers',
        $enqueued_only && $drain['sent'] === 2 && $sent_states === ['sent', 'sent'] && count(log_rows($conn, $uid)) === 2,
        'queued ' . count($queued) . ', drained ' . $drain['sent'] . ', logged ' . count(log_rows($conn, $uid)));

    // ── M6-13 — retry and backoff ───────────────────────────
    clear_state($conn, $uid);
    put_setting($conn, 'sms_provider', 'selftest_unknown');   // unknown provider: always fails, no network
    enqueue_notification($conn, $uid, 'sms', 'test', ['to' => '09171234567', 'body' => 'AMS retry test']);
    $attempts_seen = [];
    for ($i = 0; $i < 4; $i++) {
        $conn->query("UPDATE notification_queue SET next_attempt_at = NOW() WHERE user_id = $uid AND status = 'pending'");
        process_notification_queue($conn, 5, $uid);
        $row = queue_rows($conn, $uid)[0] ?? null;
        if ($row) $attempts_seen[] = $row['attempts'] . ':' . $row['status'];
    }
    $final = queue_rows($conn, $uid)[0] ?? null;
    check('M6-13', 'A failing driver retries, backs off, then gives up',
        $final && (int)$final['attempts'] === 3 && $final['status'] === 'failed'
            && str_contains((string)$final['error_message'], 'Unknown SMS provider'),
        implode(' -> ', $attempts_seen) . ($final && $final['error_message'] ? ' (error recorded)' : ' (no error recorded)'));
    put_setting($conn, 'sms_provider', 'log');

    // ── M6-14 — concurrent drains cannot double-send ────────
    clear_state($conn, $uid);
    for ($i = 0; $i < 4; $i++) {
        enqueue_notification($conn, $uid, 'sms', 'test', ['to' => '09171234567', 'body' => "AMS claim test $i"]);
    }
    // A second connection stands in for a second process: both drain at once.
    $conn2 = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
    $a = process_notification_queue($conn, 4, $uid);
    $b = process_notification_queue($conn2, 4, $uid);
    $conn2->close();
    check('M6-14', 'Two drains racing never send the same job twice',
        ($a['sent'] + $b['sent']) === 4 && count(log_rows($conn, $uid, 'sms')) === 4,
        'drain A ' . $a['sent'] . ', drain B ' . $b['sent'] . ', log rows ' . count(log_rows($conn, $uid, 'sms')));

    // ── M6-15 / M6-16 — quiet hours ─────────────────────────
    clear_state($conn, $uid);
    // Make the current hour the quiet window, whatever the clock says: start at
    // this hour, end at the next one. Holds for the wrap-around case too (23->00).
    $now_hour = notification_clock_hour($conn);
    put_setting($conn, 'notifications_quiet_start', (string)$now_hour);
    put_setting($conn, 'notifications_quiet_end', (string)(($now_hour + 1) % 24));
    enqueue_notification($conn, $uid, 'sms', 'rent_due', ['to' => '09171234567', 'body' => 'AMS: rent due soon']);
    enqueue_notification($conn, $uid, 'sms', 'overdue', ['to' => '09171234567', 'body' => 'AMS: rent overdue']);
    $q = process_notification_queue($conn, 10, $uid);
    $states = [];
    $held_until = null;
    foreach (queue_rows($conn, $uid) as $r) {
        $states[$r['event_type']] = $r['status'];
        if ($r['event_type'] === 'rent_due') $held_until = $r['next_attempt_at'];
    }
    // Held until the window's end hour on the DB clock (PHP's may differ).
    $held_ok = $held_until && (int)substr($held_until, 11, 2) === ($now_hour + 1) % 24;
    check('M6-15', 'A non-urgent SMS in quiet hours is deferred, not sent',
        $q['deferred'] === 1 && ($states['rent_due'] ?? '') === 'pending' && $held_ok,
        'deferred ' . $q['deferred'] . ', held until ' . ($held_until ?? '-'));
    check('M6-16', 'An overdue SMS ignores quiet hours',
        $q['sent'] === 1 && ($states['overdue'] ?? '') === 'sent', 'sent ' . $q['sent']);
    put_setting($conn, 'notifications_quiet_start', '23');
    put_setting($conn, 'notifications_quiet_end', '23');

    // ── M6-17 — templates escape their inputs (C10) ─────────
    $html = email_status_update_template('Tenant', 'maintenance', '<img src=x onerror=alert(1)>', 'Approved', '<script>alert(2)</script>');
    check('M6-17', 'Template values are escaped, not rendered as markup',
        strpos($html, '<img src=x') === false && strpos($html, '<script>') === false
        && strpos($html, '&lt;img src=x') !== false,
        'injection escaped');

    // ── M6-18 — retention prune (C11) ───────────────────────
    clear_state($conn, $uid);
    $stmt = $conn->prepare("INSERT INTO notification_log (user_id, channel, event_type, recipient, message_body, status, sent_at)
                            VALUES (?, 'sms', 'test', '+639171234567', 'old row', 'sent', DATE_SUB(NOW(), INTERVAL 100 DAY))");
    $stmt->bind_param("i", $uid);
    $stmt->execute();
    $stmt->close();
    $before = count(log_rows($conn, $uid));
    $drain = process_notification_queue($conn, 5, $uid);
    check('M6-18', 'The drain prunes log rows past the retention window',
        $drain['pruned'] >= 1 && count(log_rows($conn, $uid)) === $before - 1,
        'pruned ' . $drain['pruned']);

    // ── Body truncation (C11) ───────────────────────────────
    clear_state($conn, $uid);
    log_notification_delivery($conn, $uid, 'sms', 'test', '+639171234567', null, str_repeat('x', 900), 'sent');
    $row = log_rows($conn, $uid)[0] ?? null;
    check('C11', 'Logged message bodies are truncated to 500 characters',
        $row && mb_strlen($row['message_body']) === 500, $row ? mb_strlen($row['message_body']) . ' chars' : 'no row');

    // ── M6-35 — the log driver records and contacts nothing ─
    clear_state($conn, $uid);
    put_setting($conn, 'sms_provider', 'log');
    $outbox = __DIR__ . '/../logs/notification_outbox';
    $before = count(glob($outbox . '/*-sms-*.txt') ?: []);
    $ok = send_sms($conn, '0917 123 4567', 'AMS dry-run check', 'test', $uid);
    $after = count(glob($outbox . '/*-sms-*.txt') ?: []);
    $row = log_rows($conn, $uid, 'sms')[0] ?? null;
    check('M6-35', "sms_provider 'log' writes the outbox and a sent row",
        $ok && $after === $before + 1 && $row && $row['status'] === 'sent',
        'outbox +' . ($after - $before) . ', log ' . ($row['status'] ?? 'none'));

    // ── M6-39 — Semaphore drops messages that start with "TEST" ─
    clear_state($conn, $uid);
    $helper_ok = sms_avoid_ignored_prefix('TEST: ok') === 'AMS: TEST: ok'
        && sms_avoid_ignored_prefix('AMS: Test message') === 'AMS: Test message';
    send_sms($conn, '09171234567', "\u{1F514} Test reminder", 'test', $uid);   // leading emoji is stripped first
    $row = log_rows($conn, $uid, 'sms')[0] ?? null;
    check('M6-39', 'An SMS starting with TEST is prefixed so Semaphore does not drop it',
        $helper_ok && $row && $row['message_body'] === 'AMS: Test reminder',
        $row ? '"' . $row['message_body'] . '"' : 'no row');

    // ── M6-41 — same-text SMS jobs drain as one bulk send ───
    clear_state($conn, $uid);
    $before = count(glob($outbox . '/*-sms-*.txt') ?: []);
    foreach (['09171234567', '0917 123 4567', '+63 917 123 4567', '12345'] as $to) {
        enqueue_notification($conn, $uid, 'sms', 'info', ['to' => $to, 'body' => 'AMS bulk test']);
    }
    $drain = process_notification_queue($conn, 10, $uid);
    $after = count(glob($outbox . '/*-sms-*.txt') ?: []);
    $by_status = [];
    foreach (log_rows($conn, $uid, 'sms') as $r) $by_status[$r['status']] = ($by_status[$r['status']] ?? 0) + 1;
    check('M6-41', 'Same-text SMS jobs go out together; a bad number fails alone',
        $drain['sent'] === 3 && ($by_status['sent'] ?? 0) === 3 && ($by_status['failed'] ?? 0) === 1 && $after === $before + 3,
        "sent {$drain['sent']}, log " . json_encode($by_status) . ', outbox +' . ($after - $before));

    // ── M6-42 — a Semaphore answer maps back to each recipient ─
    $list = [['message_id' => 11, 'recipient' => '639171111111', 'status' => 'Queued'],
             ['message_id' => 12, 'recipient' => '639172222222', 'status' => 'Refunded']];
    $resp = ['ok' => true, 'list' => $list, 'by_number' => ['9171111111' => $list[0], '9172222222' => $list[1]]];
    $a = _semaphore_result_for($resp, '+639171111111');
    $b = _semaphore_result_for($resp, '+639172222222');
    $c = _semaphore_result_for($resp, '+639173333333');
    check('M6-42', 'Semaphore bulk answers map per recipient (Queued ok, Refunded/missing fail)',
        $a['ok'] && $a['message_id'] === '11' && $a['status'] === 'Queued' && !$b['ok'] && !$c['ok'],
        "a={$a['status']}, b=" . ($b['ok'] ? 'ok' : 'fail') . ', c=' . ($c['ok'] ? 'ok' : 'fail'));

    // ── M6-43..47 — SMS templates follow Semaphore's rules ──
    // (sms_templates.php R1-R8.) Oversized inputs with the characters that
    // force Unicode, so every template has to shorten and clean.
    $huge = str_repeat("Nag-ayos \u{2014} \u{201C}ma\u{00F1}ana\u{201D} \u{20B1}500 ", 25);
    $today = new DateTime('2026-09-26');
    $all = [
        'announcement' => sms_announcement_template($huge, $huge, 'Urgent'),
        'rent_due'     => sms_payment_template(5490, $huge, '2026-09-29', 'rent_due', '', $today),
        'due_today'    => sms_payment_template(5490, $huge, '2026-09-26', 'rent_due', '', $today),
        'overdue'      => sms_payment_template(5490, $huge, '2026-09-01', 'overdue', '', $today),
        'custom'       => sms_payment_template(5490, $huge, '2026-09-29', 'rent_due', $huge, $today),
        'status'       => sms_status_update_template($huge, $huge, 'Rejected', $huge),
        'status_bare'  => sms_status_update_template('', $huge, 'Approved', $huge),
        'lease'        => sms_lease_reminder_template($huge, '2026-10-26', 30),
        'test'         => sms_test_template('Sep 26, 09:00'),
    ];
    $bad = [];
    foreach ($all as $name => $s) {
        if (mb_strlen($s) > 160 || gsm7_safe($s) !== $s || strpos($s, 'AMS') !== 0) $bad[] = "$name(" . mb_strlen($s) . ')';
    }
    check('M6-43', 'Every SMS template is one ASCII segment starting with AMS', !$bad,
        $bad ? 'bad: ' . implode(', ', $bad) : count($all) . ' templates');

    $o = $all['overdue'];
    check('M6-44', 'The overdue SMS keeps amount, due date and its last word',
        strpos($o, 'PHP 5,490.00') !== false && strpos($o, 'Sep 1, 2026') !== false
        && substr($o, -strlen('further penalties.')) === 'further penalties.',
        mb_strlen($o) . ' chars');

    $s = sms_status_update_template('maintenance', 'Leaking pipe', 'Rejected', 'Reason: ' . $huge);
    check('M6-45', 'A long reason is shortened; the status is never cut',
        strpos($s, 'is now Rejected.') !== false && substr($s, -3) === '...' && mb_strlen($s) <= 160,
        mb_strlen($s) . ' chars');

    clear_state($conn, $uid);
    dispatch_external_notification($conn, $uid, 'contract_update', 'Rent Approaching End',
        sms_lease_reminder_template('101', '2026-10-26', 30),
        email_lease_reminder_template('Selftest', '101', 'Oct 26, 2026', 30), 'sync');
    $sms = log_rows($conn, $uid, 'sms');
    $email = log_rows($conn, $uid, 'email');
    check('M6-46', 'The rent-end reminder goes out by SMS and email',
        count($sms) === 1 && $sms[0]['status'] === 'sent' && count($email) === 1 && $email[0]['status'] === 'sent',
        count($sms) . ' sms, ' . count($email) . ' email');

    $a = sms_announcement_template('Water', 'Details at https://bit.ly/x9 and www.example.com/notice. Store water.', 'General');
    $c = sms_payment_template(5490, '101', '2026-09-29', 'rent_due', 'Pay at pay.example.com/abc or example.ph today.', $today);
    $svc = sms_status_update_template('service', 'Aircon cleaning', 'Completed', sms_amount(1500) . ' has been added to your invoice.');
    $has_link = '~https?://|www\.|\.(?:com|ph|ly)\b~i';
    check('M6-47', 'Links are stripped from free text; no invoice ID in SMS',
        !preg_match($has_link, $a) && !preg_match($has_link, $c) && strpos($a, 'Store water.') !== false
        && !preg_match('/INV-|invoice [A-Z0-9-]{4,}/', $svc),
        '"' . $a . '"');

    // ── Nothing contacts a provider in dry run ──────────────
    // Real drivers (Semaphore) do open connections, so the rule is that every
    // network call sits inside a provider-driver function; the dry-run path
    // (send_sms/_sms_via_log, send_email/_email_via_log, the queue) has none.
    $driver_fn = '/^(_send_via_\w+|_semaphore_request|semaphore_account_balance|_email_via_smtp)$/';
    $network = [];
    foreach (glob(__DIR__ . '/../api/services/*.php') as $file) {
        $chunks = preg_split('/^function\s+(\w+)\s*\(/m', file_get_contents($file), -1, PREG_SPLIT_DELIM_CAPTURE);
        // $chunks = [preamble, name1, body1, name2, body2, ...]
        for ($i = 0; $i < count($chunks); $i += 2) {
            $name = $i === 0 ? '(top level)' : $chunks[$i - 1];
            if (preg_match('/curl_init|fsockopen|file_get_contents\s*\(\s*[\'"]https?:/', $chunks[$i])
                && !preg_match($driver_fn, $name)) {
                $network[] = basename($file) . ':' . $name;
            }
        }
    }
    check('DRY', 'Network calls live only in provider drivers', !$network, $network ? implode(', ', $network) : 'clean');

} finally {
    // ── Restore ─────────────────────────────────────────────
    if (!$keep) {
        $conn->query("DELETE FROM notification_log WHERE user_id = $uid");
        $conn->query("DELETE FROM notification_queue WHERE user_id = $uid");
        $conn->query("DELETE FROM notification_preferences WHERE user_id = $uid");
        $conn->query("DELETE FROM users WHERE id = $uid");
    }
    foreach ($saved_settings as $key => $value) {
        if ($value !== null) put_setting($conn, $key, $value);
    }
    // Release the lock process_queue.php honours, so the scheduled drain resumes.
    $conn->query("DELETE FROM system_settings WHERE setting_key = 'notification_selftest_lock'");
}

// ── Report ──────────────────────────────────────────────────
echo "\nAMS notification selftest - dry run (nothing was sent)\n";
echo str_repeat('=', 96) . "\n";
foreach ($results as $r) {
    echo ($r['ok'] ? '  PASS  ' : '  FAIL  ')
       . str_pad($r['id'], 8)
       . str_pad($r['desc'], 58)
       . $r['detail'] . "\n";
}
echo str_repeat('=', 96) . "\n";
echo ($failures === 0
    ? '  All ' . count($results) . " checks passed.\n"
    : '  ' . $failures . ' of ' . count($results) . " checks FAILED.\n");
if ($keep) echo "  Fixture user #$uid kept (--keep).\n";
echo "\n";

$conn->close();
exit($failures === 0 ? 0 : 1);
