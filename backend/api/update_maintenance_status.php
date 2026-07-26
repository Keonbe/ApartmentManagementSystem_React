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
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['id'] ?? null;
$status = $input['status'] ?? null;
$assigned_to = $input['assignedTo'] ?? null;
$estimated_cost = isset($input['estimatedCost']) ? (float)$input['estimatedCost'] : null;
$work_notes = $input['workNotes'] ?? null;
$tenant_responsible = isset($input['tenantResponsible']) ? ((bool)$input['tenantResponsible'] ? 1 : 0) : 0;

if (!$id || !$status) {
    echo json_encode(["success" => false, "message" => "Request ID and status are required."]);
    exit;
}

$stmt = $conn->prepare("UPDATE maintenance_requests SET status = ?, assigned_to = ?, estimated_cost = ?, work_notes = ?, tenant_responsible = ? WHERE id = ?");
$stmt->bind_param("ssdsii", $status, $assigned_to, $estimated_cost, $work_notes, $tenant_responsible, $id);

if ($stmt->execute()) {
    log_activity($conn, $admin_id, 'maintenance', "Updated Maintenance Ticket #$id", "Status: $status, Assigned: $assigned_to");
    echo json_encode(["success" => true, "message" => "Maintenance ticket updated successfully."]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to update maintenance ticket", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
