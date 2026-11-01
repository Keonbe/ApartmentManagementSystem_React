<?php
// Removes one photo from the Glass theme's recent list (Other Settings →
// Glass Mode). The photo tenants see right now cannot be removed: switch to
// another one and save first.
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Invalid request method."]);
    exit;
}

$admin_id = require_admin($conn);

$fail = function ($status, $message) use ($conn) {
    http_response_code($status);
    echo json_encode(["success" => false, "message" => $message]);
    $conn->close();
    exit;
};

$input = json_decode(file_get_contents("php://input"), true);
$path = is_array($input) ? ($input['path'] ?? null) : null;

// Only a name this app generated, so nothing outside site_assets/ is reachable.
if (!is_string($path) || preg_match(GLASS_BG_PATH_PATTERN, $path) !== 1) {
    $fail(422, "Choose a photo from the recent list.");
}
if (!is_file(glass_bg_absolute_path($path))) {
    $fail(404, "This photo was already removed.");
}
if ($path === current_glass_bg($conn)) {
    $fail(409, "Tenants see this photo now. Choose another photo and save before removing it.");
}

delete_glass_bg_file($path);
log_activity($conn, $admin_id, 'system', 'Removed Glass Background', "Removed a Glass theme background from the recent photos (" . basename($path) . ").");

echo json_encode([
    "success" => true,
    "message" => "Photo removed.",
    "backgrounds" => glass_bg_history(current_glass_bg($conn)),
]);
$conn->close();
