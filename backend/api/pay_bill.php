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

$input = json_decode(file_get_contents("php://input"), true);

if (!$input) {
    echo json_encode(["success" => false, "message" => "No data received"]);
    exit;
}

$invoice_id = $input['invoiceId'] ?? '';
$payment_method = $input['paymentMethod'] ?? '';

if (empty($invoice_id) || empty($payment_method)) {
    echo json_encode(["success" => false, "message" => "Invoice ID and payment method are required."]);
    exit;
}

$status = ($payment_method === 'Cash on Hand') ? 'pending' : 'paid';
$paid_at = ($payment_method === 'Cash on Hand') ? null : date('Y-m-d H:i:s');

$stmt = $conn->prepare("UPDATE invoices SET payment_method = ?, status = ?, paid_at = ? WHERE id = ?");
$stmt->bind_param("ssss", $payment_method, $status, $paid_at, $invoice_id);

if ($stmt->execute()) {
    log_activity($conn, null, 'payment', "Tenant payment action", "Invoice ID: $invoice_id, Method: $payment_method, Status: $status");
    echo json_encode(["success" => true, "message" => "Payment method registered successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to process payment", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
