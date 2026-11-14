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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

$auth = require_user($conn);
$user_id = $auth['id'];

$input = read_json_input();
$id = (int)($input['id'] ?? 0);
$reason = trim((string)($input['reason'] ?? ''));

if (!$id) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Request ID is required."]);
    exit;
}
if ($reason === '' || mb_strlen($reason) > 255) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Tell us what is still wrong (up to 255 characters)."]);
    exit;
}

$stmt = $conn->prepare("SELECT status, resolved_at, is_invoiced, title, issue_category, room_name FROM maintenance_requests WHERE id = ? AND user_id = ?");
$stmt->bind_param("ii", $id, $user_id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$row) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Maintenance request not found."]);
    exit;
}
if ($row['status'] !== 'Completed') {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Only a completed repair can be reported as not fixed."]);
    exit;
}
if ($row['resolved_at'] && strtotime($row['resolved_at']) < strtotime('-' . MAINTENANCE_REOPEN_DAYS . ' days')) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This repair was completed more than " . MAINTENANCE_REOPEN_DAYS . " days ago. Please submit a new request."]);
    exit;
}
if ((int)$row['is_invoiced']) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This repair is already on your invoice. Contact the office to dispute it."]);
    exit;
}

// Guarded on the status we read so a double tap or a concurrent admin change can't reopen twice.
$stmt = $conn->prepare("UPDATE maintenance_requests SET status = 'In Progress', resolved_at = NULL, reopen_reason = ?, cancel_requested_at = NULL WHERE id = ? AND user_id = ? AND status = 'Completed' AND is_invoiced = 0");
$stmt->bind_param("sii", $reason, $id, $user_id);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

if ($affected === 0) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This request just changed. Refresh and try again."]);
    exit;
}

$label = $row['title'] ?: $row['issue_category'];
notify_admins_queue($conn, 'maintenance_request', $id, "Repair reported as not fixed",
    "Unit {$row['room_name']} says \"$label\" is not fixed: $reason");
log_activity($conn, $user_id, 'maintenance', "Reopened Maintenance Request #$id", "Tenant reported the repair as not fixed: $reason");

echo json_encode(["success" => true, "message" => "We reopened your request and told management."]);
$conn->close();
