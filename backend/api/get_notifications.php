<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$user_id = $_GET['userId'] ?? $_SERVER['HTTP_X_USER_ID'] ?? $_SERVER['HTTP_X_ADMIN_ID'] ?? null;

// Log the request
$log_msg = "[" . date('Y-m-d H:i:s') . "] Request: userId=" . ($user_id ?? 'NULL') . ", URI=" . $_SERVER['REQUEST_URI'] . "\n";
file_put_contents(__DIR__ . "/get_notifications.log", $log_msg, FILE_APPEND);

if (!$user_id) {
    echo json_encode(["success" => false, "message" => "User ID is required"]);
    file_put_contents(__DIR__ . "/get_notifications.log", "Response: User ID required\n\n", FILE_APPEND);
    exit;
}

$stmt = $conn->prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$result = $stmt->get_result();

$notifications = [];
while ($row = $result->fetch_assoc()) {
    $row['is_read'] = (bool)$row['is_read'];
    $notifications[] = $row;
}

// Log response count
file_put_contents(__DIR__ . "/get_notifications.log", "Response: count=" . count($notifications) . "\n\n", FILE_APPEND);

echo json_encode(["success" => true, "notifications" => $notifications]);

$stmt->close();
$conn->close();
?>
