<?php
/**
 * SMS sender (checklist 6.6). Semaphore is the only real provider; 'log' is
 * the dry run.
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
    // The "TEST" guard runs on the cleaned text (a leading emoji is stripped by
    // gsm7_safe(), which could expose "Test"), then re-caps for the added prefix.
    // Applied to every driver so the dry-run outbox shows what Semaphore gets.
    $message = sms_single_segment(sms_avoid_ignored_prefix(sms_single_segment($message)));

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

    [$code, $json, $raw, $err, $retry_after] = _semaphore_request('POST', '/messages', $fields);
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

    return ['ok' => false, 'error' => _semaphore_error($code, $json, $raw, $retry_after)];
}

/**
 * Live credit balance for the admin settings page. Never throws.
 * Returns ['ok' => bool, 'credit_balance' => ?, 'account_name' => ?, 'status' => ?,
 *          'checked_at' => ?, 'cached' => bool, 'error' => ?].
 *
 * Semaphore allows GET /account only 2 times a minute, so a successful answer is
 * reused for SEMAPHORE_ACCOUNT_CACHE_SECONDS. The cache is tied to a hash of the
 * key, so pasting a new key checks again at once. Errors are never cached.
 */
const SEMAPHORE_ACCOUNT_CACHE_SECONDS = 60;

function semaphore_account_balance($conn) {
    $api_key = get_setting($conn, 'sms_api_key', '');
    if ($api_key === '') return ['ok' => false, 'error' => 'No Semaphore API key configured'];

    $cache_file = __DIR__ . '/../../logs/semaphore_account.json';
    $key_hash   = hash('sha256', $api_key);
    $cached     = is_file($cache_file) ? json_decode((string)@file_get_contents($cache_file), true) : null;
    if (is_array($cached) && ($cached['key_hash'] ?? '') === $key_hash
        && time() - (int)($cached['checked_ts'] ?? 0) < SEMAPHORE_ACCOUNT_CACHE_SECONDS) {
        return [
            'ok'             => true,
            'credit_balance' => $cached['credit_balance'] ?? null,
            'account_name'   => $cached['account_name'] ?? null,
            'status'         => $cached['status'] ?? null,
            'checked_at'     => $cached['checked_at'] ?? null,
            'cached'         => true,
        ];
    }

    [$code, $json, $raw, $err, $retry_after] = _semaphore_request('GET', '/account', ['apikey' => $api_key]);
    if ($err !== null) return ['ok' => false, 'error' => $err];

    if ($code >= 200 && $code < 300 && is_array($json) && array_key_exists('credit_balance', $json)) {
        $result = [
            'ok'             => true,
            'credit_balance' => $json['credit_balance'],
            'account_name'   => $json['account_name'] ?? null,
            'status'         => $json['status'] ?? null,
            'checked_at'     => date('c'),
            'cached'         => false,
        ];
        $dir = dirname($cache_file);
        if (is_dir($dir) || @mkdir($dir, 0777, true)) {
            @file_put_contents($cache_file, json_encode([
                'key_hash'       => $key_hash,
                'checked_ts'     => time(),
                'checked_at'     => $result['checked_at'],
                'credit_balance' => $result['credit_balance'],
                'account_name'   => $result['account_name'],
                'status'         => $result['status'],
            ]), LOCK_EX);
        }
        return $result;
    }
    return ['ok' => false, 'error' => _semaphore_error($code, $json, $raw, $retry_after)];
}

// Validation errors arrive as {"field": ["message", ...]} — often with a 200 —
// so flatten them into something an admin can act on ("The selected apikey is
// invalid.") instead of raw JSON. A 429 names the wait from Retry-After; the
// queue's own backoff (2 minutes and up) already outlasts it.
function _semaphore_error($code, $json, $raw, $retry_after = null) {
    if ($code === 429) {
        return 'Semaphore rate limit reached' . ($retry_after !== null ? " (retry after {$retry_after}s)" : '');
    }
    if (is_array($json) && $json && !isset($json[0])) {
        $messages = [];
        foreach ($json as $value) {
            foreach ((array)$value as $m) if (is_scalar($m)) $messages[] = (string)$m;
        }
        if ($messages) return mb_substr('Semaphore: ' . implode(' ', $messages), 0, 300);
    }
    return mb_substr("Semaphore HTTP $code: " . (is_array($json) ? json_encode($json) : (string)$raw), 0, 300);
}

// Shared transport. Returns [http_code, decoded_json|null, raw_body, error|null,
// retry_after_seconds|null]. Only /messages and /account are ever called: the
// /priority and /otp routes bill 2 credits, and /otp is for one-time codes only.
function _semaphore_request($method, $path, $fields) {
    $url = 'https://api.semaphore.co/api/v4' . $path;
    $ch  = curl_init();
    $retry_after = null;
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$retry_after) {
            if (preg_match('/^Retry-After:\s*(\d+)/i', $line, $m)) $retry_after = (int)$m[1];
            return strlen($line);
        },
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

    if ($raw === false || $cerr !== '') return [$code, null, '', 'cURL error: ' . ($cerr ?: 'request failed'), null];
    return [$code, json_decode($raw, true), $raw, null, $retry_after];
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
