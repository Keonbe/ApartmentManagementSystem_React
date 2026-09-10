<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, x-user-id");

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
$notification_id = $input['notificationId'] ?? 0;
$action = $input['action'] ?? ''; // 'approve' or 'reject'

if (!$notification_id || !in_array($action, ['approve', 'reject'])) {
    echo json_encode(["success" => false, "message" => "Invalid parameters"]);
    exit;
}

$conn->begin_transaction();

try {
    // 1. Fetch the original notification details
    $stmt = $conn->prepare("SELECT * FROM notifications WHERE id = ?");
    $stmt->bind_param("i", $notification_id);
    $stmt->execute();
    $notif = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$notif) {
        throw new Exception("Notification request not found.");
    }

    $target_user_id = $notif['user_id'];
    $type = $notif['type'];

    // 2. Only perform database updates if APPROVED
    if ($action === 'approve') {
        if ($type === 'occupancy_request') {
            $new_occupants = (int) $notif['metadata_value']; 
            
            $appStmt = $conn->prepare("SELECT id, room_name FROM rent_applications WHERE user_id = ? AND status IN ('Approved', 'active', 'pending-move-out') ORDER BY id DESC LIMIT 1");
            $appStmt->bind_param("i", $target_user_id);
            $appStmt->execute();
            $app_res = $appStmt->get_result()->fetch_assoc();
            $appStmt->close();

            $new_monthly_rent = 4000;
            if ($app_res) {
                $room_name = $app_res['room_name'];
                $clean_room = strtoupper(trim(str_ireplace('Room', '', $room_name)));
                $base_room_rent = in_array($clean_room, ['K', 'L', 'M', 'N']) ? 3500 : 4000;
                $new_monthly_rent = $base_room_rent + ($new_occupants > 4 ? ($new_occupants - 4) * 1000 : 0);

                $updateStmt = $conn->prepare("UPDATE rent_applications SET occupants = ?, monthly_rent = ? WHERE id = ?");
                $updateStmt->bind_param("idi", $new_occupants, $new_monthly_rent, $app_res['id']);
                $updateStmt->execute();
                $updateStmt->close();

                $roomStmt = $conn->prepare("UPDATE rooms SET occupants = ?, monthly_rent = ? WHERE id = ?");
                $roomStmt->bind_param("ids", $new_occupants, $new_monthly_rent, $room_name);
                $roomStmt->execute();
                $roomStmt->close();
            }

            log_activity($conn, $admin_id, 'tenant', "Approved Occupancy Change", "User ID: $target_user_id updated to $new_occupants occupants (Rent: ₱$new_monthly_rent)");

        } else if ($type === 'lease_extension_request') {
            $add_months = (int) $notif['metadata_value'];

            // Resolve the tenant's application ONCE and reuse its id/room_name
            // for every downstream update, instead of re-querying by user_id
            // (which, with more than one Approved/active row for the same
            // tenant, could silently pick a different application per query).
            $appStmt = $conn->prepare("SELECT id, room_name FROM rent_applications WHERE user_id = ? AND status IN ('Approved', 'active') ORDER BY id DESC LIMIT 1");
            $appStmt->bind_param("i", $target_user_id);
            $appStmt->execute();
            $app = $appStmt->get_result()->fetch_assoc();
            $appStmt->close();

            if (!$app) {
                throw new Exception("No active rent application found for this tenant.");
            }
            $app_id = (int)$app['id'];
            $room_name = $app['room_name'];

            $updateStmt = $conn->prepare("UPDATE rent_applications SET months_of_rent = months_of_rent + ? WHERE id = ?");
            $updateStmt->bind_param("ii", $add_months, $app_id);
            $updateStmt->execute();
            $updateStmt->close();

            $roomStmt = $conn->prepare("UPDATE rooms SET lease_end = DATE_ADD(lease_end, INTERVAL ? MONTH) WHERE id = ?");
            $roomStmt->bind_param("is", $add_months, $room_name);
            $roomStmt->execute();
            $roomStmt->close();

            // Extend the tenant's existing contract in place (one row per
            // application, matching get_contracts.php / my_room.php's
            // single-row assumption) and record the renewal in lease_renewals
            // so the history of extensions is auditable even though the
            // contract row itself isn't versioned.
            $ctrLookup = $conn->prepare("SELECT id, lease_end, status FROM lease_contracts WHERE rent_application_id = ?");
            $ctrLookup->bind_param("i", $app_id);
            $ctrLookup->execute();
            $contract = $ctrLookup->get_result()->fetch_assoc();
            $ctrLookup->close();

            if ($contract && $contract['lease_end'] !== null && $contract['status'] !== 'terminated') {
                $contract_id = $contract['id'];
                $previous_lease_end = $contract['lease_end'];

                // A renewal on an already-'expired' contract means the tenant is
                // continuing occupancy — reactivate it along with the new date.
                $ctrStmt = $conn->prepare("UPDATE lease_contracts SET lease_end = DATE_ADD(lease_end, INTERVAL ? MONTH), status = IF(status = 'expired', 'active', status) WHERE id = ?");
                $ctrStmt->bind_param("is", $add_months, $contract_id);
                $ctrStmt->execute();
                $ctrStmt->close();

                $newEndStmt = $conn->prepare("SELECT lease_end FROM lease_contracts WHERE id = ?");
                $newEndStmt->bind_param("s", $contract_id);
                $newEndStmt->execute();
                $new_lease_end = $newEndStmt->get_result()->fetch_assoc()['lease_end'];
                $newEndStmt->close();

                $rentStmt = $conn->prepare("SELECT monthly_rent FROM rent_applications WHERE id = ?");
                $rentStmt->bind_param("i", $app_id);
                $rentStmt->execute();
                $current_rent = $rentStmt->get_result()->fetch_assoc()['monthly_rent'];
                $rentStmt->close();

                $renewalStmt = $conn->prepare("INSERT INTO lease_renewals (contract_id, added_months, previous_lease_end, new_lease_end, rent_at_renewal, approved_by) VALUES (?, ?, ?, ?, ?, ?)");
                $renewalStmt->bind_param("sissdi", $contract_id, $add_months, $previous_lease_end, $new_lease_end, $current_rent, $admin_id);
                $renewalStmt->execute();
                $renewalStmt->close();

                log_activity($conn, $admin_id, 'contract', "Approved Lease Extension", "User ID: $target_user_id — Contract $contract_id extended by $add_months month(s): $previous_lease_end → $new_lease_end");
            } else {
                // No contract, or one with no lease_end to extend yet (e.g.
                // still a Draft awaiting activation). The application/room
                // dates above are still advanced; note the gap rather than
                // silently doing nothing to the contract.
                log_activity($conn, $admin_id, 'contract', "Approved Lease Extension", "User ID: $target_user_id extended by $add_months month(s); no active contract lease_end to extend");
            }
        }
    }

    if ($action === 'reject') {
        log_activity($conn, $admin_id, 'tenant', "Rejected " . str_replace('_', ' ', $type), "User ID: $target_user_id");
    }

    // 3. Mark the original Admin notification as resolved
    $markStmt = $conn->prepare("UPDATE notifications SET is_read = 1, status = ? WHERE id = ?");
    $statusText = ($action === 'approve') ? 'Approved' : 'Rejected';
    $markStmt->bind_param("si", $statusText, $notification_id);
    $markStmt->execute();
    $markStmt->close();

    // 4. Notify Tenant of decision
    // FIX APPLIED HERE: We explicitly insert 'Resolved' into the status column so it doesn't trigger the action buttons again.
    $title = ($action === 'approve') ? "Request Approved" : "Request Declined";
    $msg = "Your " . str_replace('_', ' ', $type) . " has been " . strtolower($statusText) . " by management.";

    $userNotif = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, ?, ?, ?, 'Resolved', 0)");
    $userNotif->bind_param("isss", $target_user_id, $type, $title, $msg);
    $userNotif->execute();
    $userNotif->close();

    $conn->commit();
    echo json_encode(["success" => true, "message" => "Request $statusText successfully."]);

} catch (Exception $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Server error: " . $e->getMessage()]);
}

$conn->close();
?>