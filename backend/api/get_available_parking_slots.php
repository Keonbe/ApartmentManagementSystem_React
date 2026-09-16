<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// This file used to include 'db_connection.php', which does not exist, so every
// call ended in a fatal error that also leaked the server path.
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$auth = require_user($conn);

// Real capacity for the tenant page. ParkingReservation.jsx used to call an
// admin-only endpoint, get a 403, and show every slot as free.
$capacity = parking_capacity($conn);

$response = [
    "success" => true,
    "max_slots" => $capacity['max'],
    "occupied_count" => $capacity['occupied'],
    "available_slots" => $capacity['available'],
    "monthly_fee" => parking_monthly_fee($conn),
    "billing_mode" => get_setting($conn, 'parking_billing_mode', 'manual') === 'auto' ? 'auto' : 'manual',
    "max_duration_months" => PARKING_MAX_DURATION_MONTHS,
    "my_reservation" => null,
];

// The caller's most recent reservation, so the page can show its status instead
// of offering a second request.
$stmt = $conn->prepare("SELECT id, vehicle_model, plate_number, status, slot_number, assigned_at, released_at, release_reason,
                               rejection_reason, duration_months, total_cost, created_at
                        FROM parking_reservations WHERE user_id = ? ORDER BY id DESC LIMIT 1");
$stmt->bind_param("i", $auth['id']);
$stmt->execute();
$mine = $stmt->get_result()->fetch_assoc();
$stmt->close();

if ($mine) {
    $billed = [];
    $b = $conn->prepare("SELECT billing_period FROM parking_charges WHERE reservation_id = ? ORDER BY billing_period");
    $b->bind_param("i", $mine['id']);
    $b->execute();
    foreach ($b->get_result()->fetch_all(MYSQLI_ASSOC) as $row) $billed[] = $row['billing_period'];
    $b->close();

    $end = parking_term_end($mine['assigned_at'], $mine['duration_months']);
    $mine['term_ends_at'] = $end ? $end->format('Y-m-d') : null;
    $mine['billed_periods'] = $billed;
    $mine['slot_number'] = $mine['slot_number'] !== null ? (int)$mine['slot_number'] : null;
    $response['my_reservation'] = $mine;
}

if ($auth['role'] === 'admin') {
    $response['taken_slots'] = $capacity['taken'];
}

echo json_encode($response);
$conn->close();
?>
