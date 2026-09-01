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

if ($status === 'Completed') {
    $stmt = $conn->prepare("UPDATE maintenance_requests SET status = ?, assigned_to = ?, estimated_cost = ?, work_notes = ?, tenant_responsible = ?, resolved_at = COALESCE(resolved_at, NOW()) WHERE id = ?");
    $stmt->bind_param("ssdsii", $status, $assigned_to, $estimated_cost, $work_notes, $tenant_responsible, $id);
} else {
    $stmt = $conn->prepare("UPDATE maintenance_requests SET status = ?, assigned_to = ?, estimated_cost = ?, work_notes = ?, tenant_responsible = ?, resolved_at = NULL WHERE id = ?");
    $stmt->bind_param("ssdsii", $status, $assigned_to, $estimated_cost, $work_notes, $tenant_responsible, $id);
}

if ($stmt->execute()) {
    log_activity($conn, $admin_id, 'maintenance', "Updated Maintenance Ticket #$id", "Status: $status, Assigned: $assigned_to");

    // Fetch tenant user_id
    $u_stmt = $conn->prepare("SELECT user_id, issue_category FROM maintenance_requests WHERE id = ?");
    $u_stmt->bind_param("i", $id);
    $u_stmt->execute();
    $u_res = $u_stmt->get_result()->fetch_assoc();
    $u_stmt->close();
    
    if ($u_res) {
        $tenant_id = $u_res['user_id'];
        $issue = $u_res['issue_category'];
        
        $notif_title = "Maintenance Update";
        $notif_msg = "Your maintenance request for $issue is now: $status.";
        $notif_stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, 'maintenance_update', ?, ?, 'Resolved', 0)");
        $notif_stmt->bind_param("iss", $tenant_id, $notif_title, $notif_msg);
        $notif_stmt->execute();
        $notif_stmt->close();
    }

    echo json_encode(["success" => true, "message" => "Maintenance ticket updated successfully."]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to update maintenance ticket", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
