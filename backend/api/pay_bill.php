<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
if (empty($user_id)) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Unauthorized"]);
    exit;
}

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
$paid_at = null;

if (!empty($proof_path)) {
    $stmt = $conn->prepare("UPDATE invoices SET payment_method = ?, payment_reference = ?, proof_of_payment_path = ?, status = ?, paid_at = ? WHERE id = ? AND user_id = ?");
    $stmt->bind_param("ssssssi", $payment_method, $payment_reference, $proof_path, $status, $paid_at, $invoice_id, $user_id);
} else {
    $stmt = $conn->prepare("UPDATE invoices SET payment_method = ?, payment_reference = ?, status = ?, paid_at = ? WHERE id = ? AND user_id = ?");
    $stmt->bind_param("sssssi", $payment_method, $payment_reference, $status, $paid_at, $invoice_id, $user_id);
}

if ($stmt->execute()) {
    log_activity($conn, null, 'payment', "Tenant payment action", "Invoice ID: $invoice_id, Method: $payment_method, Status: $status, Ref: $payment_reference");
    echo json_encode(["success" => true, "message" => "Payment processed successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to process payment", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
