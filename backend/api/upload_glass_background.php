<?php
// Uploads a photo for the tenant side's Glass theme backdrop (Other Settings →
// Glass Mode). It only stores the file and returns its path: the photo goes
// live when the admin saves settings with that path in glass_bg_image
// (update_system_settings.php checks the path again).
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

const GLASS_BG_MAX_BYTES = 5 * 1024 * 1024;
const GLASS_BG_MIN_SIDE = 640;     // smaller than this looks blurry stretched over a screen
const GLASS_BG_MAX_SIDE = 8000;    // decoding anything bigger costs every visitor's phone

$file = $_FILES['background'] ?? null;
if (!$file || !is_array($file) || !isset($file['error']) || is_array($file['error']) || $file['error'] === UPLOAD_ERR_NO_FILE) {
    $fail(422, "Choose an image to upload.");
}
if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE || $file['size'] > GLASS_BG_MAX_BYTES) {
    $fail(422, "The image must be 5 MB or smaller.");
}
if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
    $fail(422, "The upload failed. Please try again.");
}

// The extension is decided by the file's content, never by its name.
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);
$extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
if (!isset($extensions[$mime])) {
    $fail(422, "Use a JPG, PNG or WEBP image.");
}

$size = @getimagesize($file['tmp_name']);
if (!$size || $size[0] < 1 || $size[1] < 1) {
    $fail(422, "This file is not a readable image.");
}
[$width, $height] = $size;
if (max($width, $height) < GLASS_BG_MIN_SIDE) {
    $fail(422, "The image is too small for a background. Use one at least " . GLASS_BG_MIN_SIDE . " pixels wide or tall.");
}
if ($width > GLASS_BG_MAX_SIDE || $height > GLASS_BG_MAX_SIDE) {
    $fail(422, "The image is too large. Use one at most " . GLASS_BG_MAX_SIDE . " pixels on each side.");
}

$dir = glass_bg_absolute_path(GLASS_BG_DIR) . '/';
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    $fail(500, "The image could not be saved.");
}
// The folder is served directly (guests see the photo on Home): no listing,
// and nothing in it may run as a script. Written here too in case the
// committed .htaccess was not deployed.
$htaccess = $dir . '.htaccess';
if (!is_file($htaccess)) {
    file_put_contents($htaccess, "Options -Indexes\n<FilesMatch \"\\.(php|phtml|php3|php4|php5|php7|phps|phar|pht|cgi|pl|py|sh|svg|html?)$\">\n    Require all denied\n</FilesMatch>\n");
}

// Uploads that were never saved into settings (the admin discarded them) are
// cleared once they are a day old. The live backdrop is never touched.
$current = '';
$res = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'glass_bg_image'");
if ($res && ($row = $res->fetch_assoc())) $current = (string)$row['setting_value'];
foreach (glob($dir . 'glass_bg_*') ?: [] as $old) {
    $relative = GLASS_BG_DIR . '/' . basename($old);
    if ($relative !== $current && filemtime($old) < time() - 86400) delete_glass_bg_file($relative);
}

$name = 'glass_bg_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $extensions[$mime];
if (!move_uploaded_file($file['tmp_name'], $dir . $name)) {
    $fail(500, "The image could not be saved.");
}

$relative = GLASS_BG_DIR . '/' . $name;
log_activity($conn, $admin_id, 'system', 'Uploaded Glass Background', "Uploaded a Glass theme background ($width x $height, " . round($file['size'] / 1024) . " KB). It applies once the settings are saved.");

echo json_encode([
    "success" => true,
    "message" => "Image uploaded. Save the settings to use it.",
    "image_path" => $relative,
]);
$conn->close();
