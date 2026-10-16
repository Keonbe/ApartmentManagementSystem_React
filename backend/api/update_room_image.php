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

// Sets one showcase photo's description (alt text) and display option.
$data = json_decode(file_get_contents("php://input"), true) ?? [];
$room_id = (string)($data['room_id'] ?? '');
$path = (string)($data['path'] ?? '');
$alt = trim((string)($data['alt'] ?? ''));
$fit = (string)($data['fit'] ?? 'fill');

if ($room_id === '' || $path === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Room ID and image path are required."]);
    exit;
}
if (!in_array($fit, GALLERY_FITS, true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Display option must be fill, fit or wide."]);
    exit;
}
if (mb_strlen($alt) > GALLERY_ALT_MAX) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "The description must be " . GALLERY_ALT_MAX . " characters or fewer."]);
    exit;
}

$conn->begin_transaction();
$stmt = $conn->prepare("SELECT gallery FROM rooms WHERE id = ? FOR UPDATE");
$stmt->bind_param("s", $room_id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$row) {
    $conn->rollback();
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Room not found."]);
    exit;
}

$gallery = room_gallery_items($row['gallery'] ?? null);
$found = false;
foreach ($gallery as &$item) {
    if ($item['path'] === $path) {
        $item['alt'] = $alt;
        $item['fit'] = $fit;
        $found = true;
    }
}
unset($item);

if (!$found) {
    $conn->rollback();
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Image not found on this room."]);
    exit;
}

$json = json_encode($gallery);
$stmt = $conn->prepare("UPDATE rooms SET gallery = ? WHERE id = ?");
$stmt->bind_param("ss", $json, $room_id);
if (!$stmt->execute()) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to save the image details."]);
    exit;
}
$stmt->close();
$conn->commit();

log_activity($conn, $adminId, 'unit', 'Updated Unit Gallery', "Updated an image's description or display in Room $room_id.");

echo json_encode(["success" => true, "message" => "Image details saved", "gallery" => $gallery]);
$conn->close();
