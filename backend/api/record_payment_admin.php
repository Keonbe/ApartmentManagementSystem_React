<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);
    $invoice_id = $input['invoiceId'] ?? 0;
    $payment_method = $input['paymentMethod'] ?? 'Cash';
    $admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;

    if ($invoice_id > 0) {
        $stmt = $conn->prepare("UPDATE invoices SET status = 'paid', payment_method = ?, paid_at = NOW() WHERE id = ?");
        $stmt->bind_param("si", $payment_method, $invoice_id);

        if ($stmt->execute()) {
            log_activity($conn, $admin_id, 'payment', "Approved Verification Pipeline", "Invoice ID: $invoice_id settled via $payment_method");
            echo json_encode(["success" => true, "message" => "Payment successfully finalized and saved."]);
        } else {
            echo json_encode(["success" => false, "message" => "Failed to update record fields."]);
        }
        $stmt->close();
    } else {
        echo json_encode(["success" => false, "message" => "Invalid target tracking index parameters."]);
    }
    $conn->close();
    exit;
}
?>