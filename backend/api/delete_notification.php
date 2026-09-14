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

// Same scoping as mark_notification_read.php. A single id used to be deleted
// with no check (even unauthenticated), and an admin "clear all" deleted every
// non-pending notification in the system — every tenant's inbox included.
$auth = require_user($conn);
$is_admin = $auth['role'] === 'admin';

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$notification_id = (int)($input['notificationId'] ?? $input['id'] ?? 0);

$scope = $is_admin ? "(user_id = ? OR type IN " . admin_queue_types_sql() . ")" : "user_id = ?";

if ($notification_id) {
    $stmt = $conn->prepare("DELETE FROM notifications WHERE id = ? AND $scope");
    $stmt->bind_param("ii", $notification_id, $auth['id']);
    $stmt->execute();
    $deleted = $stmt->affected_rows;
    $stmt->close();

    if ($deleted === 0) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Notification not found."]);
        exit;
    }
} else {
    // Bulk clear keeps anything still Pending, so an open request is never lost.
    $stmt = $conn->prepare("DELETE FROM notifications WHERE status != 'Pending' AND $scope");
    $stmt->bind_param("i", $auth['id']);
    $stmt->execute();
    $deleted = $stmt->affected_rows;
    $stmt->close();
}

echo json_encode(["success" => true, "message" => "Notifications cleared.", "deleted" => $deleted]);
$conn->close();
?>
