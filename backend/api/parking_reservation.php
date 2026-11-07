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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

// A tenant's parking request (multipart form), or cancelling one.
//   slotId          the slot tapped on the page (parking_slots.id); it must be
//                   free and take the vehicle type. Requests do not hold a slot:
//                   the admin assigns one, and requests left without a slot
//                   once the lot is full are closed (parking_close_unservable_requests).
//   vehicleType     one of the slot's types
//   vehicleModel    2-100 characters
//   plateNumber     required, except for an e-bike (optional, checked if given)
//   transmission    Automatic | Manual; not asked for an e-bike
//   durationMonths  1 to parking_max_duration_months
//   uploadedFile    the OR/CR, required when the slot requires it
// { action: 'cancel', id }  withdraws the tenant's own Pending request.
// A tenant may hold parking_max_per_tenant open reservations; the fee per month
// is fixed now (0 while parking is free).

function parking_fail($code, $message, $field = null) {
    if ($field) validation_fail([$field => $message], $code);
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

// The reservation belongs to the session user; any userId in the form is ignored.
$auth = require_user($conn);
$user_id = (int)$auth['id'];

if (($_POST['action'] ?? '') === 'cancel') {
    if ($auth['role'] !== 'user') parking_fail(403, "Only tenants can cancel a parking request.");
    $id = (int)($_POST['id'] ?? 0);
    $stmt = $conn->prepare("UPDATE parking_reservations SET status = 'Cancelled' WHERE id = ? AND user_id = ? AND status = 'Pending'");
    $stmt->bind_param("ii", $id, $user_id);
    $stmt->execute();
    $changed = $stmt->affected_rows;
    $stmt->close();
    if (!$changed) parking_fail(409, "Only a request still awaiting review can be cancelled.");
    resolve_admin_queue($conn, 'parking_reservation', $id);
    log_activity($conn, $user_id, 'service', "Cancelled Parking Request", "Reservation ID: $id");
    echo json_encode(["success" => true, "message" => "Parking request cancelled."]);
    $conn->close();
    exit;
}

if ($auth['role'] !== 'user' || !get_active_tenancy($conn, $user_id)) {
    parking_fail(403, "Only tenants with an active rental can reserve parking.");
}

// The Services page hid parking when the module was switched off, but the
// endpoint still accepted requests.
if (get_setting($conn, 'service_parking_active', 'true') === 'false') {
    parking_fail(403, "Parking reservations are currently unavailable.");
}

$slot_raw = trim((string)($_POST['slotId'] ?? ''));
$vehicle_type = strtolower(trim((string)($_POST['vehicleType'] ?? '')));
$vehicle_model = trim((string)($_POST['vehicleModel'] ?? ''));
$plate_number = strtoupper(trim((string)($_POST['plateNumber'] ?? '')));
$transmission = trim((string)($_POST['transmission'] ?? ''));
$duration_raw = trim((string)($_POST['durationMonths'] ?? ''));
$max_months = parking_max_duration_months($conn);
$no_plate = in_array($vehicle_type, PARKING_NO_PLATE_TYPES, true);

// ── Validate everything before touching the upload ──
$slots = parking_slots($conn);
// Pages from before slots existed sent no slotId: take the first free slot for the type.
if ($slot_raw === '') {
    $first = array_key_first(parking_free_slots($slots, parking_assigned_by_slot($conn), $vehicle_type));
    $slot_raw = $first !== null ? (string)$first : '';
}
$slot = ctype_digit($slot_raw) ? ($slots[(int)$slot_raw] ?? null) : null;

$errors = [];
if (!in_array($vehicle_type, PARKING_VEHICLE_TYPES, true)) {
    $errors['vehicleType'] = "This vehicle type is not accepted for parking.";
} elseif ($slot && !in_array($vehicle_type, $slot['vehicle_types'], true)) {
    $errors['vehicleType'] = "Slot {$slot['label']} does not take this vehicle type.";
}
if (mb_strlen($vehicle_model) < 2 || mb_strlen($vehicle_model) > 100) {
    $errors['vehicleModel'] = "Vehicle model must be between 2 and 100 characters.";
}
// Plate numbers, conduction stickers, or MV file numbers (up to 15 digits).
if ($plate_number === '') {
    if (!$no_plate) $errors['plateNumber'] = "Enter the plate number.";
} elseif (!preg_match('/^[A-Z0-9][A-Z0-9 \-]{2,14}$/', $plate_number)) {
    $errors['plateNumber'] = "Invalid plate number. Use 3-15 letters, digits, spaces or dashes (e.g. ABC 1234).";
}
if ($no_plate) {
    $transmission = '';
} elseif (!in_array($transmission, ['Automatic', 'Manual'], true)) {
    $errors['transmission'] = "Transmission must be Automatic or Manual.";
}
if (!ctype_digit($duration_raw) || (int)$duration_raw < 1 || (int)$duration_raw > $max_months) {
    $errors['durationMonths'] = "Duration must be between 1 and $max_months months.";
}
if ($errors) validation_fail($errors);
$duration_months = (int)$duration_raw;

if (!$slot) {
    parking_fail(409, ctype_digit($slot_raw) || $slot_raw === ''
        ? "No parking slot is free for this vehicle type right now."
        : "Choose a parking slot.");
}
if ($slot['status'] !== 'active') parking_fail(409, "Slot {$slot['label']} is under maintenance. Choose another slot.");

$file = $_FILES['uploadedFile'] ?? null;
$has_file = $file && $file['error'] !== UPLOAD_ERR_NO_FILE;
if ($slot['requires_registration'] && !$has_file) {
    parking_fail(422, "Vehicle registration document (OR/CR) is required for this slot.", 'uploadedFile');
}
if ($has_file) {
    if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 10 * 1024 * 1024) {
        parking_fail(422, "The document must be a JPG, PNG or PDF of 10MB or less.", 'uploadedFile');
    }
    $file_ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($file_ext, ['jpg', 'jpeg', 'png', 'pdf'], true)) {
        parking_fail(422, "Invalid document format. Allowed formats: JPG, PNG, PDF.", 'uploadedFile');
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'application/pdf'], true)) {
        parking_fail(422, "File content does not match allowed Image or PDF format.", 'uploadedFile');
    }
}

// One tenant's requests one at a time: the open-count and same-plate checks
// below, and the insert, cannot interleave with a second tab.
$lock_name = "ams_parking_user_$user_id";
$got = (int)($conn->query("SELECT GET_LOCK('$lock_name', 10) AS got")->fetch_assoc()['got'] ?? 0);
if (!$got) parking_fail(409, "Another parking request is being sent. Try again in a moment.");
$release = function () use ($conn, $lock_name) { $conn->query("SELECT RELEASE_LOCK('$lock_name')"); };

$open = $conn->prepare("SELECT status, plate_number FROM parking_reservations WHERE user_id = ? AND status IN ('Pending', 'Assigned')");
$open->bind_param("i", $user_id);
$open->execute();
$existing = $open->get_result()->fetch_all(MYSQLI_ASSOC);
$open->close();
$max_open = parking_max_per_tenant($conn);
if (count($existing) >= $max_open) {
    $release();
    parking_fail(409, $max_open === 1
        ? (($existing[0]['status'] ?? '') === 'Assigned' ? "You already have an assigned parking slot." : "You already have a parking request awaiting review.")
        : "You already have $max_open open parking reservations, the most allowed.");
}
if ($plate_number !== '' && in_array($plate_number, array_column($existing, 'plate_number'), true)) {
    $release();
    parking_fail(409, "Plate $plate_number already has an open parking reservation.", 'plateNumber');
}

// The slot must still be free: a request is refused when nothing is left.
if (isset(parking_assigned_by_slot($conn)[$slot['id']])) {
    $release();
    parking_fail(409, "Slot {$slot['label']} was just taken. Choose another slot.");
}

$document_path = null;
$saved_file = null;
if ($has_file) {
    $upload_dir = __DIR__ . "/../uploads/documents/";
    if (!is_dir($upload_dir)) mkdir($upload_dir, 0755, true);
    $unique_file_name = time() . "_" . bin2hex(random_bytes(6)) . "_" . preg_replace("/[^a-zA-Z0-9.]/", "_", basename($file['name']));
    if (!move_uploaded_file($file['tmp_name'], $upload_dir . $unique_file_name)) {
        $release();
        parking_fail(500, "Failed to save the uploaded document.");
    }
    $document_path = "uploads/documents/" . $unique_file_name;
    $saved_file = $upload_dir . $unique_file_name;
}

$monthly_fee = parking_monthly_fee($conn);
$total_cost = $duration_months * $monthly_fee;
$plate_db = $plate_number !== '' ? $plate_number : null;
$transmission_db = $transmission !== '' ? $transmission : null;
$slot_id = $slot['id'];

try {
    $stmt = $conn->prepare("INSERT INTO parking_reservations (user_id, vehicle_type, vehicle_model, plate_number, status, slot_number, transmission, duration_months, total_cost, monthly_fee, document_path) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("isssisidds", $user_id, $vehicle_type, $vehicle_model, $plate_db, $slot_id, $transmission_db, $duration_months, $total_cost, $monthly_fee, $document_path);
    $stmt->execute();
    $reservation_id = $stmt->insert_id;
    $stmt->close();
} catch (mysqli_sql_exception $e) {
    $release();
    if ($saved_file) @unlink($saved_file);
    error_log('[AMS] parking_reservation insert failed: ' . $e->getMessage());
    parking_fail(500, "Failed to create the reservation. Please try again.");
}
$release();

$vehicle = $vehicle_model . ($plate_db ? " ($plate_db)" : '');
notify_admins_queue($conn, 'parking_reservation', $reservation_id, "New Parking Reservation",
    "A new parking request for slot {$slot['label']}: $vehicle, $duration_months month(s).");
log_activity($conn, $user_id, 'service', "Requested Parking", "Reservation ID: $reservation_id, slot {$slot['label']}, " . ($plate_db ?: $vehicle_type) . ", $duration_months month(s)");

echo json_encode(["success" => true, "message" => "Reservation created successfully", "id" => $reservation_id]);
$conn->close();
