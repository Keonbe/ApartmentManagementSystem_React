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

    if ($invoice_id) {
        // Bind the event to the checkout session this invoice actually opened.
        // Without this, any validly-signed event naming an invoice id could
        // settle it, including a stale event from a superseded session.
        //
        // The metadata id may be an advance payment's group id (config.php,
        // "Advance payments"): then the event covers every month in it, and
        // the checks below apply to the months together — the same session on
        // each, the sum as the amount due, "paid" only once all are.
        $all_rows = payment_key_invoices($conn, $invoice_id);
        $group_rows = array_values(array_filter($all_rows, fn($row) => $row['status'] !== 'cancelled'));

        if (!$group_rows) {
            // Cancelled while the tenant was at the checkout: the money was
            // still collected, so it goes to the admin as a refund to pay back.
            if ($status === 'paid' && $all_rows) {
                raise_unapplied_payment($conn, $payment_id, $paid_centavos, $all_rows[0]['user_id'], $invoice_id, "the bill was cancelled before the payment arrived");
            }
            http_response_code(200);
            echo json_encode(["success" => true, "message" => "Unknown invoice; ignored"]);
            $conn->close();
            exit;
        }

        $unpaid_rows = array_values(array_filter($group_rows, fn($row) => $row['status'] !== 'paid'));
        $session_rows = array_filter($group_rows, fn($row) => !empty($row['checkout_session_id']));
        $inv_row = [
            'status' => $unpaid_rows ? $unpaid_rows[0]['status'] : 'paid',
            'user_id' => $group_rows[0]['user_id'],
            // What the checkout charged: the balance after any parts already received.
            'total_amount' => array_sum(array_map(fn($row) => invoice_balance_cents($row) / 100, $group_rows)),
        ];
        $superseded = false;
        foreach ($session_rows as $row) {
            if ($session_id && !hash_equals($row['checkout_session_id'], $session_id)) $superseded = true;
        }
        // Rows opened before the intent id was stored have none; those match
        // on the invoice id alone.
        foreach ($group_rows as $row) {
            if (empty($row['checkout_payment_intent_id'])) continue;
            // A failed event that names no intent cannot be tied to the open
            // checkout, so it is treated as stale rather than risk failing an
            // invoice whose newer checkout is still in progress.
            if ($event_type === 'payment.failed' && !$intent_id) $superseded = true;
            elseif ($intent_id && !hash_equals($row['checkout_payment_intent_id'], $intent_id)) $superseded = true;
        }

        if ($superseded) {
            // A paid event on an old checkout is real money PayMongo holds.
            if ($status === 'paid') {
                raise_unapplied_payment($conn, $payment_id, $paid_centavos, $inv_row['user_id'], $invoice_id, "it came from an older checkout than the one now open");
            }
            http_response_code(200);
            echo json_encode(["success" => true, "message" => "Event belongs to a superseded checkout session; ignored"]);
            $conn->close();
            exit;
        }

        // Already settled — acknowledge so PayMongo stops retrying, but do
        // not rewrite the row.
        if ($inv_row['status'] === 'paid' && $status === 'paid') {
            // A different payment on a bill that is already paid is a double
            // payment; the same payment again is just PayMongo retrying. A bill
            // paid at the desk has no stored PayMongo payment, so any online
            // payment on it is a double payment too (raised once per payment id).
            $stored = $conn->prepare("SELECT paymongo_payment_id FROM invoices WHERE ? IN (id, payment_group) AND paymongo_payment_id IS NOT NULL LIMIT 1");
            $stored->bind_param("s", $invoice_id);
            $stored->execute();
            $stored_payment = $stored->get_result()->fetch_assoc()['paymongo_payment_id'] ?? null;
            $stored->close();
            if ($payment_id && $stored_payment !== $payment_id) {
                raise_unapplied_payment($conn, $payment_id, $paid_centavos, $inv_row['user_id'], $invoice_id, "the bill was already paid");
            }
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
            $expected_centavos = (int)round((float)$inv_row['total_amount'] * 100);

            // Keep the payment id on the bill whatever happens next: a refund
            // through PayMongo needs it.
            if ($payment_id) {
                $keep = $conn->prepare("UPDATE invoices SET paymongo_payment_id = ? WHERE ? IN (id, payment_group)");
                $keep->bind_param("ss", $payment_id, $invoice_id);
                $keep->execute();
                $keep->close();
            }

            if ($paid_centavos === null || (int)$paid_centavos !== $expected_centavos) {
                $mismatch = $conn->prepare("UPDATE invoices SET status = 'pending-verification' WHERE ? IN (id, payment_group) AND status IN " . billing_open_status_sql());
                $mismatch->bind_param("s", $invoice_id);
                $mismatch->execute();
                $mismatch->close();

                $paid_display = $paid_centavos !== null ? number_format($paid_centavos / 100, 2) : 'unknown';
                notify_admins_queue($conn, 'payment_verification', $invoice_id, 'Payment Amount Mismatch',
                    "PayMongo reported ₱$paid_display for invoice $invoice_id, but the invoice total is ₱" . number_format((float)$inv_row['total_amount'], 2) . ". Verify manually before marking it paid.");

                $actor = !empty($inv_row['user_id']) ? (int)$inv_row['user_id'] : null;
                if ($actor) {
                    create_notification($conn, $actor, 'payment', 'Payment Being Verified',
                        "Your online payment for invoice $invoice_id was received and is being verified by management. You will be notified once it is confirmed.",
                        'Resolved', "invoice:$invoice_id");
                }
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
            // the admin-queue updates (a paid move-in invoice asks the admin to
            // schedule the move-in) and the tenant notification, exactly like a
            // desk payment. Payment never activates the tenancy by itself.
            // An advance payment settles each of its months (settle_payment_key()).
            $result = settle_payment_key($conn, $invoice_id, $pm_label ?: 'PayMongo (Sandbox)', null, null);

            $actor = !empty($inv_row['user_id']) ? (int)$inv_row['user_id'] : null;

            if (!$result['ok']) {
                // A business-logic failure here (e.g. the room was taken by
                // someone else in the meantime) can't be fixed by PayMongo
                // retrying the same event, so acknowledge it — but log loudly,
                // since the tenant did pay and the cascade needs a manual look.
                error_log("PayMongo webhook settle_invoice failed for invoice $invoice_id: " . $result['message']);
                log_activity($conn, $actor, 'billing', 'Online Payment Needs Review',
                    "Invoice: $invoice_id, Session: " . ($session_id ?? 'n/a') . " — " . $result['message'], $actor ?? 0);
                notify_admins_queue($conn, 'payment_verification', $invoice_id, 'Online Payment Needs Review',
                    "An online payment for $invoice_id was received but could not be recorded: " . $result['message']);
                raise_unapplied_payment($conn, $payment_id, $paid_centavos, $actor, $invoice_id, $result['message']);
                http_response_code(200);
                echo json_encode(["success" => true, "message" => "Payment recorded but needs manual review: " . $result['message']]);
                $conn->close();
                exit;
            }

            log_activity($conn, $actor, 'billing', 'Online Payment Received', "Invoice: $invoice_id, Session: " . ($session_id ?? 'n/a'), $actor ?? 0);
            notify_admins_info($conn, 'payment', 'Online Payment Received',
                "Invoice $invoice_id was paid online (" . ($pm_label ?: 'PayMongo') . ") and recorded automatically.", "invoice:$invoice_id");
        } else {
            // Only a checkout still in progress fails. The session is released
            // like a cancelled one, so the tenant can open a new checkout
            // (create_checkout_session.php stores a session only on rows
            // without one).
            $stmt = $conn->prepare("UPDATE invoices SET status = ?, checkout_session_id = NULL, checkout_payment_intent_id = NULL, processing_since = NULL WHERE ? IN (id, payment_group) AND status = 'processing'");
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
            log_activity($conn, $actor, 'billing', 'Online Payment Failed', "Invoice: $invoice_id, Payment intent: " . ($intent_id ?? 'n/a'), $actor ?? 0);

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
