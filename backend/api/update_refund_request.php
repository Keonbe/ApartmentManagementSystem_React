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

function refund_fail($code, $msg) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $msg]);
    exit;
}

// Admin decisions: approve | reject | request_info | mark_refunded.
$admin_id = (int)require_admin($conn);
$input = json_decode(file_get_contents("php://input"), true) ?: [];
$id = (int)($input['id'] ?? 0);
$action = $input['action'] ?? '';
$message = trim((string)($input['message'] ?? ''));

$targets = ['approve' => 'Approved', 'reject' => 'Rejected', 'request_info' => 'Info Requested', 'mark_refunded' => 'Refunded'];
if (!isset($targets[$action])) refund_fail(400, "Unknown action.");
if (in_array($action, ['reject', 'request_info'], true) && $message === '') {
    refund_fail(400, $action === 'reject' ? "A reason is required to reject a refund." : "Tell the tenant what information you need.");
}
if (mb_strlen($message) > 1000) refund_fail(400, "Keep the message under 1000 characters.");

$stmt = $conn->prepare("SELECT user_id, type, amount, status FROM refund_requests WHERE id = ?");
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

$method = null;
$reference = null;
if ($action === 'mark_refunded') {
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
        $u = $conn->prepare("UPDATE refund_requests SET status='Approved', decided_by=?, decided_at=NOW(), decision_reason=NULLIF(?, '') WHERE id=? AND status=?");
        $u->bind_param("isis", $admin_id, $message, $id, $from);
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

    $ev = $conn->prepare("INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message) VALUES (?, ?, 'admin', ?, ?)");
    $note = $action === 'mark_refunded' ? "Paid out via $method (ref $reference)" . ($message !== '' ? ". $message" : '') : $message;
    $ev->bind_param("iiss", $id, $admin_id, $action, $note);
    $ev->execute();
    $ev->close();
    $conn->commit();
} catch (Exception $e) {
    $conn->rollback();
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
