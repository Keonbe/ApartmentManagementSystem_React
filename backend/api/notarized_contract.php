<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";
require_once __DIR__ . '/../signed_contract.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// The notarized rent contract, handed to the office in person (backend/signed_contract.php).
//   POST { contractId, action }
//   ready   tenant (own contract): "my contract is notarized"; the office is alerted
//           (queue type notarized_contract). Needs the setting on, a contract in force,
//           a signed copy on file that was not sent back, and no notarized copy yet.
//   mark    admin: the office has the notarized copy (notarized_at / notarized_by); the
//           alert is cleared and the tenant told.
//   unmark  admin: undo a mark made by mistake (the alert comes back if the tenant had
//           said it was ready).
$user = require_user($conn);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Use POST."]);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) $body = $_POST;
$text = fn($key) => isset($body[$key]) && is_scalar($body[$key]) ? trim((string)$body[$key]) : '';
$contract_id = $text('contractId');
$action = $text('action');

$errors = [];
if ($contract_id === '') $errors['contractId'] = 'Choose a contract.';
if (!in_array($action, ['ready', 'mark', 'unmark'], true)) $errors['action'] = 'Unknown action.';
if ($errors) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => reset($errors), "errors" => $errors]);
    exit;
}
$is_admin = ($user['role'] ?? '') === 'admin';
if ($action === 'ready' ? $is_admin : !$is_admin) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => $action === 'ready' ? "Only the tenant can say the contract is notarized." : "Only an admin can do that."]);
    exit;
}

$fail = function ($code, $message) use ($conn) {
    $conn->rollback();
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
};

$conn->begin_transaction();
try {
    $stmt = $conn->prepare("SELECT lc.id, lc.status, lc.signed_lease_path, lc.signed_lease_review, lc.notarized_lease_path,
                                   lc.notarized_ready_at, lc.notarized_at, ra.user_id
                              FROM lease_contracts lc
                              LEFT JOIN rent_applications ra ON ra.id = lc.rent_application_id
                             WHERE lc.id = ? FOR UPDATE");
    $stmt->bind_param("s", $contract_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    // A tenant asking about someone else's contract gets the same 404 as a missing one.
    if (!$row || (!$is_admin && (int)$row['user_id'] !== (int)$user['id'])) $fail(404, "Contract not found.");

    if ($action === 'ready') {
        if (!contract_requires_notarized($conn)) $fail(409, "The office does not need a notarized copy.");
        if (!in_array($row['status'], ['draft', 'active', 'eviction-pending'], true)) $fail(409, "This rent contract is no longer in force.");
        $signed = signed_contract_review_state($row);
        if ($signed === null || $signed === 'rejected') $fail(409, "Upload your signed contract first.");
        if (contract_is_notarized($row)) $fail(409, "The office already has your notarized copy.");
        $upd = $conn->prepare("UPDATE lease_contracts SET notarized_ready_at = NOW() WHERE id = ? AND notarized_ready_at IS NULL AND notarized_at IS NULL");
        $upd->bind_param("s", $contract_id);
    } elseif ($action === 'mark') {
        if (!empty($row['notarized_at'])) $fail(409, "This contract is already marked notarized.");
        $upd = $conn->prepare("UPDATE lease_contracts SET notarized_at = NOW(), notarized_by = ? WHERE id = ? AND notarized_at IS NULL");
        $upd->bind_param("is", $user['id'], $contract_id);
    } else {
        if (empty($row['notarized_at'])) $fail(409, "This contract is not marked notarized.");
        $upd = $conn->prepare("UPDATE lease_contracts SET notarized_at = NULL, notarized_by = NULL WHERE id = ? AND notarized_at IS NOT NULL");
        $upd->bind_param("s", $contract_id);
    }
    $upd->execute();
    $changed = $upd->affected_rows;
    $upd->close();
    if ($changed !== 1) {
        $fail(409, $action === 'ready' ? "You already told the office." : "The contract changed. Reload and try again.");
    }
    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    error_log('notarized_contract: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Nothing was saved. Please try again."]);
    exit;
}

// Saved. Alerts, notices and the log follow; a failure there must not report the
// saved change as failed.
try {
    $tenant = signed_contract_tenant($conn, $contract_id);
    if ($action === 'ready') {
        resolve_admin_queue($conn, NOTARIZED_CONTRACT_QUEUE, $contract_id);
        notify_admins_queue($conn, NOTARIZED_CONTRACT_QUEUE, $contract_id, 'Notarized contract to collect',
            $tenant['name'] . ($tenant['unit'] !== '' ? ' (Unit ' . $tenant['unit'] . ')' : '') . ' has the notarized rent contract ready to hand in. Mark it received on Contracts.');
        log_activity($conn, $user['id'], 'contract', 'Notarized Contract Ready', "Contract: $contract_id");
    } elseif ($action === 'mark') {
        resolve_admin_queue($conn, NOTARIZED_CONTRACT_QUEUE, $contract_id);
        if ($tenant['user_id']) {
            create_notification($conn, $tenant['user_id'], 'contract_update', 'Notarized contract received',
                'Management has your notarized rent contract on file. Thank you.');
        }
        log_activity($conn, $user['id'], 'contract', 'Marked Contract Notarized', "Contract: $contract_id");
    } else {
        if (!empty($row['notarized_ready_at'])) {
            notify_admins_queue($conn, NOTARIZED_CONTRACT_QUEUE, $contract_id, 'Notarized contract to collect',
                $tenant['name'] . ($tenant['unit'] !== '' ? ' (Unit ' . $tenant['unit'] . ')' : '') . ' has the notarized rent contract ready to hand in. Mark it received on Contracts.');
        }
        log_activity($conn, $user['id'], 'contract', 'Undid Contract Notarized', "Contract: $contract_id");
    }
} catch (Throwable $e) {
    error_log('notarized_contract follow-up: ' . $e->getMessage());
}

$messages = [
    'ready' => "The office knows. Hand them the notarized copy.",
    'mark' => "Marked notarized.",
    'unmark' => "No longer marked notarized.",
];
echo json_encode(["success" => true, "message" => $messages[$action]]);
$conn->close();
