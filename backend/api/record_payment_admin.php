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
    $payments = $input['payments'] ?? null;

    if (empty($invoice_id)) {
        echo json_encode(["success" => false, "message" => "Invalid target invoice parameter."]);
        exit;
    }

    if (!is_array($payments)) {
        if ($amount_paid === null || !is_numeric($amount_paid) || (float)$amount_paid <= 0) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Enter the amount received.", "errors" => ["amountPaid" => "Enter the amount received."]]);
            exit;
        }
        $legacy_method = strtolower((string)$payment_method);
        if (in_array($legacy_method, ['bdo', 'bpi'], true)) {
            $payments = [['method' => 'bank_transfer', 'bank_name' => strtoupper($legacy_method), 'amount' => (float)$amount_paid, 'reference_number' => $payment_reference]];
        } else {
            $payments = [['method' => $legacy_method, 'amount' => (float)$amount_paid, 'reference_number' => $payment_reference]];
        }
    }

    if (!$payments || count($payments) > 10) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Provide between 1 and 10 payment portions."]);
        exit;
    }
    $normalized = [];
    $payment_total_cents = 0;
    $allowed_methods = ['cash', 'gcash', 'bank_transfer'];
    foreach ($payments as $part) {
        if (!is_array($part)) continue;
        $method = strtolower(trim((string)($part['method'] ?? '')));
        $amount_raw = $part['amount'] ?? null;
        $bank_name = trim((string)($part['bank_name'] ?? ''));
        $reference = trim((string)($part['reference_number'] ?? ''));
        if (!in_array($method, $allowed_methods, true) || !is_numeric($amount_raw) || (float)$amount_raw <= 0 || round((float)$amount_raw, 2) !== (float)$amount_raw) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Each portion needs a supported method and a positive amount with at most two decimals."]);
            exit;
        }
        // A listed bank, or the name the admin typed after choosing "Other" —
        // the page sends that name, never the word "Other" itself.
        $listed_bank = $bank_name !== 'Other' && in_array($bank_name, PHILIPPINE_BANKS, true);
        $custom_bank = (bool)preg_match('/^[\p{L}\p{N}][\p{L}\p{N} .&\'\-]{1,59}$/u', $bank_name) && strcasecmp($bank_name, 'Other') !== 0;
        if ($method === 'bank_transfer' && !$listed_bank && !$custom_bank) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Choose a supported originating bank for each bank transfer."]);
            exit;
        }
        if ($method === 'gcash' && $reference !== '' && !preg_match('/^\d{13}$/', $reference)) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "GCash reference numbers must be exactly 13 digits."]);
            exit;
        }
        if ($method === 'bank_transfer' && $reference !== '' && (strlen($reference) > 55 || preg_match('/^\d+$/', $reference))) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Bank references must be 55 characters or fewer and cannot contain digits only."]);
            exit;
        }
        if ($method !== 'bank_transfer') $bank_name = '';
        $part['method'] = $method;
        $part['amount'] = round((float)$amount_raw, 2);
        $part['bank_name'] = $bank_name ?: null;
        $part['reference_number'] = $reference ?: null;
        $normalized[] = $part;
        $payment_total_cents += (int)round((float)$amount_raw * 100);
    }
    if (count($normalized) !== count($payments)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Invalid payment portion."]);
        exit;
    }
    $payments = $normalized;
    $payment_method = count($payments) > 1 ? 'split' : $payments[0]['method'];
    $amount_paid = $payment_total_cents / 100;

    $allowed_for_proof = array_values(array_unique(array_map(function ($part) {
        return $part['method'] === 'bank_transfer' ? 'bank_transfer' : $part['method'];
    }, $payments)));
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
        $proof_matches = false;
        foreach ($declared as $declared_method) {
            $normalized_declared = strtolower($declared_method);
            if (in_array($normalized_declared, ['bdo', 'bpi'], true)) $normalized_declared = 'bank_transfer';
            if (in_array($normalized_declared, $allowed_for_proof, true)) $proof_matches = true;
        }
        if ($declared && !$proof_matches) {
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
    $open_total_cents = 0;
    foreach ($open_rows as $open_row) $open_total_cents += (int)round((float)$open_row['total_amount'] * 100);
    $cash_only_legacy_overpayment = count($payments) === 1 && $payments[0]['method'] === 'cash' && $payment_total_cents >= $open_total_cents;
    if ($payment_total_cents !== $open_total_cents && !$cash_only_legacy_overpayment) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Payment portions must add up exactly to the invoice or grouped-invoice total."]);
        exit;
    }
    if (!$open_rows) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "Invoice not found or already settled."]);
        exit;
    }
    $legacy_cash_overpayment = count($payments) === 1 && $payments[0]['method'] === 'cash' && $payment_total_cents > $open_total_cents;
    $settlement_splits = $legacy_cash_overpayment ? null : $payments;
    $result = settle_payment_key($conn, $invoice_id, $payment_method, $payment_reference, $amount_paid, $settlement_splits, (int)$admin_id);

    if (!$result['ok']) {
        // These messages are written above for the admin and carry no internals.
        http_response_code(409);
        echo json_encode(["success" => false, "message" => $result['message']]);
        $conn->close();
        exit;
    }

    log_activity($conn, $admin_id, 'billing', "Recorded Payment", ucfirst(payment_key_label($invoice_id)) . " settled via " . implode(', ', array_map(fn($p) => $p['method'] . ' ₱' . number_format($p['amount'], 2), $payments)) . (count($result['invoice_ids']) > 1 ? " (" . implode(", ", $result['invoice_ids']) . ")" : ""));

    echo json_encode(["success" => true, "message" => "Payment successfully finalized and saved."]);
    $conn->close();
    exit;
}

echo json_encode(["success" => false, "message" => "Invalid request method."]);
?>
