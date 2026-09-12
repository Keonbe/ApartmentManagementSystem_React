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

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    echo json_encode(["success" => false, "message" => "Invalid JSON"]);
    exit;
}

$room_name = $input['room_name'] ?? '';
$billing_period = $input['billing_period'] ?? '';
$reading_date = $input['reading_date'] ?? date('Y-m-d');
$water_curr_reading = floatval($input['water_curr_reading'] ?? 0);
$electric_curr_reading = floatval($input['electric_curr_reading'] ?? 0);
$water_rate_per_unit = floatval($input['water_rate_per_unit'] ?? 40.00);
$electric_rate_per_unit = floatval($input['electric_rate_per_unit'] ?? 12.00);
$water_other_fees = floatval($input['water_other_fees'] ?? 0.00);
$electric_other_fees = floatval($input['electric_other_fees'] ?? 0.00);
$notes = $input['notes'] ?? '';

if (!$room_name || !$billing_period) {
    echo json_encode(["success" => false, "message" => "Room name and billing period are required"]);
    exit;
}

// Find current tenant of the room
$user_id = null;
$tenant_query = "
    SELECT ra.user_id 
    FROM rent_applications ra 
    WHERE ra.room_name = ? 
      AND ra.status IN ('Approved', 'active', 'pending-move-out')
      AND NOT EXISTS (
          SELECT 1 FROM invoices i 
          WHERE i.rent_application_id = ra.id 
            AND i.status IN ('pending', 'pending-verification')
            AND i.security_deposit > 0
      )
    ORDER BY ra.id DESC LIMIT 1";
$stmt = $conn->prepare($tenant_query);
$stmt->bind_param("s", $room_name);
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $user_id = $row['user_id'];
}
$stmt->close();

// Find previous reading
$water_prev_reading = 0.00;
$electric_prev_reading = 0.00;
$prev_query = "SELECT water_curr_reading, electric_curr_reading FROM utility_readings WHERE room_name = ? AND billing_period < ? ORDER BY billing_period DESC LIMIT 1";
$stmt = $conn->prepare($prev_query);
$stmt->bind_param("ss", $room_name, $billing_period);
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $water_prev_reading = floatval($row['water_curr_reading']);
    $electric_prev_reading = floatval($row['electric_curr_reading']);
}
$stmt->close();

// Compute
$water_consumption = max(0, $water_curr_reading - $water_prev_reading);
$water_amount = $water_consumption * $water_rate_per_unit;

$electric_consumption = max(0, $electric_curr_reading - $electric_prev_reading);
$electric_amount = $electric_consumption * $electric_rate_per_unit;

// Check for duplicate
$check_query = "SELECT id FROM utility_readings WHERE room_name = ? AND billing_period = ?";
$stmt = $conn->prepare($check_query);
$stmt->bind_param("ss", $room_name, $billing_period);
$stmt->execute();
$check_res = $stmt->get_result();
if ($check_res->fetch_assoc()) {
    $stmt->close();
    echo json_encode(["success" => false, "message" => "A utility reading for this unit and billing period already exists. Please edit the existing reading or choose a different period."]);
    exit;
}
$stmt->close();

// Insert
$query = "INSERT INTO utility_readings 
    (room_name, user_id, billing_period, reading_date, water_prev_reading, water_curr_reading, water_rate_per_unit, water_consumption, water_amount, water_other_fees, electric_prev_reading, electric_curr_reading, electric_rate_per_unit, electric_consumption, electric_amount, electric_other_fees, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
$stmt = $conn->prepare($query);
$stmt->bind_param("sisssdddddddddddsi", 
    $room_name, $user_id, $billing_period, $reading_date, 
    $water_prev_reading, $water_curr_reading, $water_rate_per_unit, $water_consumption, $water_amount, $water_other_fees,
    $electric_prev_reading, $electric_curr_reading, $electric_rate_per_unit, $electric_consumption, $electric_amount, $electric_other_fees,
    $notes, $admin_id
);

if ($stmt->execute()) {
    log_activity($conn, $admin_id, 'utilities', 'record_reading', "Recorded utility readings for Room {$room_name} ({$billing_period})");
    echo json_encode(["success" => true, "message" => "Utility reading saved successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to save reading: " . $conn->error]);
}

$stmt->close();
$conn->close();
?>
