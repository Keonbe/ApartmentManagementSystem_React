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

// The office accepts a tenant's signed contract copy, or sends it back with a note
// (backend/signed_contract.php). Admin only.
//   POST { contractId, decision: 'accept' | 'reject', note (reject: 3-255 chars), path? }
// path = the copy the admin looked at: if the tenant has uploaded a newer one since,
// nothing changes (409) so a copy nobody saw is never accepted.
$admin_id = require_admin($conn);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Use POST."]);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) $body = $_POST;
// Text fields only: anything else (an array, an object) counts as missing.
$text = fn($key) => isset($body[$key]) && is_scalar($body[$key]) ? trim((string)$body[$key]) : null;
$contract_id = $text('contractId') ?? '';
$decision = $text('decision') ?? '';
$note = $text('note') ?? '';
$seen_path = $text('path');

$errors = [];
if ($contract_id === '') $errors['contractId'] = 'Choose a contract.';
if (!in_array($decision, ['accept', 'reject'], true)) $errors['decision'] = 'Choose accept or ask for a new copy.';
if ($decision === 'reject') {
    $len = mb_strlen($note);
    if ($len < 3) $errors['note'] = 'Tell the tenant what to fix (at least 3 characters).';
    elseif ($len > 255) $errors['note'] = 'Keep the note to 255 characters.';
}
if ($errors) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => reset($errors), "errors" => $errors]);
    exit;
}

$review = $decision === 'accept' ? 'accepted' : 'rejected';
$note_value = $decision === 'reject' ? $note : null;

$conn->begin_transaction();
try {
    $stmt = $conn->prepare("SELECT id, signed_lease_path, signed_lease_review FROM lease_contracts WHERE id = ? FOR UPDATE");
    $stmt->bind_param("s", $contract_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $fail = null;
    if (!$row) $fail = [404, "Contract not found."];
    elseif (signed_contract_review_state($row) === null) $fail = [409, "There is no signed copy to check."];
    elseif ($seen_path !== null && $seen_path !== (string)$row['signed_lease_path']) $fail = [409, "The tenant uploaded a newer copy. Reload to see it."];
    elseif (signed_contract_review_state($row) !== 'pending') $fail = [409, "This copy was already checked."];
    if ($fail) {
        $conn->rollback();
        http_response_code($fail[0]);
        echo json_encode(["success" => false, "message" => $fail[1]]);
        exit;
    }

    $upd = $conn->prepare("UPDATE lease_contracts
                              SET signed_lease_review = ?, signed_lease_review_note = ?, signed_lease_reviewed_at = NOW(), signed_lease_reviewed_by = ?
                            WHERE id = ? AND signed_lease_review = 'pending'");
    $upd->bind_param("ssis", $review, $note_value, $admin_id, $contract_id);
    $upd->execute();
    $changed = $upd->affected_rows;
    $upd->close();
    if ($changed !== 1) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This copy was already checked."]);
        exit;
    }
    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    error_log('review_signed_contract: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "The review was not saved. Please try again."]);
    exit;
}

// Saved. The alert, the tenant's notice and the log follow; a failure there must not
// report the saved review as failed.
try {
    resolve_admin_queue($conn, SIGNED_CONTRACT_QUEUE, $contract_id);
    $tenant = signed_contract_tenant($conn, $contract_id);
    if ($tenant['user_id']) {
        if ($review === 'accepted') {
            create_notification($conn, $tenant['user_id'], 'application_update', 'Signed contract accepted',
                'Management checked your signed rent contract and accepted it.');
        } else {
            create_notification($conn, $tenant['user_id'], 'application_update', 'Please upload your signed contract again',
                'Management could not accept your signed rent contract: ' . $note . ' Open Track Application to upload a new copy.');
        }
    }
    log_activity($conn, $admin_id, 'contract', $review === 'accepted' ? 'Accepted Signed Contract' : 'Returned Signed Contract',
        "Contract: $contract_id" . ($review === 'rejected' ? " (asked for a new copy)" : ''));
} catch (Throwable $e) {
    error_log('review_signed_contract follow-up: ' . $e->getMessage());
}

echo json_encode([
    "success" => true,
    "message" => $review === 'accepted' ? "Signed contract accepted." : "The tenant was asked for a new copy.",
    "review" => ['review' => $review, 'note' => $note_value],
]);
$conn->close();
