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

// 1. Fetch webhook secret
$settings_res = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'paymongo_webhook_secret'");
$secret = $settings_res->fetch_assoc()['setting_value'] ?? '';

if (!$secret) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Webhook secret not configured"]);
    exit;
}

// 2. Parse Signature Header (t=timestamp, te=test_sig, li=live_sig)
$parts = explode(',', $signature_header);
$parsed_sig = [];
foreach ($parts as $part) {
    list($key, $value) = explode('=', trim($part), 2);
    $parsed_sig[$key] = $value;
}

$timestamp = $parsed_sig['t'] ?? '';
$test_sig = $parsed_sig['te'] ?? '';
// Since we only support sandbox per user request
$signature_to_verify = $test_sig; 

if (!$timestamp || !$signature_to_verify) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Invalid signature format"]);
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

    if ($invoice_id) {
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
                $stmt = $conn->prepare("UPDATE invoices SET status = 'paid', payment_method = ?, paid_at = COALESCE(paid_at, NOW()) WHERE id = ?");
                $stmt->bind_param("ss", $pm_label, $invoice_id);
            } else {
                $stmt = $conn->prepare("UPDATE invoices SET status = 'paid', payment_method = COALESCE(payment_method, 'PayMongo (Sandbox)'), paid_at = COALESCE(paid_at, NOW()) WHERE id = ?");
                $stmt->bind_param("s", $invoice_id);
            }
        } else {
            $stmt = $conn->prepare("UPDATE invoices SET status = ? WHERE id = ?");
            $stmt->bind_param("ss", $status, $invoice_id);
        }

        if ($stmt->execute()) {
            if ($user_id) {
                log_activity($conn, 1, 'Payment', 'Webhook ' . $status, "Invoice: $invoice_id"); // Assuming admin 1 for systemic logs
            }
        }
    }
}

http_response_code(200);
echo json_encode(["success" => true]);
$conn->close();
?>
