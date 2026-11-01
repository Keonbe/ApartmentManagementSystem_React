<?php
// The admin photos still on the server, newest first, the live one marked:
// ?kind=glass (default) for Other Settings → Glass Mode, ?kind=preview for
// Other Settings → Preview Page. The last SITE_IMAGE_KEEP uploads of each kind;
// upload_glass_background.php / upload_preview_image.php add to them and trim.
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Invalid request method."]);
    exit;
}

require_admin($conn);

$kind = (string)($_GET['kind'] ?? 'glass');
if (!in_array($kind, SITE_IMAGE_KINDS, true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Unknown photo list."]);
    exit;
}

echo json_encode([
    "success" => true,
    "backgrounds" => site_image_history($kind, current_site_image($conn, $kind)),
    "limit" => SITE_IMAGE_KEEP,
]);
$conn->close();
