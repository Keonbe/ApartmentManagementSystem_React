<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['id'] ?? 0;

if ($id > 0) {
    // Get application details, including the contract (if any) so its
    // move-out settlement can be undone, and the status recorded at
    // archive time so we restore to THAT instead of assuming 'active'.
    $stmt = $conn->prepare("SELECT ra.user_id, ra.room_name, ra.first_name, ra.last_name, ra.monthly_rent, ra.occupants, ra.months_of_rent, ra.pre_archive_status,
                                    lc.id as contract_id, lc.status as contract_status, lc.lease_start, lc.lease_end
                            FROM rent_applications ra
                            LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id
                            WHERE ra.id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $app = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$app) {
        echo json_encode(["success" => false, "message" => "Application record not found."]);
        exit;
    }

    $user_id = $app['user_id'] ? (int)$app['user_id'] : 0;
    $room_name = $app['room_name'];
    $full_name = $app['first_name'] . ' ' . $app['last_name'];
    $months = (int)($app['months_of_rent'] ?? 6);
    $lease_start = $app['lease_start'] ?? date('Y-m-d');
    $lease_end = $app['lease_end'] ?? date('Y-m-d', strtotime("+$months months"));
    $occupants = (int)($app['occupants'] ?? 1);
    // Older archived rows predate pre_archive_status — fall back to 'active'
    // rather than fail, since that was the only behavior before this fix.
    $restore_status = $app['pre_archive_status'] ?: 'active';

    $conn->begin_transaction();
    try {
        // 1. Restore rent application to its actual pre-archive status
        $upd_stmt = $conn->prepare("UPDATE rent_applications SET status = ?, pre_archive_status = NULL, archive_date = NULL, archive_reason = NULL, archive_notes = NULL WHERE id = ? AND status = 'archived'");
        $upd_stmt->bind_param("si", $restore_status, $id);
        $upd_stmt->execute();
        if ($upd_stmt->affected_rows === 0) {
            throw new Exception("Tenant could not be restored — this application is no longer archived.");
        }
        $upd_stmt->close();

        // 2. Unarchive corresponding user
        if ($user_id > 0) {
            $user_stmt = $conn->prepare("UPDATE users SET is_archived = 0 WHERE id = ?");
            $user_stmt->bind_param("i", $user_id);
            $user_stmt->execute();
            $user_stmt->close();
        }

        // 3. Undo the move-out settlement on the lease contract, if one
        // exists and was actually settled (archive_tenant.php terminates the
        // contract rather than settling it, but update_tenant_status.php's
        // move-out branch sets it to 'expired' with deposit/refund fields
        // before the tenant is later archived — that settlement needs to be
        // reversed too, or the restored tenant comes back to an
        // already-refunded, expired lease). Only when the tenant is actually
        // going back to a live tenancy (H6) — restoring to 'moved-out' should
        // leave the contract exactly as it was.
        $reactivate_tenancy = in_array($restore_status, ['active', 'Approved'], true);
        if ($reactivate_tenancy && !empty($app['contract_id']) && in_array($app['contract_status'], ['expired', 'terminated'], true)) {
            $ctr_stmt = $conn->prepare("UPDATE lease_contracts SET status = 'active', deposit_status = 'Held', damage_deduction = 0.00, utility_deduction = 0.00, refund_amount = 0.00, refund_date = NULL, termination_reason = NULL, terminated_at = NULL WHERE id = ?");
            $ctr_stmt->bind_param("s", $app['contract_id']);
            $ctr_stmt->execute();
            $ctr_stmt->close();
        }

        // 4. Restore only the invoices THIS archive cancelled (cancel_reason
        // = 'Archived', set by end_tenancy() in archive_tenant.php) — not
        // ones cancelled for an unrelated reason, such as an earlier move-out
        // that this same application went through before being archived
        // (H6). We don't retain each invoice's exact prior sub-state (some
        // may have been 'pending-verification' or 'scheduled'), so 'pending'
        // is the closest safe default: it puts the balance back as owed
        // without falsely claiming a payment proof is already under review.
        $inv_stmt = $conn->prepare("UPDATE invoices SET status = 'pending', cancel_reason = NULL WHERE rent_application_id = ? AND status = 'cancelled' AND cancel_reason = 'Archived'");
        $inv_stmt->bind_param("i", $id);
        $inv_stmt->execute();
        $invoices_restored = $inv_stmt->affected_rows;
        $inv_stmt->close();

        // 5. Try to reoccupy the room if it is currently vacant — only when
        // the tenant is going back to a live tenancy (H6); restoring to
        // 'moved-out' shouldn't re-assign a room nobody is coming back to.
        $room_restored = false;
        if ($reactivate_tenancy) {
            $room_check = $conn->prepare("SELECT status FROM rooms WHERE id = ?");
            $room_check->bind_param("s", $room_name);
            $room_check->execute();
            $room_res = $room_check->get_result()->fetch_assoc();
            $room_check->close();

            if ($room_res && $room_res['status'] === 'vacant') {
                $room_stmt = $conn->prepare("UPDATE rooms SET status = 'occupied', tenant_name = ?, lease_start = ?, lease_end = ?, occupants = ? WHERE id = ? AND status = 'vacant'");
                $room_stmt->bind_param("sssis", $full_name, $lease_start, $lease_end, $occupants, $room_name);
                $room_stmt->execute();
                $room_restored = $room_stmt->affected_rows > 0;
                $room_stmt->close();
            }
        }

        $conn->commit();
        log_activity($conn, $admin_id, 'Tenant Management', 'Restore Tenant', "Restored archived tenant $full_name (ID $id) to status '$restore_status'" . ($invoices_restored > 0 ? ", $invoices_restored invoice(s) reinstated" : ""));
        $message = "Tenant restored successfully.";
        if ($reactivate_tenancy) {
            $message = $room_restored ? "Tenant and unit restored successfully." : "Tenant restored successfully, but room $room_name is no longer vacant.";
        }
        echo json_encode([
            "success" => true,
            "room_restored" => $room_restored,
            "message" => $message
        ]);
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => public_error_message($e)]);
    }
} else {
    echo json_encode(["success" => false, "message" => "Invalid ID."]);
}
$conn->close();
?>
