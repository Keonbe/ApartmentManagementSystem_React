<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once __DIR__ . '/../config.php';

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// The correction path for a mistyped reading: delete it, then record it again.
// Only an un-invoiced reading that is the unit's latest may go — deleting an
// earlier one would break the chain the next reading was computed from.
$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true);
$id = (int)($input['id'] ?? 0);
if ($id <= 0) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Reading ID is required."]);
    exit;
}

$stmt = $conn->prepare("SELECT room_name, billing_period, is_invoiced FROM utility_readings WHERE id = ?");
$stmt->bind_param("i", $id);
$stmt->execute();
$reading = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$reading) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Utility reading not found."]);
    exit;
}
if ((int)$reading['is_invoiced'] === 1) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This reading has already been invoiced and cannot be deleted."]);
    exit;
}

$stmt = $conn->prepare("SELECT 1 FROM utility_readings WHERE room_name = ? AND billing_period > ? LIMIT 1");
$stmt->bind_param("ss", $reading['room_name'], $reading['billing_period']);
$stmt->execute();
$has_later = (bool)$stmt->get_result()->fetch_assoc();
$stmt->close();

if ($has_later) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Only the most recent reading for Unit {$reading['room_name']} can be deleted."]);
    exit;
}

// Guarded on is_invoiced = 0 so a sync that lands between the check and the delete wins.
$stmt = $conn->prepare("DELETE FROM utility_readings WHERE id = ? AND is_invoiced = 0");
$stmt->bind_param("i", $id);
$stmt->execute();
$deleted = $stmt->affected_rows;
$stmt->close();

if ($deleted === 0) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This reading was invoiced in the meantime and cannot be deleted."]);
    exit;
}

log_activity($conn, $admin_id, 'utilities', 'delete_reading', "Deleted utility reading #{$id} for Unit {$reading['room_name']} ({$reading['billing_period']})");
echo json_encode(["success" => true, "message" => "Reading deleted."]);
$conn->close();
?>
