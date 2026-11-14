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

// Tenant side: reply (answers an info request) | cancel.
$auth = require_user($conn);
$uid = (int)$auth['id'];
$input = read_json_input();
$id = (int)($input['id'] ?? 0);
$action = $input['action'] ?? '';
$message = trim((string)($input['message'] ?? ''));

if (!in_array($action, ['reply', 'cancel'], true)) refund_fail(400, "Unknown action.");
if ($action === 'reply' && ($message === '' || mb_strlen($message) > 1000)) refund_fail(400, "Write your reply (up to 1000 characters).");
if (mb_strlen($message) > 1000) refund_fail(400, "Keep the message under 1000 characters.");

$stmt = $conn->prepare("SELECT amount, status, type FROM refund_requests WHERE id = ? AND user_id = ?");
$stmt->bind_param("ii", $id, $uid);
$stmt->execute();
$req = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$req) refund_fail(404, "Refund request not found.");

$from = $req['status'];
if ($action === 'cancel' && $req['type'] === 'deposit') refund_fail(409, "A security deposit refund cannot be cancelled. Contact Management if something is wrong.");
$to = $action === 'reply' ? 'Pending Review' : 'Cancelled';
if ($action === 'reply' && $from !== 'Info Requested') refund_fail(409, "There is no question waiting for your reply.");
if (!in_array($to, REFUND_TRANSITIONS[$from] ?? [], true)) refund_fail(409, "This request is $from and cannot be changed.");

$conn->begin_transaction();
try {
    $u = $conn->prepare("UPDATE refund_requests SET status = ? WHERE id = ? AND user_id = ? AND status = ?");
    $u->bind_param("siis", $to, $id, $uid, $from);
    $u->execute();
    if ($u->affected_rows < 1) throw new Exception("This request changed. Reload and try again.");
    $u->close();
    if ($action === 'cancel') {
        $conn->query("UPDATE advance_credits SET refund_request_id = NULL WHERE refund_request_id = $id");
    }
    $ev = $conn->prepare("INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message) VALUES (?, ?, 'user', ?, ?)");
    $ev->bind_param("iiss", $id, $uid, $action, $message);
    $ev->execute();
    $ev->close();
    $conn->commit();
} catch (Exception $e) {
    $conn->rollback();
    refund_fail(409, $e->getMessage());
}

resolve_admin_queue($conn, 'refund_request', $id);
if ($action === 'reply') {
    notify_admins_queue($conn, 'refund_request', $id, 'Refund Reply Received',
        "The tenant answered your question on a ₱" . number_format((float)$req['amount'], 2) . " refund request.");
    log_activity($conn, $uid, 'billing', 'Refund Reply Sent', "Refund #$id");
} else {
    log_activity($conn, $uid, 'billing', 'Refund Request Cancelled', "Refund #$id");
}

echo json_encode(["success" => true, "message" => $action === 'reply' ? "Reply sent." : "Refund request cancelled.", "status" => $to]);
$conn->close();
