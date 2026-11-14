<?php
// Removes one photo from a recent-photos list: kind "glass" (default, Other
// Settings → Glass Mode) or "preview" (Other Settings → Preview Page). The
// photo tenants see right now cannot be removed: switch to another one and
// save first.
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

$input = read_json_input();
$path = is_array($input) ? ($input['path'] ?? null) : null;
$kind = is_array($input) && isset($input['kind']) ? $input['kind'] : 'glass';
if (!is_string($kind) || !in_array($kind, SITE_IMAGE_KINDS, true)) {
    $fail(422, "Unknown photo list.");
}

// Only a name this app generated for that kind, so nothing outside
// site_assets/ (or in the other list) is reachable.
[, $pattern] = site_image_kind($kind);
if (!is_string($path) || preg_match($pattern, $path) !== 1) {
    $fail(422, "Choose a photo from the recent list.");
}
if (!is_file(glass_bg_absolute_path($path))) {
    $fail(404, "This photo was already removed.");
}
if ($path === current_site_image($conn, $kind)) {
    $fail(409, "Tenants see this photo now. Choose another photo and save before removing it.");
}

delete_site_image($kind, $path);
$what = $kind === 'preview' ? 'Preview page photo' : 'Glass theme background';
log_activity($conn, $admin_id, 'system', $kind === 'preview' ? 'Removed Preview Photo' : 'Removed Glass Background',
    "Removed a $what from the recent photos (" . basename($path) . ").");

echo json_encode([
    "success" => true,
    "message" => "Photo removed.",
    "backgrounds" => site_image_history($kind, current_site_image($conn, $kind)),
]);
$conn->close();
