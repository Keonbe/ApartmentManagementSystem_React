<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$input = json_decode(file_get_contents("php://input"), true);
$email = $input['email'] ?? '';
$occupants = (int)($input['occupants'] ?? 0);

if (empty($email) || $occupants < 1) {
    echo json_encode(["success" => false, "message" => "Email and a valid occupant count are required."]);
    exit;
}

// Fetch current active occupancy count from rent_applications
$userQuery = $conn->prepare("
    SELECT u.id, u.first_name, u.last_name, ra.room_name, ra.occupants as current_occupants 
    FROM users u 
    LEFT JOIN rent_applications ra ON ra.user_id = u.id AND ra.status = 'Approved'
    WHERE u.email_address = ?
");
$userQuery->bind_param("s", $email);
$userQuery->execute();
$user = $userQuery->get_result()->fetch_assoc();
$userQuery->close();

if ($user) {
    $userId = $user['id'];
    $tenantName = $user['first_name'] . ' ' . $user['last_name'];
    $roomName = $user['room_name'] ?? 'Unassigned';
    $currentOccupants = (int)($user['current_occupants'] ?? 0);

    // SERVER-SIDE VALIDATION: Rejects request if new occupants equals current count
    if ($occupants === $currentOccupants) {
        echo json_encode([
            "success" => false, 
            "message" => "Your room is already registered with $occupants occupant(s)."
        ]);
        exit;
    }

    // Cooldown check for pending requests within 24 hours
    $checkStmt = $conn->prepare("
        SELECT id FROM notifications 
        WHERE user_id = ? AND type = 'occupancy_request' AND status = 'Pending' 
        AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    ");
    $checkStmt->bind_param("i", $userId);
    $checkStmt->execute();
    $hasRecent = $checkStmt->get_result()->num_rows > 0;
    $checkStmt->close();

    if ($hasRecent) {
        echo json_encode([
            "success" => false, 
            "message" => "You have already submitted an occupancy request within the last 24 hours. Please wait for admin approval."
        ]);
        exit;
    }

    // Insert pending request notification for admin
    $title = "Occupancy Change Request";
    $msg = "$tenantName (Unit $roomName) requested to change room occupants to $occupants.";

    $stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, metadata_value, status, is_read) VALUES (?, 'occupancy_request', ?, ?, ?, 'Pending', 0)");
    $stmt->bind_param("isss", $userId, $title, $msg, $occupants);
    
    if ($stmt->execute()) {
        echo json_encode(["success" => true, "message" => "Occupancy update request submitted for admin review."]);
    } else {
        echo json_encode(["success" => false, "message" => "Failed to submit request."]);
    }
    $stmt->close();
} else {
    echo json_encode(["success" => false, "message" => "User record not found."]);
}

$conn->close();
?>