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

    $single_entry = !is_array($payments);
    $errors = array_filter([
        'invoiceId' => v_str($invoice_id, 'Invoice', 1, 50),
        'amountPaid' => $single_entry && ($amount_paid === null || !is_numeric($amount_paid) || (float)$amount_paid <= 0) ? 'Enter the amount received.' : '',
        'paymentReference' => v_str($payment_reference, 'Reference number', 1, 100, false),
    ]);
    if ($errors) validation_fail($errors);

    if ($single_entry) {
        $legacy_method = strtolower((string)$payment_method);
        if (in_array($legacy_method, ['bdo', 'bpi'], true)) {
            $payments = [['method' => 'bank_transfer', 'bank_name' => strtoupper($legacy_method), 'amount' => (float)$amount_paid, 'reference_number' => $payment_reference]];
        } else {
            $payments = [['method' => $legacy_method, 'amount' => (float)$amount_paid, 'reference_number' => $payment_reference]];
        }
    }

    $checked = normalize_payment_portions($payments, 2);
    if (!$checked['ok']) {
        // The single-method form can mark the field; the split form shows the
        // message itself (it has no per-portion error slots).
        if ($single_entry) {
            $msg = $checked['message'];
            validation_fail([stripos($msg, 'reference') !== false ? 'paymentReference' : (stripos($msg, 'bank') !== false ? 'paymentMethod' : 'amountPaid') => $msg]);
        }
        http_response_code(422);
        echo json_encode(["success" => false, "message" => $checked['message']]);
        exit;
    }
    $payments = $checked['parts'];
    $payment_total_cents = $checked['total_cents'];
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
        // Pay Bills is where a payment starts: the tenant submits a proof or
        // schedules a visit first, then the desk confirms it.
        if (!in_array($open_row['status'], ADMIN_RECORDABLE_STATUSES, true)) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "The tenant hasn't submitted a payment or scheduled a visit for this bill yet. Ask them to pay in Pay Bills, or wait for their submission."]);
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

    // A tenant's split submission is confirmed as submitted (same methods and
    // amounts), or rejected so they send a new one — never quietly reshaped.
    $is_split_submission = (bool)array_filter($open_rows, fn($r) => $r['status'] === 'pending-verification' && $r['payment_method'] === SPLIT_PAYMENT_LABEL);
    $submitted_parts = $is_split_submission ? payment_proof_parts($conn, $invoice_id) : [];
    if ($submitted_parts) {
        $signature = fn($method, $amount) => $method . ':' . (int)round((float)$amount * 100);
        $submitted_sig = array_map(fn($p) => $signature($p['method'], $p['amount']), $submitted_parts);
        $recorded_sig = array_map(fn($p) => $signature($p['method'], $p['amount']), $payments);
        sort($submitted_sig);
        sort($recorded_sig);
        if ($submitted_sig !== $recorded_sig) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "The tenant submitted this as a split payment. Confirm it with the same methods and amounts, or reject the proof."]);
            exit;
        }
    }

    // Shared with the PayMongo webhook (audit M12) — settle_invoice() is the
    // single place the move-in cascade, the admin-queue resolution and the
    // tenant notification live, so a desk payment and an online payment
    // activate a move-in identically.
    // $invoice_id may be an advance payment's group id: each of its months is
    // settled as its own invoice (settle_payment_key()).
    // What is still owed: the balance after any parts already received.
    $open_total_cents = 0;
    foreach ($open_rows as $open_row) $open_total_cents += invoice_balance_cents($open_row);

    // Installment (`partial: true`): a part below the balance of one invoice.
    // Without the flag a short amount stays an error, so a typo never becomes
    // a part-payment by accident.
    // A tenant's proof for a part (proof_amount) is confirmed as declared, and
    // recorded as a part.
    $declared_cents = null;
    foreach ($open_rows as $open_row) {
        if ($open_row['status'] === 'pending-verification' && $open_row['proof_amount'] !== null) {
            $declared_cents = (int)round((float)$open_row['proof_amount'] * 100);
        }
    }
    if ($declared_cents !== null && $declared_cents !== $payment_total_cents) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "The tenant declared a part of ₱" . number_format($declared_cents / 100, 2) . " with the proof. Confirm that amount, or reject the proof."]);
        exit;
    }
    $partial = ($input['partial'] ?? false) === true || $declared_cents !== null;

    // Reused reference (Settings -> Payments) and double submit, per GCash/bank
    // part. Checked under the reference lock, held until the payment is
    // written, so a tenant proof with the same reference cannot slip in between.
    // The tenant's own proof or split parts for this bill are what the desk is
    // confirming, so they never count; a part already recorded on this bill
    // with the same reference (another installment) does.
    $ref_parts = array_values(array_filter($payments, fn($p) => $p['method'] !== 'cash' && $p['reference_number'] !== null));
    $reuse_notes = [];
    if ($ref_parts && $open_rows) {
        if (!payment_reference_lock($conn)) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "Another payment is being recorded. Try again in a moment."]);
            exit;
        }
        $open_ids = array_column($open_rows, 'id');
        $blocks = reference_reuse_blocks($conn);
        foreach ($ref_parts as $p) {
            if (payment_double_submitted($conn, $open_ids, null, $p['reference_number'], (int)round($p['amount'] * 100))) {
                http_response_code(409);
                echo json_encode(["success" => false, "message" => "This payment was already recorded: reference {$p['reference_number']} for ₱" . number_format($p['amount'], 2) . " was saved on this bill a moment ago."]);
                exit;
            }
            $reuse = find_reference_reuse($conn, $p['method'], $p['bank_name'], $p['reference_number'], $invoice_id, $open_ids);
            if (!$reuse) continue;
            $where = "invoice {$reuse['invoice_id']} (" . implode(', ', array_filter([$reuse['tenant_name'], $reuse['status']])) . ")";
            if ($blocks) {
                http_response_code(409);
                echo json_encode(["success" => false, "message" => "Reference {$p['reference_number']} was already used on $where. Check the number, or reject the proof."]);
                exit;
            }
            $reuse_notes[] = "reference {$p['reference_number']} also used on $where";
        }
    }
    $log_reuse = function () use ($conn, $admin_id, $invoice_id, &$reuse_notes) {
        if ($reuse_notes) log_activity($conn, $admin_id, 'billing', 'Reused Payment Reference', ucfirst(payment_key_label($invoice_id)) . ": " . implode('; ', $reuse_notes));
    };
    // A part is never more than the balance (the cash-with-change allowance
    // below is for full payments only).
    if ($partial && $open_rows && $payment_total_cents > $open_total_cents) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "The part (₱" . number_format($payment_total_cents / 100, 2) . ") is more than the balance (₱" . number_format($open_total_cents / 100, 2) . ")."]);
        exit;
    }
    if ($partial && $open_rows && $payment_total_cents < $open_total_cents) {
        if (is_payment_group_key($invoice_id) || count($open_rows) !== 1) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "A grouped or advance payment is paid in full; part-payments are recorded on a single invoice."]);
            exit;
        }
        $result = record_partial_payment($conn, $open_rows[0]['id'], $payments, (int)$admin_id);
        payment_reference_unlock($conn);
        if ($result['ok']) $log_reuse();
        if (!$result['ok']) {
            http_response_code($result['code'] ?? 409);
            echo json_encode(["success" => false, "message" => $result['message']]);
            exit;
        }
        echo json_encode(["success" => true, "message" => $result['message'], "partial" => true, "amount_paid" => $result['amount_paid'], "balance" => $result['balance']]);
        $conn->close();
        exit;
    }
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
    payment_reference_unlock($conn);
    // Months already settled before a failure are recorded too.
    if ($result['ok'] || !empty($result['invoice_ids'])) $log_reuse();

    if (!$result['ok']) {
        // These messages are written above for the admin and carry no internals.
        http_response_code(409);
        echo json_encode(["success" => false, "message" => $result['message']]);
        $conn->close();
        exit;
    }

    clear_payment_proof_parts($conn, $invoice_id);
    log_activity($conn, $admin_id, 'billing', "Recorded Payment", ucfirst(payment_key_label($invoice_id)) . " settled via " . implode(', ', array_map(fn($p) => $p['method'] . ' ₱' . number_format($p['amount'], 2), $payments)) . (count($result['invoice_ids']) > 1 ? " (" . implode(", ", $result['invoice_ids']) . ")" : ""));

    echo json_encode(["success" => true, "message" => "Payment successfully finalized and saved."]);
    $conn->close();
    exit;
}

echo json_encode(["success" => false, "message" => "Invalid request method."]);
?>
