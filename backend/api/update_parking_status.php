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
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['rawId'] ?? $input['id'] ?? null;
$status = $input['status'] ?? null;

if (!$id || !$status) {
    echo json_encode(["success" => false, "message" => "Reservation ID and status are required."]);
    exit;
}

$stmt = $conn->prepare("UPDATE parking_reservations SET status = ? WHERE id = ?");
$stmt->bind_param("si", $status, $id);

if ($stmt->execute()) {
    log_activity($conn, $admin_id, 'system', "Updated Parking Reservation #$id Status", "Status set to: $status");
    echo json_encode(["success" => true, "message" => "Parking reservation status updated."]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to update parking reservation", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
