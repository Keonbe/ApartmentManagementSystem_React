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

$input = json_decode(file_get_contents("php://input"), true);
$user_id = $input['userId'] ?? $_SERVER['HTTP_X_USER_ID'] ?? null;
$type = $input['type'] ?? '';
$id = $input['id'] ?? null;

if (!$user_id || !$type || !$id) {
    echo json_encode(["success" => false, "message" => "Missing required fields"]);
    exit;
}

$table = '';
if ($type === 'Maintenance') $table = 'maintenance_requests';
else if ($type === 'CCTV') $table = 'cctv_requests';
else if ($type === 'Parking') $table = 'parking_reservations';
else {
    echo json_encode(["success" => false, "message" => "Invalid type"]);
    exit;
}

$stmt = $conn->prepare("UPDATE $table SET status = 'Cancelled' WHERE id = ? AND user_id = ? AND status = 'Pending'");
$stmt->bind_param("ii", $id, $user_id);
$stmt->execute();

if ($stmt->affected_rows > 0) {
    echo json_encode(["success" => true, "message" => "Request cancelled successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to cancel request or not in Pending state"]);
}

$stmt->close();
$conn->close();
?>
