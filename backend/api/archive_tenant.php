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

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['id'] ?? 0;
$archiveReason = $input['archiveReason'] ?? 'End of Rent Term';
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
        // Refused when already archived: archiving twice would overwrite the
        // status restore_tenant.php puts the application back to.
        $archived = archive_application($conn, (int)$id, $archiveReason, $archiveNotes);
        if (!$archived['ok']) {
            throw new Exception($archived['code'] === 'not_allowed'
                ? "This application is already archived."
                : "Application could not be archived — it may no longer exist.");
        }

        // end_tenancy() vacates the room (only if this tenant still occupies
        // it), cancels open invoices tagged with this reason, releases
        // parking and cancels pending visitor pre-registrations — the same
        // cleanup ordinary move-out and contract termination do (M3).
        $vacated = end_tenancy($conn, (int)$id, 'Archived');

        // Close out any still-active contract so the daily sweep doesn't later
        // send an already-archived tenant a "Lease Contract Expired" notice
        // for a lease that was never formally ended (M3).
        $ctr_stmt = $conn->prepare("UPDATE lease_contracts SET status = 'terminated', termination_reason = ?, terminated_at = NOW() WHERE rent_application_id = ? AND status = 'active'");
        $ctr_stmt->bind_param("si", $archiveReason, $id);
        $ctr_stmt->execute();
        $ctr_stmt->close();

        $user_id = $room_res['user_id'] ? (int)$room_res['user_id'] : 0;
        if ($user_id > 0) {
            $user_stmt = $conn->prepare("UPDATE users SET is_archived = 1 WHERE id = ?");
            $user_stmt->bind_param("i", $user_id);
            $user_stmt->execute();
            $user_stmt->close();
        }

        $parking_released = $vacated ? $vacated['parking_released'] : 0;
        $visitors_cancelled = $vacated ? $vacated['visitors_cancelled'] : 0;

        log_activity($conn, $admin_id, 'tenant', "Archived Tenant", "Application ID: $id, Reason: $archiveReason" . ($archiveNotes ? ", Notes: $archiveNotes" : "") . ($parking_released ? "; parking released" : "") . ($visitors_cancelled ? "; visitor pre-registrations cancelled" : ""));

        $conn->commit();
        echo json_encode(["success" => true]);
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => public_error_message($e)]);
    }
} else {
    echo json_encode(["success" => false, "message" => "Invalid ID"]);
}
$conn->close();
?>
