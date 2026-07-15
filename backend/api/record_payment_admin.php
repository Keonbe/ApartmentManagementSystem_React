<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

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
$payment_method = $input['paymentMethod'] ?? 'Cash';

if (empty($invoice_id)) {
    echo json_encode(["success" => false, "message" => "Invoice ID is required."]);
    exit;
}

$status = 'paid';
$paid_at = date('Y-m-d H:i:s');

$stmt = $conn->prepare("UPDATE invoices SET payment_method = ?, status = ?, paid_at = ? WHERE id = ?");
$stmt->bind_param("ssss", $payment_method, $status, $paid_at, $invoice_id);

if ($stmt->execute()) {
    if ($stmt->affected_rows > 0) {
        echo json_encode(["success" => true, "message" => "Payment recorded successfully"]);
    } else {
        echo json_encode(["success" => false, "message" => "Invoice not found or already paid"]);
    }
} else {
    echo json_encode(["success" => false, "message" => "Failed to record payment", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
