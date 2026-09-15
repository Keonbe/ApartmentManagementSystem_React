<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
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
$action = $input['action'] ?? ''; // 'flag', 'clear', 'activate' or 'edit'

if (empty($contract_id) || empty($action)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Contract ID and action are required."]);
    exit;
}

$tenant_id = get_contract_owner($conn, $contract_id);

if ($action === 'edit') {
    $lease_start = $input['leaseStart'] ?? null;
    $lease_end = $input['leaseEnd'] ?? null;
    if (empty($lease_start) || empty($lease_end)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Lease Start and Lease End are required."]);
        exit;
    }
    $stmt = $conn->prepare("UPDATE lease_contracts SET lease_start = ?, lease_end = ? WHERE id = ?");
    $stmt->bind_param("sss", $lease_start, $lease_end, $contract_id);
    if ($stmt->execute()) {
        log_activity($conn, $admin_id, 'contract', "Updated Contract Dates", "Contract: $contract_id, Start: $lease_start, End: $lease_end");
        if ($tenant_id && $stmt->affected_rows > 0) {
            create_notification($conn, $tenant_id, 'contract_update', 'Lease Dates Updated',
                "Your lease contract dates were updated: " . date('M j, Y', strtotime($lease_start)) . " to " . date('M j, Y', strtotime($lease_end)) . ".");
        }
        echo json_encode(["success" => true, "message" => "Contract dates updated successfully"]);
    } else {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Failed to update contract dates"]);
    }
} else if ($action === 'activate') {
    // Draft -> Active, after the admin has reviewed the generated contract.
    $stmt = $conn->prepare("UPDATE lease_contracts SET status = 'active' WHERE id = ? AND status = 'draft'");
    $stmt->bind_param("s", $contract_id);

    if ($stmt->execute()) {
        if ($stmt->affected_rows === 0) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "Contract not found or is not a draft."]);
        } else {
            log_activity($conn, $admin_id, 'contract', "Activated Contract", "Contract: $contract_id");
            if ($tenant_id) {
                create_notification($conn, $tenant_id, 'contract_update', 'Lease Contract Active',
                    "Your lease contract ($contract_id) is now active. You can view it any time from View Contract.");
            }
            echo json_encode(["success" => true, "message" => "Contract activated successfully"]);
        }
    } else {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Failed to activate contract"]);
    }
} else if ($action === 'flag' || $action === 'clear') {
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

    $stmt = $conn->prepare("UPDATE lease_contracts SET status = ?, eviction_status = ? WHERE id = ?");
    $stmt->bind_param("sss", $status, $eviction_status, $contract_id);

    if ($stmt->execute()) {
        if ($stmt->affected_rows === 0) {
            http_response_code(404);
            echo json_encode(["success" => false, "message" => "Contract not found."]);
        } else {
            log_activity($conn, $admin_id, 'contract', $action === 'flag' ? "Flagged Eviction" : "Cleared Eviction Flag", "Contract: $contract_id");
            if ($tenant_id) {
                if ($action === 'flag') {
                    create_notification($conn, $tenant_id, 'contract_update', 'Lease Under Eviction Review',
                        "Your lease has been flagged for eviction review because of overdue payments. Please settle your balance or contact management.");
                } else {
                    create_notification($conn, $tenant_id, 'contract_update', 'Eviction Review Cleared',
                        "The eviction review on your lease has been cleared.");
                }
            }
            echo json_encode(["success" => true, "message" => "Eviction status updated successfully"]);
        }
    } else {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Failed to update eviction status"]);
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
