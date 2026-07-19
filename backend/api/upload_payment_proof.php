<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $invoice_id = $_POST['invoiceId'] ?? 0;
    $payment_method = $_POST['paymentMethod'] ?? '';
    $sender_name = $_POST['senderName'] ?? '';
    $reference_no = $_POST['referenceNo'] ?? '';

    if (empty($invoice_id) || empty($payment_method) || empty($sender_name) || empty($reference_no)) {
        echo json_encode(["success" => false, "message" => "Missing required data payloads."]);
        exit;
    }

    if (!isset($_FILES['proofImage']) || $_FILES['proofImage']['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(["success" => false, "message" => "Missing required transaction receipt image file."]);
        exit;
    }

    $base_path = dirname(__DIR__);
    $upload_dir = $base_path . "/uploads/payments/";
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }

    $ext = strtolower(pathinfo($_FILES['proofImage']['name'], PATHINFO_EXTENSION));
    $file_name = "INV_" . $invoice_id . "_" . time() . "_" . uniqid() . "." . $ext;
    $server_path = $upload_dir . $file_name;
    $relative_path = "uploads/payments/" . $file_name;

    if (move_uploaded_file($_FILES['proofImage']['tmp_name'], $server_path)) {
        // Shift status state to 'pending-verification' and bind tracking parameters
        $stmt = $conn->prepare("UPDATE invoices SET status = 'pending-verification', payment_method = ?, sender_name = ?, payment_reference = ?, proof_of_payment_path = ? WHERE id = ?");
        $stmt->bind_param("sssss", $payment_method, $sender_name, $reference_no, $relative_path, $invoice_id);

        if ($stmt->execute()) {
            echo json_encode(["success" => true, "message" => "Payment proof uploaded to review pipeline successfully."]);
        } else {
            echo json_encode(["success" => false, "message" => "Failed to update invoice tracking row entries."]);
        }
        $stmt->close();
    } else {
        echo json_encode(["success" => false, "message" => "Failed to write file system asset blocks."]);
    }
    $conn->close();
    exit;
}
?>