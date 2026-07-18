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

$stmt = $conn->prepare("INSERT INTO announcements (tag, title, body, send_to, channels) VALUES (?, ?, ?, ?, ?)");
$stmt->bind_param("sssss", $tag, $title, $body, $send_to, $channels);

if ($stmt->execute()) {
    log_activity($conn, $admin_id, 'communication', "Created Announcement", "Title: $title");
    echo json_encode(["success" => true, "message" => "Announcement created successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to create announcement", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
