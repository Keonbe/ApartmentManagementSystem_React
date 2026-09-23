<?php
/**
 * Multi-provider SMS sender (checklist 6.6).
 *
 * Usage:
 *   require_once __DIR__ . '/services/send_sms.php';
 *   $ok = send_sms($conn, $phone, $message, $event_type, $user_id);
 *
 * config.php must already be loaded: normalize_ph_mobile(), sms_single_segment(),
 * log_notification_delivery() and get_setting() all live there, so that C2/C11/C12
 * are decided in one place and send_email.php can reuse the same logger.
 *
 * The active provider is system_settings.sms_provider. Returns true on success,
 * false on failure; every attempt lands in notification_log either way.
 */

// ──────────────────────────────────────────────
//  Public API
// ──────────────────────────────────────────────
function send_sms($conn, $phone, $message, $event_type = 'general', $user_id = null) {
    $original = $phone;

    // Building-wide switch. Ships off, so nothing can send by accident.
    $enabled = get_setting($conn, 'notifications_sms_enabled', '0');
    if ($enabled !== '1' && $enabled !== 'true') {
        log_notification_delivery($conn, $user_id, 'sms', $event_type, $original, null, $message, 'skipped', 'SMS globally disabled');
        return false;
    }

    // C12 — users.contact_no is free-text varchar(30), so "0917 123-4567" and
    // "+63 917 123 4567" both occur. Strip to digits before deciding anything.
    $phone = normalize_ph_mobile($phone);
    if ($phone === null) {
        // Log the value as given: the normalised one is null, which would make
        // the failed row name nothing at all.
        log_notification_delivery($conn, $user_id, 'sms', $event_type, $original, null, $message, 'failed', 'Invalid phone number');
        return false;
    }

    // Cost control (§0.3): one GSM-7 segment, hard. A single "PHP" written as a
    // peso sign, or an em dash, makes the whole message UCS-2 at 70 chars per
    // segment, so what looks like one message bills as three.
    $message = sms_single_segment($message);

    $provider = strtolower(get_setting($conn, 'sms_provider', 'log'));

    $result = match ($provider) {
        'log'       => _sms_via_log($conn, $phone, $message, $event_type, $user_id),
        'semaphore' => _sms_provider_stub('Semaphore'),
        'twilio'    => _sms_provider_stub('Twilio'),
        'vonage'    => _sms_provider_stub('Vonage'),
        'movider'   => _sms_provider_stub('Movider'),
        'itexmo'    => _sms_provider_stub('iTexMo'),
        default     => ['ok' => false, 'error' => "Unknown SMS provider: $provider"],
    };

    if ($result['ok']) {
        log_notification_delivery($conn, $user_id, 'sms', $event_type, $phone, null, $message, 'sent');
        return true;
    }

    log_notification_delivery($conn, $user_id, 'sms', $event_type, $phone, null, $message, 'failed', $result['error']);
    return false;
}

// ──────────────────────────────────────────────
//  Driver: log  (dry run — the default)
// ──────────────────────────────────────────────
//  Contacts nothing. The message is recorded in notification_log by the caller
//  and written to the mock outbox here, so the whole pipeline — dispatcher,
//  queue, preferences, opt-outs, retry — is demonstrable with no account, no
//  spend and no sender-ID approval (§0.4 makes that approval the long pole).
function _sms_via_log($conn, $phone, $message, $event_type, $user_id) {
    $sender = get_setting($conn, 'sms_sender_name', 'AMS');
    $body = "To:      $phone\n"
          . "From:    $sender\n"
          . "Event:   $event_type\n"
          . "User:    " . ($user_id ?: '-') . "\n"
          . "Length:  " . mb_strlen($message) . " chars (1 segment)\n"
          . "Sent:    " . date('Y-m-d H:i:s') . "\n"
          . str_repeat('-', 60) . "\n"
          . $message . "\n";
    write_mock_outbox('sms', 'txt', $body);
    return ['ok' => true];
}

// The real drivers are deliberately not implemented yet: each one contacts a
// paid API, and untested code that spends money is worse than an honest stub.
// Appendix C of docs/features/sms_email_implementation.md has the cURL call for
// each; adding one is a single function plus a line in the match above.
function _sms_provider_stub($name) {
    return ['ok' => false, 'error' => "$name driver is not implemented yet - see Appendix C. Set sms_provider to 'log' for the dry run."];
}

// ──────────────────────────────────────────────
//  Mock outbox
// ──────────────────────────────────────────────
//  Where a dry-run message goes so a human can read it: one file per message
//  under backend/logs/notification_outbox/. Shared with send_email.php.
//  Never fatal — a demo artefact must not be able to break a send.
function write_mock_outbox($channel, $extension, $contents) {
    $dir = __DIR__ . '/../../logs/notification_outbox';
    if (!is_dir($dir) && !@mkdir($dir, 0777, true)) return null;

    $name = date('Ymd-His') . '-' . $channel . '-' . substr(bin2hex(random_bytes(4)), 0, 6) . '.' . $extension;
    $path = $dir . '/' . $name;
    return @file_put_contents($path, $contents) === false ? null : $path;
}
