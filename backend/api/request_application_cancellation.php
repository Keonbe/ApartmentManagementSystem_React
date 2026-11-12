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

    // The move-in payment, the open-request check and the cancellation fee (Settings > Rental,
    // default 0, kept out of the amount asked back; paid_amount still records everything paid,
    // so the admin can approve up to that) are worked out in open_cancellation_refund(), the
    // same function an admin cancelling at the tenant's request uses.
    $cr = open_cancellation_refund($conn, $app_id, (int)$auth['id'], (int)$auth['id'], 'user', $reason, $destination);
    if ($cr['state'] !== 'opened') throw new Exception($cr['message']);
    $rid = $cr['id']; $refund = $cr['refund']; $fee = $cr['fee']; $paid = $cr['paid']; $invoice = ['id' => $cr['invoice']];
    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback(); http_response_code(409); echo json_encode(['success' => false, 'message' => $e->getMessage()]); exit;
}
notify_admins_queue($conn, 'refund_request', $rid, 'Applicant Cancellation Refund', "Tenant requested cancellation for Unit payment {$invoice['id']}; refund #$rid needs management review.");
log_activity($conn, (int)$auth['id'], 'billing', 'Cancellation Refund Requested', "Refund #$rid for application #$app_id");
echo json_encode(['success' => true, 'id' => $rid, 'refund_amount' => $refund, 'cancellation_fee' => $fee, 'message' => 'Cancellation request sent to management for review. Your application is not cancelled yet.' . ($fee > 0 ? ' A cancellation fee of ₱' . number_format($fee, 2) . ' will be kept from what you paid.' : '')]);
$conn->close();
?>
