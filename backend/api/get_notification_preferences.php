<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// The caller's own in-app notification preferences (checklist 6.8).
$auth = require_user($conn);

$saved = [];
$stmt = $conn->prepare("SELECT category, in_app_enabled FROM notification_preferences WHERE user_id = ?");
$stmt->bind_param("i", $auth['id']);
$stmt->execute();
foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
    $saved[$row['category']] = (bool)$row['in_app_enabled'];
}
$stmt->close();

$preferences = [];
foreach (NOTIFICATION_PREF_CATEGORIES as $key => $cat) {
    $preferences[] = [
        'category' => $key,
        'label' => $cat['label'],
        'in_app_enabled' => $saved[$key] ?? true,
    ];
}

echo json_encode([
    "success" => true,
    "preferences" => $preferences,
    // Shown to the user as the list of notices that cannot be switched off.
    "always_on" => ['Overdue payment alerts', 'Bills and payment confirmations', 'Application and lease decisions', 'Maintenance updates', 'Contract and move-out notices'],
]);
$conn->close();
?>
