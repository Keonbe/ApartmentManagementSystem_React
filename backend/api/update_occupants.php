<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// This queues an occupancy-change request that, on admin approval, alters
// the tenant's billed rent — it must always be filed as the caller's own
// verified identity, never a client-supplied email.
$auth = require_user($conn);

$input = json_decode(file_get_contents("php://input"), true);
$occupants = (int)($input['occupants'] ?? 0);

if ($occupants < 1) {
    echo json_encode(["success" => false, "message" => "A valid occupant count is required."]);
    exit;
}

// Fetch current active occupancy count from rent_applications
$userQuery = $conn->prepare("
    SELECT u.id, u.first_name, u.last_name, ra.room_name, ra.occupants as current_occupants
    FROM users u
    LEFT JOIN rent_applications ra ON ra.user_id = u.id AND ra.status IN ('Approved', 'active', 'pending-move-out')
    WHERE u.id = ?
");
$userQuery->bind_param("i", $auth['id']);
$userQuery->execute();
$user = $userQuery->get_result()->fetch_assoc();
$userQuery->close();

if ($user && $user['room_name']) {
    $userId = $user['id'];
    $tenantName = $user['first_name'] . ' ' . $user['last_name'];
    $roomName = $user['room_name'];
    $currentOccupants = (int)($user['current_occupants'] ?? 0);

    // SERVER-SIDE VALIDATION: Rejects request if new occupants equals current count
    if ($occupants === $currentOccupants) {
        echo json_encode([
            "success" => false,
            "message" => "Your room is already registered with $occupants occupant(s)."
        ]);
        exit;
    }

    // Any still-open request blocks a new one, regardless of age — a request
    // pending for more than 24 hours used to stop blocking, letting a tenant
    // stack multiple independently-approvable occupancy changes.
    $checkStmt = $conn->prepare("
        SELECT id FROM notifications
        WHERE user_id = ? AND type = 'occupancy_request' AND status = 'Pending'
    ");
    $checkStmt->bind_param("i", $userId);
    $checkStmt->execute();
    $hasRecent = $checkStmt->get_result()->num_rows > 0;
    $checkStmt->close();

    if ($hasRecent) {
        echo json_encode([
            "success" => false,
            "message" => "You have already submitted an occupancy request. Please wait for admin approval."
        ]);
        exit;
    }

    // Insert pending request notification for admin
    $title = "Occupancy Change Request";
    $msg = "$tenantName (Unit $roomName) requested to change room occupants to $occupants.";

    $stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, metadata_value, status, is_read) VALUES (?, 'occupancy_request', ?, ?, ?, 'Pending', 0)");
    $stmt->bind_param("isss", $userId, $title, $msg, $occupants);
    
    if ($stmt->execute()) {
        log_activity($conn, $userId, 'tenant', "Requested Occupancy Change", "Unit $roomName: $occupants occupant(s)");
        echo json_encode(["success" => true, "message" => "Occupancy update request submitted for admin review."]);
    } else {
        echo json_encode(["success" => false, "message" => "Failed to submit request."]);
    }
    $stmt->close();
} else {
    echo json_encode(["success" => false, "message" => "No active room assignment found for this account."]);
}

$conn->close();
?>