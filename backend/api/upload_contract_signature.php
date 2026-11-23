<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id");

require_once "../config.php";
require_once __DIR__ . '/../contract_template.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
    exit;
}

// Admin → Edit Contract → Details: the owner's e-signature image. It is stored
// here and returned as a path; the editor puts that path in the template's
// details.owner_signature, and it takes effect when the template is saved
// (save_contract_template.php checks it). Every contract without a signature of
// its own then prints with it on the owner's signature line.
$admin_id = require_admin($conn);

$file = $_FILES['file'] ?? null;
if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Choose a PNG or JPG image of the signature.", "errors" => ["file" => "Choose a PNG or JPG image of the signature."]]);
    exit;
}
$fail = function ($message) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => $message, "errors" => ["file" => $message]]);
    exit;
};
if ($file['error'] !== UPLOAD_ERR_OK) $fail("The upload failed. The image must be 2 MB or smaller.");
if ($file['size'] > CONTRACT_SIGNATURE_MAX_BYTES) $fail("The image must be 2 MB or smaller.");

$ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);
$types = ['image/png' => 'png', 'image/jpeg' => 'jpg'];
if (!in_array($ext, ['png', 'jpg', 'jpeg'], true) || !isset($types[$mime])) {
    $fail("The signature must be a PNG or JPG image (a PNG with a transparent background looks best).");
}
$size = @getimagesize($file['tmp_name']);
if (!$size || $size[0] < 20 || $size[1] < 10 || $size[0] > 4000 || $size[1] > 4000) {
    $fail("The image must be between 20 x 10 and 4000 x 4000 pixels.");
}

$dir = __DIR__ . '/../' . CONTRACT_SIGNATURE_DIR;
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Could not save the image."]);
    exit;
}
$name = bin2hex(random_bytes(16)) . '.' . $types[$mime];
if (!move_uploaded_file($file['tmp_name'], $dir . $name)) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Could not save the image."]);
    exit;
}

$path = CONTRACT_SIGNATURE_DIR . $name;
log_activity($conn, $admin_id, 'contract', 'Uploaded Owner Signature', "Owner e-signature image uploaded ($path); applies once the contract template is saved.");
echo json_encode(["success" => true, "path" => $path]);
$conn->close();
