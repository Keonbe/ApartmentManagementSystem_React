<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

function resolve_fail($code, $msg) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $msg]);
    exit;
}

// Admin answer to a tenant's deposit review: `upheld` (the settlement stands) or
// `adjusted` (return `amount` more of the deposit: a deposit refund request that
// is approved at once, so it only waits for the payout). A response is required.
$admin_id = (int)require_admin($conn);
$input = read_json_input();
$id = (int)($input['id'] ?? 0);
$outcome = $input['outcome'] ?? '';
$response = is_string($input['response'] ?? null) ? trim($input['response']) : '';
if (!in_array($outcome, ['upheld', 'adjusted'], true)) resolve_fail(400, "Choose whether the settlement stands or is adjusted.");
if ($response === '') resolve_fail(422, "Write the reason the tenant will read.");
if (mb_strlen($response) > 1000) resolve_fail(422, "Keep the response under 1000 characters.");
$amount = null;
if ($outcome === 'adjusted') {
    $raw = $input['amount'] ?? null;
    if (is_bool($raw) || !is_numeric($raw) || !is_finite((float)$raw)) resolve_fail(422, "Enter the amount to return.");
    $amount = round((float)$raw, 2);
    if ($amount <= 0) resolve_fail(422, "The amount to return must be more than ₱0.");
}

$conn->begin_transaction();
try {
    $q = $conn->prepare("SELECT d.id, d.status, d.user_id, d.rent_application_id, lc.id AS contract_id, lc.deposit_amount, lc.refund_amount
                         FROM deposit_reviews d LEFT JOIN lease_contracts lc ON lc.rent_application_id = d.rent_application_id
                         WHERE d.id = ? FOR UPDATE");
    $q->bind_param("i", $id);
    $q->execute();
    $rv = $q->get_result()->fetch_assoc();
    $q->close();
    if (!$rv) { $conn->rollback(); resolve_fail(404, "Review not found."); }
    if ($rv['status'] !== 'Open') { $conn->rollback(); resolve_fail(409, "This review was already answered."); }

    $refund_id = null;
    if ($outcome === 'adjusted') {
        $max = round((float)$rv['deposit_amount'] - (float)$rv['refund_amount'], 2);
        if (!$rv['contract_id'] || $amount > $max) {
            $conn->rollback();
            resolve_fail(422, "At most ₱" . number_format(max(0, $max), 2) . " of this deposit can still be returned.");
        }
    }

    $u = $conn->prepare("UPDATE deposit_reviews SET status = 'Resolved', outcome = ?, adjusted_amount = ?, admin_response = ?, resolved_by = ?, resolved_at = NOW() WHERE id = ? AND status = 'Open'");
    $u->bind_param("sdsii", $outcome, $amount, $response, $admin_id, $id);
    $u->execute();
    if ($u->affected_rows < 1) throw new Exception("This review was answered by someone else. Reload and try again.");
    $u->close();

    if ($outcome === 'adjusted') {
        $why = "Deposit review #$id: " . $response;
        $refund_id = insert_refund_request($conn, (int)$rv['user_id'], (int)$rv['rent_application_id'], 'deposit', null, $amount, $why, $admin_id, 'admin');
        // The admin's decision is this answer: the request is approved, only the payout is left.
        $ap = $conn->prepare("UPDATE refund_requests SET status = 'Approved', decided_by = ?, decided_at = NOW(), decision_reason = ? WHERE id = ? AND status = 'Pending Review'");
        $ap->bind_param("isi", $admin_id, $response, $refund_id);
        $ap->execute();
        $ap->close();
        $ev = $conn->prepare("INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message) VALUES (?, ?, 'admin', 'approve', ?)");
        $ev->bind_param("iis", $refund_id, $admin_id, $response);
        $ev->execute();
        $ev->close();
        $c = $conn->prepare("UPDATE lease_contracts SET refund_amount = refund_amount + ?, deposit_status = 'Refund Pending' WHERE id = ?");
        $c->bind_param("ds", $amount, $rv['contract_id']);
        $c->execute();
        $c->close();
    }
    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    resolve_fail(409, public_error_message($e));
}

resolve_admin_queue($conn, 'deposit_review', $id);
// Already approved by this answer: only the payout is left, so say that (not "needs review").
if ($refund_id) notify_admins_queue($conn, 'refund_request', $refund_id, 'Deposit Refund Ready for Payout', "Deposit review #$id was adjusted: a refund of ₱" . number_format($amount, 2) . " is approved and waiting for its payout.");
create_notification($conn, (int)$rv['user_id'], 'refund_update',
    $outcome === 'adjusted' ? 'Deposit Review: ₱' . number_format($amount, 2) . ' Will Be Returned' : 'Deposit Review Answered',
    ($outcome === 'adjusted' ? "Management adjusted your deposit settlement and will return ₱" . number_format($amount, 2) . ". " : "Management reviewed your deposit settlement and it stands. ") . "Reply: $response");
log_activity($conn, $admin_id, 'billing', 'Deposit Review Answered', "Review #$id: $outcome" . ($amount !== null ? ", ₱" . number_format($amount, 2) : ""));

echo json_encode(["success" => true, "message" => $outcome === 'adjusted' ? "Adjustment recorded; the refund is waiting for its payout." : "Response sent.", "refundId" => $refund_id]);
$conn->close();
