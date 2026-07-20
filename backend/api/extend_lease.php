<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

try {
    $input = json_decode(file_get_contents("php://input"), true);
    $email = $input['email'] ?? '';
    $additionalMonths = (int)($input['additionalMonths'] ?? 1);

    if (empty($email)) {
        throw new Exception("Invalid parameter data.");
    }

    $userQuery = $conn->prepare("SELECT u.id, u.first_name, u.last_name, ra.room_name FROM users u LEFT JOIN rent_applications ra ON ra.user_id = u.id WHERE u.email_address = ?");
    $userQuery->bind_param("s", $email);
    $userQuery->execute();
    $user = $userQuery->get_result()->fetch_assoc();
    $userQuery->close();

    if ($user) {
        $userId = $user['id'];
        $tenantName = $user['first_name'] . ' ' . $user['last_name'];
        $roomName = $user['room_name'] ?? 'Unassigned';

        $title = "Lease Extension Request";
        $msg = "$tenantName (Unit $roomName) requested a $additionalMonths month(s) lease extension.";

        $stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, metadata_value, status, is_read) VALUES (?, 'lease_extension_request', ?, ?, ?, 'Pending', 0)");
        
        if (!$stmt) {
            throw new Exception("Database prepare failed: " . $conn->error);
        }

        $stmt->bind_param("isss", $userId, $title, $msg, $additionalMonths);

        if ($stmt->execute()) {
            echo json_encode(["success" => true, "message" => "Lease extension request submitted for admin verification."]);
        } else {
            throw new Exception("Failed to save extension request.");
        }
        $stmt->close();
    } else {
        throw new Exception("User not found.");
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}
$conn->close();
?>