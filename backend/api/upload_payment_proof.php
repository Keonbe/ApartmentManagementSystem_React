<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$user_id = $_POST['userId'] ?? $_SERVER['HTTP_X_USER_ID'] ?? null;

if (!$user_id) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Unauthorized - User ID required"]);
    exit;
}

$invoiceId = $_POST['invoiceId'] ?? '';
$paymentMethod = $_POST['paymentMethod'] ?? '';
$senderName = $_POST['senderName'] ?? '';
$referenceNo = $_POST['referenceNo'] ?? '';

if (empty($invoiceId) || empty($paymentMethod) || empty($senderName) || empty($referenceNo)) {
    echo json_encode(["success" => false, "message" => "Missing required fields."]);
    exit;
}

if ($paymentMethod === 'GCash') {
    if (!preg_match('/^\d{13}$/', $referenceNo)) {
        echo json_encode(["success" => false, "message" => "GCash Reference Number must be exactly 13 digits (numbers only)."]);
        exit;
    }
} else if ($paymentMethod === 'Bank Transfer') {
    if (strlen($referenceNo) > 55) {
        echo json_encode(["success" => false, "message" => "Bank Transfer Reference Number must be 55 characters or less."]);
        exit;
    }
    if (preg_match('/^\d+$/', $referenceNo)) {
        echo json_encode(["success" => false, "message" => "Bank Transfer Reference Number cannot consist of numbers only."]);
        exit;
    }
}

if (!isset($_FILES['proofImage']) || $_FILES['proofImage']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(["success" => false, "message" => "Valid image file is required."]);
    exit;
}

// target dir is one level up inside uploads/payments
$target_dir = "../uploads/payments/";
if (!is_dir($target_dir)) {
    mkdir($target_dir, 0777, true);
}

$file_ext = strtolower(pathinfo($_FILES["proofImage"]["name"], PATHINFO_EXTENSION));
$allowed_exts = ['jpg', 'jpeg', 'png'];

if (!in_array($file_ext, $allowed_exts)) {
    echo json_encode(["success" => false, "message" => "Only JPG, JPEG, and PNG files are allowed."]);
    exit;
}

$new_filename = "proof_" . time() . "_" . uniqid() . "." . $file_ext;
$target_file = $target_dir . $new_filename;
$relative_path = "uploads/payments/" . $new_filename;

if (move_uploaded_file($_FILES["proofImage"]["tmp_name"], $target_file)) {
    $stmt = $conn->prepare("UPDATE invoices SET status = 'pending-verification', payment_method = ?, sender_name = ?, payment_reference = ?, proof_of_payment_path = ? WHERE id = ? AND user_id = ?");
    $stmt->bind_param("sssssi", $paymentMethod, $senderName, $referenceNo, $relative_path, $invoiceId, $user_id);
    if ($stmt->execute()) {
        if ($stmt->affected_rows > 0) {
            log_activity($conn, null, 'payment', 'Proof Uploaded', "User $user_id uploaded proof for $paymentMethod on invoice $invoiceId");
            echo json_encode(["success" => true, "message" => "Payment proof submitted successfully."]);
        } else {
            echo json_encode(["success" => false, "message" => "Invoice not found or unauthorized."]);
        }
    } else {
        echo json_encode(["success" => false, "message" => "Database error: " . $stmt->error]);
    }
    $stmt->close();
} else {
    echo json_encode(["success" => false, "message" => "Failed to upload image."]);
}

$conn->close();
?>
