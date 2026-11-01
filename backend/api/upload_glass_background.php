<?php
// Uploads a photo for the tenant side's Glass theme backdrop (Other Settings →
// Glass Mode). It only stores the file and returns its path: the photo goes
// live when the admin saves settings with that path in glass_bg_image
// (update_system_settings.php checks the path again). The last GLASS_BG_KEEP
// uploads stay available to switch back to (get_glass_backgrounds.php).
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

// Type from the content, 640-8000 px, 5 MB (config.php check_site_image_upload()).
[$image, $problem] = check_site_image_upload($_FILES['background'] ?? null);
if ($problem) $fail($problem[0], $problem[1]);

$relative = store_site_image($_FILES['background'], 'glass_bg_', $image['ext']);
if ($relative === null) $fail(500, "The image could not be saved.");
// Only the last GLASS_BG_KEEP photos are kept (the live one always is).
$live = current_glass_bg($conn);
prune_glass_bg_files($live);
log_activity($conn, $admin_id, 'system', 'Uploaded Glass Background', "Uploaded a Glass theme background ({$image['width']} x {$image['height']}, " . round($image['size'] / 1024) . " KB). It applies once the settings are saved.");

echo json_encode([
    "success" => true,
    "message" => "Image uploaded. Save the settings to use it.",
    "image_path" => $relative,
    "backgrounds" => glass_bg_history($live),
]);
$conn->close();
