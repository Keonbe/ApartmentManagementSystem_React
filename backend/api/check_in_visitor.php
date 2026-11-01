<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
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

$visit_at_raw = trim($input['visitAt'] ?? $input['visit_at'] ?? '');
$expected_out_raw = trim($input['expectedCheckOutAt'] ?? $input['expected_check_out_at'] ?? '');

function parse_visit_datetime($raw) {
    return DateTime::createFromFormat('Y-m-d\TH:i', $raw) ?: DateTime::createFromFormat('Y-m-d H:i:s', $raw);
}

// The visitor management module can be switched off entirely — this used to
// only hide the Services card; the endpoint kept accepting registrations.
// Walk-ins are unaffected: an admin logging someone already at the door
// isn't a "reservation" the toggle is meant to gate.
if (!$isAdmin && get_setting($conn, 'service_visitor_management_active', 'true') === 'false') {
    fail(403, "Visitor registration is currently unavailable.");
}

// Every field is checked and all problems are reported together. Keys are the
// form fields: AdminVisitors (unit, visitDate/visitTime, checkOutDate/
// checkOutTime) and UserVisitors (expectedDate/expectedTime, expectedOutDate/
// expectedOutTime) split each date/time into two inputs; the error goes on the
// time input.
$errors = [];
$errors['visitorName'] = $visitor_name === '' ? "Visitor name is required." : v_str($visitor_name, 'Visitor name', 1, 150);
// Philippine mobile only, stored as +639XXXXXXXXX like every other contact
// number (the form has a fixed +63 prefix).
if ($contact_number === '') {
    $errors['contactNumber'] = "Contact number is required.";
} else {
    $contact_number = normalize_ph_mobile($contact_number);
    if ($contact_number === null) $errors['contactNumber'] = "Contact number must be a Philippine mobile number (+63 9XX XXX XXXX).";
}
$errors['purpose'] = $purpose === '' ? "Purpose is required." : v_str($purpose, 'Purpose', 1, 255);
$errors['idType'] = in_array($id_type, VISITOR_ID_TYPES, true) ? '' : "Invalid ID type.";
$errors['idNumber'] = $id_number === '' ? "ID number is required." : v_str($id_number, 'ID number', 1, 50);
$errors['vehiclePlate'] = v_str($vehicle_plate, 'Vehicle plate', 1, 30, false);

if ($isAdmin) {
    $room_name = trim($input['unit'] ?? $input['room_name'] ?? '');
    if ($room_name === '') {
        $errors['unit'] = "Unit is required.";
    } else {
        $r = $conn->prepare("SELECT 1 FROM rooms WHERE id = ?");
        $r->bind_param("s", $room_name);
        $r->execute();
        if (!$r->get_result()->fetch_assoc()) $errors['unit'] = "Unit $room_name does not exist.";
        $r->close();
    }

    // The host is whoever currently rents the unit, never a posted userId.
    $target_user_id = null;
    if (empty($errors['unit'])) {
        $u_stmt = $conn->prepare("SELECT user_id FROM rent_applications WHERE room_name = ? AND status IN ('Approved', 'active', 'pending-move-out') ORDER BY id DESC LIMIT 1");
        $u_stmt->bind_param("s", $room_name);
        $u_stmt->execute();
        $u_res = $u_stmt->get_result()->fetch_assoc();
        $u_stmt->close();
        if ($u_res) $target_user_id = (int)$u_res['user_id'];
    }
} else {
    $tenancy = get_active_tenancy($conn, $auth['id']);
    if (!$tenancy) fail(403, "Only tenants with an active rental can register visitors.");
    $room_name = $tenancy['room_name'];
    $target_user_id = $auth['id'];
}

// Expected arrival: required for a tenant's pre-registration (check_in_at is
// only ever stamped once the visitor is actually approved/admitted, so a
// pending row needs its own idea of "when"), ignored for a walk-in.
//
// A walk-in's check-in date/time is the admin's visitAt (required — the form
// defaults it to now): may be back-dated up to 24 hours (a visitor logged
// late), never in the future beyond a 5-minute clock allowance. It becomes
// check_in_at.
$expected_at = null;
$check_in_at = date('Y-m-d H:i:s');
$check_in_ref = null;
if ($isAdmin) {
    $visit_dt = $visit_at_raw === '' ? null : parse_visit_datetime($visit_at_raw);
    if ($visit_at_raw === '') $errors['visitTime'] = "Check-in date/time is required.";
    elseif (!$visit_dt) $errors['visitTime'] = "Check-in date/time must be a valid date/time.";
    elseif ($visit_dt > new DateTime('+5 minutes')) $errors['visitTime'] = "Check-in date/time cannot be in the future.";
    elseif ($visit_dt < new DateTime('-24 hours')) $errors['visitTime'] = "Check-in date/time can be back-dated by at most 24 hours.";
    else {
        $check_in_at = $visit_dt->format('Y-m-d H:i:s');
        $check_in_ref = $visit_dt;
    }
} else {
    $expected_dt = $expected_at_raw === '' ? null : parse_visit_datetime($expected_at_raw);
    $now = new DateTime();
    if ($expected_at_raw === '') $errors['expectedTime'] = "Expected check-in date/time is required.";
    elseif (!$expected_dt) $errors['expectedTime'] = "Expected arrival must be a valid date/time.";
    elseif ($expected_dt < (clone $now)->modify('-1 hour')) $errors['expectedTime'] = "Expected arrival cannot be in the past.";
    elseif ($expected_dt > (clone $now)->modify('+30 days')) $errors['expectedTime'] = "Expected arrival must be within 30 days.";
    else {
        $expected_at = $expected_dt->format('Y-m-d H:i:s');
        $check_in_ref = $expected_dt;
    }
}

// Expected check-out: required for both roles, after the check-in and within
// 30 days of it. Informational — overstay still uses visitor_overstay_hours.
$out_key = $isAdmin ? 'checkOutTime' : 'expectedOutTime';
$expected_out_dt = $expected_out_raw === '' ? null : parse_visit_datetime($expected_out_raw);
if ($expected_out_raw === '') $errors[$out_key] = "Expected check-out date/time is required.";
elseif (!$expected_out_dt) $errors[$out_key] = "Expected check-out must be a valid date/time.";
elseif ($check_in_ref && $expected_out_dt <= $check_in_ref) $errors[$out_key] = "Expected check-out must be after the check-in date/time.";
elseif ($check_in_ref && $expected_out_dt > (clone $check_in_ref)->modify('+30 days')) $errors[$out_key] = "Expected check-out must be within 30 days of check-in.";
elseif ($isAdmin && $expected_out_dt < new DateTime('-5 minutes')) $errors[$out_key] = "Expected check-out cannot be in the past.";

// Government ID photo: images only, 5MB, checked by extension and content (security audit B-7).
$file = isset($_FILES['idPhoto']) && $_FILES['idPhoto']['error'] !== UPLOAD_ERR_NO_FILE ? $_FILES['idPhoto'] : null;
$ext = $file ? strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) : '';
if ($file) {
    if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 5 * 1024 * 1024) {
        $errors['idPhoto'] = "ID photo must be an image of 5MB or less.";
    } elseif (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'], true)) {
        $errors['idPhoto'] = "ID photo must be a JPG, PNG or WEBP image.";
    } else {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) $errors['idPhoto'] = "ID photo content is not a valid image.";
    }
}

$errors = array_filter($errors);
if ($errors) validation_fail($errors);
$expected_check_out_at = $expected_out_dt->format('Y-m-d H:i:s');
$expected_out_label = date('M j, Y g:i A', strtotime($expected_check_out_at));

$id_photo_path = null;
if ($file) {
    $upload_dir = "../uploads/visitors/";
    if (!file_exists($upload_dir)) mkdir($upload_dir, 0755, true);
    $filename = "visitor_id_" . time() . "_" . bin2hex(random_bytes(8)) . "." . $ext;
    if (!move_uploaded_file($file['tmp_name'], $upload_dir . $filename)) fail(500, "Failed to save the ID photo.");
    $id_photo_path = "uploads/visitors/" . $filename;
}

$initial_status = $isAdmin ? 'checked_in' : 'pending_approval';

$stmt = $conn->prepare("INSERT INTO visitor_logs (user_id, room_name, visitor_name, contact_number, id_type, id_number, id_photo_path, purpose, vehicle_plate, status, expected_at, expected_check_out_at, created_by, check_in_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
$stmt->bind_param("isssssssssssis", $target_user_id, $room_name, $visitor_name, $contact_number, $id_type, $id_number, $id_photo_path, $purpose, $vehicle_plate, $initial_status, $expected_at, $expected_check_out_at, $auth['id'], $check_in_at);
if (!$stmt->execute()) {
    if ($id_photo_path) @unlink(__DIR__ . '/../' . $id_photo_path);
    fail(500, "Failed to record the visitor.");
}
$new_id = $stmt->insert_id;
$stmt->close();

if ($isAdmin) {
    if ($target_user_id) {
        $n_title = "Visitor Arrival: $visitor_name";
        $n_msg = "$visitor_name (Contact: $contact_number) has checked in to visit your unit ($room_name), expected to leave by $expected_out_label.";
        create_notification($conn, $target_user_id, 'visitor_log', $n_title, $n_msg);
    }
    log_activity($conn, $auth['id'], 'service', "Logged Visitor Check-In", "Visitor $visitor_name checked in for Unit $room_name");
} else {
    // Reaches the admin bell now — a pre-registration used to sit in
    // 'pending_approval' with nothing telling an admin it was waiting.
    notify_admins_queue($conn, 'visitor_registration', $new_id, "Visitor Pre-Registration: $visitor_name",
        "Tenant for Unit $room_name pre-registered $visitor_name ($purpose), expected " . date('M j, Y g:i A', strtotime($expected_at)) . " until $expected_out_label.");
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
