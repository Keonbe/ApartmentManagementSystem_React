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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

$auth = require_user($conn);
$user_id = $auth['id'];

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$incident_date = trim($input['incidentDate'] ?? '');
$incident_time = trim($input['incidentTime'] ?? '');
$location_details = trim($input['locationDetails'] ?? '');
$reason_request = trim($input['reasonRequest'] ?? '');

if ($incident_date === '' || $incident_time === '' || $location_details === '' || $reason_request === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "All fields are required."]);
    exit;
}

$parsed_date = DateTime::createFromFormat('Y-m-d', $incident_date);
$today = (new DateTime('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
if (!$parsed_date || $parsed_date->format('Y-m-d') !== $incident_date || $incident_date > $today) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Incident date must be a valid date that is not in the future."]);
    exit;
}

if (strlen($location_details) > 50 || strlen($incident_time) > 50 || strlen($reason_request) > 1000) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Location and time must be 50 characters or fewer, and the reason 1000 or fewer."]);
    exit;
}

if (!get_active_tenancy($conn, $user_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Only tenants with an active lease can request CCTV footage."]);
    exit;
}

$stmt = $conn->prepare("INSERT INTO cctv_requests (user_id, incident_date, incident_time, location_details, reason_request) VALUES (?, ?, ?, ?, ?)");
$stmt->bind_param("issss", $user_id, $incident_date, $incident_time, $location_details, $reason_request);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to submit request."]);
    $stmt->close();
    exit;
}

$request_id = $stmt->insert_id;
$stmt->close();

$admin_row = $conn->query("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")->fetch_assoc();
if ($admin_row) {
    $notif_admin_id = (int)$admin_row['id'];
    $notif_title = "New CCTV Request";
    $notif_msg = "A new CCTV footage request has been submitted for an incident at $location_details.";
    $notif_stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, 'cctv_request', ?, ?, 'Pending', 0)");
    $notif_stmt->bind_param("iss", $notif_admin_id, $notif_title, $notif_msg);
    $notif_stmt->execute();
    $notif_stmt->close();
}

log_activity($conn, $user_id, 'service', "Submitted CCTV Request", "CCTV Request ID: $request_id at $location_details on $incident_date");

echo json_encode(["success" => true, "message" => "CCTV request submitted successfully", "id" => $request_id]);
$conn->close();
