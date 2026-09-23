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

$category = normalize_maintenance_category($_POST['issueType'] ?? '');
// Priority is an admin call, not a tenant self-declaration — any urgency the
// client sends is ignored. Every new ticket starts as "Needs Triage" and only
// an admin can assign a real priority via update_maintenance_status.php.
$urgency = MAINTENANCE_DEFAULT_URGENCY;
$preferred_date = $_POST['preferredDate'] ?? '';
$preferred_time = strtolower(trim($_POST['preferredTime'] ?? ''));
$description = trim($_POST['description'] ?? '');
$permission_to_enter = !empty($_POST['permissionToEnter']) ? 1 : 0;

if (!$category || $preferred_date === '' || $preferred_time === '' || $description === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Please fill in all required fields with a valid category."]);
    exit;
}

$parsed_date = DateTime::createFromFormat('Y-m-d', $preferred_date);
$today = (new DateTime('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
if (!$parsed_date || $parsed_date->format('Y-m-d') !== $preferred_date || $preferred_date < $today) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Preferred date must be a valid date from today onward."]);
    exit;
}

if (!in_array($preferred_time, ['morning', 'afternoon'], true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Preferred time must be morning or afternoon."]);
    exit;
}

$tenancy = get_active_tenancy($conn, $user_id);
if (!$tenancy) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Only tenants with an active lease can submit maintenance requests."]);
    exit;
}

[$attachment_path, $upload_error] = store_maintenance_attachment($_FILES['uploadedFile'] ?? null);
if ($upload_error) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => $upload_error]);
    exit;
}

$room_name = $tenancy['room_name'];
$stmt = $conn->prepare("INSERT INTO maintenance_requests (user_id, issue_category, urgency, preferred_date, preferred_time, description, permission_to_enter, attachment_path, room_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
$stmt->bind_param("isssssiss", $user_id, $category, $urgency, $preferred_date, $preferred_time, $description, $permission_to_enter, $attachment_path, $room_name);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to submit request."]);
    $stmt->close();
    exit;
}

$request_id = $stmt->insert_id;
$stmt->close();

notify_admins_queue($conn, 'maintenance_request', $request_id, "New Maintenance Request",
    "A new maintenance request ($category - $urgency) has been submitted for Unit $room_name.");

log_activity($conn, $user_id, 'maintenance', "Submitted Maintenance Request #$request_id", "Issue: $category ($urgency), Unit: $room_name");

echo json_encode(["success" => true, "message" => "Maintenance request submitted successfully", "id" => $request_id]);
$conn->close();
