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

$id     = (int)($input['rawId'] ?? $input['id'] ?? 0);
$status = trim($input['status'] ?? '');
$reason = trim($input['reason'] ?? '');

$allowed = ['Cancelled', 'Expired', 'Converted'];

if ($id <= 0) {
    echo json_encode(["success" => false, "message" => "A valid reservation ID is required."]);
    exit;
}
if (!in_array($status, $allowed, true)) {
    echo json_encode(["success" => false, "message" => "Invalid status. Allowed: " . implode(', ', $allowed)]);
    exit;
}

$conn->begin_transaction();

try {
    $stmt = $conn->prepare("SELECT room_name, user_id, inquiry_id, reserved_for_name, status FROM unit_reservations WHERE id = ? FOR UPDATE");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $reservation = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$reservation) {
        throw new Exception("Reservation not found.");
    }
    if ($reservation['status'] !== 'Active') {
        throw new Exception("Reservation is already " . $reservation['status'] . " and cannot be changed.");
    }

    $room_name = $reservation['room_name'];
    $reason_val = $reason !== '' ? $reason : null;

    $upd = $conn->prepare("UPDATE unit_reservations SET status = ?, released_at = NOW(), released_reason = ? WHERE id = ?");
    $upd->bind_param("ssi", $status, $reason_val, $id);
    $upd->execute();
    $upd->close();

    if ($status === 'Cancelled' || $status === 'Expired') {
        // Release the hold. Guarded on 'reserved' so an occupied unit is never
        // clobbered by a stale reservation row.
        $room_upd = $conn->prepare("UPDATE rooms SET status = 'vacant' WHERE id = ? AND status = 'reserved'");
        $room_upd->bind_param("s", $room_name);
        $room_upd->execute();
        $room_upd->close();

        // Send the source inquiry back to Contacted so it stays in the pipeline.
        if (!empty($reservation['inquiry_id'])) {
            $inq_id = (int)$reservation['inquiry_id'];
            $inq_upd = $conn->prepare("UPDATE inquiries SET status = 'Contacted' WHERE id = ? AND status = 'Reserved'");
            $inq_upd->bind_param("i", $inq_id);
            $inq_upd->execute();
            $inq_upd->close();
        }
    } else {
        // Converted: the unit stays 'reserved'. The approval cascade in
        // update_tenant_status.php flips it to 'occupied' on move-in.
        if (!empty($reservation['inquiry_id'])) {
            $inq_id = (int)$reservation['inquiry_id'];
            $inq_upd = $conn->prepare("UPDATE inquiries SET status = 'Converted' WHERE id = ?");
            $inq_upd->bind_param("i", $inq_id);
            $inq_upd->execute();
            $inq_upd->close();
        }
    }

    $conn->commit();

    log_activity($conn, $admin_id_int, 'inquiry', "Updated Reservation Status", "Reservation ID: $id (Unit $room_name) set to $status" . ($reason_val ? ". Reason: $reason_val" : ""));

    if (!empty($reservation['user_id'])) {
        $user_id = (int)$reservation['user_id'];
        $notif_title = "Reservation " . $status;
        $notif_msg = $status === 'Converted'
            ? "Your reservation for Unit $room_name has moved forward to a rent application."
            : "Your reservation for Unit $room_name is no longer active (" . strtolower($status) . ")." . ($reason_val ? " Reason: $reason_val" : "");
        create_notification($conn, $user_id, 'unit_reservation', $notif_title, $notif_msg);
    }

    echo json_encode(["success" => true, "message" => "Reservation marked $status."]);

} catch (Exception $e) {
    $conn->rollback();
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>
