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

if ($auth['role'] !== 'admin' && get_setting($conn, 'service_cctv_active', 'true') === 'false') {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "CCTV viewing request service is currently disabled by management."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$incident_date = trim($input['incidentDate'] ?? '');
$incident_time = trim($input['incidentTime'] ?? '');
$location_details = trim($input['locationDetails'] ?? '');
$reason_request = trim($input['reasonRequest'] ?? '');
$incident_type = $input['incidentType'] ?? '';

// Footage is released for incidents only: the tenant picks the location and
// what happened from the lists in Settings -> CCTV, and the admin reviews that
// against the reason. Footage is only kept for the configured window, so older
// dates cannot be requested (the form's min date).
const CCTV_OTHER_REASON_MIN = 20;
$cctv = cctv_settings($conn);
$incident_type_keys = array_column($cctv['incidentTypes'], 'key');

if ($incident_date === '' || $incident_time === '' || $location_details === '' || $reason_request === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "All fields are required."]);
    exit;
}

if (!in_array($location_details, $cctv['locations'], true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Please choose one of the listed camera locations.", "field" => "locationDetails"]);
    exit;
}

if (!is_string($incident_type) || !in_array($incident_type, $incident_type_keys, true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Please choose what kind of incident this is. Footage is released for incidents only.", "field" => "incidentType"]);
    exit;
}

if ($incident_type === 'other' && mb_strlen($reason_request) < CCTV_OTHER_REASON_MIN) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Please describe the incident in at least " . CCTV_OTHER_REASON_MIN . " characters.", "field" => "reasonRequest"]);
    exit;
}

if (mb_strlen($reason_request) < $cctv['minReasonLength']) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Please explain the reason in at least " . $cctv['minReasonLength'] . " characters.", "field" => "reasonRequest"]);
    exit;
}

// Footage shows other people: the tenant must agree to the Data Privacy terms
// on the form, and when they did is kept with the request (privacy_consent_at).
if (($input['privacyConsent'] ?? null) !== true) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Please agree to the data privacy terms to request footage.", "field" => "privacyConsent"]);
    exit;
}

$parsed_date = DateTime::createFromFormat('Y-m-d', $incident_date);
$today = (new DateTime('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
if (!$parsed_date || $parsed_date->format('Y-m-d') !== $incident_date || $incident_date > $today) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Incident date must be a valid date that is not in the future."]);
    exit;
}
$oldest = (new DateTime($today))->modify('-' . $cctv['lookbackDays'] . ' days')->format('Y-m-d');
if ($incident_date < $oldest) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Footage is only kept for about " . $cctv['lookbackDays'] . " days, so the incident must be on or after $oldest.", "field" => "incidentDate"]);
    exit;
}

if (strlen($location_details) > 50 || strlen($incident_time) > 50 || strlen($reason_request) > 1000) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Location and time must be 50 characters or fewer, and the reason 1000 or fewer."]);
    exit;
}

if (!get_active_tenancy($conn, $user_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Only tenants with an active rental can request CCTV footage."]);
    exit;
}

$stmt = $conn->prepare("INSERT INTO cctv_requests (user_id, incident_date, incident_time, location_details, incident_type, reason_request, privacy_consent_at) VALUES (?, ?, ?, ?, ?, ?, NOW())");
$stmt->bind_param("isssss", $user_id, $incident_date, $incident_time, $location_details, $incident_type, $reason_request);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to submit request."]);
    $stmt->close();
    exit;
}

$request_id = $stmt->insert_id;
$stmt->close();

notify_admins_queue($conn, 'cctv_request', $request_id, "New CCTV Request",
    "A new CCTV footage request has been submitted for an incident at $location_details.");

log_activity($conn, $user_id, 'service', "Submitted CCTV Request", "CCTV Request ID: $request_id ($incident_type) at $location_details on $incident_date");

echo json_encode(["success" => true, "message" => "CCTV request submitted successfully", "id" => $request_id]);
$conn->close();
