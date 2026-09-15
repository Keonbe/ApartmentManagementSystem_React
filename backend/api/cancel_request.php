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

$auth = require_user($conn);
$user_id = $auth['id'];

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$id   = (int)($input['id'] ?? $input['rawId'] ?? 0);
$type = $input['type'] ?? '';

if (!$id || !$type) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Request ID and type are required."]);
    exit;
}

$tables = [
    'Maintenance' => 'maintenance_requests',
    'CCTV' => 'cctv_requests',
    'Parking' => 'parking_reservations',
    'Service' => 'service_requests',
];

if (!isset($tables[$type])) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Unknown request type: $type"]);
    exit;
}
$table = $tables[$type];

// Only Pending rows may be cancelled, and only by their owner — so a billed booking can never reach here.
$stmt = $conn->prepare("UPDATE `$table` SET status = 'Cancelled' WHERE id = ? AND user_id = ? AND status = 'Pending'");
$stmt->bind_param("ii", $id, $user_id);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

if ($affected === 0) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Only your own pending requests can be cancelled."]);
    $conn->close();
    exit;
}

// A cancelled request no longer needs the admin's attention, whatever its type.
// Only service bookings used to be cleared from the admin bell.
$queue_types = [
    'Maintenance' => 'maintenance_request',
    'CCTV' => 'cctv_request',
    'Parking' => 'parking_reservation',
    'Service' => 'service_request',
];
resolve_admin_queue($conn, $queue_types[$type], $id);

log_activity($conn, $user_id, $type === 'Maintenance' ? 'maintenance' : 'service', "Cancelled $type Request", "$type Request ID: $id cancelled by tenant");

echo json_encode(["success" => true, "message" => "Request cancelled successfully."]);
$conn->close();
