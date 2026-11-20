<?php
header('Content-Type: application/json');
require_once "../config.php";
require_once __DIR__ . '/../paymongo_gateway.php';

$payload = file_get_contents('php://input');
$signature_header = $_SERVER['HTTP_PAYMONGO_SIGNATURE'] ?? '';

if (!$payload || !$signature_header) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Missing payload or signature"]);
    exit;
}

// 1. Fetch webhook secret (PAYMONGO_WEBHOOK_SECRET in the environment wins)
$secret = ams_env_setting('paymongo_webhook_secret');
if ($secret === null) {
    $settings_res = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'paymongo_webhook_secret'");
    $secret = $settings_res ? ($settings_res->fetch_assoc()['setting_value'] ?? '') : '';
}

if (!$secret) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Webhook secret not configured"]);
    exit;
}

// 2. Decode the payload early — only to read `livemode`, which decides which
// signature key below is the real one. The signature itself is still
// verified against the raw, undecoded $payload string in step 4.
$event = json_decode($payload, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Invalid JSON"]);
    exit;
}
$livemode = !empty($event['data']['attributes']['livemode']);

// 3. Parse Signature Header (t=timestamp, te=test_sig, li=live_sig)
$parts = explode(',', $signature_header);
$parsed_sig = [];
foreach ($parts as $part) {
    // A malformed segment with no "=" would raise an undefined-offset error
    // under PHP 8 if destructured blindly.
    $kv = explode('=', trim($part), 2);
    if (count($kv) === 2) {
        $parsed_sig[$kv[0]] = $kv[1];
    }
}

$timestamp = $parsed_sig['t'] ?? '';
// PayMongo's header carries BOTH `te` and `li`, with whichever mode isn't
// live sending an EMPTY string for the unused key — not an absent one. `??`
// only skips a missing/null key, so in live mode it picked the empty `te`
// and 401'd every real event (audit H9a). Select by the event's own
// `livemode` flag, falling back with `?:` (falsy-skipping) only if that
// specific key is genuinely blank.
$signature_to_verify = $livemode
    ? (($parsed_sig['li'] ?? '') ?: ($parsed_sig['te'] ?? ''))
    : (($parsed_sig['te'] ?? '') ?: ($parsed_sig['li'] ?? ''));

if (!$timestamp || !$signature_to_verify) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Invalid signature format"]);
    exit;
}

// The signature covers timestamp + payload, so without a freshness window a
// captured "payment.paid" event stays valid forever and can be replayed.
if (!ctype_digit((string)$timestamp) || abs(time() - (int)$timestamp) > 300) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Signature timestamp outside the accepted window"]);
    exit;
}

// 4. Verify Signature — against the raw payload string, never the
// re-encoded/decoded form.
$expected_sig = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);

if (!hash_equals($expected_sig, $signature_to_verify)) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Signature verification failed"]);
    exit;
}

// 5. Process Webhook Event
$event_type = $event['data']['attributes']['type'] ?? '';
$event_data = $event['data']['attributes']['data'] ?? [];

// Refund progress: PayMongo confirms (or fails) a refund after our API call
// accepted it. The event may carry the refund itself (re_...) or the payment
// with its refunds list, depending on the event name, so read both shapes.
if (stripos($event_type, 'refund') !== false) {
    $refunds = [];
    foreach (($event_data['attributes']['refunds'] ?? []) as $r) $refunds[] = $r;
    if (!$refunds && str_starts_with((string)($event_data['id'] ?? ''), 're_')) $refunds[] = $event_data;
    foreach ($refunds as $r) {
        $refund_id = $r['id'] ?? null;
        $new_status = $r['attributes']['status'] ?? null;
        if (!$refund_id || !$new_status) continue;
        $upd = $conn->prepare("UPDATE refund_requests SET gateway_status = ? WHERE gateway_refund_id = ? AND (gateway_status IS NULL OR gateway_status <> ?)");
        $upd->bind_param("sss", $new_status, $refund_id, $new_status);
        $upd->execute();
        $changed = $upd->affected_rows > 0;
        $upd->close();
        if (!$changed) continue;
        $row = $conn->prepare("SELECT id, user_id, amount FROM refund_requests WHERE gateway_refund_id = ? LIMIT 1");
        $row->bind_param("s", $refund_id);
        $row->execute();
        $req = $row->get_result()->fetch_assoc();
        $row->close();
        if (!$req) continue;
        $amt = number_format((float)$req['amount'], 2);
        log_activity($conn, (int)$req['user_id'], 'billing', 'Refund Gateway Update', "Refund #{$req['id']}: PayMongo $refund_id is $new_status", (int)$req['user_id']);
        if ($new_status === 'succeeded') {
            create_notification($conn, (int)$req['user_id'], 'refund_update', 'Refund Completed', "Your refund of ₱$amt has been returned to your payment method.");
        } elseif ($new_status === 'failed') {
            notify_admins_queue($conn, 'refund_request', $req['id'], 'Refund Failed at PayMongo',
                "PayMongo could not complete refund #{$req['id']} (₱$amt, $refund_id). Pay it back another way and note it on the request.");
        }
    }
    http_response_code(200);
    echo json_encode(["success" => true]);
    $conn->close();
    exit;
}

// Only care about paid or failed
if ($event_type === 'checkout_session.payment.paid' || $event_type === 'payment.failed') {

    // For checkout session paid, metadata is inside attributes->data->attributes->metadata
    if ($event_type === 'checkout_session.payment.paid') {
        $metadata = $event_data['attributes']['metadata'] ?? [];
        $status = 'paid';
    } else {
        // For payment failed
        $metadata = $event_data['attributes']['metadata'] ?? [];
        $status = 'payment-failed';
    }

    $invoice_id = $metadata['invoice_id'] ?? null;
    $user_id = $metadata['user_id'] ?? null;
    $session_id = $event_data['id'] ?? null;
    $intent_id = null;
    $payment_id = $status === 'paid' ? ($event_data['attributes']['payments'][0]['id'] ?? null) : null;
    $paid_centavos = $status === 'paid' ? ($event_data['attributes']['payments'][0]['attributes']['amount'] ?? null) : null;

    // A payment.failed event carries the payment (pay_...), not the checkout
    // session, so comparing its id with checkout_session_id discarded every
    // one as "superseded" (audit N-10a). Match it by the payment intent the
    // checkout opened instead — which also finds the invoice when the
    // payment's metadata doesn't name it.
    if ($event_type === 'payment.failed') {
        $session_id = null;
        $intent_id = $event_data['attributes']['payment_intent_id'] ?? null;
        if (!$invoice_id && $intent_id) {
            $lookup = $conn->prepare("SELECT COALESCE(payment_group, id) AS payment_key FROM invoices WHERE checkout_payment_intent_id = ? LIMIT 1");
            $lookup->bind_param("s", $intent_id);
            $lookup->execute();
            $invoice_id = $lookup->get_result()->fetch_assoc()['payment_key'] ?? null;
            $lookup->close();
        }
    }

    // The rules for what an event does to a bill live in paymongo_gateway.php
    // (paymongo_process_checkout_event), shared with the payment reconciliation.
    $source_type = $status === 'paid' ? ($event_data['attributes']['payments'][0]['attributes']['source']['type'] ?? null) : null;
    $handled = paymongo_process_checkout_event($conn, $event_type, $invoice_id, $session_id, $intent_id, $payment_id, $paid_centavos, $source_type);
    if (!$handled['success'] || $handled['message'] !== null) {
        http_response_code($handled['http']);
        echo json_encode(array_filter(["success" => $handled['success'], "message" => $handled['message']], fn($v) => $v !== null));
        $conn->close();
        exit;
    }
}

http_response_code(200);
echo json_encode(["success" => true]);
$conn->close();
?>
