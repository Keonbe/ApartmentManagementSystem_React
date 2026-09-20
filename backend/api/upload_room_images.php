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

// Unit showcase photos are a management concern, not a tenant one.
$adminId = require_admin($conn);

$room_id = $_POST['room_id'] ?? '';
if ($room_id === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Room ID is required."]);
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

$gallery = json_decode($row['gallery'] ?? '[]', true) ?: [];

// Matches the frontend's <input type="file" multiple name="images[]">.
$files = $_FILES['images'] ?? null;
if (!$files || empty($files['name'][0])) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "No images were provided."]);
    exit;
}

$count = is_array($files['name']) ? count($files['name']) : 0;

// A generous cap: enough for a real showcase gallery without letting a
// single room's uploads grow unbounded.
$max_images = 8;
if (count($gallery) + $count > $max_images) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "A unit can have at most $max_images showcase images."]);
    exit;
}

$added = [];
for ($i = 0; $i < $count; $i++) {
    $file = [
        'name' => $files['name'][$i],
        'type' => $files['type'][$i],
        'tmp_name' => $files['tmp_name'][$i],
        'error' => $files['error'][$i],
        'size' => $files['size'][$i],
    ];

    [$path, $error] = store_room_image($file);
    if ($error) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => $error]);
        exit;
    }
    if ($path) {
        $gallery[] = $path;
        $added[] = $path;
    }
}

if (empty($added)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "No valid images were uploaded."]);
    exit;
}

$json = json_encode($gallery);
$stmt = $conn->prepare("UPDATE rooms SET gallery = ? WHERE id = ?");
$stmt->bind_param("ss", $json, $room_id);
if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to save uploaded images."]);
    exit;
}
$stmt->close();

$n = count($added);
log_activity($conn, $adminId, 'unit', 'Updated Unit Gallery', "Added $n image(s) to Room $room_id.");

echo json_encode(["success" => true, "message" => "Images uploaded successfully", "gallery" => $gallery]);
$conn->close();
