<?php
// The Glass theme photos still on the server (Other Settings → Glass Mode →
// Recent photos), newest first: the last GLASS_BG_KEEP uploads, the live one
// marked. upload_glass_background.php adds to it and trims it.
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

echo json_encode([
    "success" => true,
    "backgrounds" => glass_bg_history(current_glass_bg($conn)),
    "limit" => GLASS_BG_KEEP,
]);
$conn->close();
