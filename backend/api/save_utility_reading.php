<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once __DIR__ . '/../config.php';

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// The real admin id from the session, so recorded_by and the audit log are never blank or forged.
$admin_id = require_admin($conn);

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

// Returns the value as a float, $default when absent, or null when present but not a number.
function number_field($input, $key, $default = null) {
    if (!array_key_exists($key, $input) || $input[$key] === '' || $input[$key] === null) return $default;
    return is_numeric($input[$key]) ? (float)$input[$key] : null;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!is_array($input)) fail(400, "Invalid JSON");

$room_name = trim((string)($input['room_name'] ?? ''));
$billing_period = trim((string)($input['billing_period'] ?? ''));
$reading_date = trim((string)($input['reading_date'] ?? '')) ?: date('Y-m-d');
$notes = trim((string)($input['notes'] ?? ''));

if ($room_name === '' || $billing_period === '') fail(422, "Room name and billing period are required.");
if (!is_valid_utility_period($billing_period)) fail(422, "Billing period must be a month in YYYY-MM format.");

$stmt = $conn->prepare("SELECT id FROM rooms WHERE id = ?");
$stmt->bind_param("s", $room_name);
$stmt->execute();
$room_exists = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$room_exists) fail(422, "Unit {$room_name} does not exist.");

$date = DateTime::createFromFormat('!Y-m-d', $reading_date);
if (!$date || $date->format('Y-m-d') !== $reading_date) fail(422, "Reading date must be a valid date (YYYY-MM-DD).");
if ($reading_date > date('Y-m-d')) fail(422, "Reading date cannot be in the future.");
if ($reading_date < $billing_period . '-01') fail(422, "Reading date cannot be before the start of the billing period.");

// Readings form a chain: each one's "previous" is the reading before it. Adding
// one out of order would leave the later reading computed from the wrong base.
$stmt = $conn->prepare("SELECT billing_period FROM utility_readings WHERE room_name = ? AND billing_period >= ? ORDER BY billing_period DESC LIMIT 1");
$stmt->bind_param("ss", $room_name, $billing_period);
$stmt->execute();
$later = $stmt->get_result()->fetch_assoc();
$stmt->close();
if ($later) {
    if ($later['billing_period'] === $billing_period) {
        fail(409, "A reading for Unit {$room_name} ({$billing_period}) already exists. Delete it first if it needs correcting.");
    }
    fail(409, "Unit {$room_name} already has a reading for {$later['billing_period']}. Readings must be recorded in order, oldest first.");
}

$stmt = $conn->prepare("SELECT water_curr_reading, electric_curr_reading, water_rate_per_unit, electric_rate_per_unit FROM utility_readings WHERE room_name = ? AND billing_period < ? ORDER BY billing_period DESC LIMIT 1");
$stmt->bind_param("ss", $room_name, $billing_period);
$stmt->execute();
$prev = $stmt->get_result()->fetch_assoc();
$stmt->close();

$water_prev_reading = $prev ? (float)$prev['water_curr_reading'] : 0.00;
$electric_prev_reading = $prev ? (float)$prev['electric_curr_reading'] : 0.00;

$water_curr_reading = number_field($input, 'water_curr_reading');
$electric_curr_reading = number_field($input, 'electric_curr_reading');
// Rates default to the unit's last rate, so a correction to one field doesn't silently reset the other.
$water_rate_per_unit = number_field($input, 'water_rate_per_unit', $prev ? (float)$prev['water_rate_per_unit'] : 40.00);
$electric_rate_per_unit = number_field($input, 'electric_rate_per_unit', $prev ? (float)$prev['electric_rate_per_unit'] : 12.00);
$water_other_fees = number_field($input, 'water_other_fees', 0.00);
$electric_other_fees = number_field($input, 'electric_other_fees', 0.00);

if ($water_curr_reading === null || $electric_curr_reading === null) fail(422, "Current water and electricity meter readings are required and must be numbers.");
if ($water_curr_reading < 0 || $electric_curr_reading < 0) fail(422, "Meter readings cannot be negative.");
if ($water_rate_per_unit === null || $water_rate_per_unit <= 0 || $water_rate_per_unit > 1000) fail(422, "Water rate must be greater than ₱0 and at most ₱1,000 per m³.");
if ($electric_rate_per_unit === null || $electric_rate_per_unit <= 0 || $electric_rate_per_unit > 1000) fail(422, "Electricity rate must be greater than ₱0 and at most ₱1,000 per kWh.");
if ($water_other_fees === null || $water_other_fees < 0 || $electric_other_fees === null || $electric_other_fees < 0) fail(422, "Other fees cannot be negative.");

// A meter never runs backwards. Previously a lower value was clamped to zero
// consumption, hiding a typo or a replaced meter and under-billing the month.
if ($water_curr_reading < $water_prev_reading) {
    fail(422, "Water reading ({$water_curr_reading}) is lower than the previous reading ({$water_prev_reading}) for Unit {$room_name}. Check the meter value.");
}
if ($electric_curr_reading < $electric_prev_reading) {
    fail(422, "Electricity reading ({$electric_curr_reading}) is lower than the previous reading ({$electric_prev_reading}) for Unit {$room_name}. Check the meter value.");
}

$water_consumption = round($water_curr_reading - $water_prev_reading, 2);
$water_amount = round($water_consumption * $water_rate_per_unit, 2);
$electric_consumption = round($electric_curr_reading - $electric_prev_reading, 2);
$electric_amount = round($electric_consumption * $electric_rate_per_unit, 2);

$tenancy = get_room_tenancy($conn, $room_name);
$user_id = $tenancy ? (int)$tenancy['user_id'] : null;

$stmt = $conn->prepare("INSERT INTO utility_readings
    (room_name, user_id, billing_period, reading_date, water_prev_reading, water_curr_reading, water_rate_per_unit, water_consumption, water_amount, water_other_fees, electric_prev_reading, electric_curr_reading, electric_rate_per_unit, electric_consumption, electric_amount, electric_other_fees, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
$stmt->bind_param("sissddddddddddddsi",
    $room_name, $user_id, $billing_period, $reading_date,
    $water_prev_reading, $water_curr_reading, $water_rate_per_unit, $water_consumption, $water_amount, $water_other_fees,
    $electric_prev_reading, $electric_curr_reading, $electric_rate_per_unit, $electric_consumption, $electric_amount, $electric_other_fees,
    $notes, $admin_id
);

try {
    $ok = $stmt->execute();
    $errno = $stmt->errno;
} catch (mysqli_sql_exception $e) {
    $ok = false;
    $errno = $e->getCode();
}
$stmt->close();

if (!$ok) {
    // The unique key catches a concurrent save of the same unit and period.
    if ($errno === 1062) fail(409, "A reading for Unit {$room_name} ({$billing_period}) already exists.");
    fail(500, "Failed to save the reading.");
}
$reading_id = $conn->insert_id;

$total = round($water_amount + $water_other_fees + $electric_amount + $electric_other_fees, 2);
log_activity($conn, $admin_id, 'utilities', 'Recorded Utility Reading', "Recorded utility reading #{$reading_id} for Unit {$room_name} ({$billing_period}) — ₱" . number_format($total, 2));

$response = [
    "success" => true,
    "message" => "Utility reading saved successfully.",
    "id" => $reading_id,
    "water_consumption" => $water_consumption,
    "electric_consumption" => $electric_consumption,
    "total_amount" => $total,
];
if (!$user_id) {
    $response["warning"] = "Unit {$room_name} has no billable tenant right now, so this reading cannot be invoiced until one is assigned.";
}
echo json_encode($response);
$conn->close();
?>
