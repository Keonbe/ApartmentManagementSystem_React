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

// Admin-only. This endpoint had no authentication at all: anyone could drop an
// arbitrary title and message into any user's inbox (in-app phishing).
$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true) ?? [];

$user_id = (int)($input['userId'] ?? 0);
$title = trim((string)($input['title'] ?? ''));
$message = trim((string)($input['message'] ?? ''));
$type = trim((string)($input['type'] ?? 'system'));

if (!$user_id || $title === '' || $message === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "User ID, title, and message are required."]);
    exit;
}
if (mb_strlen($title) > 255 || !preg_match('/^[a-z_]{1,50}$/', $type)) {
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

$stmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)");
$stmt->bind_param("isss", $user_id, $title, $message, $type);

if ($stmt->execute()) {
    echo json_encode(["success" => true, "message" => "Notification created successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to create notification"]);
}

$stmt->close();
$conn->close();
?>
