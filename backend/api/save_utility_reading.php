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

// Only an occupied unit has someone to bill. A vacant or unoccupied unit is
// refused instead of saving a reading nobody can be invoiced for.
$tenancy = get_room_tenancy($conn, $room_name);
$user_id = $tenancy ? (int)$tenancy['user_id'] : null;
if (!$user_id) fail(422, "Unit {$room_name} has no tenant right now. Readings can only be recorded for an occupied unit.");

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

// "Record total only": the tenant paid the whole amount, so the admin enters a
// single total (and a note) with no meter readings. It bills through the same
// sync as a metered reading and does not break the meter chain: later metered
// readings take their "previous" from the last metered row.
$entry_mode_raw = $input['entry_mode'] ?? 'metered';
if (!in_array($entry_mode_raw, ['metered', 'total', 'bill'], true)) fail(422, "Choose how the utilities are recorded: provider bill, meter readings or total only.");
$entry_mode = $entry_mode_raw;
if (mb_strlen($notes) > 500) fail(422, "The note can be up to 500 characters.");

// The latest earlier meter value per utility, from any row that has one (a
// metered reading, or a provider bill where a reading was also noted). Bill rows
// without a reading store NULL and are skipped, so the chain stays intact.
$stmt = $conn->prepare("SELECT
    (SELECT water_curr_reading FROM utility_readings WHERE room_name = ? AND billing_period < ? AND entry_mode IN ('metered', 'bill') AND water_curr_reading IS NOT NULL ORDER BY billing_period DESC LIMIT 1) AS water_prev,
    (SELECT electric_curr_reading FROM utility_readings WHERE room_name = ? AND billing_period < ? AND entry_mode IN ('metered', 'bill') AND electric_curr_reading IS NOT NULL ORDER BY billing_period DESC LIMIT 1) AS electric_prev");
$stmt->bind_param("ssss", $room_name, $billing_period, $room_name, $billing_period);
$stmt->execute();
$prev_meter = $stmt->get_result()->fetch_assoc();
$stmt->close();

// "Provider bill": the tenant pays exactly what the Meralco / Prime Water bill
// says. The bill amounts go to water_amount / electric_amount (so
// sync_utility_to_invoice.php bills them unchanged); a meter reading is optional
// information only and is never multiplied by a rate.
$bill_mode = $entry_mode === 'bill';
if ($bill_mode) {
    $amount_or_fail = function ($key, $label) use ($input) {
        $v = number_field($input, $key, 0.0);
        if ($v === null) fail(422, "{$label} bill amount must be a number.");
        if ($v < 0) fail(422, "{$label} bill amount cannot be negative.");
        if ($v > 1000000) fail(422, "{$label} bill amount can be at most ₱1,000,000.");
        return round($v, 2);
    };
    $water_bill = $amount_or_fail('water_bill_amount', 'Water');
    $electric_bill = $amount_or_fail('electric_bill_amount', 'Electricity');
    if ($water_bill <= 0 && $electric_bill <= 0) fail(422, "Enter the water or electricity bill amount (at least one above ₱0).");

    // Optional meter value: stored with its consumption only when one is given.
    $reading_or_fail = function ($key, $label, $prev) use ($input, $room_name) {
        $v = number_field($input, $key);
        if (array_key_exists($key, $input) && $input[$key] !== '' && $input[$key] !== null && $v === null) fail(422, "{$label} meter reading must be a number.");
        if ($v === null) return [null, null, null];
        if ($v < 0) fail(422, "Meter readings cannot be negative.");
        if ($v > 1000000) fail(422, "{$label} meter reading is too large.");
        $v = round($v, 2);
        if ($prev !== null && $v < (float)$prev) {
            fail(422, "{$label} reading ({$v}) is lower than the previous reading (" . (float)$prev . ") for Unit {$room_name}. Check the meter value.");
        }
        // The first reading on record is the starting point: no consumption yet.
        return $prev === null ? [null, $v, null] : [(float)$prev, $v, round($v - (float)$prev, 2)];
    };
    [$water_prev_reading, $water_curr_reading, $water_consumption] = $reading_or_fail('water_curr_reading', 'Water', $prev_meter['water_prev'] ?? null);
    [$electric_prev_reading, $electric_curr_reading, $electric_consumption] = $reading_or_fail('electric_curr_reading', 'Electricity', $prev_meter['electric_prev'] ?? null);
    $water_rate_per_unit = null;
    $electric_rate_per_unit = null;
    $water_amount = $water_bill;
    $electric_amount = $electric_bill;
    $water_other_fees = 0.0;
    $electric_other_fees = 0.0;
}

if ($entry_mode === 'total') {
    $total_amount = number_field($input, 'total_amount');
    if ($total_amount === null || $total_amount <= 0) fail(422, "Enter the total amount paid (greater than ₱0).");
    if ($total_amount > 1000000) fail(422, "The total amount is too large.");
    $total_amount = round($total_amount, 2);
    if (!empty($input['items'])) fail(422, "Extra utilities are not used when recording a total only.");
    if (mb_strlen($notes) > 500) fail(422, "The note can be up to 500 characters.");

    $stmt = $conn->prepare("INSERT INTO utility_readings (room_name, user_id, billing_period, reading_date, entry_mode, total_amount, notes, recorded_by) VALUES (?, ?, ?, ?, 'total', ?, ?, ?)");
    $stmt->bind_param("sissdsi", $room_name, $user_id, $billing_period, $reading_date, $total_amount, $notes, $admin_id);
    try {
        $ok = $stmt->execute();
        $errno = $stmt->errno;
    } catch (mysqli_sql_exception $e) {
        $ok = false;
        $errno = $e->getCode();
    }
    $stmt->close();
    if (!$ok) {
        if ($errno === 1062) fail(409, "A reading for Unit {$room_name} ({$billing_period}) already exists.");
        fail(500, "Failed to save the record.");
    }
    $reading_id = $conn->insert_id;
    log_activity($conn, $admin_id, 'utilities', 'Recorded Utility Total', "Recorded utility total #{$reading_id} for Unit {$room_name} ({$billing_period}) — ₱" . number_format($total_amount, 2));
    echo json_encode(["success" => true, "message" => "Utility total saved successfully.", "id" => $reading_id, "total_amount" => $total_amount]);
    $conn->close();
    exit;
}
if (!$bill_mode) {
// Rates carry over from the last metered row only (a bill row has no rate).
$stmt = $conn->prepare("SELECT water_rate_per_unit, electric_rate_per_unit FROM utility_readings WHERE room_name = ? AND billing_period < ? AND entry_mode = 'metered' ORDER BY billing_period DESC LIMIT 1");
$stmt->bind_param("ss", $room_name, $billing_period);
$stmt->execute();
$prev = $stmt->get_result()->fetch_assoc();
$stmt->close();

$water_prev_reading = $prev_meter['water_prev'] !== null ? (float)$prev_meter['water_prev'] : 0.00;
$electric_prev_reading = $prev_meter['electric_prev'] !== null ? (float)$prev_meter['electric_prev'] : 0.00;

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
}

// Extra utility types: items = [{type_id, curr_reading?, rate?, other_fees?}].
// Metered types bill (reading - previous) x rate; flat types bill the rate.
$items = [];
$raw_items = $input['items'] ?? [];
if (!is_array($raw_items)) fail(422, "Extra utilities must be a list.");
$seen_types = [];
foreach ($raw_items as $raw) {
    $type_id = (int)($raw['type_id'] ?? 0);
    if ($type_id <= 0 || isset($seen_types[$type_id])) fail(422, "Each extra utility can be entered once.");
    $seen_types[$type_id] = true;

    $stmt = $conn->prepare("SELECT id, name, billing_mode, default_rate, is_active FROM utility_types WHERE id = ?");
    $stmt->bind_param("i", $type_id);
    $stmt->execute();
    $type = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$type || !(int)$type['is_active']) fail(422, "That utility type is not available.");

    $rate = number_field($raw, 'rate', (float)$type['default_rate']);
    $fees = number_field($raw, 'other_fees', 0.00);
    if ($rate === null || $rate < 0 || $rate > 100000) fail(422, "{$type['name']}: enter a valid rate or fee.");
    if ($fees === null || $fees < 0) fail(422, "{$type['name']}: other fees cannot be negative.");

    $item = ['type_id' => $type_id, 'prev' => null, 'curr' => null, 'consumption' => null, 'rate' => $rate, 'fees' => $fees];
    if ($type['billing_mode'] === 'metered') {
        $curr = number_field($raw, 'curr_reading');
        if ($curr === null || $curr < 0) fail(422, "{$type['name']}: enter the current meter reading.");
        $stmt = $conn->prepare("SELECT i.curr_reading FROM utility_reading_items i JOIN utility_readings r ON r.id = i.reading_id
                                WHERE r.room_name = ? AND i.type_id = ? AND r.billing_period < ? ORDER BY r.billing_period DESC LIMIT 1");
        $stmt->bind_param("sis", $room_name, $type_id, $billing_period);
        $stmt->execute();
        $p = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        $prev_item = $p ? (float)$p['curr_reading'] : 0.00;
        if ($curr < $prev_item) fail(422, "{$type['name']} reading ({$curr}) is lower than the previous reading ({$prev_item}) for Unit {$room_name}.");
        $item['prev'] = $prev_item;
        $item['curr'] = $curr;
        $item['consumption'] = round($curr - $prev_item, 2);
        $item['amount'] = round($item['consumption'] * $rate, 2);
    } else {
        $item['amount'] = round($rate, 2);
    }
    $items[] = $item;
}

$conn->begin_transaction();
$stmt = $conn->prepare("INSERT INTO utility_readings
    (room_name, user_id, billing_period, reading_date, entry_mode, water_prev_reading, water_curr_reading, water_rate_per_unit, water_consumption, water_amount, water_other_fees, electric_prev_reading, electric_curr_reading, electric_rate_per_unit, electric_consumption, electric_amount, electric_other_fees, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
// A provider-bill row without a meter reading stores NULL readings and rates.
$stmt->bind_param("sisssddddddddddddsi",
    $room_name, $user_id, $billing_period, $reading_date, $entry_mode,
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
    $conn->rollback();
    // The unique key catches a concurrent save of the same unit and period.
    if ($errno === 1062) fail(409, "A reading for Unit {$room_name} ({$billing_period}) already exists.");
    fail(500, "Failed to save the reading.");
}
$reading_id = $conn->insert_id;

$extra_total = 0.0;
foreach ($items as $item) {
    $ins = $conn->prepare("INSERT INTO utility_reading_items (reading_id, type_id, prev_reading, curr_reading, consumption, rate, amount, other_fees) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $ins->bind_param("iiddddd" . "d", $reading_id, $item['type_id'], $item['prev'], $item['curr'], $item['consumption'], $item['rate'], $item['amount'], $item['fees']);
    if (!$ins->execute()) {
        $ins->close();
        $conn->rollback();
        fail(500, "Failed to save the extra utility charges.");
    }
    $ins->close();
    $extra_total += $item['amount'] + $item['fees'];
}
$conn->commit();

$total = round($water_amount + $water_other_fees + $electric_amount + $electric_other_fees + $extra_total, 2);
if ($bill_mode) {
    log_activity($conn, $admin_id, 'utilities', 'Recorded Utility Bill', "Recorded provider bill #{$reading_id} for Unit {$room_name} ({$billing_period}) — water ₱" . number_format($water_amount, 2) . ", electricity ₱" . number_format($electric_amount, 2) . " (total ₱" . number_format($total, 2) . ")");
} else {
    log_activity($conn, $admin_id, 'utilities', 'Recorded Utility Reading', "Recorded utility reading #{$reading_id} for Unit {$room_name} ({$billing_period}) — ₱" . number_format($total, 2));
}

$response = [
    "success" => true,
    "message" => $bill_mode ? "Utility bill saved successfully." : "Utility reading saved successfully.",
    "id" => $reading_id,
    "entry_mode" => $entry_mode,
    "water_amount" => $water_amount,
    "electric_amount" => $electric_amount,
    "water_consumption" => $water_consumption,
    "electric_consumption" => $electric_consumption,
    "total_amount" => $total,
];
echo json_encode($response);
$conn->close();
?>
