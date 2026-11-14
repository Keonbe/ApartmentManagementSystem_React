<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true);

if (!$input) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "No data received"]);
    exit;
}

$contract_id = $input['contractId'] ?? '';
// Why the suggested notice deduction from the deposit was lowered: text only.
$input['waive_forfeiture_reason'] = is_string($input['waive_forfeiture_reason'] ?? null) ? mb_substr(trim($input['waive_forfeiture_reason']), 0, 200) : '';
$action = $input['action'] ?? ''; // 'flag', 'clear', 'activate', 'terminate' or 'edit'

if (empty($contract_id) || empty($action)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Contract ID and action are required."]);
    exit;
}

// Load current status up front so every action can be checked against
// CONTRACT_TRANSITIONS instead of guessing from its own WHERE clause.
$lookup = $conn->prepare("SELECT lc.status, lc.lease_end, lc.rent_application_id, ra.status AS app_status
                          FROM lease_contracts lc
                          LEFT JOIN rent_applications ra ON ra.id = lc.rent_application_id
                          WHERE lc.id = ?");
$lookup->bind_param("s", $contract_id);
$lookup->execute();
$contract = $lookup->get_result()->fetch_assoc();
$lookup->close();

if (!$contract) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Contract not found."]);
    exit;
}

$current_status = $contract['status'];
$tenant_id = get_contract_owner($conn, $contract_id);

if ($action === 'edit') {
    if (!contract_action_allowed($current_status, 'edit')) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "A $current_status contract's dates cannot be edited."]);
        exit;
    }

    $lease_start = $input['leaseStart'] ?? null;
    $lease_end = $input['leaseEnd'] ?? null;
    if (empty($lease_start) || empty($lease_end)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Rent Start and Rent End are required."]);
        exit;
    }

    $start_dt = DateTime::createFromFormat('Y-m-d', $lease_start);
    $end_dt = DateTime::createFromFormat('Y-m-d', $lease_end);
    // createFromFormat rolls 2026-02-30 over to 2026-03-02, so compare the round trip.
    if (!$start_dt || !$end_dt || $start_dt->format('Y-m-d') !== $lease_start || $end_dt->format('Y-m-d') !== $lease_end) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Dates must be in YYYY-MM-DD format."]);
        exit;
    }
    if ($end_dt <= $start_dt) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Rent end must be after rent start."]);
        exit;
    }
    $max_end = (clone $start_dt)->modify('+24 months');
    if ($end_dt > $max_end) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "The maximum rent period is 24 months."]);
        exit;
    }
    // Moving the end date later is an extension, so it obeys the same
    // "Maximum Months Ahead" setting as the three extension paths. Keeping or
    // shortening an end date that is already far out is still allowed.
    if (empty($contract['lease_end']) || $lease_end > $contract['lease_end']) {
        $ahead_error = rent_end_ahead_error($conn, $lease_end);
        if ($ahead_error !== null) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => $ahead_error]);
            exit;
        }
    }

    // Re-derive status from the new dates: an active lease whose new end date
    // has already lapsed should read as expired immediately, and an expired
    // lease extended into the future should read as active again — but only
    // while the application behind it is still occupied, so editing dates on
    // an expired lease for a tenant who has since moved out doesn't silently
    // reactivate it.
    $today = date('Y-m-d');
    $new_status = $current_status;
    if ($current_status === 'active' && $lease_end < $today) {
        $new_status = 'expired';
    } elseif ($current_status === 'expired' && $lease_end >= $today
        && in_array($contract['app_status'], ['Approved', 'active', 'pending-move-out'], true)) {
        $new_status = 'active';
    }

    $stmt = $conn->prepare("UPDATE lease_contracts SET lease_start = ?, lease_end = ?, status = ? WHERE id = ? AND status = ?");
    $stmt->bind_param("sssss", $lease_start, $lease_end, $new_status, $contract_id, $current_status);
    if ($stmt->execute()) {
        if ($stmt->affected_rows === 0) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "Contract status changed before this could be applied. Try again."]);
        } else {
            // Keep rooms.lease_start/lease_end in step — get_rooms.php and the
            // occupancy views read the lease dates from there, not the contract.
            // Only while this application still holds the room: an expired
            // contract of a tenant who moved out must not rewrite the dates of
            // whoever rents the room now (audit M2).
            if (!empty($contract['rent_application_id'])) {
                $room_stmt = $conn->prepare("
                    UPDATE rooms r
                    JOIN rent_applications ra ON ra.room_name = r.id
                    SET r.lease_start = ?, r.lease_end = ?
                    WHERE ra.id = ?
                      AND ra.status IN ('Approved', 'active', 'pending-move-out')
                      AND r.status IN ('reserved', 'occupied')
                ");
                $room_stmt->bind_param("ssi", $lease_start, $lease_end, $contract['rent_application_id']);
                $room_stmt->execute();
                $room_stmt->close();
            }

            log_activity($conn, $admin_id, 'contract', "Updated Contract Dates", "Contract: $contract_id, Start: $lease_start, End: $lease_end" . ($new_status !== $current_status ? ", Status: $current_status -> $new_status" : ""));
            if ($tenant_id) {
                create_notification($conn, $tenant_id, 'contract_update', 'Rent Dates Updated',
                    "Your rent contract dates were updated: " . date('M j, Y', strtotime($lease_start)) . " to " . date('M j, Y', strtotime($lease_end)) . ".");
            }
            echo json_encode(["success" => true, "message" => "Contract dates updated successfully"]);
        }
    } else {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Failed to update contract dates"]);
    }
} else if ($action === 'set_deposit_refundable') {
    // RA 9653 Sec. 7: the deposit may be kept only to the extent of unpaid
    // rent, utilities and damage, so what remains is always returned. The
    // "not refunded" option was removed (2026-11-13).
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Under RA 9653 the unused security deposit is always returned to the tenant, so this cannot be turned off."]);
    exit;
} else if ($action === 'activate') {
    // Draft -> Active, after the admin has reviewed the generated contract.
    if (!contract_action_allowed($current_status, 'activate')) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "A $current_status contract cannot be activated."]);
        exit;
    }

    // An active contract starts the monthly rent sweep, so it needs the move-in
    // invoice (advance rent + deposit) paid first. And while the tenant has not
    // moved in, confirming the move-in is what activates the contract — with
    // the real start date the rent months are anchored on.
    if (empty($contract['rent_application_id']) || !move_in_paid($conn, $contract['rent_application_id'])) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "The move-in invoice (advance rent and security deposit) must be paid before this contract can be activated."]);
        exit;
    }
    if (!in_array($contract['app_status'], ['active', 'pending-move-out'], true)) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This tenant has not moved in yet. Confirm the move-in instead; that activates the contract from the move-in date."]);
        exit;
    }

    $stmt = $conn->prepare("UPDATE lease_contracts SET status = 'active' WHERE id = ? AND status = ?");
    $stmt->bind_param("ss", $contract_id, $current_status);

    if ($stmt->execute()) {
        if ($stmt->affected_rows === 0) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "Contract status changed before this could be applied. Try again."]);
        } else {
            log_activity($conn, $admin_id, 'contract', "Activated Contract", "Contract: $contract_id");
            if ($tenant_id) {
                create_notification($conn, $tenant_id, 'contract_update', 'Rent Contract Active',
                    "Your rent contract ($contract_id) is now active. You can view it any time from View Contract.");
            }
            echo json_encode(["success" => true, "message" => "Contract activated successfully"]);
        }
    } else {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Failed to activate contract"]);
    }
} else if ($action === 'flag' || $action === 'clear') {
    if (!contract_action_allowed($current_status, $action)) {
        http_response_code(422);
        $verb = $action === 'flag' ? 'flagged for eviction' : 'cleared';
        echo json_encode(["success" => false, "message" => "A $current_status contract cannot be $verb."]);
        exit;
    }

    $eviction_status = $action === 'flag' ? 'flagged' : null;
    $ground = null;

    if ($action === 'flag') {
        // RA 9653 Sec. 9: an eviction is only for one of the legal grounds,
        // checked here (arrears must total three months of rent).
        $ground = is_string($input['ground'] ?? null) ? $input['ground'] : '';
        if ($why = ejectment_ground_refusal($conn, $contract, $ground, $input, 'flag')) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => $why]);
            exit;
        }
        $status = 'eviction-pending';
    } else {
        // Clearing the flag restores whatever status the lease's own dates
        // imply, rather than always forcing 'active' — a contract whose
        // lease_end has already lapsed should go back to 'expired', not be
        // reactivated as a side effect of clearing an eviction flag.
        $dateStmt = $conn->prepare("SELECT lease_end FROM lease_contracts WHERE id = ?");
        $dateStmt->bind_param("s", $contract_id);
        $dateStmt->execute();
        $row = $dateStmt->get_result()->fetch_assoc();
        $dateStmt->close();

        $lease_end = $row ? $row['lease_end'] : null;
        $status = ($lease_end !== null && $lease_end < date('Y-m-d')) ? 'expired' : 'active';
    }

    $stmt = $conn->prepare("UPDATE lease_contracts SET status = ?, eviction_status = ?, eviction_ground = ? WHERE id = ? AND status = ?");
    $stmt->bind_param("sssss", $status, $eviction_status, $ground, $contract_id, $current_status);

    if ($stmt->execute()) {
        if ($stmt->affected_rows === 0) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "Contract status changed before this could be applied. Try again."]);
        } else {
            $detail = trim((string)($input['details'] ?? ''));
            log_activity($conn, $admin_id, 'contract', $action === 'flag' ? "Flagged Eviction" : "Cleared Eviction Flag",
                "Contract: $contract_id" . ($ground ? "; ground: " . ejectment_ground_label($ground) : '')
                . (!empty($input['notice_date']) ? "; notice given " . $input['notice_date'] : '')
                . ($detail !== '' ? "; " . mb_substr($detail, 0, 200) : ''));
            if ($tenant_id) {
                if ($action === 'flag') {
                    create_notification($conn, $tenant_id, 'contract_update', 'Rent Contract Under Eviction Review',
                        "Your rent contract is under eviction review. Ground: " . ejectment_ground_label($ground) . " (RA 9653 Sec. 9). "
                        . ($ground === 'arrears' ? "Settling your unpaid rent ends the review. " : "")
                        . "Please contact management. If you do not agree, only a court can order you to leave; your utilities and access are not cut off.");
                } else {
                    create_notification($conn, $tenant_id, 'contract_update', 'Eviction Review Cleared',
                        "The eviction review on your rent contract has been cleared.");
                }
            }
            echo json_encode(["success" => true, "message" => "Eviction status updated successfully"]);
        }
    } else {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Failed to update eviction status"]);
    }
} else if ($action === 'terminate') {
    // Terminating a lease ends the tenancy — it isn't just a status label.
    // end_tenancy() below is the same helper the ordinary move-out flow
    // (update_tenant_status.php) and tenant archiving (archive_tenant.php)
    // use: it vacates the room, cancels open invoices, releases parking and
    // cancels pending visitor pre-registrations (M3).
    if (!contract_action_allowed($current_status, 'terminate')) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "A $current_status contract cannot be terminated."]);
        exit;
    }

    $reason = trim($input['reason'] ?? '');
    if ($reason === '') {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Give a reason for terminating this contract."]);
        exit;
    }
    // RA 9653 Sec. 9 grounds, or the tenant's own agreement ('mutual').
    $ground = is_string($input['ground'] ?? null) ? $input['ground'] : '';
    if ($why = ejectment_ground_refusal($conn, $contract, $ground, $input, 'terminate')) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => $why]);
        exit;
    }

    if (empty($contract['rent_application_id'])) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This contract has no linked application to end the tenancy for."]);
        exit;
    }
    if (in_array($contract['app_status'], ['moved-out', 'archived'], true)) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This tenant has already moved out."]);
        exit;
    }

    $app_id = (int)$contract['rent_application_id'];

    // A payment still under review would be charged to the deposit and then
    // cancelled by end_tenancy(); the admin settles it first.
    if ($in_review = tenancy_payment_in_review($conn, $app_id)) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => $in_review]);
        exit;
    }

    $conn->begin_transaction();
    try {
        // Not closed here — the shared cleanup at the bottom of the file
        // closes $stmt once, same as every other action branch above.
        $stmt = $conn->prepare("UPDATE lease_contracts SET status = 'terminated', termination_reason = ?, terminated_at = NOW(), eviction_status = NULL, eviction_ground = ? WHERE id = ? AND status = ?");
        $stmt->bind_param("ssss", $reason, $ground, $contract_id, $current_status);
        $stmt->execute();
        $changed = $stmt->affected_rows > 0;
        if (!$changed) {
            throw new Exception("Contract status changed before this could be applied. Try again.");
        }

        // Locks the application and checks it can still move out.
        $ended = transition_application($conn, $app_id, 'moved-out');
        if (!$ended['ok']) {
            throw new Exception("This tenant has already moved out.");
        }

        // The deposit's disposition, through the same settle_deposit() as an
        // ordinary move-out: it covers what is owed plus itemized damage and
        // utilities, and the rest (with any bank interest) is returned
        // (RA 9653 Sec. 7). Read before end_tenancy() cancels any invoice.
        $settled = settle_deposit($conn, $app_id, $contract_id, [
            'kind' => 'terminate', 'waive_reason' => $input['waive_forfeiture_reason'] ?? '',
            'damage' => $input['damage_deduction'] ?? 0, 'utility' => $input['utility_deduction'] ?? 0,
            'interest' => $input['deposit_interest'] ?? 0,
            'admin_id' => $admin_id, 'user_id' => $ended['user_id'] ?? 0,
        ]);
        $open_total = $settled ? $settled['open_total'] : 0.0;

        $vacated = end_tenancy($conn, $app_id, 'Contract Terminated');
        if ($vacated === null) {
            throw new Exception("The application behind this contract no longer exists.");
        }
        // A deposit that covered what was owed also clears those invoices
        // (otherwise the tenant would pay them twice: once from the deposit, once again).
        if ($settled && $settled['balance'] <= 0 && $settled['open_total'] > 0) {
            $clear = $conn->prepare("UPDATE invoices SET status = 'cancelled', cancel_reason = 'Settled from deposit' WHERE rent_application_id = ? AND status IN " . billing_open_status_sql());
            $clear->bind_param("i", $app_id);
            $clear->execute();
            $clear->close();
        }

        $conn->commit();

        if ($settled && $settled['refund_id']) {
            notify_refund_raised($conn, $settled['refund_id'], $settled['refund_amount'], 'a returned security deposit');
            log_activity($conn, $admin_id, 'billing', 'Refund Requested', "Refund #{$settled['refund_id']}: ₱" . number_format($settled['refund_amount'], 2) . " (security deposit, contract $contract_id)");
        }
        if ($vacated['user_id']) {
            create_notification($conn, $vacated['user_id'], 'contract_update', 'Rent Contract Terminated',
                "Your rent contract ($contract_id) has been terminated (" . ejectment_ground_label($ground) . "): $reason. Your unit has been marked vacant."
                . ($settled && $settled['refund_amount'] > 0 ? " ₱" . number_format($settled['refund_amount'], 2) . " of your deposit will be returned within " . deposit_refund_days($conn) . " days. Follow it under My Refunds." : "")
                . ($ground !== 'mutual' ? " If you do not agree, only a court can order you to leave." : ""));
        }
        $details = "Contract: $contract_id, Ground: " . ejectment_ground_label($ground) . ", Reason: $reason"
            . ($settled ? "; deposit " . $settled['status'] . ($settled['refund_amount'] > 0 ? " (refund ₱" . number_format($settled['refund_amount'], 2) . ")" : "") . ($settled['interest'] > 0 ? " incl. ₱" . number_format($settled['interest'], 2) . " interest" : "") : "")
            . ($open_total > 0 ? "; ₱" . number_format($open_total, 2) . " open at termination" : "")
            . ($vacated['parking_released'] ? "; parking released" : "")
            . ($vacated['visitors_cancelled'] ? "; visitor pre-registrations cancelled" : "");
        log_activity($conn, $admin_id, 'contract', "Terminated Contract & Ended Tenancy", $details);

        echo json_encode(["success" => true, "message" => "Contract terminated and tenancy ended."]);
    } catch (Exception $e) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => public_error_message($e)]);
    }
} else {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Unknown action."]);
}

if (isset($stmt) && $stmt instanceof mysqli_stmt) {
    $stmt->close();
}
$conn->close();
?>
