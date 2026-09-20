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
        $chk = $conn->prepare("SELECT status, checkout_session_id, user_id, total_amount FROM invoices WHERE id = ?");
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
            // The total can change after the checkout session was created —
            // promote_overdue_invoices() may have moved it processing ->
            // overdue and added a late fee — so a paid event is trusted only
            // when the amount PayMongo actually collected still matches the
            // invoice as it stands today (audit H9b). This never happened
            // before: a paid event settled the invoice at its current total
            // regardless of what was actually collected at checkout.
            $paid_centavos = $event_data['attributes']['payments'][0]['attributes']['amount'] ?? null;
            $expected_centavos = (int)round((float)$inv_row['total_amount'] * 100);

            if ($paid_centavos === null || (int)$paid_centavos !== $expected_centavos) {
                $mismatch = $conn->prepare("UPDATE invoices SET status = 'pending-verification' WHERE id = ? AND status IN " . billing_open_status_sql());
                $mismatch->bind_param("s", $invoice_id);
                $mismatch->execute();
                $mismatch->close();

                $paid_display = $paid_centavos !== null ? number_format($paid_centavos / 100, 2) : 'unknown';
                notify_admins_queue($conn, 'payment_verification', $invoice_id, 'Payment Amount Mismatch',
                    "PayMongo reported ₱$paid_display for invoice $invoice_id, but the invoice total is ₱" . number_format((float)$inv_row['total_amount'], 2) . ". Verify manually before marking it paid.");

                $actor = !empty($inv_row['user_id']) ? (int)$inv_row['user_id'] : null;
                log_activity($conn, $actor, 'billing', 'Online Payment Amount Mismatch',
                    "Invoice: $invoice_id, Session: " . ($session_id ?? 'n/a') . ", Paid: ₱$paid_display, Expected: ₱" . number_format((float)$inv_row['total_amount'], 2), $actor ?? 0);

                http_response_code(200);
                echo json_encode(["success" => true, "message" => "Amount mismatch; queued for manual verification"]);
                $conn->close();
                exit;
            }

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

            // Shared with the front desk (audit M12) — settle_invoice() carries
            // the move-in cascade, the admin-queue resolution and the tenant
            // notification, so an online move-in payment now activates the
            // room/application/contract exactly like a desk payment does.
            // Before this, the webhook only flipped the invoice to 'paid' and
            // left the application 'Approved' and the contract a draft.
            $result = settle_invoice($conn, $invoice_id, $pm_label ?: 'PayMongo (Sandbox)', null, null);

            $actor = !empty($inv_row['user_id']) ? (int)$inv_row['user_id'] : null;

            if (!$result['ok']) {
                // A business-logic failure here (e.g. the room was taken by
                // someone else in the meantime) can't be fixed by PayMongo
                // retrying the same event, so acknowledge it — but log loudly,
                // since the tenant did pay and the cascade needs a manual look.
                error_log("PayMongo webhook settle_invoice failed for invoice $invoice_id: " . $result['message']);
                log_activity($conn, $actor, 'billing', 'Online Payment Needs Review',
                    "Invoice: $invoice_id, Session: " . ($session_id ?? 'n/a') . " — " . $result['message'], $actor ?? 0);
                http_response_code(200);
                echo json_encode(["success" => true, "message" => "Payment recorded but needs manual review: " . $result['message']]);
                $conn->close();
                exit;
            }

            log_activity($conn, $actor, 'billing', 'Online Payment Received', "Invoice: $invoice_id, Session: " . ($session_id ?? 'n/a'), $actor ?? 0);
        } else {
            $stmt = $conn->prepare("UPDATE invoices SET status = ? WHERE id = ? AND status IN " . billing_open_status_sql());
            $stmt->bind_param("ss", $status, $invoice_id);

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
            log_activity($conn, $actor, 'billing', 'Online Payment Failed', "Invoice: $invoice_id, Session: " . ($session_id ?? 'n/a'), $actor ?? 0);

            if ($changed && $actor) {
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
