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

$auth = require_user($conn);
$actor_id = (int)$auth['id'];
$actor_role = $auth['role'] === 'admin' ? 'admin' : 'user';
$input = json_decode(file_get_contents("php://input"), true) ?: [];

// A tenant raises for themselves; an admin names the tenant.
$user_id = $actor_id;
if ($actor_role === 'admin') {
    $user_id = (int)($input['user_id'] ?? 0);
    if ($user_id <= 0) refund_fail(400, "Choose the tenant this refund is for.");
}

$type = $input['type'] ?? '';
$reason = trim((string)($input['reason'] ?? ''));
$amount = round((float)($input['amount'] ?? 0), 2);
$invoice_id = trim((string)($input['invoice_id'] ?? ''));

if (!in_array($type, ['advance', 'overpayment'], true)) refund_fail(400, "Refund type must be advance rent or overpayment.");
if ($reason === '' || mb_strlen($reason) > 1000) refund_fail(400, "A reason (up to 1000 characters) is required.");
if ($amount <= 0) refund_fail(400, "Enter an amount greater than zero.");

$u = $conn->prepare("SELECT id FROM users WHERE id = ? AND role = 'user'");
$u->bind_param("i", $user_id);
$u->execute();
$exists = $u->get_result()->num_rows > 0;
$u->close();
if (!$exists) refund_fail(404, "Tenant not found.");

$eligible = refund_eligible($conn, $user_id);
$invoice_ref = null;
if ($type === 'advance') {
    $max = $eligible['advance'];
} else {
    if ($invoice_id === '') refund_fail(400, "Choose the overpaid bill.");
    $max = 0.0;
    foreach ($eligible['overpayments'] as $o) {
        if ($o['invoiceId'] === $invoice_id) $max = $o['amount'];
    }
    $invoice_ref = $invoice_id;
}
if ($max <= 0) refund_fail(422, "There is nothing available to refund for this request.");
if ($amount > $max + 0.001) refund_fail(422, "The most you can ask back here is ₱" . number_format($max, 2) . ".");

// Latest tenancy (for reference only; a moved-out tenant may not have an active one).
$app_id = null;
$a = $conn->prepare("SELECT id FROM rent_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1");
$a->bind_param("i", $user_id);
$a->execute();
$a->bind_result($app_id);
$a->fetch();
$a->close();

$conn->begin_transaction();
try {
    // Serialise per tenant so two requests cannot claim the same money.
    $lock = $conn->prepare("SELECT id FROM users WHERE id = ? FOR UPDATE");
    $lock->bind_param("i", $user_id);
    $lock->execute();
    $lock->close();

    $eligible = refund_eligible($conn, $user_id);
    $max = $type === 'advance' ? $eligible['advance'] : 0.0;
    if ($type === 'overpayment') {
        foreach ($eligible['overpayments'] as $o) if ($o['invoiceId'] === $invoice_id) $max = $o['amount'];
    }
    if ($amount > $max + 0.001) throw new Exception("Another request already holds this money.");

    $ins = $conn->prepare("INSERT INTO refund_requests (user_id, rent_application_id, type, invoice_id, amount, reason, raised_by, raised_by_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $ins->bind_param("iissdsis", $user_id, $app_id, $type, $invoice_ref, $amount, $reason, $actor_id, $actor_role);
    if (!$ins->execute()) throw new Exception("Could not save the request.");
    $rid = $conn->insert_id;
    $ins->close();

    if ($type === 'advance') {
        // Hold credits (oldest first) until the requested amount is covered.
        $cr = $conn->query("SELECT id, amount FROM advance_credits WHERE user_id = $user_id AND status IN ('refund-due','available') AND refund_request_id IS NULL ORDER BY period_start FOR UPDATE");
        $left = $amount;
        $hold = $conn->prepare("UPDATE advance_credits SET refund_request_id = ? WHERE id = ?");
        while ($left > 0.001 && ($row = $cr->fetch_assoc())) {
            $hold->bind_param("ii", $rid, $row['id']);
            $hold->execute();
            $left -= (float)$row['amount'];
        }
        $hold->close();
        // Credits are refunded whole months at a time (oldest first).
        if (abs($left) > 0.01) throw new Exception("Advance rent is refunded in whole months. Enter the full amount of one or more months.");
    }

    $ev = $conn->prepare("INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message) VALUES (?, ?, ?, 'raised', ?)");
    $ev->bind_param("iiss", $rid, $actor_id, $actor_role, $reason);
    $ev->execute();
    $ev->close();
    $conn->commit();
} catch (Exception $e) {
    $conn->rollback();
    refund_fail(409, $e->getMessage());
}

$label = $type === 'advance' ? 'advance rent' : 'an overpayment';
log_activity($conn, $actor_id, 'billing', 'Refund Requested', "Refund #$rid: ₱" . number_format($amount, 2) . " ($type) for user $user_id");
notify_admins_queue($conn, 'refund_request', $rid, 'Refund Request',
    "A refund of ₱" . number_format($amount, 2) . " for $label needs review.");
if ($actor_role === 'admin') {
    create_notification($conn, $user_id, 'refund_update', 'Refund Request Opened',
        "A refund request of ₱" . number_format($amount, 2) . " was opened for you.");
}

echo json_encode(["success" => true, "message" => "Refund request submitted.", "id" => $rid]);
$conn->close();
