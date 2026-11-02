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
    if (!$start_dt || !$end_dt) {
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

    if ($action === 'flag') {
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

    $stmt = $conn->prepare("UPDATE lease_contracts SET status = ?, eviction_status = ? WHERE id = ? AND status = ?");
    $stmt->bind_param("ssss", $status, $eviction_status, $contract_id, $current_status);

    if ($stmt->execute()) {
        if ($stmt->affected_rows === 0) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "Contract status changed before this could be applied. Try again."]);
        } else {
            log_activity($conn, $admin_id, 'contract', $action === 'flag' ? "Flagged Eviction" : "Cleared Eviction Flag", "Contract: $contract_id");
            if ($tenant_id) {
                if ($action === 'flag') {
                    create_notification($conn, $tenant_id, 'contract_update', 'Rent Contract Under Eviction Review',
                        "Your rent contract has been flagged for eviction review because of overdue payments. Please settle your balance or contact management.");
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

    $conn->begin_transaction();
    try {
        // Not closed here — the shared cleanup at the bottom of the file
        // closes $stmt once, same as every other action branch above.
        $stmt = $conn->prepare("UPDATE lease_contracts SET status = 'terminated', termination_reason = ?, terminated_at = NOW(), eviction_status = NULL WHERE id = ? AND status = ?");
        $stmt->bind_param("sss", $reason, $contract_id, $current_status);
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

        // The deposit's disposition, as at an ordinary move-out (non-refundable,
        // checklist 3.9): a held deposit is applied against whatever is still
        // owed, else to rent; one never paid is recorded as not collected. Read
        // before end_tenancy() cancels any invoice.
        $open_stmt = $conn->prepare("SELECT COALESCE(SUM(" . invoice_balance_sql('i') . "), 0) AS open_total FROM invoices i WHERE i.rent_application_id = ? AND " . invoice_owed_where_sql('i'));
        $open_stmt->bind_param("i", $app_id);
        $open_stmt->execute();
        $open_total = (float)$open_stmt->get_result()->fetch_assoc()['open_total'];
        $open_stmt->close();
        $deposit_status = $open_total > 0 ? 'Applied to Bills/Damages' : 'Applied to Rent';
        $dep_stmt = $conn->prepare("UPDATE lease_contracts
            SET deposit_status = CASE WHEN deposit_status = 'Held' THEN ? ELSE 'Not Collected' END,
                refund_amount = 0.00, refund_date = CURDATE()
            WHERE id = ? AND deposit_status IN ('Held', 'Pending')");
        $dep_stmt->bind_param("ss", $deposit_status, $contract_id);
        $dep_stmt->execute();
        $dep_stmt->close();

        $vacated = end_tenancy($conn, $app_id, 'Contract Terminated');
        if ($vacated === null) {
            throw new Exception("The application behind this contract no longer exists.");
        }

        $conn->commit();

        if ($vacated['user_id']) {
            create_notification($conn, $vacated['user_id'], 'contract_update', 'Rent Contract Terminated',
                "Your rent contract ($contract_id) has been terminated: $reason. Your unit has been marked vacant.");
        }
        $details = "Contract: $contract_id, Reason: $reason"
            . ($open_total > 0 ? "; ₱" . number_format($open_total, 2) . " still open at termination" : "")
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
