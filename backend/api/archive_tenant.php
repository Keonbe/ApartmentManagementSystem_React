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
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['id'] ?? 0;
$archiveReason = $input['archiveReason'] ?? 'End of Lease';
$archiveNotes = $input['archiveNotes'] ?? '';
$archiveDate = date('Y-m-d');

if ($id > 0) {
    // Get room name, tenant name, user_id, and the CURRENT status before
    // archiving — restore_tenant.php uses this to put the application back
    // to what it actually was, instead of assuming 'active'.
    $get_room = $conn->prepare("SELECT room_name, first_name, last_name, user_id, status FROM rent_applications WHERE id = ?");
    $get_room->bind_param("i", $id);
    $get_room->execute();
    $room_res = $get_room->get_result()->fetch_assoc();
    $get_room->close();

    if (!$room_res) {
        echo json_encode(["success" => false, "message" => "Application record not found."]);
        exit;
    }

    $conn->begin_transaction();
    try {
        $pre_archive_status = $room_res['status'];
        $stmt = $conn->prepare("UPDATE rent_applications SET status = 'archived', pre_archive_status = ?, archive_date = ?, archive_reason = ?, archive_notes = ? WHERE id = ?");
        $stmt->bind_param("ssssi", $pre_archive_status, $archiveDate, $archiveReason, $archiveNotes, $id);
        $stmt->execute();
        if ($stmt->affected_rows === 0) {
            throw new Exception("Application could not be archived — it may no longer exist.");
        }
        $stmt->close();

        // Cancel any remaining unpaid invoices for this application
        $cancel_inv = $conn->prepare("UPDATE invoices SET status = 'cancelled' WHERE rent_application_id = ? AND status IN ('pending', 'pending-verification', 'scheduled')");
        $cancel_inv->bind_param("i", $id);
        $cancel_inv->execute();
        $cancel_inv->close();

        $room_name = $room_res['room_name'];
        $full_name = $room_res['first_name'] . ' ' . $room_res['last_name'];
        $user_id = $room_res['user_id'] ? (int)$room_res['user_id'] : 0;

        // Only vacate the room if it's still THIS tenant occupying it — an
        // old, already-moved-out application being archived late shouldn't
        // blank out whoever has since re-let the unit.
        $room_stmt = $conn->prepare("UPDATE rooms SET status = 'vacant', last_tenant = ?, tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0 WHERE id = ? AND tenant_name = ?");
        $room_stmt->bind_param("sss", $full_name, $room_name, $full_name);
        $room_stmt->execute();
        $room_stmt->close();

        if ($user_id > 0) {
            $user_stmt = $conn->prepare("UPDATE users SET is_archived = 1 WHERE id = ?");
            $user_stmt->bind_param("i", $user_id);
            $user_stmt->execute();
            $user_stmt->close();
        }

        log_activity($conn, $admin_id, 'tenant', "Archived Tenant", "Application ID: $id, Reason: $archiveReason" . ($archiveNotes ? ", Notes: $archiveNotes" : ""));

        $conn->commit();
        echo json_encode(["success" => true]);
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
} else {
    echo json_encode(["success" => false, "message" => "Invalid ID"]);
}
$conn->close();
?>
