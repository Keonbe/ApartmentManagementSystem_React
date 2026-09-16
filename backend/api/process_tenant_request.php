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

// A request that can't be applied as asked (limits, stale state). The message is
// safe to show the admin, unlike an unexpected server error.
class RequestRefused extends Exception {}

$conn->begin_transaction();

try {
    // 1. Fetch the original notification. Only the two request types this
    // endpoint knows how to apply may be decided here. It used to load any id,
    // so an admin could "approve" a tenant's rent reminder or bill notice, which
    // flipped its status and sent the tenant a meaningless "Request Approved".
    $stmt = $conn->prepare("SELECT * FROM notifications WHERE id = ? AND type IN ('occupancy_request', 'lease_extension_request', 'household_request')");
    $stmt->bind_param("i", $notification_id);
    $stmt->execute();
    $notif = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$notif) {
        $conn->rollback();
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Occupancy, household or lease extension request not found."]);
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

            $appStmt = $conn->prepare("SELECT id FROM rent_applications WHERE user_id = ? AND status IN ('Approved', 'active', 'pending-move-out') ORDER BY id DESC LIMIT 1");
            $appStmt->bind_param("i", $target_user_id);
            $appStmt->execute();
            $app_res = $appStmt->get_result()->fetch_assoc();
            $appStmt->close();

            $new_monthly_rent = null;
            if ($app_res) {
                // The count can't drop below the lease holder plus the named
                // household members, or rise above the configured maximum.
                $app_id = (int)$app_res['id'];
                $floor = 1 + household_active_count($conn, $app_id);
                $max = max_occupants_per_unit($conn);
                if ($new_occupants < $floor) throw new RequestRefused("The unit has $floor named occupant(s); remove household members before lowering the count.");
                if ($new_occupants > $max) throw new RequestRefused("The maximum is $max occupants per unit.");
                $new_monthly_rent = apply_occupant_count($conn, $app_id, $new_occupants);
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

    $household_label = null;
    if ($type === 'household_request') {
        $parts = explode(':', (string)$notif['metadata_value'], 2);
        $op = $parts[0] ?? '';
        $member_id = (int)($parts[1] ?? 0);

        $mStmt = $conn->prepare("SELECT hm.*, ra.user_id AS holder_id, ra.occupants FROM household_members hm JOIN rent_applications ra ON ra.id = hm.rent_application_id WHERE hm.id = ?");
        $mStmt->bind_param("i", $member_id);
        $mStmt->execute();
        $member = $mStmt->get_result()->fetch_assoc();
        $mStmt->close();
        if (!$member || (int)$member['holder_id'] !== (int)$target_user_id) {
            throw new RequestRefused("Household member not found.");
        }
        $app_id = (int)$member['rent_application_id'];
        $name = $member['full_name'];
        $current = (int)$member['occupants'];

        if ($op === 'add') {
            if ($member['status'] !== 'Pending') throw new RequestRefused("This household request is no longer open.");
            if ($action === 'approve') {
                $new_count = max($current, 2 + household_active_count($conn, $app_id));
                $max = max_occupants_per_unit($conn);
                if ($new_count > $max) throw new RequestRefused("Adding $name would exceed the maximum of $max occupants per unit.");
                $upd = $conn->prepare("UPDATE household_members SET status = 'Active', added_at = NOW() WHERE id = ? AND status = 'Pending'");
            } else {
                $upd = $conn->prepare("UPDATE household_members SET status = 'Rejected' WHERE id = ? AND status = 'Pending'");
            }
            $household_label = "request to add $name to your household";
        } elseif ($op === 'remove') {
            if ($member['status'] !== 'Active' || $member['removal_requested_at'] === null) throw new RequestRefused("This household request is no longer open.");
            if ($action === 'approve') {
                $upd = $conn->prepare("UPDATE household_members SET status = 'Removed', removed_at = NOW(), removal_requested_at = NULL WHERE id = ? AND status = 'Active'");
            } else {
                $upd = $conn->prepare("UPDATE household_members SET removal_requested_at = NULL WHERE id = ?");
            }
            $household_label = "request to remove $name from your household";
        } else {
            throw new RequestRefused("Unknown household request.");
        }
        $upd->bind_param("i", $member_id);
        $upd->execute();
        $upd->close();

        if ($action === 'approve') {
            // Naming someone already counted doesn't change the count; a new
            // person raises it by one. Removing lowers it, never below the
            // lease holder plus the members still named.
            $active = household_active_count($conn, $app_id);
            $new_count = $op === 'add' ? max($current, 1 + $active) : max(1 + $active, $current - 1);
            $new_rent = apply_occupant_count($conn, $app_id, $new_count);
            log_activity($conn, $admin_id, 'tenant', $op === 'add' ? "Approved Household Member" : "Approved Household Removal",
                "User ID: $target_user_id — $name; occupants now $new_count (Rent: ₱$new_rent)");
        } else {
            log_activity($conn, $admin_id, 'tenant', $op === 'add' ? "Rejected Household Member" : "Rejected Household Removal", "User ID: $target_user_id — $name");
        }
    } elseif ($action === 'reject') {
        log_activity($conn, $admin_id, 'tenant', "Rejected " . str_replace('_', ' ', $type), "User ID: $target_user_id");
    }

    // 3. (Notification already marked decided by the claim step above.)

    // 4. Notify the tenant of the decision (never Pending, so it can't be re-decided).
    $label = $household_label ?? ($type === 'occupancy_request' ? 'occupancy change request' : 'lease extension request');
    $title = ($action === 'approve') ? "Request Approved" : "Request Declined";
    $msg = "Your $label has been " . strtolower($statusText) . " by management.";
    create_notification($conn, $target_user_id, $type, $title, $msg, 'Resolved');

    $conn->commit();
    echo json_encode(["success" => true, "message" => "Request $statusText successfully."]);

} catch (RequestRefused $e) {
    $conn->rollback();
    http_response_code(409);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
} catch (Exception $e) {
    $conn->rollback();
    server_error_response($e, $e->getMessage() === "This request has already been processed."
        ? "This request has already been processed." : "Could not process the request.");
}

$conn->close();
?>