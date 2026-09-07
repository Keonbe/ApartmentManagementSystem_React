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

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}
$admin_id = (int)$admin_id;

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$id = (int)($input['rawId'] ?? $input['id'] ?? 0);

if (!$id) {
    echo json_encode(["success" => false, "message" => "Service request ID is required."]);
    exit;
}

//RetryPathForARequestThatCompletedWhileTheTenantHadNoActiveLease.
//Billing Only Ever Applies To Delivered Work.
$stmt = $conn->prepare("SELECT status, is_invoiced FROM service_requests WHERE id = ?");
$stmt->bind_param("i", $id);
$stmt->execute();
$request = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$request) {
    echo json_encode(["success" => false, "message" => "Service request not found."]);
    exit;
}

if ($request['status'] !== 'Completed') {
    echo json_encode(["success" => false, "message" => "Only completed service requests can be billed."]);
    exit;
}

if ((int)$request['is_invoiced']) {
    echo json_encode(["success" => false, "message" => "This service request has already been billed."]);
    exit;
}

$charge = post_service_charge($conn, $id);

if ($charge['ok']) {
    log_activity($conn, $admin_id, 'service', "Posted Service Charge", "Service Request ID: $id billed to invoice " . ($charge['invoice_id'] ?? 'n/a'));
}

echo json_encode([
    "success" => $charge['ok'],
    "message" => $charge['message'],
    "invoiceId" => $charge['invoice_id']
]);

$conn->close();
?>
