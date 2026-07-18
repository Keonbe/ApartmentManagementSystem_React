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

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$id     = $input['id'] ?? null;
$status = $input['status'] ?? null; // 'Assigned' or 'Rejected'

if (!$id || !$status) {
    echo json_encode(["success" => false, "message" => "ID and status are required"]);
    exit;
}

$allowed = ['Assigned', 'Rejected'];
if (!in_array($status, $allowed)) {
    echo json_encode(["success" => false, "message" => "Invalid status value"]);
    exit;
}

$stmt = $conn->prepare("UPDATE parking_reservations SET status = ? WHERE id = ?");
$stmt->bind_param("si", $status, $id);

if ($stmt->execute()) {
    log_activity($conn, $admin_id, 'service', "Parking Reservation $status", "Reservation ID: $id");
    echo json_encode(["success" => true, "message" => "Parking reservation $status"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to update: " . $stmt->error]);
}

$stmt->close();
$conn->close();
?>
