<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$input = json_decode(file_get_contents("php://input"), true);
$notification_id = $input['notificationId'] ?? null;
$user_id = $input['userId'] ?? null;
$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;

$is_admin = verify_admin($conn, $admin_id);

try {
    if ($notification_id) {
        // Mark a single notification as read
        $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE id = ?");
        $stmt->bind_param("i", $notification_id);
    } else if ($is_admin) {
        // ADMIN BULK ACTION: Mark ALL notifications as read across the system
        $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0");
    } else if ($user_id) {
        // TENANT BULK ACTION: Mark all notifications for this specific user as read
        $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0");
        $stmt->bind_param("i", $user_id);
    } else {
        echo json_encode(["success" => false, "message" => "Missing parameters."]);
        exit();
    }

    if ($stmt->execute()) {
        echo json_encode(["success" => true, "message" => "Notifications marked as read."]);
    } else {
        echo json_encode(["success" => false, "message" => "Failed to update status."]);
    }
    $stmt->close();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Server error: " . $e->getMessage()]);
}

$conn->close();
?>