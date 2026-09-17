<?php
header('Content-Type: application/json');
require_once "../config.php";

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

// 2. Parse Signature Header (t=timestamp, te=test_sig, li=live_sig)
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
// Sandbox signs as 'te', live as 'li'. Accept whichever is present so that
// switching to live keys does not silently 401 every real webhook.
$signature_to_verify = $parsed_sig['te'] ?? $parsed_sig['li'] ?? '';

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

// 3. Verify Signature
$expected_sig = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);

if (!hash_equals($expected_sig, $signature_to_verify)) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Signature verification failed"]);
    exit;
}

// 4. Process Webhook Event
$event = json_decode($payload, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Invalid JSON"]);
    exit;
}

$event_type = $event['data']['attributes']['type'] ?? '';
$event_data = $event['data']['attributes']['data'] ?? [];

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

    if ($invoice_id) {
        // Bind the event to the checkout session this invoice actually opened.
        // Without this, any validly-signed event naming an invoice id could
        // settle it, including a stale event from a superseded session.
        $chk = $conn->prepare("SELECT status, checkout_session_id, user_id FROM invoices WHERE id = ?");
        $chk->bind_param("s", $invoice_id);
        $chk->execute();
        $inv_row = $chk->get_result()->fetch_assoc();
        $chk->close();

        if (!$inv_row) {
            http_response_code(200);
            echo json_encode(["success" => true, "message" => "Unknown invoice; ignored"]);
            $conn->close();
            exit;
        }

        if ($session_id && !empty($inv_row['checkout_session_id'])
            && !hash_equals($inv_row['checkout_session_id'], $session_id)) {
            http_response_code(200);
            echo json_encode(["success" => true, "message" => "Event belongs to a superseded checkout session; ignored"]);
            $conn->close();
            exit;
        }

        // Already settled — acknowledge so PayMongo stops retrying, but do
        // not rewrite the row.
        if ($inv_row['status'] === 'paid' && $status === 'paid') {
            http_response_code(200);
            echo json_encode(["success" => true, "message" => "Already recorded"]);
            $conn->close();
            exit;
        }

        if ($status === 'paid') {
            $source_type = $event_data['attributes']['payments'][0]['attributes']['source']['type'] ?? null;
            $pm_label = null;
            if ($source_type) {
                $type_map = [
                    'gcash' => 'GCash (Sandbox)',
                    'paymaya' => 'Maya (Sandbox)',
                    'card' => 'Card (Sandbox)',
                    'dob' => 'Online Banking (Sandbox)'
                ];
                $pm_label = $type_map[$source_type] ?? (ucfirst($source_type) . ' (Sandbox)');
            }

            if ($pm_label) {
                $stmt = $conn->prepare("UPDATE invoices SET status = 'paid', payment_method = ?, paid_at = COALESCE(paid_at, NOW()) WHERE id = ? AND status IN " . billing_open_status_sql());
                $stmt->bind_param("ss", $pm_label, $invoice_id);
            } else {
                $stmt = $conn->prepare("UPDATE invoices SET status = 'paid', payment_method = COALESCE(payment_method, 'PayMongo (Sandbox)'), paid_at = COALESCE(paid_at, NOW()) WHERE id = ? AND status IN " . billing_open_status_sql());
                $stmt->bind_param("s", $invoice_id);
            }
        } else {
            $stmt = $conn->prepare("UPDATE invoices SET status = ? WHERE id = ? AND status IN " . billing_open_status_sql());
            $stmt->bind_param("ss", $status, $invoice_id);
        }

        if (!$stmt->execute()) {
            // Returning 200 on a failed write used to mean PayMongo never
            // retried, so a collected payment could be permanently lost.
            error_log("PayMongo webhook DB write failed for invoice $invoice_id: " . $stmt->error);
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Failed to record payment"]);
            $conn->close();
            exit;
        }

        // Attribute to the invoice's owner as stored in the database — the
        // payload metadata is only as trustworthy as whoever built the session.
        $actor = !empty($inv_row['user_id']) ? (int)$inv_row['user_id'] : null;
        $changed = $stmt->affected_rows > 0;
        log_activity($conn, $actor, 'billing', $status === 'paid' ? 'Online Payment Received' : 'Online Payment Failed', "Invoice: $invoice_id, Session: " . ($session_id ?? 'n/a'), $actor ?? 0);

        if ($changed && $actor) {
            if ($status === 'paid') {
                create_notification($conn, $actor, 'payment', 'Payment Received',
                    "Your online payment for invoice $invoice_id was successful. Thank you!");
            } else {
                create_notification($conn, $actor, 'payment', 'Payment Failed',
                    "Your online payment for invoice $invoice_id did not go through. Please try again or choose another payment method.");
            }
        }
    }
}

http_response_code(200);
echo json_encode(["success" => true]);
$conn->close();
?>
