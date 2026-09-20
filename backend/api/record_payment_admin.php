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
    $amount_paid = isset($input['amountPaid']) && $input['amountPaid'] !== '' ? (float)$input['amountPaid'] : null;

    if (empty($invoice_id)) {
        echo json_encode(["success" => false, "message" => "Invalid target invoice parameter."]);
        exit;
    }

    // Shared with the PayMongo webhook (audit M12) — settle_invoice() is the
    // single place the move-in cascade, the admin-queue resolution and the
    // tenant notification live, so a desk payment and an online payment
    // activate a move-in identically.
    $result = settle_invoice($conn, $invoice_id, $payment_method, $payment_reference, $amount_paid);

    if (!$result['ok']) {
        // These messages are written above for the admin and carry no internals.
        http_response_code(409);
        echo json_encode(["success" => false, "message" => $result['message']]);
        $conn->close();
        exit;
    }

    log_activity($conn, $admin_id, 'billing', "Recorded Payment", "Invoice ID: $invoice_id settled via $payment_method");

    echo json_encode(["success" => true, "message" => "Payment successfully finalized and saved."]);
    $conn->close();
    exit;
}

echo json_encode(["success" => false, "message" => "Invalid request method."]);
?>
