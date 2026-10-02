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

function parking_fail($code, $message) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

// The reservation belongs to the session user; any userId in the form is ignored.
$auth = require_user($conn);
if ($auth['role'] !== 'user' || !get_active_tenancy($conn, $auth['id'])) {
    parking_fail(403, "Only tenants with an active rental can reserve parking.");
}
$user_id = $auth['id'];

// The Services page hid parking when the module was switched off, but the
// endpoint still accepted requests.
if (get_setting($conn, 'service_parking_active', 'true') === 'false') {
    parking_fail(403, "Parking reservations are currently unavailable.");
}

$vehicle_type = strtolower(trim($_POST['vehicleType'] ?? ''));
$vehicle_model = trim($_POST['vehicleModel'] ?? '');
$plate_number = strtoupper(trim($_POST['plateNumber'] ?? ''));
$transmission = trim($_POST['transmission'] ?? '');
$duration_raw = trim($_POST['durationMonths'] ?? '');

// ── Validate everything before touching the upload ──
if ($vehicle_type === '' || $vehicle_model === '' || $plate_number === '' || $transmission === '' || $duration_raw === '') {
    parking_fail(422, "All fields are required.");
}
if (mb_strlen($vehicle_model) < 2 || mb_strlen($vehicle_model) > 100) {
    parking_fail(422, "Vehicle model must be between 2 and 100 characters.");
}
// Plate numbers, conduction stickers, or MV file numbers (up to 15 digits) —
// the same rule the form applies. The server used to cap this at 10 characters,
// so an MV file number the form accepted was refused.
if (!preg_match('/^[A-Z0-9][A-Z0-9 \-]{2,14}$/', $plate_number)) {
    parking_fail(422, "Invalid plate number. Use 3–15 letters, digits, spaces or dashes (e.g. ABC 1234).");
}
if (!in_array($transmission, ['Automatic', 'Manual'], true)) {
    parking_fail(422, "Transmission must be Automatic or Manual.");
}
if (!ctype_digit($duration_raw) || (int)$duration_raw < 1 || (int)$duration_raw > PARKING_MAX_DURATION_MONTHS) {
    parking_fail(422, "Duration must be between 1 and " . PARKING_MAX_DURATION_MONTHS . " months.");
}
$duration_months = (int)$duration_raw;

$allowed_vehicle_types = ['motorcycle'];
$decoded = json_decode((string)get_setting($conn, 'parking_allowed_vehicle_types', ''), true);
if (is_array($decoded) && count($decoded) > 0) {
    $allowed_vehicle_types = array_map('strtolower', $decoded);
}
if (!in_array($vehicle_type, $allowed_vehicle_types, true)) {
    parking_fail(422, "This vehicle type is not currently accepted for parking reservations.");
}

// One open reservation per tenant (also enforced by a unique key).
$open = $conn->prepare("SELECT status FROM parking_reservations WHERE user_id = ? AND status IN ('Pending', 'Assigned') LIMIT 1");
$open->bind_param("i", $user_id);
$open->execute();
$existing = $open->get_result()->fetch_assoc();
$open->close();
if ($existing) {
    parking_fail(409, $existing['status'] === 'Assigned'
        ? "You already have an assigned parking slot."
        : "You already have a parking request awaiting review.");
}

// Only Assigned reservations hold a slot. A request can still be filed while the
// lot is full? No — the tenant is told straight away, as in the panel's flow.
$capacity = parking_capacity($conn);
if ($capacity['available'] <= 0) {
    parking_fail(409, "No parking slots available at this time.");
}

$file = $_FILES['uploadedFile'] ?? null;
if (!$file || $file['error'] === UPLOAD_ERR_NO_FILE) {
    parking_fail(422, "Vehicle registration document (OR/CR) is required.");
}
if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 10 * 1024 * 1024) {
    parking_fail(422, "The document must be a JPG, PNG or PDF of 10MB or less.");
}
$file_ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if (!in_array($file_ext, ['jpg', 'jpeg', 'png', 'pdf'], true)) {
    parking_fail(422, "Invalid document format. Allowed formats: JPG, PNG, PDF.");
}
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);
if (!in_array($mime, ['image/jpeg', 'image/png', 'application/pdf'], true)) {
    parking_fail(422, "File content does not match allowed Image or PDF format.");
}

$upload_dir = __DIR__ . "/../uploads/documents/";
if (!is_dir($upload_dir)) {
    mkdir($upload_dir, 0755, true);
}
$unique_file_name = time() . "_" . bin2hex(random_bytes(6)) . "_" . preg_replace("/[^a-zA-Z0-9.]/", "_", basename($file['name']));
if (!move_uploaded_file($file['tmp_name'], $upload_dir . $unique_file_name)) {
    parking_fail(500, "Failed to save the uploaded document.");
}
$document_path = "uploads/documents/" . $unique_file_name;

$total_cost = $duration_months * parking_monthly_fee($conn);

$stmt = $conn->prepare("INSERT INTO parking_reservations (user_id, vehicle_type, vehicle_model, plate_number, status, transmission, duration_months, total_cost, document_path) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?)");
$stmt->bind_param("issssids", $user_id, $vehicle_type, $vehicle_model, $plate_number, $transmission, $duration_months, $total_cost, $document_path);

try {
    $stmt->execute();
} catch (mysqli_sql_exception $e) {
    $duplicate = $e->getCode() === 1062;
    $stmt->close();
    @unlink($upload_dir . $unique_file_name);
    if ($duplicate) {
        parking_fail(409, "You already have an open parking reservation.");
    }
    error_log('[AMS] parking_reservation insert failed: ' . $e->getMessage());
    parking_fail(500, "Failed to create the reservation. Please try again.");
}
$reservation_id = $stmt->insert_id;
$stmt->close();

notify_admins_queue($conn, 'parking_reservation', $reservation_id, "New Parking Reservation",
    "A new parking reservation request for plate $plate_number ($vehicle_model, $duration_months month(s)) has been submitted.");
log_activity($conn, $user_id, 'service', "Requested Parking", "Reservation ID: $reservation_id, Plate: $plate_number, $duration_months month(s)");

echo json_encode(["success" => true, "message" => "Reservation created successfully", "id" => $reservation_id]);
$conn->close();
