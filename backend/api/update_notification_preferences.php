<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Saves the caller's own preferences: { "preferences": { "<category>": true|false, ... } }.
// Only the categories in NOTIFICATION_PREF_CATEGORIES can be changed; critical
// notices (overdue alerts, billing, decisions) are not preferences at all.
$auth = require_user($conn);

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$prefs = $input['preferences'] ?? null;

if (!is_array($prefs) || empty($prefs)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "No preferences provided."]);
    exit;
}

foreach ($prefs as $category => $enabled) {
    if (!isset(NOTIFICATION_PREF_CATEGORIES[$category])) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Unknown notification category: " . substr((string)$category, 0, 40)]);
        exit;
    }
    if (!is_bool($enabled) && !in_array($enabled, [0, 1, '0', '1'], true)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Preference values must be true or false."]);
        exit;
    }
}

$changed = [];
$stmt = $conn->prepare("INSERT INTO notification_preferences (user_id, category, in_app_enabled) VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE in_app_enabled = VALUES(in_app_enabled)");
foreach ($prefs as $category => $enabled) {
    $flag = $enabled ? 1 : 0;
    $stmt->bind_param("isi", $auth['id'], $category, $flag);
    $stmt->execute();
    if ($stmt->affected_rows > 0) {
        $changed[] = $category . ($flag ? ' on' : ' off');
    }
}
$stmt->close();

if ($changed) {
    log_activity($conn, $auth['id'], 'user', 'Updated Notification Preferences', implode(', ', $changed));
}

echo json_encode(["success" => true, "message" => "Notification preferences saved.", "changed" => count($changed)]);
$conn->close();
?>
