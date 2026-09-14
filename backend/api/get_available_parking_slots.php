<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

// This file used to include 'db_connection.php', which does not exist, so every
// call ended in a fatal error that also leaked the server path.
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_user($conn);

$max_slots = 3;
$res = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'max_parking_slots'");
if ($res && ($row = $res->fetch_assoc()) && is_numeric($row['setting_value'])) {
    $max_slots = (int)$row['setting_value'];
}

// Same set of statuses parking_reservation.php counts against the cap.
$row = $conn->query("SELECT COUNT(*) AS occupied_count FROM parking_reservations WHERE status IN ('Pending', 'Assigned', 'Approved', 'Active')")->fetch_assoc();
$occupied = (int)($row['occupied_count'] ?? 0);

echo json_encode([
    "success" => true,
    "occupied_count" => $occupied,
    "max_slots" => $max_slots,
    "available_slots" => max(0, $max_slots - $occupied),
]);
$conn->close();
?>
