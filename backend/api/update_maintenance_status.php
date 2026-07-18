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

$input = json_decode(file_get_contents("php://input"), true);
$id            = $input['id'] ?? null;
$status        = $input['status'] ?? null;
$assigned_to   = $input['assignedTo'] ?? null;
$estimated_cost = isset($input['estimatedCost']) ? (float)$input['estimatedCost'] : null;
$work_notes    = $input['workNotes'] ?? null;
$tenant_responsible = isset($input['tenantResponsible']) ? (int)$input['tenantResponsible'] : null;

if (!$id) {
    echo json_encode(["success" => false, "message" => "Maintenance request ID is required"]);
    exit;
}

// Build dynamic SET clause based on what was provided
$sets = [];
$params = [];
$types = '';

if ($status !== null) {
    $sets[] = "status = ?";
    $params[] = $status;
    $types .= 's';
}
if ($assigned_to !== null) {
    $sets[] = "assigned_to = ?";
    $params[] = $assigned_to;
    $types .= 's';
}
if ($estimated_cost !== null) {
    $sets[] = "estimated_cost = ?";
    $params[] = $estimated_cost;
    $types .= 'd';
}
if ($work_notes !== null) {
    $sets[] = "work_notes = ?";
    $params[] = $work_notes;
    $types .= 's';
}
if ($tenant_responsible !== null) {
    $sets[] = "tenant_responsible = ?";
    $params[] = $tenant_responsible;
    $types .= 'i';
}

if (empty($sets)) {
    echo json_encode(["success" => false, "message" => "No fields to update"]);
    exit;
}

$params[] = $id;
$types .= 'i';

$sql = "UPDATE maintenance_requests SET " . implode(', ', $sets) . " WHERE id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param($types, ...$params);

if ($stmt->execute()) {
    $action = $status ? "Updated Maintenance Status to $status" : "Updated Maintenance Details";
    log_activity($conn, $admin_id, 'maintenance', $action, "Request ID: $id");
    echo json_encode(["success" => true, "message" => "Maintenance request updated successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to update: " . $stmt->error]);
}

$stmt->close();
$conn->close();
?>
