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
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

$adminId = require_admin($conn);

$data = json_decode(file_get_contents("php://input"), true);
$room_id = $data['room_id'] ?? '';
$path = $data['path'] ?? '';

if ($room_id === '' || $path === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Room ID and image path are required."]);
    exit;
}

$stmt = $conn->prepare("SELECT gallery FROM rooms WHERE id = ?");
$stmt->bind_param("s", $room_id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$row) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Room not found."]);
    exit;
}

$gallery = room_gallery_items($row['gallery'] ?? null);

if (!in_array($path, array_column($gallery, 'path'), true)) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Image not found on this room."]);
    exit;
}

$gallery = array_values(array_filter($gallery, fn($item) => $item['path'] !== $path));

$json = json_encode($gallery);
$stmt = $conn->prepare("UPDATE rooms SET gallery = ? WHERE id = ?");
$stmt->bind_param("ss", $json, $room_id);
if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to update gallery."]);
    exit;
}
$stmt->close();

// Only ever unlink a path matching this exact whitelisted pattern — mirrors
// download_file.php's traversal guard, applied here since $path comes
// straight from the request body rather than a DB-verified value at this point.
if (preg_match('#^room_images/[a-zA-Z0-9_.-]+$#', $path)) {
    $base_dir = realpath(__DIR__ . '/../room_images');
    $real_path = realpath(__DIR__ . '/../' . $path);
    if ($base_dir !== false && $real_path !== false && strncmp($real_path, $base_dir, strlen($base_dir)) === 0 && is_file($real_path)) {
        @unlink($real_path);
    }
}

log_activity($conn, $adminId, 'unit', 'Updated Unit Gallery', "Removed an image from Room $room_id.");

echo json_encode(["success" => true, "message" => "Image removed successfully", "gallery" => $gallery]);
$conn->close();
