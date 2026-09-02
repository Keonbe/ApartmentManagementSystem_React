<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

ensure_notifications_audience_column($conn);
$input = json_decode(file_get_contents("php://input"), true);

if (!$input) {
    echo json_encode(["success" => false, "message" => "No data received"]);
    exit;
}

$incident_date = $input['incidentDate'] ?? '';
$incident_time = $input['incidentTime'] ?? '';
$location_details = $input['locationDetails'] ?? '';
$reason_request = $input['reasonRequest'] ?? '';
$user_id = $input['userId'] ?? $_SERVER['HTTP_X_USER_ID'] ?? null;

if (empty($incident_date) || empty($incident_time) || empty($location_details) || empty($reason_request) || empty($user_id)) {
    echo json_encode(["success" => false, "message" => "All fields are required."]);
    exit;
}

$stmt = $conn->prepare("INSERT INTO cctv_requests (user_id, incident_date, incident_time, location_details, reason_request) VALUES (?, ?, ?, ?, ?)");

$stmt->bind_param("issss", $user_id, $incident_date, $incident_time, $location_details, $reason_request);

if ($stmt->execute()) {
    // Notify Admin
    $notif_title = "New CCTV Request";
    $notif_msg = "A new CCTV footage request has been submitted for an incident at $location_details.";
    $notif_stmt = $conn->prepare("INSERT INTO notifications (user_id, type, audience, title, message, status, is_read) VALUES (?, 'cctv_request', 'admin', ?, ?, 'Pending', 0)");
    $notif_stmt->bind_param("iss", $user_id, $notif_title, $notif_msg);
    $notif_stmt->execute();
    $notif_stmt->close();

    echo json_encode(["success" => true, "message" => "CCTV request submitted successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to submit request", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>