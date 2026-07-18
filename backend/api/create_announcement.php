<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);

$tag = $input['tag'] ?? 'General';
$title = $input['title'] ?? '';
$body = $input['body'] ?? '';
$send_to = $input['sendTo'] ?? 'All Tenants';
$channels = isset($input['channels']) ? json_encode($input['channels']) : json_encode(['in-app']);

if (empty($title) || empty($body)) {
    echo json_encode(["success" => false, "message" => "Title and body are required."]);
    exit;
}

// 1. Fetch non-admin user IDs to send notification to
$recipients = [];
$user_res = $conn->query("SELECT id FROM users WHERE role != 'admin'");
if ($user_res) {
    while ($row = $user_res->fetch_assoc()) {
        $recipients[] = (int)$row['id'];
    }
}
$recipient_count = count($recipients);

$conn->begin_transaction();
try {
    // 2. Insert the announcement
    $stmt = $conn->prepare("INSERT INTO announcements (tag, title, body, send_to, channels, recipient_count) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("sssssi", $tag, $title, $body, $send_to, $channels, $recipient_count);
    $stmt->execute();
    $stmt->close();

    // 3. Insert notification for each recipient
    $notif_type = 'info';
    if (strtolower($tag) === 'urgent') {
        $notif_type = 'warning';
    } else if (strtolower($tag) === 'reminder') {
        $notif_type = 'action';
    }

    if ($recipient_count > 0) {
        $notif_stmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)");
        foreach ($recipients as $uid) {
            $notif_stmt->bind_param("isss", $uid, $title, $body, $notif_type);
            $notif_stmt->execute();
        }
        $notif_stmt->close();
    }

    $conn->commit();
    log_activity($conn, $admin_id, 'communication', "Created Announcement", "Title: $title");
    echo json_encode(["success" => true, "message" => "Announcement created successfully"]);
} catch (Exception $e) {
    $conn->rollback();
    echo json_encode(["success" => false, "message" => "Failed to create announcement", "error" => $e->getMessage()]);
}

$conn->close();
?>
