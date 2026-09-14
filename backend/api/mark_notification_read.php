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

// Every update is scoped to what the caller may see: a tenant's own
// notifications, or for an admin their own plus the admin action queue.
// Previously a single id was updated with no check at all (even with no
// session), and the admin "bulk" branch marked every notification in the
// system read — including every tenant's. The admin header also sends { id },
// which this endpoint did not read, so clicking one notification fell through
// to that bulk branch.
$auth = require_user($conn);
$is_admin = $auth['role'] === 'admin';

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$notification_id = (int)($input['notificationId'] ?? $input['id'] ?? 0);

$scope = $is_admin ? "(user_id = ? OR type IN " . admin_queue_types_sql() . ")" : "user_id = ?";

if ($notification_id) {
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

    $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE id = ?");
    $stmt->bind_param("i", $notification_id);
} else {
    $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0 AND $scope");
    $stmt->bind_param("i", $auth['id']);
}

$stmt->execute();
$updated = $stmt->affected_rows;
$stmt->close();

echo json_encode(["success" => true, "message" => "Notifications marked as read.", "updated" => $updated]);
$conn->close();
?>
