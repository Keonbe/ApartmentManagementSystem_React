<?php
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

$slot = isset($_POST['slot']) ? (int)$_POST['slot'] : 1;
if ($slot < 1 || $slot > QRPH_SLOT_COUNT) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Slot number must be between 1 and " . QRPH_SLOT_COUNT . "."]);
    exit;
}

$file = $_FILES['qr_image'] ?? null;
if (!$file || $file['error'] === UPLOAD_ERR_NO_FILE) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "No QR code image was uploaded."]);
    exit;
}

if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Image upload failed (error code {$file['error']})."]);
    exit;
}

if ($file['size'] > 5 * 1024 * 1024) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "QR code image must be 5MB or smaller."]);
    exit;
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Allowed formats: JPG, PNG, WEBP, or GIF."]);
    exit;
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);
$allowed_mimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
if (!in_array($mime, $allowed_mimes, true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "File content is not a valid image."]);
    exit;
}

$dir = __DIR__ . '/../qr_codes/';
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

$htaccess = $dir . '.htaccess';
if (!file_exists($htaccess)) {
    $rules = "Options -Indexes\n<FilesMatch \"\.(php|phtml|php3|php4|php5|php7|phps|phar|pht|cgi|pl|py|sh)$\">\n    Require all denied\n</FilesMatch>\n";
    file_put_contents($htaccess, $rules);
}

$clean_name = 'qr_slot_' . $slot . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
$target_path = $dir . $clean_name;

if (!move_uploaded_file($file['tmp_name'], $target_path)) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to save uploaded QR code image."]);
    exit;
}

$relative_path = 'qr_codes/' . $clean_name;
log_activity($conn, $admin_id, 'payment', 'Uploaded QR Ph Code', "Uploaded QR code for slot $slot.");

echo json_encode([
    "success" => true,
    "message" => "QR code image uploaded successfully.",
    "image_path" => $relative_path,
    "slot" => $slot
]);
$conn->close();
?>

