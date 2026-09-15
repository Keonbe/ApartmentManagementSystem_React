<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}
$admin_id_int = (int)$admin_id;

$input = json_decode(file_get_contents("php://input"), true) ?? [];

$inquiry_id  = isset($input['inquiry_id']) && $input['inquiry_id'] !== '' ? (int)$input['inquiry_id'] : null;
$room_name   = trim($input['room_name'] ?? '');
$reserved_for = trim($input['reserved_for_name'] ?? '');
$contact_no  = trim($input['contact_no'] ?? '');
$email       = trim($input['email'] ?? '');
$notes       = trim($input['notes'] ?? '');
$fee         = isset($input['reservation_fee']) && $input['reservation_fee'] !== '' ? (float)$input['reservation_fee'] : 0.00;
$hold_days   = isset($input['hold_days']) && $input['hold_days'] !== '' ? (int)$input['hold_days'] : null;

if ($room_name === '') {
    echo json_encode(["success" => false, "message" => "A unit must be selected to place a reservation."]);
    exit;
}
if ($reserved_for === '') {
    echo json_encode(["success" => false, "message" => "The name the unit is reserved for is required."]);
    exit;
}
if ($fee < 0) {
    echo json_encode(["success" => false, "message" => "Reservation fee cannot be negative."]);
    exit;
}

// Hold period falls back to the admin-configurable system setting (default 7).
if ($hold_days === null) {
    $setting = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'reservation_hold_days'")->fetch_assoc();
    $hold_days = $setting ? (int)$setting['setting_value'] : 7;
}
if ($hold_days < 1 || $hold_days > 90) {
    echo json_encode(["success" => false, "message" => "Hold period must be between 1 and 90 days."]);
    exit;
}

$conn->begin_transaction();

try {
    // 1. Lock the room row and require it to be vacant.
    $room_stmt = $conn->prepare("SELECT status FROM rooms WHERE id = ? FOR UPDATE");
    $room_stmt->bind_param("s", $room_name);
    $room_stmt->execute();
    $room = $room_stmt->get_result()->fetch_assoc();
    $room_stmt->close();

    if (!$room) {
        throw new Exception("Unit $room_name does not exist.");
    }
    if (strtolower($room['status']) !== 'vacant') {
        throw new Exception("Unit $room_name is currently " . $room['status'] . " and cannot be reserved.");
    }

    // 2. No other active hold on this room.
    $dup_stmt = $conn->prepare("SELECT id FROM unit_reservations WHERE room_name = ? AND status = 'Active' LIMIT 1");
    $dup_stmt->bind_param("s", $room_name);
    $dup_stmt->execute();
    $dup = $dup_stmt->get_result()->fetch_assoc();
    $dup_stmt->close();

    if ($dup) {
        throw new Exception("Unit $room_name already has an active reservation (#" . $dup['id'] . ").");
    }

    // 3. No pending rent application already competing for this room.
    //    This is the conflict check called for by docs/todo.md and FR-4.7.
    $app_stmt = $conn->prepare("SELECT id FROM rent_applications WHERE room_name = ? AND status = 'Pending Review' LIMIT 1");
    $app_stmt->bind_param("s", $room_name);
    $app_stmt->execute();
    $app = $app_stmt->get_result()->fetch_assoc();
    $app_stmt->close();

    if ($app) {
        throw new Exception("Unit $room_name has a pending rent application (#" . $app['id'] . "). Resolve that application before reserving the unit.");
    }

    // Carry the account link across from the source inquiry, if there is one.
    $user_id = null;
    if ($inquiry_id) {
        $inq_stmt = $conn->prepare("SELECT user_id FROM inquiries WHERE id = ?");
        $inq_stmt->bind_param("i", $inquiry_id);
        $inq_stmt->execute();
        $inq = $inq_stmt->get_result()->fetch_assoc();
        $inq_stmt->close();
        if (!$inq) {
            throw new Exception("Source inquiry not found.");
        }
        $user_id = $inq['user_id'] !== null ? (int)$inq['user_id'] : null;
    }

    // 4. Create the hold.
    $contact_no = $contact_no !== '' ? $contact_no : null;
    $email      = $email !== '' ? $email : null;
    $notes      = $notes !== '' ? $notes : null;

    $ins = $conn->prepare("INSERT INTO unit_reservations (inquiry_id, user_id, room_name, reserved_for_name, contact_no, email, hold_expires_at, reservation_fee, status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL ? DAY), ?, 'Active', ?, ?)");
    $ins->bind_param("iissssidsi", $inquiry_id, $user_id, $room_name, $reserved_for, $contact_no, $email, $hold_days, $fee, $notes, $admin_id_int);
    if (!$ins->execute()) {
        throw new Exception("Failed to create the reservation.");
    }
    $reservation_id = $ins->insert_id;
    $ins->close();

    // 5. Hold the unit.
    $upd = $conn->prepare("UPDATE rooms SET status = 'reserved' WHERE id = ?");
    $upd->bind_param("s", $room_name);
    $upd->execute();
    $upd->close();

    // 6. Advance the source inquiry.
    if ($inquiry_id) {
        $inq_upd = $conn->prepare("UPDATE inquiries SET status = 'Reserved', handled_by = ? WHERE id = ?");
        $inq_upd->bind_param("ii", $admin_id_int, $inquiry_id);
        $inq_upd->execute();
        $inq_upd->close();
    }

    $conn->commit();

    log_activity($conn, $admin_id_int, 'inquiry', "Reserved Unit", "Unit $room_name held for $reserved_for until +$hold_days days (Reservation ID: $reservation_id)");

    if ($user_id) {
        $notif_title = "Unit Reserved";
        $notif_msg = "Unit $room_name has been reserved for you. The hold expires in $hold_days day(s) — please complete your rent application before then.";
        create_notification($conn, $user_id, 'unit_reservation', $notif_title, $notif_msg);
    }

    echo json_encode([
        "success" => true,
        "message" => "Unit $room_name reserved for $reserved_for.",
        "reservation_id" => $reservation_id
    ]);

} catch (Exception $e) {
    $conn->rollback();
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>
