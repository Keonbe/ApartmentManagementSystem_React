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

if (!$input) {
    echo json_encode(["success" => false, "message" => "No data received"]);
    exit;
}

$stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?");

foreach ($input as $key => $value) {
    // stringify boolean values
    if (is_bool($value)) {
        $value = $value ? 'true' : 'false';
    } else {
        $value = (string)$value;
    }
    $stmt->bind_param("sss", $key, $value, $value);
    $stmt->execute();
}

log_activity($conn, $admin_id, 'system', 'Updated System Settings', 'Updated multiple configuration keys');

echo json_encode(["success" => true, "message" => "Settings updated successfully"]);

$stmt->close();
$conn->close();
?>
