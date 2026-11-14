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

// Deleting is narrower than marking read: anyone may delete only notifications
// addressed to them, and never a row that is still waiting on a decision.
//
// Previously an admin could delete any row whose type was a queue type — which
// included tenants' own decision notices — and a tenant could delete their own
// Pending occupancy / lease request, which is the row that stops a duplicate
// request from being filed and the row the admin approves from.
$auth = require_user($conn);

$input = read_json_input();
$notification_id = (int)($input['notificationId'] ?? $input['id'] ?? 0);

if ($notification_id) {
    $stmt = $conn->prepare("DELETE FROM notifications WHERE id = ? AND user_id = ? AND status <> 'Pending'");
    $stmt->bind_param("ii", $notification_id, $auth['id']);
    $stmt->execute();
    $deleted = $stmt->affected_rows;
    $stmt->close();

    if ($deleted === 0) {
        $check = $conn->prepare("SELECT status FROM notifications WHERE id = ? AND user_id = ?");
        $check->bind_param("ii", $notification_id, $auth['id']);
        $check->execute();
        $row = $check->get_result()->fetch_assoc();
        $check->close();

        if ($row) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "This request is still awaiting a decision and cannot be removed."]);
        } else {
            http_response_code(404);
            echo json_encode(["success" => false, "message" => "Notification not found."]);
        }
        exit;
    }
} else {
    $stmt = $conn->prepare("DELETE FROM notifications WHERE user_id = ? AND status <> 'Pending'");
    $stmt->bind_param("i", $auth['id']);
    $stmt->execute();
    $deleted = $stmt->affected_rows;
    $stmt->close();
}

echo json_encode(["success" => true, "message" => "Notifications cleared.", "deleted" => $deleted]);
$conn->close();
?>
