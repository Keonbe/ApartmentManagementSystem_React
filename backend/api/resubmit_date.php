<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$auth = require_user($conn);
$user_id = $auth['id'];
$input = json_decode(file_get_contents("php://input"), true);
$app_id = $input['id'] ?? 0;
$new_date = $input['preferred_move_in_date'] ?? '';

if ($app_id <= 0 || empty($new_date)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Missing application ID or date.']);
    exit;
}

$stmt = $conn->prepare("UPDATE rent_applications SET preferred_move_in_date = ?, status = 'Pending Review', rejection_reason = NULL WHERE id = ? AND user_id = ? AND status = 'Action Required'");
$stmt->bind_param("sii", $new_date, $app_id, $user_id);
$stmt->execute();

if ($stmt->affected_rows > 0) {
    echo json_encode(['success' => true]);
} else {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Could not update application. Status may have changed.']);
}
$stmt->close();
?>
