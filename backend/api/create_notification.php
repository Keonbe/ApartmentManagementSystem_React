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

// Admin-only. This endpoint had no authentication at all: anyone could drop an
// arbitrary title and message into any user's inbox (in-app phishing).
$admin_id = require_admin($conn);

$input = $_POST;
if (empty($input)) {
    $input = read_json_input();
}


$user_id = (int)($input['userId'] ?? 0);
$title = trim((string)($input['title'] ?? ''));
$message = trim((string)($input['message'] ?? ''));
$type = trim((string)($input['type'] ?? 'system'));

if (!$user_id || $title === '' || $message === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "User ID, title, and message are required."]);
    exit;
}
// A queue type would make the message look like a request awaiting a decision.
if (mb_strlen($message) > 5000) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "The message must be 5000 characters or fewer."]);
    exit;
}
if (mb_strlen($title) > 255 || !preg_match('/^[a-z_]{1,50}$/', $type) || in_array($type, ADMIN_QUEUE_NOTIFICATION_TYPES, true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Invalid title or notification type."]);
    exit;
}

$chk = $conn->prepare("SELECT 1 FROM users WHERE id = ?");
$chk->bind_param("i", $user_id);
$chk->execute();
$exists = (bool)$chk->get_result()->fetch_assoc();
$chk->close();
if (!$exists) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "User not found."]);
    exit;
}


$attachment_path = null;
if (isset($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK) {
    $file = $_FILES['attachment'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (in_array($ext, ['jpg', 'jpeg', 'png', 'pdf'])) {
        // Keep notification files under backend/uploads so download_file.php
        // can authorize and stream them to the recipient.
        $upload_dir = __DIR__ . '/../uploads/notifications/';
        if (!is_dir($upload_dir)) mkdir($upload_dir, 0755, true);
        $filename = uniqid('notif_') . '.' . $ext;
        if (move_uploaded_file($file['tmp_name'], $upload_dir . $filename)) {
            $attachment_path = 'uploads/notifications/' . $filename;
        }
    }
}

$id = create_notification($conn, $user_id, $type, $title, $message);
if ($id && $attachment_path) {
    $upd = $conn->prepare("UPDATE notifications SET attachment_path = ? WHERE id = ?");
    $upd->bind_param("si", $attachment_path, $id);
    $upd->execute();
    $upd->close();
}

log_activity($conn, $admin_id, 'communication', 'Sent Notification', "To user #$user_id: $title");
echo json_encode(["success" => true, "message" => $id ? "Notification created successfully" : "The user has muted this kind of notification.", "delivered" => (bool)$id]);

$conn->close();
?>
