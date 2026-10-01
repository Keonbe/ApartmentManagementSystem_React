<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);
    $invoice_id = $input['invoiceId'] ?? '';
    $payment_method = $input['paymentMethod'] ?? 'Cash';
    // Checklist 3.2 calls for amount and reference to be recorded; both
    // were previously discarded, so every admin-recorded payment was
    // assumed to settle the full total with no reference kept.
    $payment_reference = trim($input['paymentReference'] ?? '') ?: null;
    $amount_paid = isset($input['amountPaid']) && $input['amountPaid'] !== '' ? $input['amountPaid'] : null;

    if (empty($invoice_id)) {
        echo json_encode(["success" => false, "message" => "Invalid target invoice parameter."]);
        exit;
    }

    // Payments audit 2026-09-30: the amount is required for every method. An
    // omitted amount used to skip the short-payment check below, so a GCash or
    // bank record for less than the bill still settled it in full.
    if ($amount_paid === null || !is_numeric($amount_paid) || (float)$amount_paid <= 0) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Enter the amount received.", "errors" => ["amountPaid" => "Enter the amount received."]]);
        exit;
    }
    $amount_paid = (float)$amount_paid;

    // The recorded method is one of the desk methods, and must agree with how
    // the tenant actually paid (payments audit follow-up 2026-10-01).
    if (!in_array($payment_method, DESK_PAYMENT_METHODS, true)) {
        http_response_code(422);
        $msg = "Choose a payment method: " . implode(', ', DESK_PAYMENT_METHODS) . ".";
        echo json_encode(["success" => false, "message" => $msg, "errors" => ["paymentMethod" => $msg]]);
        exit;
    }
    $open_rows = payment_key_invoices($conn, $invoice_id, null, BILLING_OPEN_STATUSES);
    foreach ($open_rows as $open_row) {
        // A gateway checkout may still complete; recording it here as well
        // could charge the tenant twice. The admin cancels it first
        // (release_checkout_session.php) after checking PayMongo.
        if ($open_row['status'] === 'processing') {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "An online checkout is in progress for this bill. Check PayMongo: if it wasn't paid there, cancel the checkout first, then record the payment."]);
            exit;
        }
        // A proof under review is evidence of one channel: confirm it as that
        // channel, or reject the proof — never relabel it.
        $declared = $open_row['status'] === 'pending-verification' ? desk_methods_for_label($open_row['payment_method']) : [];
        if ($declared && !in_array($payment_method, $declared, true)) {
            http_response_code(422);
            $as = implode(' or ', $declared);
            $msg = "The tenant submitted this as {$open_row['payment_method']} with a proof. Confirm it as $as, or reject the proof.";
            echo json_encode(["success" => false, "message" => $msg, "errors" => ["paymentMethod" => $msg]]);
            exit;
        }
    }

    // Shared with the PayMongo webhook (audit M12) — settle_invoice() is the
    // single place the move-in cascade, the admin-queue resolution and the
    // tenant notification live, so a desk payment and an online payment
    // activate a move-in identically.
    // $invoice_id may be an advance payment's group id: each of its months is
    // settled as its own invoice (settle_payment_key()).
    $result = settle_payment_key($conn, $invoice_id, $payment_method, $payment_reference, $amount_paid);

    if (!$result['ok']) {
        // These messages are written above for the admin and carry no internals.
        http_response_code(409);
        echo json_encode(["success" => false, "message" => $result['message']]);
        $conn->close();
        exit;
    }

    log_activity($conn, $admin_id, 'billing', "Recorded Payment", ucfirst(payment_key_label($invoice_id)) . " settled via $payment_method" . (count($result['invoice_ids']) > 1 ? " (" . implode(", ", $result['invoice_ids']) . ")" : ""));

    echo json_encode(["success" => true, "message" => "Payment successfully finalized and saved."]);
    $conn->close();
    exit;
}

echo json_encode(["success" => false, "message" => "Invalid request method."]);
?>
