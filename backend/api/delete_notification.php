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
        // Delete a single notification
        $stmt = $conn->prepare("DELETE FROM notifications WHERE id = ?");
        $stmt->bind_param("i", $notification_id);
    } else if ($is_admin) {
        // ADMIN BULK ACTION: Clear ALL non-pending notifications
        // (Preserves 'Pending' verification requests so active requests aren't lost)
        $stmt = $conn->prepare("DELETE FROM notifications WHERE status != 'Pending'");
    } else if ($user_id) {
        // TENANT BULK ACTION: Delete all notifications for this user
        $stmt = $conn->prepare("DELETE FROM notifications WHERE user_id = ? AND status != 'Pending'");
        $stmt->bind_param("i", $user_id);
    } else {
        echo json_encode(["success" => false, "message" => "Missing parameters."]);
        exit();
    }

    if ($stmt->execute()) {
        echo json_encode(["success" => true, "message" => "Notifications cleared."]);
    } else {
        echo json_encode(["success" => false, "message" => "Failed to delete notifications."]);
    }
    $stmt->close();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Server error: " . $e->getMessage()]);
}

$conn->close();
?>