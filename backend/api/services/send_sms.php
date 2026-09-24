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

    // Spend guard: a real provider bills every send, so a runaway loop or a
    // mis-targeted broadcast stops at the cap. The dry run costs nothing and
    // is not capped, so mock testing is unaffected.
    if ($provider !== 'log' && ($cap = _sms_daily_cap_reached($conn)) !== null) {
        log_notification_delivery($conn, $user_id, 'sms', $event_type, $phone, null, $message, 'skipped', "Daily SMS cap reached ($cap)");
        return false;
    }

    $result = match ($provider) {
        'log'       => _sms_via_log($conn, $phone, $message, $event_type, $user_id),
        'semaphore' => _send_via_semaphore($conn, $phone, $message),
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

// ──────────────────────────────────────────────
//  Driver: Semaphore  (api.semaphore.co, Philippines)
// ──────────────────────────────────────────────
//  One POST per message; Semaphore charges one credit per 160-char segment,
//  which sms_single_segment() has already enforced.
function _send_via_semaphore($conn, $phone, $message) {
    $api_key = get_setting($conn, 'sms_api_key', '');
    if ($api_key === '') return ['ok' => false, 'error' => 'No Semaphore API key configured'];

    $fields = [
        'apikey'  => $api_key,
        // normalize_ph_mobile() gives +639XXXXXXXXX; Semaphore wants 639XXXXXXXXX.
        'number'  => ltrim($phone, '+'),
        'message' => $message,
    ];
    // An unapproved sendername is rejected, so it is only sent once the admin
    // has confirmed approval. Without it Semaphore uses its shared 'SEMAPHORE'.
    $sender = trim((string)get_setting($conn, 'sms_sender_name', ''));
    if ($sender !== '' && get_setting($conn, 'sms_sender_approved', '0') === '1') {
        $fields['sendername'] = $sender;
    }

    [$code, $json, $raw, $err] = _semaphore_request('POST', '/messages', $fields);
    if ($err !== null) return ['ok' => false, 'error' => $err];

    // Success is a list of message objects, one per recipient. Validation
    // errors come back as an object of field => messages, sometimes with a
    // 200, so the status code alone is not enough.
    $first = (is_array($json) && isset($json[0]) && is_array($json[0])) ? $json[0] : null;
    if ($code >= 200 && $code < 300 && $first && !empty($first['message_id'])) {
        $status = (string)($first['status'] ?? '');
        if (in_array(strtolower($status), ['failed', 'refunded'], true)) {
            return ['ok' => false, 'error' => "Semaphore marked message {$first['message_id']} as $status"];
        }
        return ['ok' => true];
    }

    return ['ok' => false, 'error' => _semaphore_error($code, $json, $raw)];
}

/**
 * Live credit balance for the admin settings page. Never throws.
 * Returns ['ok' => bool, 'credit_balance' => ?, 'account_name' => ?, 'status' => ?, 'error' => ?].
 */
function semaphore_account_balance($conn) {
    $api_key = get_setting($conn, 'sms_api_key', '');
    if ($api_key === '') return ['ok' => false, 'error' => 'No Semaphore API key configured'];

    [$code, $json, $raw, $err] = _semaphore_request('GET', '/account', ['apikey' => $api_key]);
    if ($err !== null) return ['ok' => false, 'error' => $err];

    if ($code >= 200 && $code < 300 && is_array($json) && array_key_exists('credit_balance', $json)) {
        return [
            'ok'             => true,
            'credit_balance' => $json['credit_balance'],
            'account_name'   => $json['account_name'] ?? null,
            'status'         => $json['status'] ?? null,
        ];
    }
    return ['ok' => false, 'error' => _semaphore_error($code, $json, $raw)];
}

// Validation errors arrive as {"field": ["message", ...]} — often with a 200 —
// so flatten them into something an admin can act on ("The selected apikey is
// invalid.") instead of raw JSON.
function _semaphore_error($code, $json, $raw) {
    if (is_array($json) && $json && !isset($json[0])) {
        $messages = [];
        foreach ($json as $value) {
            foreach ((array)$value as $m) if (is_scalar($m)) $messages[] = (string)$m;
        }
        if ($messages) return mb_substr('Semaphore: ' . implode(' ', $messages), 0, 300);
    }
    return mb_substr("Semaphore HTTP $code: " . (is_array($json) ? json_encode($json) : (string)$raw), 0, 300);
}

// Shared transport. Returns [http_code, decoded_json|null, raw_body, error|null].
function _semaphore_request($method, $path, $fields) {
    $url = 'https://api.semaphore.co/api/v4' . $path;
    $ch  = curl_init();
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 5,
    ];
    if ($method === 'POST') {
        $opts[CURLOPT_URL]        = $url;
        $opts[CURLOPT_POST]       = true;
        $opts[CURLOPT_POSTFIELDS] = http_build_query($fields);
    } else {
        $opts[CURLOPT_URL] = $url . '?' . http_build_query($fields);
    }
    curl_setopt_array($ch, $opts);

    $raw  = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);

    if ($raw === false || $cerr !== '') return [$code, null, '', 'cURL error: ' . ($cerr ?: 'request failed')];
    return [$code, json_decode($raw, true), $raw, null];
}

// ──────────────────────────────────────────────
//  Daily cap
// ──────────────────────────────────────────────
// Returns the cap when today's sent count has reached it, else null.
function _sms_daily_cap_reached($conn) {
    $cap = (int)get_setting($conn, 'sms_daily_cap', '0');
    if ($cap <= 0) return null;

    $res = $conn->query("SELECT COUNT(*) AS n FROM notification_log
                         WHERE channel = 'sms' AND status = 'sent' AND sent_at >= CURDATE()");
    if (!$res) return null;
    $sent = (int)$res->fetch_assoc()['n'];
    return $sent >= $cap ? $cap : null;
}

// The remaining drivers are deliberately not implemented: each contacts a paid
// API, and untested code that spends money is worse than an honest stub.
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
