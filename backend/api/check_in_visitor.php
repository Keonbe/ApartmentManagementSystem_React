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

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
$user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
$isAdmin = verify_admin($conn, $admin_id);

// Parse input from $_POST or raw JSON input
$input = !empty($_POST) ? $_POST : (json_decode(file_get_contents("php://input"), true) ?: []);

$visitor_name = trim($input['visitorName'] ?? $input['visitor_name'] ?? '');
$contact_number = trim($input['contactNumber'] ?? $input['contact_number'] ?? '');
$room_name = trim($input['unit'] ?? $input['room_name'] ?? '');
$purpose = trim($input['purpose'] ?? '');
$id_type = trim($input['idType'] ?? $input['id_type'] ?? 'National ID');
$id_number = trim($input['idNumber'] ?? $input['id_number'] ?? '');
$vehicle_plate = strtoupper(trim($input['vehiclePlate'] ?? $input['vehicle_plate'] ?? ''));
$target_user_id = !empty($input['userId']) ? (int)$input['userId'] : ($user_id ? (int)$user_id : null);

if (empty($visitor_name) || empty($contact_number) || empty($room_name) || empty($purpose)) {
    echo json_encode(["success" => false, "message" => "Visitor name, contact number, unit, and purpose are required."]);
    exit;
}

// Handle optional Government ID photo/pass upload
$id_photo_path = null;
if (isset($_FILES['idPhoto']) && $_FILES['idPhoto']['error'] === UPLOAD_ERR_OK) {
    $upload_dir = "../uploads/visitors/";
    if (!file_exists($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }
    $ext = pathinfo($_FILES['idPhoto']['name'], PATHINFO_EXTENSION);
    $filename = "visitor_id_" . time() . "_" . uniqid() . "." . strtolower($ext);
    $target_file = $upload_dir . $filename;
    if (move_uploaded_file($_FILES['idPhoto']['tmp_name'], $target_file)) {
        $id_photo_path = "uploads/visitors/" . $filename;
    }
}

// If tenant user_id is missing, look up approved tenant for room_name
if (!$target_user_id) {
    $u_stmt = $conn->prepare("SELECT user_id FROM rent_applications WHERE room_name = ? AND status = 'Approved' ORDER BY id DESC LIMIT 1");
    $u_stmt->bind_param("s", $room_name);
    $u_stmt->execute();
    $u_res = $u_stmt->get_result()->fetch_assoc();
    $u_stmt->close();
    if ($u_res) {
        $target_user_id = (int)$u_res['user_id'];
    }
}

try {
    // If admin is creating: direct 'checked_in'
    // If tenant is creating: initial 'pending_approval'
    $initial_status = $isAdmin ? 'checked_in' : 'pending_approval';

    $stmt = $conn->prepare("INSERT INTO visitor_logs (user_id, room_name, visitor_name, contact_number, id_type, id_number, id_photo_path, purpose, vehicle_plate, status, created_by, check_in_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
    $created_by_id = $isAdmin ? (int)$admin_id : (int)$user_id;
    $stmt->bind_param("isssssssssi", $target_user_id, $room_name, $visitor_name, $contact_number, $id_type, $id_number, $id_photo_path, $purpose, $vehicle_plate, $initial_status, $created_by_id);
    
    if (!$stmt->execute()) {
        throw new Exception("Failed to insert visitor log: " . $stmt->error);
    }
    $new_id = $stmt->insert_id;
    $stmt->close();

    // Notifications
    if ($isAdmin && $target_user_id) {
        // Notify tenant that a visitor has checked in to their unit
        $n_title = "Visitor Arrival: $visitor_name";
        $n_msg = "$visitor_name (Contact: $contact_number) has checked in to visit your unit ($room_name).";
        $n_stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, 'visitor_log', ?, ?, 'Active', 0)");
        $n_stmt->bind_param("iss", $target_user_id, $n_title, $n_msg);
        $n_stmt->execute();
        $n_stmt->close();

        log_activity($conn, $admin_id, 'service', "Logged Visitor Check-In", "Visitor $visitor_name checked in for Unit $room_name");
    } else {
        // Tenant logged a visitor -> Notify Admin
        log_activity($conn, $user_id, 'tenant', "Registered Visitor for Review", "Tenant for Unit $room_name registered visitor $visitor_name ($purpose)");
    }

    echo json_encode([
        "success" => true,
        "message" => $isAdmin ? "Visitor checked in successfully." : "Visitor registered successfully and submitted for admin verification.",
        "visitorId" => $new_id,
        "status" => $initial_status
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>