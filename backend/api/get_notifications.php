<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Whose inbox this is comes from the session. The tenant branch used to read
// ?userId= with no authentication, so anyone could read any tenant's notices.
$auth = require_user($conn);

try {
    if ($auth['role'] === 'admin') {
        // ADMIN VIEW: the action queue — request types still awaiting a decision.
        $stmt = $conn->prepare("SELECT * FROM notifications
                                WHERE status = 'Pending' AND type IN " . admin_queue_types_sql() . "
                                ORDER BY created_at DESC
                                LIMIT 100");
    } else {
        // TENANT VIEW: only the caller's own notifications; ?userId= is ignored.
        $stmt = $conn->prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50");
        $stmt->bind_param("i", $auth['id']);
    }

    $stmt->execute();
    $result = $stmt->get_result();
    $notifications = [];
    while ($row = $result->fetch_assoc()) {
        $notifications[] = $row;
    }
    $stmt->close();

    echo json_encode(["success" => true, "notifications" => $notifications]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to load notifications."]);
}

$conn->close();
?>
