<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Every update is scoped to what the caller may see: a tenant's own
// notifications, or for an admin their own plus the open action queue.
//
// The admin scope used to be "own OR any queue type", but tenant-addressed rows
// share those types (a parking or CCTV decision is typed 'parking_reservation' /
// 'cctv_request'), so an admin's "Mark all read" marked tenants' decision notices
// read. The queue is only ever the Pending rows, and decisions are never Pending.
$auth = require_user($conn);
$is_admin = $auth['role'] === 'admin';

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$notification_id = (int)($input['notificationId'] ?? $input['id'] ?? 0);

$scope = $is_admin
    ? "(user_id = ? OR (status = 'Pending' AND type IN " . admin_queue_types_sql() . "))"
    : "user_id = ?";

if ($notification_id) {
    $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND $scope");
    $stmt->bind_param("ii", $notification_id, $auth['id']);
    $stmt->execute();
    $stmt->close();

    $check = $conn->prepare("SELECT 1 FROM notifications WHERE id = ? AND $scope");
    $check->bind_param("ii", $notification_id, $auth['id']);
    $check->execute();
    $visible = (bool)$check->get_result()->fetch_assoc();
    $check->close();
    if (!$visible) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Notification not found."]);
        exit;
    }
    $updated = 1;
} else {
    $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0 AND $scope");
    $stmt->bind_param("i", $auth['id']);
    $stmt->execute();
    $updated = $stmt->affected_rows;
    $stmt->close();
}

echo json_encode(["success" => true, "message" => "Notifications marked as read.", "updated" => $updated]);
$conn->close();
?>
