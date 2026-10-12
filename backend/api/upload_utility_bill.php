<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

function bill_fail($code, $msg) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $msg]);
    exit;
}

// Admin attaches (or replaces / removes) the provider's bill on a reading.
$admin_id = (int)require_admin($conn);
$reading_id = (int)($_POST['reading_id'] ?? 0);
$remove = !empty($_POST['remove']);

$stmt = $conn->prepare("SELECT id, room_name, user_id, billing_period, bill_file_path FROM utility_readings WHERE id = ?");
$stmt->bind_param("i", $reading_id);
$stmt->execute();
$reading = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$reading) bill_fail(404, "Utility reading not found.");

$new_path = null;
if (!$remove) {
    $file = $_FILES['bill'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK) bill_fail(400, "Choose the bill file to attach.");
    if ($file['size'] > 10 * 1024 * 1024) bill_fail(422, "The bill file exceeds the 10MB size limit.");

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'pdf'], true)) bill_fail(422, "Invalid bill format. Allowed: JPG, PNG, PDF.");

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'application/pdf'], true)) bill_fail(422, "File content does not match allowed formats.");

    $dir = '../uploads/utility_bills/';
    if (!file_exists($dir)) mkdir($dir, 0755, true);
    $name = 'bill_' . bin2hex(random_bytes(16)) . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], $dir . $name)) bill_fail(500, "Failed to save the bill. Please try again.");
    $new_path = 'uploads/utility_bills/' . $name;
}

$upd = $conn->prepare("UPDATE utility_readings SET bill_file_path = ? WHERE id = ?");
$upd->bind_param("si", $new_path, $reading_id);
$upd->execute();
$upd->close();

// The replaced / removed file is no longer referenced by any row.
if (!empty($reading['bill_file_path'])) {
    $old = realpath(__DIR__ . '/../' . $reading['bill_file_path']);
    $base = realpath(__DIR__ . '/../uploads/utility_bills');
    if ($old && $base && strncmp($old, $base, strlen($base)) === 0) @unlink($old);
}

$label = is_valid_utility_period($reading['billing_period']) ? utility_period_label($reading['billing_period']) : $reading['billing_period'];
log_activity($conn, $admin_id, 'utilities', $remove ? 'Removed Utility Bill File' : 'Attached Utility Bill File', "Unit {$reading['room_name']}, $label");
if (!$remove && $reading['user_id']) {
    create_notification($conn, (int)$reading['user_id'], 'billing', 'Utility Bill Attached',
        "The utility bill for Unit {$reading['room_name']} ($label) is ready to view on your Utilities page.");
}

echo json_encode(["success" => true, "message" => $remove ? "Bill file removed." : "Bill file attached.", "bill_file_path" => $new_path]);
$conn->close();
