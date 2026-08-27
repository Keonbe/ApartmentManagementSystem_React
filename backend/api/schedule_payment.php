<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
if (!$user_id) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$invoice_id = $data['invoice_id'] ?? null;
$scheduled_date = $data['scheduled_date'] ?? null;
$scheduled_time_slot = $data['scheduled_time_slot'] ?? null;

if (!$invoice_id || !$scheduled_date || !$scheduled_time_slot) {
    echo json_encode(["success" => false, "message" => "Missing required fields"]);
    exit;
}

$stmt = $conn->prepare("SELECT id, status FROM invoices WHERE id = ? AND user_id = ?");
$stmt->bind_param("si", $invoice_id, $user_id);
$stmt->execute();
$res = $stmt->get_result();

if ($res->num_rows === 0) {
    echo json_encode(["success" => false, "message" => "Invoice not found or access denied"]);
    exit;
}

$row = $res->fetch_assoc();
if (in_array($row['status'], ['paid', 'processing'])) {
    echo json_encode(["success" => false, "message" => "Cannot schedule payment for this invoice status"]);
    exit;
}

$update = $conn->prepare("UPDATE invoices SET status = 'scheduled', scheduled_date = ?, scheduled_time_slot = ?, payment_gateway = 'in_person' WHERE id = ?");
$update->bind_param("sss", $scheduled_date, $scheduled_time_slot, $invoice_id);

if ($update->execute()) {
    echo json_encode(["success" => true, "message" => "Payment scheduled successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to schedule payment"]);
}
$conn->close();
?>
