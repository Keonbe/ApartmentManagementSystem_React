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

$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$id = (int)($input['id'] ?? 0);

if (!$id) {
    echo json_encode(["success" => false, "message" => "Maintenance request ID is required."]);
    exit;
}

// RetryPathForATicketCompletedWhileTheTenantHadNoActiveLease.
// Billing Only Ever Applies To Completed, Tenant-Responsible Work.
$stmt = $conn->prepare("SELECT status, tenant_responsible, is_invoiced FROM maintenance_requests WHERE id = ?");
$stmt->bind_param("i", $id);
$stmt->execute();
$request = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$request) {
    echo json_encode(["success" => false, "message" => "Maintenance request not found."]);
    exit;
}

if ($request['status'] !== 'Completed') {
    echo json_encode(["success" => false, "message" => "Only completed maintenance requests can be billed."]);
    exit;
}

if (!(int)$request['tenant_responsible']) {
    echo json_encode(["success" => false, "message" => "This request is not flagged as tenant-responsible."]);
    exit;
}

if ((int)$request['is_invoiced']) {
    echo json_encode(["success" => false, "message" => "This maintenance request has already been billed."]);
    exit;
}

$charge = post_invoice_charge($conn, 'maintenance', $id);

if ($charge['ok']) {
    log_activity($conn, $admin_id, 'billing', "Posted Maintenance Charge", "Maintenance Ticket #$id billed to invoice " . ($charge['invoice_id'] ?? 'n/a'));
}

echo json_encode([
    "success" => $charge['ok'],
    "message" => $charge['message'],
    "invoiceId" => $charge['invoice_id']
]);

$conn->close();
?>
