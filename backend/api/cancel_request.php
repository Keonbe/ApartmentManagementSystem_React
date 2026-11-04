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

// An approved booking: free to cancel until SERVICE_FREE_CANCEL_HOURS before the confirmed
// visit; after that (and once work has started) the tenant asks and the admin decides.
if ($affected === 0 && $type === 'Service') {
    $stmt = $conn->prepare("SELECT status, scheduled_date, scheduled_window, cancel_requested_at, is_invoiced, service_name FROM service_requests WHERE id = ? AND user_id = ?");
    $stmt->bind_param("ii", $id, $user_id);
    $stmt->execute();
    $booking = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($booking && !(int)$booking['is_invoiced']) {
        if ($booking['status'] === 'Approved' && service_cancel_is_free('Approved', $booking['scheduled_date'], $booking['scheduled_window'])) {
            $stmt = $conn->prepare("UPDATE service_requests SET status = 'Cancelled', cancel_requested_at = NULL WHERE id = ? AND user_id = ? AND status = 'Approved'");
            $stmt->bind_param("ii", $id, $user_id);
            $stmt->execute();
            $affected = $stmt->affected_rows;
            $stmt->close();
        } elseif (in_array($booking['status'], ['Approved', 'In Progress'], true) && $booking['cancel_requested_at'] === null) {
            $stmt = $conn->prepare("UPDATE service_requests SET cancel_requested_at = NOW() WHERE id = ? AND user_id = ? AND status = ? AND cancel_requested_at IS NULL");
            $stmt->bind_param("iis", $id, $user_id, $booking['status']);
            $stmt->execute();
            $asked = $stmt->affected_rows;
            $stmt->close();
            if ($asked > 0) {
                notify_admins_queue($conn, 'service_request', $id, "Tenant asks to cancel a booking",
                    "The tenant asked to cancel service booking #$id (\"{$booking['service_name']}\"). Open it to cancel or decline.");
                log_activity($conn, $user_id, 'service', "Requested Service Cancellation", "Service Request ID: $id, cancellation requested by tenant");
                echo json_encode(["success" => true, "requested" => true, "message" => "We told management you want to cancel. They will confirm because the visit is close or already started."]);
                $conn->close();
                exit;
            }
        }
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

if ($type === 'Service') {
    $stmt = $conn->prepare("SELECT service_name FROM service_requests WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $cancelled = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $service_label = $cancelled['service_name'] ?? 'service';
    create_notification($conn, $user_id, 'service_status', "Service Booking Cancelled", "Your \"$service_label\" booking has been cancelled.");
    notify_admins_info($conn, 'info', "Service booking cancelled", "A tenant cancelled service booking #$id (\"$service_label\").");
}

log_activity($conn, $user_id, $type === 'Maintenance' ? 'maintenance' : 'service', "Cancelled $type Request", "$type Request ID: $id cancelled by tenant");

echo json_encode(["success" => true, "message" => "Request cancelled successfully."]);
$conn->close();
