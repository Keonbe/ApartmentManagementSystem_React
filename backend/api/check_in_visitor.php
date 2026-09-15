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

$input = !empty($_POST) ? $_POST : (json_decode(file_get_contents("php://input"), true) ?: []);

$visitor_name = trim($input['visitorName'] ?? $input['visitor_name'] ?? '');
$contact_number = trim($input['contactNumber'] ?? $input['contact_number'] ?? '');
$purpose = trim($input['purpose'] ?? '');
$id_type = trim($input['idType'] ?? $input['id_type'] ?? 'National ID');
$id_number = trim($input['idNumber'] ?? $input['id_number'] ?? '');
$vehicle_plate = strtoupper(trim($input['vehiclePlate'] ?? $input['vehicle_plate'] ?? ''));

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

$stmt = $conn->prepare("INSERT INTO visitor_logs (user_id, room_name, visitor_name, contact_number, id_type, id_number, id_photo_path, purpose, vehicle_plate, status, created_by, check_in_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
$stmt->bind_param("isssssssssi", $target_user_id, $room_name, $visitor_name, $contact_number, $id_type, $id_number, $id_photo_path, $purpose, $vehicle_plate, $initial_status, $auth['id']);
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
