<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id');
require_once '../config.php';
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
$auth = require_user($conn);
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) $input = [];
$app_id = (int)($input['id'] ?? 0);
$reason = trim((string)($input['reason'] ?? ''));
$destination = trim((string)($input['payout_destination'] ?? ''));
if ($app_id <= 0 || mb_strlen($reason) < 3 || mb_strlen($reason) > 255 || $destination === '' || mb_strlen($destination) > 255) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Provide a cancellation reason and payout account details (up to 255 characters).']);
    exit;
}

$conn->begin_transaction();
try {
    $a = $conn->prepare("SELECT id, user_id, status FROM rent_applications WHERE id = ? AND user_id = ? FOR UPDATE");
    $a->bind_param('ii', $app_id, $auth['id']); $a->execute(); $application = $a->get_result()->fetch_assoc(); $a->close();
    if (!$application || !in_array($application['status'], ['Approved', 'Pending Review'], true)) throw new Exception('This application cannot be cancelled in its current state.');

    $inv = $conn->prepare("SELECT id, billing_period, total_amount, security_deposit, amount_paid, status,
            (SELECT COALESCE(SUM(t.amount), 0) FROM payment_transactions t WHERE t.invoice_id = invoices.id) AS tx_paid
        FROM invoices WHERE rent_application_id = ? AND security_deposit > 0 AND amount_paid > 0 AND status IN ('paid','pending','pending-verification','overdue','processing') ORDER BY created_at ASC LIMIT 1 FOR UPDATE");
    $inv->bind_param('i', $app_id); $inv->execute(); $invoice = $inv->get_result()->fetch_assoc(); $inv->close();
    if (!$invoice) throw new Exception('No move-in payment was found. Use the unpaid application cancellation option.');
    $paid = round((float)$invoice['amount_paid'], 2);
    if ($invoice['status'] === 'paid' && (float)$invoice['tx_paid'] > 0) $paid = round((float)$invoice['tx_paid'], 2);
    if ($paid <= 0) throw new Exception('No refundable payment was found.');

    if ($invoice['status'] === 'paid') {
        $paid = (float)$invoice['tx_paid'] > 0 ? round((float)$invoice['tx_paid'], 2) : round((float)$invoice['total_amount'], 2);
    }
    $paid = min($paid, (float)$invoice['total_amount']);
    if ($paid <= 0) throw new Exception('No refundable payment was found.');
    $existing = $conn->prepare("SELECT id, raised_by_role FROM refund_requests WHERE invoice_id = ? AND type = 'rejected_application' AND status IN ('Pending Review','Info Requested','Approved','Refunded') LIMIT 1 FOR UPDATE");
    $existing->bind_param('s', $invoice['id']); $existing->execute(); $already = $existing->get_result()->fetch_assoc(); $existing->close();
    if ($already && $already['raised_by_role'] === 'admin') throw new Exception('Management has already opened a refund request for this move-in payment.');
    if ($already) throw new Exception('A cancellation refund request already exists for this move-in payment.');

    $why = 'Application cancellation requested by applicant: ' . $reason;
    $status = 'Pending Review'; $role = 'user'; $actor = (int)$auth['id']; $deposit = min((float)$invoice['security_deposit'], $paid);
    $ins = $conn->prepare("INSERT INTO refund_requests (user_id, rent_application_id, type, invoice_id, amount, reason, status, raised_by, raised_by_role, payout_destination, paid_amount, deposit_amount) VALUES (?, ?, 'rejected_application', ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $ins->bind_param('iisdssissdd', $auth['id'], $app_id, $invoice['id'], $paid, $why, $status, $actor, $role, $destination, $paid, $deposit);
    if (!$ins->execute()) throw new Exception('Could not create the cancellation refund request.');
    $rid = (int)$conn->insert_id; $ins->close();
    $event = $conn->prepare("INSERT INTO refund_request_events (refund_request_id, actor_id, actor_role, action, message) VALUES (?, ?, 'user', 'raised', ?)");
    $event->bind_param('iis', $rid, $actor, $why); $event->execute(); $event->close();
    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback(); http_response_code(409); echo json_encode(['success' => false, 'message' => $e->getMessage()]); exit;
}
notify_admins_queue($conn, 'refund_request', $rid, 'Applicant Cancellation Refund', "Tenant requested cancellation for Unit payment {$invoice['id']}; refund #$rid needs management review.");
log_activity($conn, (int)$auth['id'], 'billing', 'Cancellation Refund Requested', "Refund #$rid for application #$app_id");
echo json_encode(['success' => true, 'id' => $rid, 'message' => 'Cancellation request sent to management for review. Your application is not cancelled yet.']);
$conn->close();
?>