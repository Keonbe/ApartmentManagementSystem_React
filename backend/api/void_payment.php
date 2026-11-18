<?php
// Void a paid desk payment (SPRINT 182, panel audit F-04). A bill an admin marked
// paid by mistake (wrong invoice, wrong amount, a transfer that never arrived)
// used to be stuck: adjust_invoice.php refuses a paid bill and nothing un-paid it.
// A void needs a reason, reopens the bill (pending, or overdue when its due date
// has passed), removes its payment rows, and tells the tenant. The reason, the
// admin and the amount stay in the bill's adjustment history and the activity log.
//
// Not for money that left the desk's hands: an online (PayMongo) payment is
// refunded through a refund request, and a bill paid from advance rent or the
// security deposit is undone by the move-out flow that did it.
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

$admin_id = require_admin($conn);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

$input = read_json_input();
$invoice_id = is_string($input['invoiceId'] ?? null) ? trim($input['invoiceId']) : '';
if ($invoice_id === '' || mb_strlen($invoice_id) > 50) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "invoiceId is required."]);
    exit;
}

// Same rule as adjust_invoice.php (the text is kept in invoice_adjustments and
// quoted to the tenant), a little shorter to leave room for the "Payment voided:" prefix.
$reason = is_string($input['reason'] ?? null) ? trim(preg_replace('/\s+/u', ' ', $input['reason'])) : '';
$reason_len = mb_strlen($reason);
if ($reason_len < 5 || $reason_len > 220) {
    $msg = $reason_len === 0 ? "Enter the reason for voiding this payment." : "The reason must be 5 to 220 characters.";
    validation_fail(['reason' => $msg]);
}

$refuse = function ($message, $status = 409) use ($conn) {
    $conn->rollback();
    http_response_code($status);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
};

$conn->begin_transaction();
try {
    $stmt = $conn->prepare("SELECT id, user_id, rent_application_id, status, total_amount, amount_paid, payment_method, payment_reference, bank_name, paid_at, due_date, billing_period,
                                   security_deposit, advance_months, payment_group, payment_gateway, paymongo_payment_id, checkout_payment_intent_id
                            FROM invoices WHERE id = ? FOR UPDATE");
    $stmt->bind_param("s", $invoice_id);
    $stmt->execute();
    $inv = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$inv) $refuse("Invoice not found.", 404);
    if ($inv['status'] !== 'paid') $refuse("Invoice {$invoice_id} is not paid, so there is no payment to void.");
    if (!empty($inv['payment_gateway']) || !empty($inv['paymongo_payment_id']) || !empty($inv['checkout_payment_intent_id'])) {
        $refuse("Invoice {$invoice_id} was paid online. Refund it through a refund request instead.");
    }
    if (!empty($inv['payment_group'])) {
        $refuse("Invoice {$invoice_id} was paid together with other bills (" . $inv['payment_group'] . "), so one of them cannot be voided on its own.");
    }
    if (!empty($inv['advance_months'])) {
        $refuse("Invoice {$invoice_id} is an advance payment. Its months are billed from the credits, so it cannot be voided.");
    }
    if ($inv['payment_method'] === 'Advance credit') {
        $refuse("Invoice {$invoice_id} was paid from the tenant's advance rent, not at the desk.");
    }
    if ($inv['payment_method'] === DEPOSIT_PAYMENT_METHOD) {
        $refuse("Invoice {$invoice_id} was paid from the security deposit at move-out. Restore the tenancy to undo that.");
    }

    // A refund already raised against this bill would pay the same money back twice.
    $open = "'" . implode("','", array_merge(REFUND_OPEN_STATUSES, ['Refunded'])) . "'";
    $rf = $conn->prepare("SELECT id FROM refund_requests WHERE invoice_id = ? AND status IN ($open) LIMIT 1");
    $rf->bind_param("s", $invoice_id);
    $rf->execute();
    $has_refund = (bool)$rf->get_result()->fetch_assoc();
    $rf->close();
    if ($has_refund) $refuse("Invoice {$invoice_id} already has a refund request. Resolve that instead of voiding the payment.");

    // A move-in invoice holds the deposit; once the tenant has moved in the money
    // is part of the running tenancy and cannot be taken back here.
    $moves_in = (float)$inv['security_deposit'] > 0 && !empty($inv['rent_application_id']);
    if ($moves_in) {
        $ap = $conn->prepare("SELECT status FROM rent_applications WHERE id = ?");
        $ap->bind_param("i", $inv['rent_application_id']);
        $ap->execute();
        $app = $ap->get_result()->fetch_assoc();
        $ap->close();
        if (!$app || $app['status'] !== 'Approved') {
            $refuse("Invoice {$invoice_id} is the move-in payment and the tenant has already moved in, so it cannot be voided.");
        }
    }

    // The payment as it stood, for the log: one line per ledger row.
    $tx = $conn->prepare("SELECT amount, payment_method, bank_name, reference_number FROM payment_transactions WHERE invoice_id = ? ORDER BY id");
    $tx->bind_param("s", $invoice_id);
    $tx->execute();
    $tx_rows = $tx->get_result()->fetch_all(MYSQLI_ASSOC);
    $tx->close();
    $tx_summary = $tx_rows
        ? implode(' + ', array_map(fn($r) => '₱' . number_format((float)$r['amount'], 2) . ' ' . ($r['bank_name'] ?: $r['payment_method']) . ($r['reference_number'] ? ' (ref ' . $r['reference_number'] . ')' : ''), $tx_rows))
        : '₱' . number_format((float)$inv['amount_paid'], 2) . ' ' . ($inv['payment_method'] ?: 'unknown method') . ($inv['payment_reference'] ? ' (ref ' . $inv['payment_reference'] . ')' : '');

    // Reopen. The status guard makes a second submit change nothing.
    $up = $conn->prepare("UPDATE invoices SET status = IF(due_date IS NOT NULL AND due_date < CURDATE(), 'overdue', 'pending'),
                                 amount_paid = 0, proof_amount = NULL, payment_method = NULL, payment_reference = NULL, bank_name = NULL, paid_at = NULL
                          WHERE id = ? AND status = 'paid'");
    $up->bind_param("s", $invoice_id);
    $up->execute();
    $reopened = $up->affected_rows === 1;
    $up->close();
    if (!$reopened) $refuse("Invoice {$invoice_id} changed before this could be applied. Reload and try again.");

    $del = $conn->prepare("DELETE FROM payment_transactions WHERE invoice_id = ?");
    $del->bind_param("s", $invoice_id);
    $del->execute();
    $del->close();

    if ($moves_in) {
        $dep = $conn->prepare("UPDATE lease_contracts SET deposit_status = 'Pending' WHERE rent_application_id = ? AND deposit_status = 'Held'");
        $dep->bind_param("i", $inv['rent_application_id']);
        $dep->execute();
        $dep->close();
    }

    // The bill's adjustment history carries the reason, the admin and the amount.
    $stored_reason = "Payment voided: " . $reason;
    $total_text = money_str($inv['total_amount']);
    $changes = json_encode(['amount_paid' => [(float)$inv['amount_paid'], 0.0]]);
    $hist = $conn->prepare("INSERT INTO invoice_adjustments (invoice_id, admin_id, reason, old_total, new_total, changes) VALUES (?, ?, ?, ?, ?, ?)");
    $hist->bind_param("sissss", $invoice_id, $admin_id, $stored_reason, $total_text, $total_text, $changes);
    if (!$hist->execute()) throw new Exception("Could not save the void record.");
    $hist->close();

    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(["success" => false, "message" => public_error_message($e)]);
    exit;
}

// After the commit: a failed note or log must not report the void as failed.
log_activity($conn, $admin_id, 'billing', 'Voided Payment',
    "Invoice {$invoice_id}: payment of {$tx_summary}" . ($inv['paid_at'] ? " received {$inv['paid_at']}" : '') . " voided; bill reopened. Reason: {$reason}");

if (!empty($inv['user_id'])) {
    create_notification($conn, (int)$inv['user_id'], 'payment', 'Payment Voided',
        "The payment recorded for invoice {$invoice_id} (" . ($inv['billing_period'] ?: 'your bill') . ") was voided by management: {$reason}. The bill is open again; please pay it from Pay Bills or contact the office.",
        'Resolved', "invoice:$invoice_id");
}

echo json_encode([
    "success" => true,
    "message" => "Payment voided. Invoice {$invoice_id} is open again.",
    "invoice_id" => $invoice_id,
]);
$conn->close();
