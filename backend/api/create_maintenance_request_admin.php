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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

$title = trim($_POST['title'] ?? '');
$category = normalize_maintenance_category($_POST['issueType'] ?? '');
$urgency = normalize_maintenance_urgency($_POST['priority'] ?? 'Medium');
$unit = trim($_POST['unit'] ?? '');
$description = trim($_POST['description'] ?? '');

if ($title === '' || $unit === '' || !$category || !$urgency) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Title, unit, and a valid category and priority are required."]);
    exit;
}

$stmt = $conn->prepare("SELECT id FROM rooms WHERE id = ?");
$stmt->bind_param("s", $unit);
$stmt->execute();
$room = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$room) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Unit $unit does not exist."]);
    exit;
}

// The ticket belongs to the unit's current occupant, if any.
$user_id = null;
$stmt = $conn->prepare("SELECT user_id FROM rent_applications
                        WHERE room_name = ? AND status IN ('Approved', 'active', 'pending-move-out')
                        ORDER BY id DESC LIMIT 1");
$stmt->bind_param("s", $unit);
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $user_id = (int)$row['user_id'];
}
$stmt->close();

[$attachment_path, $upload_error] = store_maintenance_attachment($_FILES['photo'] ?? null);
if ($upload_error) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => $upload_error]);
    exit;
}

$preferred_date = date('Y-m-d');
$preferred_time = 'morning';

$stmt = $conn->prepare("
    INSERT INTO maintenance_requests
    (user_id, title, issue_category, urgency, preferred_date, preferred_time, description, permission_to_enter, attachment_path, status, room_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'Pending', ?)
");
$stmt->bind_param("issssssss", $user_id, $title, $category, $urgency, $preferred_date, $preferred_time, $description, $attachment_path, $unit);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to create maintenance request."]);
    $stmt->close();
    exit;
}

$inserted_id = $stmt->insert_id;
$stmt->close();

log_activity($conn, $admin_id, 'maintenance', "Created Maintenance Ticket #$inserted_id", "Issue: $category ($urgency), Unit: $unit");

echo json_encode([
    "success" => true,
    "message" => "Maintenance request created successfully",
    "id" => $inserted_id,
    "attachment_path" => $attachment_path
]);
$conn->close();
