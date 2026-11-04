<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_user($conn);

// Which time slots of one day still have room, for a service with a per-slot limit.
$service_id = (int)($_GET['serviceId'] ?? 0);
$date = $_GET['date'] ?? '';
$parsed = DateTime::createFromFormat('Y-m-d', $date);
if (!$service_id || !$parsed || $parsed->format('Y-m-d') !== $date) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "A service and a valid date are required."]);
    exit;
}

$stmt = $conn->prepare("SELECT max_per_slot FROM service_catalog WHERE id = ? AND is_active = 1");
$stmt->bind_param("i", $service_id);
$stmt->execute();
$service = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$service) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "That service is not available."]);
    exit;
}

$limit = $service['max_per_slot'] === null ? null : (int)$service['max_per_slot'];
$slots = [];
foreach (array_keys(SERVICE_SLOT_START_HOUR) as $window) {
    $taken = $limit === null ? 0 : service_slot_taken($conn, $service_id, $date, $window);
    $slots[$window] = ["limit" => $limit, "taken" => $taken, "full" => $limit !== null && $taken >= $limit];
}

echo json_encode(["success" => true, "slots" => $slots]);
$conn->close();
