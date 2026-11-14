<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";
require_once __DIR__ . '/../paymongo_gateway.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

function refund_fail($code, $msg) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $msg]);
    exit;
}

// Admin decisions: approve | reject | request_info | mark_refunded.
// mark_refunded with gateway=true pays the refund back through PayMongo
// (POST /v1/refunds on the payment the money came in on); without it the
// admin records a payout made by hand (method + reference).
$admin_id = (int)require_admin($conn);
$input = read_json_input();
$id = (int)($input['id'] ?? 0);
$action = $input['action'] ?? '';
$message = trim((string)($input['message'] ?? ''));

$targets = ['approve' => 'Approved', 'reject' => 'Rejected', 'request_info' => 'Info Requested', 'mark_refunded' => 'Refunded'];
if (!isset($targets[$action])) refund_fail(400, "Unknown action.");
if (in_array($action, ['reject', 'request_info'], true) && $message === '') {
    refund_fail(400, $action === 'reject' ? "A reason is required to reject a refund." : "Tell the tenant what information you need.");
}
if (mb_strlen($message) > 1000) refund_fail(400, "Keep the message under 1000 characters.");

$stmt = $conn->prepare("SELECT id, user_id, rent_application_id, type, invoice_id, amount, status, paymongo_payment_id, gateway_status, paid_amount FROM refund_requests WHERE id = ?");
$stmt->bind_param("i", $id);
$stmt->execute();
$req = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$req) refund_fail(404, "Refund request not found.");

$to = $targets[$action];
$from = $req['status'];
if (!in_array($to, REFUND_TRANSITIONS[$from] ?? [], true)) {
    refund_fail(409, "This request is $from and cannot be moved to $to.");
}

$adjusted_amount = null;
if ($action === 'approve' && array_key_exists('amount', $input)) {
    if (!is_scalar($input['amount']) || !is_numeric($input['amount'])) refund_fail(422, 'Enter a valid refund amount.');
    $adjusted_amount = round((float)$input['amount'], 2);
    $ceiling = $req['paid_amount'] !== null ? (float)$req['paid_amount'] : (float)$req['amount'];
    if ($adjusted_amount <= 0 || $adjusted_amount > $ceiling + 0.001) {
        refund_fail(422, 'The approved refund must be greater than zero and no more than the verified amount paid (₱' . number_format($ceiling, 2) . ').');
    }
}

$method = null;
$reference = null;
$via_gateway = $action === 'mark_refunded' && !empty($input['gateway']);
$gateway_refund_id = null;
if ($action === 'mark_refunded' && $req['gateway_status'] === 'requesting') {
    refund_fail(409, "A PayMongo refund for this request is already in progress.");
}
if ($via_gateway) {
    $source_payment = refund_source_payment($conn, $req);
    if (!$source_payment) refund_fail(422, "This money did not come in through PayMongo. Record the payout by hand instead.");
    $cents = (int)round((float)$req['amount'] * 100);
    if ($cents < 100) refund_fail(422, "PayMongo refunds start at ₱1.00.");

    // Claim the payout first so a second click (or tab) cannot refund twice.
    $claim = $conn->prepare("UPDATE refund_requests SET gateway_status = 'requesting' WHERE id = ? AND status = 'Approved' AND gateway_status IS NULL");
    $claim->bind_param("i", $id);
    $claim->execute();
    $claimed = $claim->affected_rows > 0;
    $claim->close();
    if (!$claimed) refund_fail(409, "This request changed while you were working. Reload and try again.");

    $gw = paymongo_create_refund($conn, $source_payment, $cents, "AMS refund request #$id", "ams-refund-$id");
    if (!$gw['ok'] || !$gw['refund_id']) {
        $release = $conn->prepare("UPDATE refund_requests SET gateway_status = NULL WHERE id = ? AND gateway_status = 'requesting'");
        $release->bind_param("i", $id);
        $release->execute();
        $release->close();
        refund_fail(502, $gw['message'] ?: "PayMongo did not accept the refund.");
    }
    // The money has moved: keep the refund id before anything else can fail.
    $gateway_refund_id = $gw['refund_id'];
    $keep = $conn->prepare("UPDATE refund_requests SET gateway_refund_id = ?, gateway_status = ? WHERE id = ?");
    $keep->bind_param("ssi", $gateway_refund_id, $gw['status'], $id);
    $keep->execute();
    $keep->close();
    $method = 'PayMongo';
    $reference = $gateway_refund_id;
} elseif ($action === 'mark_refunded') {
    $method = trim((string)($input['payout_method'] ?? ''));
    $reference = trim((string)($input['payout_reference'] ?? ''));
    if ($method === '' || mb_strlen($method) > 50) refund_fail(400, "Enter how the refund was paid out.");
    if ($reference === '' || mb_strlen($reference) > 100) refund_fail(400, "Enter the payout reference.");
}

$uid = (int)$req['user_id'];
$conn->begin_transaction();
try {
    if ($action === 'mark_refunded') {
        $u = $conn->prepare("UPDATE refund_requests SET status='Refunded', payout_method=?, payout_reference=?, refunded_at=NOW() WHERE id=? AND status=?");
        $u->bind_param("ssis", $method, $reference, $id, $from);
    } elseif ($action === 'approve') {
        if ($adjusted_amount !== null) {
            $u = $conn->prepare("UPDATE refund_requests SET amount=?, status='Approved', decided_by=?, decided_at=NOW(), decision_reason=NULLIF(?, '') WHERE id=? AND status=? AND amount=?");
            $original_amount = (float)$req['amount'];
            $u->bind_param("disisd", $adjusted_amount, $admin_id, $message, $id, $from, $original_amount);
        } else {
            $u = $conn->prepare("UPDATE refund_requests SET status='Approved', decided_by=?, decided_at=NOW(), decision_reason=NULLIF(?, '') WHERE id=? AND status=?");
            $u->bind_param("isis", $admin_id, $message, $id, $from);
        }
    } elseif ($action === 'reject') {
        $u = $conn->prepare("UPDATE refund_requests SET status='Rejected', decided_by=?, decided_at=NOW(), decision_reason=? WHERE id=? AND status=?");
        $u->bind_param("isis", $admin_id, $message, $id, $from);
    } else {
        $u = $conn->prepare("UPDATE refund_requests SET status='Info Requested', decision_reason=? WHERE id=? AND status=?");
        $u->bind_param("sis", $message, $id, $from);
    }
    $u->execute();
    if ($u->affected_rows < 1) throw new Exception("This request changed while you were working. Reload and try again.");
    $u->close();

    if ($action === 'reject') {
        // Free the held credits so they can be requested again.
        $conn->query("UPDATE advance_credits SET refund_request_id = NULL WHERE refund_request_id = $id");
    }
    if ($action === 'mark_refunded') {
        $conn->query("UPDATE advance_credits SET status = 'refunded' WHERE refund_request_id = $id");
    }
    // A returned security deposit shows its outcome on the contract (Security Deposit Ledger),
    // once none of its deposit refunds is still open: a review can add a second request, and
    // paying out one of them must not mark the whole deposit Refunded. Any paid request makes
    // it Refunded; only when every request was rejected is it Refund Rejected.
    if ($req['type'] === 'deposit' && $req['rent_application_id'] && in_array($action, ['mark_refunded', 'reject'], true)) {
        $dep_q = $conn->prepare("SELECT SUM(status IN ('Pending Review', 'Info Requested', 'Approved')) AS open_n, SUM(status = 'Refunded') AS paid_n
                                 FROM refund_requests WHERE rent_application_id = ? AND type = 'deposit'");
        $dep_q->bind_param("i", $req['rent_application_id']);
        $dep_q->execute();
        $dep_counts = $dep_q->get_result()->fetch_assoc();
        $dep_q->close();
        if ((int)$dep_counts['open_n'] === 0) {
            $dep_status = (int)$dep_counts['paid_n'] > 0 ? 'Refunded' : 'Refund Rejected';
            $dep_u = $conn->prepare("UPDATE lease_contracts SET deposit_status = ? WHERE rent_application_id = ? AND deposit_status = 'Refund Pending'");
            $dep_u->bind_param("si", $dep_status, $req['rent_application_id']);
            $dep_u->execute();
            $dep_u->close();
        }
    }

    $ev = $conn->prepare("INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message) VALUES (?, ?, 'admin', ?, ?)");
    $note = $action === 'mark_refunded' ? "Paid out via $method (ref $reference)" . ($message !== '' ? ". $message" : '') : $message;
    $ev->bind_param("iiss", $id, $admin_id, $action, $note);
    $ev->execute();
    $ev->close();
    $conn->commit();
} catch (Exception $e) {
    $conn->rollback();
    if ($gateway_refund_id) {
        // PayMongo already took the refund; only the AMS record failed.
        error_log("Refund #$id paid through PayMongo ($gateway_refund_id) but not recorded: " . $e->getMessage());
        refund_fail(500, "PayMongo accepted the refund ($gateway_refund_id) but AMS could not record it. Reload: do not refund again.");
    }
    refund_fail(409, $e->getMessage());
}

// Approved stays in the queue until the payout is recorded.
if ($action !== 'approve') resolve_admin_queue($conn, 'refund_request', $id); // approved stays queued until paid out

$amt = number_format((float)$req['amount'], 2);
$titles = [
    'approve' => ['Refund Approved', "Your refund of ₱$amt was approved. We will send it out and record the payout."],
    'reject' => ['Refund Rejected', "Your refund of ₱$amt was rejected. Reason: $message"],
    'request_info' => ['More Information Needed', "About your refund of ₱$amt: $message"],
    'mark_refunded' => ['Refund Paid Out', "Your refund of ₱$amt was paid out via $method (ref $reference)."],
];
create_notification($conn, $uid, 'refund_update', $titles[$action][0], $titles[$action][1]);
log_activity($conn, $admin_id, 'billing', 'Refund ' . ucwords(str_replace('_', ' ', $action)), "Refund #$id: $from -> $to");

echo json_encode(["success" => true, "message" => "Refund request updated.", "status" => $to]);
$conn->close();
