<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Parking fee integration (checklist 10.3).
//   { reservation_id, period? }                     post one month's fee (manual "Bill this month")
//   { reservation_id, period, action: "reverse" }   back a month out while its invoice is unpaid
// The period is 'YYYY-MM' and defaults to the current month. A month can only be
// billed once, however it is triggered (see post_parking_charge()).
$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$reservation_id = (int)($input['reservation_id'] ?? 0);
$action = $input['action'] ?? 'post';
$period = trim((string)($input['period'] ?? ''));

if (!$reservation_id || !in_array($action, ['post', 'reverse'], true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "reservation_id is required."]);
    exit;
}
if ($period === '') {
    $period = (new DateTime('now', new DateTimeZone('Asia/Manila')))->format('Y-m');
}
if (!is_valid_utility_period($period)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Period must be in YYYY-MM format."]);
    exit;
}

if ($action === 'reverse') {
    $result = reverse_parking_charge($conn, $reservation_id, $period);
    if ($result['ok']) {
        log_activity($conn, $admin_id, 'billing', "Reversed Parking Fee", "Reservation ID: $reservation_id, $period — " . $result['message']);
    } else {
        http_response_code(409);
    }
    echo json_encode(["success" => $result['ok'], "message" => $result['message']]);
    $conn->close();
    exit;
}

$result = post_parking_charge($conn, $reservation_id, DateTime::createFromFormat('!Y-m', $period));
if ($result['ok']) {
    log_activity($conn, $admin_id, 'billing', "Billed Parking Fee", "Reservation ID: $reservation_id — " . $result['message']);
} else {
    http_response_code($result['message'] === 'Parking reservation not found.' ? 404 : 409);
}

echo json_encode([
    "success" => $result['ok'],
    "message" => $result['message'],
    "invoice_id" => $result['invoice_id'],
    "already_billed" => $result['already'],
]);
$conn->close();
?>
