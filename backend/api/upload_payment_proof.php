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

$user_id = $_SERVER['HTTP_X_USER_ID'] ?? $_POST['userId'] ?? $_POST['user_id'] ?? null;

// Support both snake_case and camelCase keys
$invoice_id = $_POST['invoice_id'] ?? $_POST['invoiceId'] ?? null;
$payment_reference = $_POST['payment_reference'] ?? $_POST['referenceNo'] ?? $_POST['paymentReference'] ?? null;
$payment_method = $_POST['payment_method'] ?? $_POST['paymentMethod'] ?? 'GCash';
$sender_name = $_POST['sender_name'] ?? $_POST['senderName'] ?? null;

// Fallback: lookup latest pending invoice if invoice_id was not explicitly sent
if (empty($invoice_id) && !empty($user_id)) {
    $inv_stmt = $conn->prepare("SELECT id FROM invoices WHERE user_id = ? AND status IN ('pending', 'overdue') ORDER BY id DESC LIMIT 1");
    $inv_stmt->bind_param("i", $user_id);
    $inv_stmt->execute();
    $inv_res = $inv_stmt->get_result();
    if ($inv_row = $inv_res->fetch_assoc()) {
        $invoice_id = $inv_row['id'];
    }
    $inv_stmt->close();
}

if (empty($invoice_id)) {
    echo json_encode(["success" => false, "message" => "Invoice ID is required."]);
    exit;
}

$proof_path = null;
// Support both 'proof' and 'proofImage' file keys
$file_key = isset($_FILES['proofImage']) ? 'proofImage' : (isset($_FILES['proof']) ? 'proof' : null);

if ($file_key && $_FILES[$file_key]['error'] === UPLOAD_ERR_OK) {
    $upload_dir = '../uploads/payment_proofs/';
    if (!file_exists($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }
    
    $file_extension = strtolower(pathinfo($_FILES[$file_key]['name'], PATHINFO_EXTENSION));
    $file_name = 'proof_' . uniqid() . '.' . $file_extension;
    $target_file = $upload_dir . $file_name;
    
    if (move_uploaded_file($_FILES[$file_key]['tmp_name'], $target_file)) {
        $proof_path = 'uploads/payment_proofs/' . $file_name;
    }
}

$query = "UPDATE invoices SET payment_method = ?, payment_reference = ?, sender_name = ?, status = 'pending-verification'";
$params = [$payment_method, $payment_reference, $sender_name];
$types = "sss";

if ($proof_path) {
    $query .= ", proof_of_payment_path = ?";
    $params[] = $proof_path;
    $types .= "s";
}

$query .= " WHERE id = ?";
$params[] = $invoice_id;
$types .= "s";

$stmt = $conn->prepare($query);
$stmt->bind_param($types, ...$params);

if ($stmt->execute()) {
    echo json_encode([
        "success" => true, 
        "message" => "Payment proof and reference uploaded successfully.",
        "proof_path" => $proof_path
    ]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to update invoice payment details", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>