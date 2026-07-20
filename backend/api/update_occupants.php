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
    echo json_encode(["success" => false, "message" => "Invalid parameter data."]);
    exit;
}

// Find user ID and Admin IDs to notify
$userQuery = $conn->prepare("SELECT u.id, u.first_name, u.last_name, ra.room_name FROM users u LEFT JOIN rent_applications ra ON ra.user_id = u.id WHERE u.email_address = ?");
$userQuery->bind_param("s", $email);
$userQuery->execute();
$user = $userQuery->get_result()->fetch_assoc();
$userQuery->close();

if ($user) {
    $userId = $user['id'];
    $tenantName = $user['first_name'] . ' ' . $user['last_name'];
    $roomName = $user['room_name'] ?? 'Unassigned';
    
    $title = "Occupancy Change Request";
    $msg = "$tenantName (Unit $roomName) requested to change room occupants to $occupants.";

    // Insert pending approval notification for admin system
    $stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, metadata_value, status, is_read) VALUES (?, 'occupancy_request', ?, ?, ?, 'Pending', 0)");
    $stmt->bind_param("isss", $userId, $title, $msg, $occupants);
    
    if ($stmt->execute()) {
        echo json_encode(["success" => true, "message" => "Occupancy update request submitted for admin review."]);
    } else {
        echo json_encode(["success" => false, "message" => "Failed to submit request."]);
    }
    $stmt->close();
} else {
    echo json_encode(["success" => false, "message" => "User not found."]);
}
$conn->close();
?>