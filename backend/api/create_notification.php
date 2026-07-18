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

$input = json_decode(file_get_contents("php://input"), true);

$user_id = $input['userId'] ?? null;
$title = $input['title'] ?? '';
$message = $input['message'] ?? '';
$type = $input['type'] ?? 'info';

if (!$user_id || empty($title) || empty($message)) {
    echo json_encode(["success" => false, "message" => "User ID, title, and message are required."]);
    exit;
}

$stmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)");
$stmt->bind_param("isss", $user_id, $title, $message, $type);

if ($stmt->execute()) {
    echo json_encode(["success" => true, "message" => "Notification created successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to create notification", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
