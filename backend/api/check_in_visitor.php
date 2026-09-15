<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// A tenant registers a visitor for their own unit; an admin logs a walk-in for
// any unit. Both the unit and the host tenant used to come from the request
// body, so a tenant could file visitors under someone else's unit and name.
$auth = require_user($conn);
$isAdmin = $auth['role'] === 'admin';

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

// The database has no STRICT sql_mode, so an over-length value is silently
// truncated rather than rejected — these caps match the column widths and
// are enforced here instead.
const VISITOR_ID_TYPES = ["National ID", "Driver's License", "Passport", "UMID / SSS", "Student / Work ID", "Company / Student ID"];

$input = !empty($_POST) ? $_POST : (json_decode(file_get_contents("php://input"), true) ?: []);

$visitor_name = trim($input['visitorName'] ?? $input['visitor_name'] ?? '');
$contact_number = trim($input['contactNumber'] ?? $input['contact_number'] ?? '');
$purpose = trim($input['purpose'] ?? '');
$id_type = trim($input['idType'] ?? $input['id_type'] ?? 'National ID');
$id_number = trim($input['idNumber'] ?? $input['id_number'] ?? '');
$vehicle_plate = strtoupper(trim($input['vehiclePlate'] ?? $input['vehicle_plate'] ?? ''));
$expected_at_raw = trim($input['expectedAt'] ?? $input['expected_at'] ?? '');

if (mb_strlen($visitor_name) > 150) fail(422, "Visitor name must be 150 characters or fewer.");
if (mb_strlen($contact_number) > 30) fail(422, "Contact number must be 30 characters or fewer.");
if ($contact_number !== '' && !preg_match('/^[0-9+\-\s()]{7,30}$/', $contact_number)) fail(422, "Contact number format is invalid.");
if (mb_strlen($purpose) > 255) fail(422, "Purpose must be 255 characters or fewer.");
if (!in_array($id_type, VISITOR_ID_TYPES, true)) fail(422, "Invalid ID type.");
if (mb_strlen($id_number) > 50) fail(422, "ID number must be 50 characters or fewer.");
if (mb_strlen($vehicle_plate) > 30) fail(422, "Vehicle plate must be 30 characters or fewer.");

// The visitor management module can be switched off entirely — this used to
// only hide the Services card; the endpoint kept accepting registrations.
// Walk-ins are unaffected: an admin logging someone already at the door
// isn't a "reservation" the toggle is meant to gate.
if (!$isAdmin && get_setting($conn, 'service_visitor_management_active', 'true') === 'false') {
    fail(403, "Visitor registration is currently unavailable.");
}

if ($isAdmin) {
    $room_name = trim($input['unit'] ?? $input['room_name'] ?? '');
    if ($room_name === '') fail(422, "Unit is required.");

    $r = $conn->prepare("SELECT 1 FROM rooms WHERE id = ?");
    $r->bind_param("s", $room_name);
    $r->execute();
    $room_exists = (bool)$r->get_result()->fetch_assoc();
    $r->close();
    if (!$room_exists) fail(422, "Unit $room_name does not exist.");

    // The host is whoever currently rents the unit, never a posted userId.
    $target_user_id = null;
    $u_stmt = $conn->prepare("SELECT user_id FROM rent_applications WHERE room_name = ? AND status IN ('Approved', 'active', 'pending-move-out') ORDER BY id DESC LIMIT 1");
    $u_stmt->bind_param("s", $room_name);
    $u_stmt->execute();
    $u_res = $u_stmt->get_result()->fetch_assoc();
    $u_stmt->close();
    if ($u_res) $target_user_id = (int)$u_res['user_id'];
} else {
    $tenancy = get_active_tenancy($conn, $auth['id']);
    if (!$tenancy) fail(403, "Only tenants with an active lease can register visitors.");
    $room_name = $tenancy['room_name'];
    $target_user_id = $auth['id'];
}

if ($visitor_name === '' || $contact_number === '' || $purpose === '') {
    fail(422, "Visitor name, contact number and purpose are required.");
}

// Expected arrival: required for a tenant's pre-registration (check_in_at is
// only ever stamped once the visitor is actually approved/admitted, so a
// pending row needs its own idea of "when"), ignored for a walk-in the admin
// is logging as it happens.
$expected_at = null;
if (!$isAdmin) {
    if ($expected_at_raw === '') fail(422, "Expected arrival date/time is required.");
    $expected_dt = DateTime::createFromFormat('Y-m-d\TH:i', $expected_at_raw) ?: DateTime::createFromFormat('Y-m-d H:i:s', $expected_at_raw);
    if (!$expected_dt) fail(422, "Expected arrival must be a valid date/time.");
    $now = new DateTime();
    $max = (clone $now)->modify('+30 days');
    if ($expected_dt < $now->modify('-1 hour')) fail(422, "Expected arrival cannot be in the past.");
    if ($expected_dt > $max) fail(422, "Expected arrival must be within 30 days.");
    $expected_at = $expected_dt->format('Y-m-d H:i:s');
}

// Government ID photo: images only, 5MB, checked by extension and content (security audit B-7).
$id_photo_path = null;
if (isset($_FILES['idPhoto']) && $_FILES['idPhoto']['error'] !== UPLOAD_ERR_NO_FILE) {
    $file = $_FILES['idPhoto'];
    if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 5 * 1024 * 1024) fail(422, "ID photo must be an image of 5MB or less.");

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'], true)) fail(422, "ID photo must be a JPG, PNG or WEBP image.");

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) fail(422, "ID photo content is not a valid image.");

    $upload_dir = "../uploads/visitors/";
    if (!file_exists($upload_dir)) mkdir($upload_dir, 0755, true);
    $filename = "visitor_id_" . time() . "_" . bin2hex(random_bytes(8)) . "." . $ext;
    if (!move_uploaded_file($file['tmp_name'], $upload_dir . $filename)) fail(500, "Failed to save the ID photo.");
    $id_photo_path = "uploads/visitors/" . $filename;
}

$initial_status = $isAdmin ? 'checked_in' : 'pending_approval';

$stmt = $conn->prepare("INSERT INTO visitor_logs (user_id, room_name, visitor_name, contact_number, id_type, id_number, id_photo_path, purpose, vehicle_plate, status, expected_at, created_by, check_in_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
$stmt->bind_param("issssssssssi", $target_user_id, $room_name, $visitor_name, $contact_number, $id_type, $id_number, $id_photo_path, $purpose, $vehicle_plate, $initial_status, $expected_at, $auth['id']);
if (!$stmt->execute()) fail(500, "Failed to record the visitor.");
$new_id = $stmt->insert_id;
$stmt->close();

if ($isAdmin) {
    if ($target_user_id) {
        $n_title = "Visitor Arrival: $visitor_name";
        $n_msg = "$visitor_name (Contact: $contact_number) has checked in to visit your unit ($room_name).";
        create_notification($conn, $target_user_id, 'visitor_log', $n_title, $n_msg);
    }
    log_activity($conn, $auth['id'], 'service', "Logged Visitor Check-In", "Visitor $visitor_name checked in for Unit $room_name");
} else {
    // Reaches the admin bell now — a pre-registration used to sit in
    // 'pending_approval' with nothing telling an admin it was waiting.
    notify_admins_queue($conn, 'visitor_registration', $new_id, "Visitor Pre-Registration: $visitor_name",
        "Tenant for Unit $room_name pre-registered $visitor_name ($purpose), expected " . date('M j, Y g:i A', strtotime($expected_at)) . ".");
    log_activity($conn, $auth['id'], 'service', "Registered Visitor for Review", "Tenant for Unit $room_name registered visitor $visitor_name ($purpose)");
}

echo json_encode([
    "success" => true,
    "message" => $isAdmin ? "Visitor checked in successfully." : "Visitor registered successfully and submitted for admin verification.",
    "visitorId" => $new_id,
    "status" => $initial_status
]);
$conn->close();
?>
