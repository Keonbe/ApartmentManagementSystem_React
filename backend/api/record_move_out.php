<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

$user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
$input = json_decode(file_get_contents("php://input"), true);
if (empty($user_id)) {
    $user_id = $input['userId'] ?? null;
}

if (empty($user_id)) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Authentication required."]);
    exit;
}

// Find the latest approved rent application for this user
$stmt = $conn->prepare("SELECT id, room_name FROM rent_applications WHERE user_id = ? AND status = 'Approved' ORDER BY created_at DESC LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$res = $stmt->get_result();

if ($res->num_rows === 0) {
    echo json_encode(["success" => false, "message" => "No active approved room application found."]);
    $stmt->close();
    $conn->close();
    exit;
}

$app = $res->fetch_assoc();
$app_id = $app['id'];
$room_name = $app['room_name'];
$stmt->close();

// Update status to 'pending-move-out'
$update_stmt = $conn->prepare("UPDATE rent_applications SET status = 'pending-move-out' WHERE id = ?");
$update_stmt->bind_param("i", $app_id);

if ($update_stmt->execute()) {
    log_activity($conn, $user_id, 'tenant', "Requested Move Out", "Application ID: $app_id, Room: $room_name");
    echo json_encode(["success" => true, "message" => "Move-out request recorded successfully."]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to submit move-out request."]);
}

$update_stmt->close();
$conn->close();
?>
