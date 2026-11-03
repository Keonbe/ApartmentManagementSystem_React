<?php
// PayMongo API calls shared by create_checkout_session.php (checkout sessions)
// and update_refund_request.php (refund payouts). Needs config.php loaded first.

function paymongo_secret_key($conn) {
    $key = ams_env_setting('paymongo_secret_key');
    if ($key !== null && $key !== '') return $key;
    $res = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'paymongo_secret_key'");
    return $res ? (string)($res->fetch_assoc()['setting_value'] ?? '') : '';
}

// One authenticated call to api.paymongo.com. Returns
// ['ok' => bool, 'http' => int, 'data' => array|null, 'message' => string, 'tls_missing' => bool].
// 'ok' means HTTP 200 with no `errors`; 'message' is then PayMongo's own detail.
function paymongo_request($method, $path, $secret_key, $payload = null, $extra_headers = []) {
    $fail = fn($message, $http = 0, $data = null, $tls = false) =>
        ['ok' => false, 'http' => $http, 'data' => $data, 'message' => $message, 'tls_missing' => $tls];

    // This request carries the PayMongo secret key, so the gateway's certificate
    // must actually be verified. XAMPP ships without curl.cainfo configured, so
    // locate a CA bundle and point cURL at it.
    $ca_bundle = ini_get('curl.cainfo') ?: ini_get('openssl.cafile') ?: '';
    if (!$ca_bundle || !is_readable($ca_bundle)) {
        foreach (['C:/xampp/apache/bin/curl-ca-bundle.crt', 'C:/xampp/php/extras/ssl/cacert.pem', '/etc/ssl/certs/ca-certificates.crt'] as $candidate) {
            if (is_readable($candidate)) { $ca_bundle = $candidate; break; }
        }
    }
    $verify = true;
    if (!$ca_bundle || !is_readable($ca_bundle)) {
        if (APP_ENV === 'production') return $fail("Payment gateway TLS certificate store is not configured on this server.", 0, null, true);
        // No bundle anywhere on a dev box: keep the sandbox demo working, but say
        // so loudly rather than silently shipping an unverified TLS connection.
        error_log("PayMongo: no CA bundle found; TLS peer verification disabled (development only).");
        $verify = false;
    }

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://api.paymongo.com" . $path);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge([
        "Content-Type: application/json",
        "Accept: application/json",
        "Authorization: Basic " . base64_encode($secret_key . ":")
    ], $extra_headers));
    if ($verify) {
        curl_setopt($ch, CURLOPT_CAINFO, $ca_bundle);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    } else {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    }

    $response = curl_exec($ch);
    $http_code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    curl_close($ch);

    $data = $response === false ? null : json_decode($response, true);
    if ($http_code !== 200 || $response === false || isset($data['errors'])) {
        error_log("PayMongo Error: " . $response . " (cURL: $curl_error)");
        $detail = $data['errors'][0]['detail'] ?? null;
        return $fail($detail ? "PayMongo: $detail" : "Failed to connect to payment gateway.", $http_code, $data);
    }
    return ['ok' => true, 'http' => $http_code, 'data' => $data, 'message' => '', 'tls_missing' => false];
}

// Refunds money to the payer of a PayMongo payment (POST /v1/refunds).
// $idempotency_key makes a retry of the same payout return the same refund
// instead of a second one. Returns ['ok', 'refund_id', 'status', 'message'].
// The API test suite (AMS_TEST_MODE) never reaches the network: a payment id
// containing "fail" is declined, any other succeeds as 'pending'.
function paymongo_create_refund($conn, $payment_id, $amount_cents, $notes, $idempotency_key) {
    if (getenv('AMS_TEST_MODE') === '1') {
        if (stripos($payment_id, 'fail') !== false) return ['ok' => false, 'refund_id' => null, 'status' => null, 'message' => 'PayMongo: test refund declined'];
        return ['ok' => true, 'refund_id' => 're_test_' . substr(md5($idempotency_key), 0, 12), 'status' => 'pending', 'message' => ''];
    }
    $secret = paymongo_secret_key($conn);
    if ($secret === '') return ['ok' => false, 'refund_id' => null, 'status' => null, 'message' => 'PayMongo is not configured.'];

    $res = paymongo_request('POST', '/v1/refunds', $secret, [
        'data' => ['attributes' => [
            'amount' => (int)$amount_cents,
            'payment_id' => $payment_id,
            'reason' => 'others',
            'notes' => mb_substr($notes, 0, 255),
        ]],
    ], ["Idempotency-Key: $idempotency_key"]);
    if (!$res['ok']) return ['ok' => false, 'refund_id' => null, 'status' => null, 'message' => $res['message']];
    return [
        'ok' => true,
        'refund_id' => $res['data']['data']['id'] ?? null,
        'status' => $res['data']['data']['attributes']['status'] ?? 'pending',
        'message' => '',
    ];
}

// The PayMongo payment a refund request is taken from, or null when the money
// came in another way (desk, bank proof) and must be paid back by hand.
function refund_source_payment($conn, $req) {
    if (!empty($req['paymongo_payment_id'])) return $req['paymongo_payment_id'];
    $invoice_id = $req['invoice_id'] ?? null;
    if (!$invoice_id && ($req['type'] ?? '') === 'advance') {
        // Advance rent: the held credits point at the advance invoice that was paid.
        $q = $conn->prepare("SELECT advance_invoice_id FROM advance_credits WHERE refund_request_id = ? LIMIT 1");
        $q->bind_param("i", $req['id']);
        $q->execute();
        $q->bind_result($invoice_id);
        $q->fetch();
        $q->close();
    }
    if (!$invoice_id) return null;
    $q = $conn->prepare("SELECT paymongo_payment_id FROM invoices WHERE id = ?");
    $q->bind_param("s", $invoice_id);
    $q->execute();
    $pid = null;
    $q->bind_result($pid);
    $q->fetch();
    $q->close();
    return $pid ?: null;
}

// An online payment PayMongo collected that AMS could not apply to a bill (the
// invoice was cancelled, paid already, or the settle cascade failed). Nothing
// else would ever show it, so it becomes an 'online_payment' refund request the
// admin can pay back through PayMongo. Once per payment id, so a webhook retry
// adds nothing. Returns the request id (0 if there is nothing to refund or one
// exists already).
function raise_unapplied_payment($conn, $payment_id, $paid_centavos, $user_id, $invoice_key, $why) {
    if (!$payment_id || !$paid_centavos || !$user_id) return 0;
    $exists = $conn->prepare("SELECT id FROM refund_requests WHERE paymongo_payment_id = ? LIMIT 1");
    $exists->bind_param("s", $payment_id);
    $exists->execute();
    $exists->store_result();
    $known = $exists->num_rows > 0;
    $exists->close();
    if ($known) return 0;

    $amount = round($paid_centavos / 100, 2);
    $reason = "Online payment for $invoice_key could not be applied: $why";
    $conn->begin_transaction();
    try {
        $rid = insert_refund_request($conn, (int)$user_id, null, 'online_payment', null, $amount, $reason, null, 'system');
        $u = $conn->prepare("UPDATE refund_requests SET paymongo_payment_id = ? WHERE id = ?");
        $u->bind_param("si", $payment_id, $rid);
        $u->execute();
        $u->close();
        $conn->commit();
    } catch (Exception $e) {
        $conn->rollback();
        error_log("raise_unapplied_payment failed for $payment_id: " . $e->getMessage());
        return 0;
    }
    notify_refund_raised($conn, $rid, $amount, "an online payment that could not be applied ($invoice_key)");
    create_notification($conn, (int)$user_id, 'payment', 'Payment Needs a Refund',
        "Your online payment of ₱" . number_format($amount, 2) . " for $invoice_key was received but could not be applied. Management will refund it to you.",
        'Resolved', "invoice:$invoice_key");
    log_activity($conn, (int)$user_id, 'billing', 'Online Payment Unapplied', "$invoice_key, payment $payment_id, ₱" . number_format($amount, 2) . " — $why", (int)$user_id);
    return $rid;
}
