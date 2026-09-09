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
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$rawId = $input['rawId'] ?? $input['id'] ?? null;
$status = $input['status'] ?? null;

if (!$rawId || !in_array($status, ['Assigned', 'Approved', 'Rejected', 'Pending'])) {
    echo json_encode(["success" => false, "message" => "Invalid parameters."]);
    exit;
}

// ── Slot Capacity Re-check (admin-configurable) ──
if ($status === 'Assigned' || $status === 'Approved') {
    $max_slots = 3;
    $max_slots_stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'max_parking_slots'");
    $max_slots_stmt->execute();
    $max_slots_row = $max_slots_stmt->get_result()->fetch_assoc();
    $max_slots_stmt->close();
    if ($max_slots_row && is_numeric($max_slots_row['setting_value'])) {
        $max_slots = (int)$max_slots_row['setting_value'];
    }

    $occupied_stmt = $conn->prepare("SELECT COUNT(*) AS occupied FROM parking_reservations WHERE status IN ('Pending', 'Assigned', 'Approved', 'Active') AND id != ?");
    $occupied_stmt->bind_param("i", $rawId);
    $occupied_stmt->execute();
    $occupied_count = (int)$occupied_stmt->get_result()->fetch_assoc()['occupied'];
    $occupied_stmt->close();

    if ($occupied_count >= $max_slots) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "Cannot approve — parking slot capacity ($max_slots) already reached."]);
        exit;
    }
}

try {
    $stmt = $conn->prepare("UPDATE parking_reservations SET status = ? WHERE id = ?");
    $stmt->bind_param("si", $status, $rawId);
    $stmt->execute();
    $stmt->close();

    // Get reservation details for notification & logging
    $infoStmt = $conn->prepare("SELECT user_id, vehicle_model, plate_number FROM parking_reservations WHERE id = ?");
    $infoStmt->bind_param("i", $rawId);
    $infoStmt->execute();
    $parking = $infoStmt->get_result()->fetch_assoc();
    $infoStmt->close();

    if ($parking) {
        $userId = $parking['user_id'];
        $notifTitle = ($status === 'Assigned' || $status === 'Approved') ? "Parking Slot Assigned" : "Parking Request " . $status;
        $notifMsg = "Your parking reservation request for " . $parking['vehicle_model'] . " (" . $parking['plate_number'] . ") has been " . strtolower($status) . ".";
        
        $notifStmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, 'parking_reservation', ?, ?, 'Resolved', 0)");
        $notifStmt->bind_param("iss", $userId, $notifTitle, $notifMsg);
        $notifStmt->execute();
        $notifStmt->close();
    }

    log_activity($conn, $admin_id, 'service', "Updated Parking Status", "Parking Reservation ID: $rawId status set to $status");

    echo json_encode(["success" => true, "message" => "Parking reservation status updated successfully."]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>