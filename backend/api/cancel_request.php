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

// Repair work already under way can't just vanish: the tenant asks, the admin
// (who may have a technician or a part on order) cancels or declines.
if ($affected === 0 && $type === 'Maintenance') {
    $stmt = $conn->prepare("UPDATE maintenance_requests SET cancel_requested_at = NOW() WHERE id = ? AND user_id = ? AND status = 'In Progress' AND cancel_requested_at IS NULL");
    $stmt->bind_param("ii", $id, $user_id);
    $stmt->execute();
    $asked = $stmt->affected_rows;
    $stmt->close();
    if ($asked > 0) {
        notify_admins_queue($conn, 'maintenance_request', $id, "Tenant asks to cancel maintenance",
            "The tenant asked to cancel maintenance request #$id while work is in progress. Open it to cancel or decline.");
        log_activity($conn, $user_id, 'maintenance', "Requested Maintenance Cancellation", "Maintenance Request ID: $id, cancellation requested by tenant");
        echo json_encode(["success" => true, "requested" => true, "message" => "We told management you want to cancel. They will confirm because work has already started."]);
        $conn->close();
        exit;
    }
}

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
