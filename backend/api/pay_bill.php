<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$auth = require_user($conn);
$user_id = $auth['id'];

$input = json_decode(file_get_contents("php://input"), true);

if (!$input) {
    echo json_encode(["success" => false, "message" => "No data received"]);
    exit;
}

$invoice_id = $input['invoiceId'] ?? '';
$payment_method = $input['paymentMethod'] ?? '';
$payment_reference = $input['paymentReference'] ?? null;
$proof_path = $input['proofOfPaymentPath'] ?? null;

if (empty($invoice_id) || empty($payment_method)) {
    echo json_encode(["success" => false, "message" => "Invoice ID and payment method are required."]);
    exit;
}

$status = ($payment_method === 'Cash on Hand') ? 'pending' : 'pending-verification';

// Only an invoice that is still genuinely open may be acted on. Without this
// guard a tenant could re-submit against an already-'paid' invoice and knock
// it back to 'pending-verification' (and the old code also blanked paid_at
// unconditionally, erasing when it was actually settled).
if (!empty($proof_path)) {
    $stmt = $conn->prepare("UPDATE invoices SET payment_method = ?, payment_reference = ?, proof_of_payment_path = ?, status = ? WHERE id = ? AND user_id = ? AND status IN " . billing_open_status_sql());
    $stmt->bind_param("sssssi", $payment_method, $payment_reference, $proof_path, $status, $invoice_id, $user_id);
} else {
    $stmt = $conn->prepare("UPDATE invoices SET payment_method = ?, payment_reference = ?, status = ? WHERE id = ? AND user_id = ? AND status IN " . billing_open_status_sql());
    $stmt->bind_param("ssssi", $payment_method, $payment_reference, $status, $invoice_id, $user_id);
}

if ($stmt->execute()) {
    if ($stmt->affected_rows === 0) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This invoice is not open for payment — it may already be settled or cancelled."]);
        $stmt->close();
        $conn->close();
        exit;
    }
    log_activity($conn, $user_id, 'payment', "Tenant payment action", "Invoice ID: $invoice_id, Method: $payment_method, Status: $status, Ref: $payment_reference");
    echo json_encode(["success" => true, "message" => "Payment processed successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to process payment", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
