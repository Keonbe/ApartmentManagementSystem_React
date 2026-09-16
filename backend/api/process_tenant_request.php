<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$notification_id = (int)($input['notificationId'] ?? 0);
$action = $input['action'] ?? ''; // 'approve' or 'reject'

if (!$notification_id || !in_array($action, ['approve', 'reject'], true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Invalid parameters"]);
    exit;
}

$conn->begin_transaction();

try {
    // 1. Fetch the original notification. Only the two request types this
    // endpoint knows how to apply may be decided here. It used to load any id,
    // so an admin could "approve" a tenant's rent reminder or bill notice, which
    // flipped its status and sent the tenant a meaningless "Request Approved".
    $stmt = $conn->prepare("SELECT * FROM notifications WHERE id = ? AND type IN ('occupancy_request', 'lease_extension_request')");
    $stmt->bind_param("i", $notification_id);
    $stmt->execute();
    $notif = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$notif) {
        $conn->rollback();
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Occupancy or lease extension request not found."]);
        exit;
    }

    // Claim the request atomically before doing anything else: only a
    // notification still 'Pending' can be claimed, and this UPDATE can only
    // ever succeed once. Replaying the same approve/reject call (double
    // click, retried request) after the first call already claimed it now
    // hits affected_rows = 0 and aborts, instead of re-running the whole
    // rent-hike / lease-extension logic a second time.
    $statusText = ($action === 'approve') ? 'Approved' : 'Rejected';
    $claimStmt = $conn->prepare("UPDATE notifications SET is_read = 1, status = ? WHERE id = ? AND status = 'Pending'");
    $claimStmt->bind_param("si", $statusText, $notification_id);
    $claimStmt->execute();
    $claimed = $claimStmt->affected_rows > 0;
    $claimStmt->close();

    if (!$claimed) {
        throw new Exception("This request has already been processed.");
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

                // Base rate is read live from rooms.monthly_rent (the admin-
                // configurable rate), not a hardcoded per-letter table.
                $room_rate_stmt = $conn->prepare("SELECT monthly_rent FROM rooms WHERE id = ?");
                $room_rate_stmt->bind_param("s", $clean_room);
                $room_rate_stmt->execute();
                $room_rate_row = $room_rate_stmt->get_result()->fetch_assoc();
                $room_rate_stmt->close();
                $base_room_rent = $room_rate_row ? (float)$room_rate_row['monthly_rent'] : 4000;

                $occupant_surcharge_setting = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'occupant_surcharge_per_person'")->fetch_assoc();
                $occupant_surcharge = $occupant_surcharge_setting ? (float)$occupant_surcharge_setting['setting_value'] : 1000;
                $new_monthly_rent = $base_room_rent + ($new_occupants > 4 ? ($new_occupants - 4) * $occupant_surcharge : 0);

                $updateStmt = $conn->prepare("UPDATE rent_applications SET occupants = ?, monthly_rent = ? WHERE id = ?");
                $updateStmt->bind_param("idi", $new_occupants, $new_monthly_rent, $app_res['id']);
                $updateStmt->execute();
                $updateStmt->close();

                // Only the occupant count belongs on rooms — rooms.monthly_rent is the
                // unit's catalog rate and must only ever be changed via update_room.php.
                // Writing this tenant's surcharged rent here used to permanently inflate
                // the room's base rate for every future applicant.
                $roomStmt = $conn->prepare("UPDATE rooms SET occupants = ? WHERE id = ?");
                $roomStmt->bind_param("is", $new_occupants, $room_name);
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

    // 3. (Notification already marked decided by the claim step above.)

    // 4. Notify the tenant of the decision (never Pending, so it can't be re-decided).
    $label = $type === 'occupancy_request' ? 'occupancy change request' : 'lease extension request';
    $title = ($action === 'approve') ? "Request Approved" : "Request Declined";
    $msg = "Your $label has been " . strtolower($statusText) . " by management.";
    create_notification($conn, $target_user_id, $type, $title, $msg, 'Resolved');

    $conn->commit();
    echo json_encode(["success" => true, "message" => "Request $statusText successfully."]);

} catch (Exception $e) {
    $conn->rollback();
    server_error_response($e, $e->getMessage() === "This request has already been processed."
        ? "This request has already been processed." : "Could not process the request.");
}

$conn->close();
?>