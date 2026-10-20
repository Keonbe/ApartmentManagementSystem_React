<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, x-user-id");

require_once "../config.php";
require_once __DIR__ . '/services/send_notification.php';

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
        echo json_encode(["success" => false, "message" => "Occupancy, household or rent extension request not found."]);
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
    $extension_billed_monthly = false;

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

            // The tenant's running tenancy (a scheduled move-out is found too, so
            // extend_tenancy() can refuse it with a clear reason).
            $appStmt = $conn->prepare("SELECT id FROM rent_applications WHERE user_id = ? AND status IN ('active', 'pending-move-out') ORDER BY id DESC LIMIT 1");
            $appStmt->bind_param("i", $target_user_id);
            $appStmt->execute();
            $app = $appStmt->get_result()->fetch_assoc();
            $appStmt->close();
            if (!$app) {
                throw new RequestRefused("This tenant has no running tenancy to extend.");
            }

            // Same rules as the request (contract state, overdue bills, scheduled
            // move-out, months-ahead limit), re-checked now; bills any holdover
            // months if the contract had expired (config.php extend_tenancy()).
            try {
                $extension = extend_tenancy($conn, (int)$app['id'], $add_months, $admin_id);
            } catch (ExtensionRefused $e) {
                throw new RequestRefused($e->getMessage());
            }

            $detail = "User ID: $target_user_id — Contract {$extension['contract_id']} extended by $add_months month(s): {$extension['previous_end']} → {$extension['new_end']}";
            if ($extension['holdover_invoices']) {
                $detail .= "; billed " . count($extension['holdover_invoices']) . " holdover month(s) since expiry (₱" . number_format($extension['holdover_total'], 2) . ")";
            }
            log_activity($conn, $admin_id, 'contract', "Approved Rent Extension", $detail);

            // The added months are billed like every other tenancy month:
            // generate_due_rent_invoices() issues each one RENT_INVOICE_LEAD_DAYS
            // before it starts (run below, after commit).
            $extension_billed_monthly = true;
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
                // The age rule is checked again: the settings may have changed since the request.
                $age_refusal = household_age_refusal($conn, $app_id, $member['age'] === null ? null : (int)$member['age']);
                if ($age_refusal !== null) throw new RequestRefused($age_refusal, 422);
                $upd =$conn->prepare("UPDATE household_members SET status = 'Active', added_at = NOW() WHERE id = ? AND status = 'Pending'");
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
    $label = $household_label ?? ($type === 'occupancy_request' ? 'occupancy change request' : 'rent extension request');
    $title = ($action === 'approve') ? "Request Approved" : "Request Declined";
    $msg = "Your $label has been " . strtolower($statusText) . " by management.";
    if ($extension_billed_monthly) {
        $msg .= " Each added month is billed a week before it starts, due on your usual rent day.";
        if (!empty($extension['holdover_invoices'])) {
            $msg .= " Your contract had expired, so the " . count($extension['holdover_invoices']) . " month(s) you stayed since then (₱" . number_format($extension['holdover_total'], 2) . ") are now billed, due " . date('M j, Y', strtotime('+' . RENT_INVOICE_LEAD_DAYS . ' days')) . ".";
        }
    }
    create_notification($conn, $target_user_id, $type, $title, $msg, 'Resolved');

    $conn->commit();

    // After commit: a notification problem must not roll back an approval that
    // has already changed the tenant's occupancy and billing.
    try {
        $notification_dispatch = dispatch_admin_action_notification(
            $conn, $target_user_id, $type, $title,
            sms_status_update_template('', $label, $statusText,
                $extension_billed_monthly ? 'Each added month is billed a week before it starts.' : ''),
            email_status_update_template(
                notify_recipient_name($conn, $target_user_id),
                str_replace('_', ' ', $type), $label, $statusText, $msg
            )
        );
    } catch (Throwable $notification_error) {
        error_log('Could not dispatch tenant request decision: ' . $notification_error->getMessage());
        $notification_dispatch = ['sms' => 'failed', 'email' => 'failed'];
    }

    $response_message = "Request $statusText successfully.";
    if ($extension_billed_monthly) {
        // A month that starts within the invoice lead time is billed now rather
        // than at the next daily sweep.
        $billed_now = generate_due_rent_invoices($conn);
        $response_message .= " The added months are billed monthly" . ($billed_now ? " ($billed_now invoice(s) issued now)." : ".");
    }
    echo json_encode([
        "success" => true,
        "message" => $response_message,
        "notification_dispatch" => $notification_dispatch
    ]);

} catch (RequestRefused $e) {
    $conn->rollback();
    // 409 for stale state and limits; 422 when the request breaks a rule (child age on a restricted floor).
    http_response_code($e->getCode() === 422 ? 422 : 409);
    echo json_encode(["success" => false, "message" => public_error_message($e)]);
} catch (Exception $e) {
    $conn->rollback();
    server_error_response($e, $e->getMessage() === "This request has already been processed."
        ? "This request has already been processed." : "Could not process the request.");
}

$conn->close();
?>