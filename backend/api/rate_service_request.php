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

$auth = require_user($conn);
$user_id = $auth['id'];

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$id = (int)($input['id'] ?? 0);
$rating = $input['rating'] ?? null;
$comment = trim((string)($input['comment'] ?? ''));

if (!$id) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Booking ID is required."]);
    exit;
}
if (!is_int($rating) && !(is_string($rating) && ctype_digit($rating)) || (int)$rating < 1 || (int)$rating > 5) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Choose 1 to 5 stars.", "errors" => ["rating" => "Choose 1 to 5 stars."]]);
    exit;
}
if (mb_strlen($comment) > 255) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "The comment can be up to 255 characters.", "errors" => ["comment" => "Up to 255 characters."]]);
    exit;
}
$rating = (int)$rating;

$stmt = $conn->prepare("SELECT status, completed_at, rating, service_name FROM service_requests WHERE id = ? AND user_id = ?");
$stmt->bind_param("ii", $id, $user_id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$row) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Booking not found."]);
    exit;
}
if ($row['status'] !== 'Completed') {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "You can rate a service once it is completed."]);
    exit;
}
if ($row['rating'] !== null) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "You already rated this service."]);
    exit;
}
if ($row['completed_at'] && strtotime($row['completed_at']) < strtotime('-' . SERVICE_RATING_DAYS . ' days')) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Ratings are open for " . SERVICE_RATING_DAYS . " days after a service is completed."]);
    exit;
}

// Guarded on "not rated yet" so a double tap or a second tab cannot rate twice.
$comment_value = $comment === '' ? null : $comment;
$stmt = $conn->prepare("UPDATE service_requests SET rating = ?, rating_comment = ?, rated_at = NOW() WHERE id = ? AND user_id = ? AND status = 'Completed' AND rating IS NULL");
$stmt->bind_param("isii", $rating, $comment_value, $id, $user_id);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

if ($affected === 0) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This booking just changed. Refresh and try again."]);
    exit;
}

log_activity($conn, $user_id, 'service', "Rated Service", "Service Request ID: $id \"{$row['service_name']}\" rated $rating/5");
notify_admins_info($conn, 'info', "Service rated $rating/5", "A tenant rated \"{$row['service_name']}\" $rating out of 5" . ($comment_value ? ": $comment_value" : '.'));

echo json_encode(["success" => true, "message" => "Thanks for your feedback."]);
$conn->close();
