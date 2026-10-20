<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id');
require_once '../config.php';
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
$auth = require_user($conn);
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$id = (int)($input['id'] ?? 0); $reason = trim($input['reason'] ?? '');
if (!$id || $reason === '') { http_response_code(422); echo json_encode(['success' => false, 'message' => 'A cancellation reason is required.']); exit; }
$conn->begin_transaction();
try {
    $q = $conn->prepare("SELECT room_name, status FROM rent_applications WHERE id = ? AND user_id = ? AND status IN ('Approved', 'Pending Review', 'Pending')"); $q->bind_param('ii', $id, $auth['id']); $q->execute(); $app = $q->get_result()->fetch_assoc(); $q->close();
    if (!$app) throw new Exception('Only a pending or approved application that has not moved in can be cancelled.');
    // Money already received on an open bill (installments) would be lost by
    // cancelling it here: management cancels it and refunds the parts.
    $pp = $conn->prepare("SELECT COALESCE(SUM(amount_paid), 0) AS paid FROM invoices WHERE (rent_application_id = ? OR (user_id = ? AND security_deposit > 0)) AND status IN " . billing_open_status_sql() . " AND amount_paid > 0 FOR UPDATE"); $pp->bind_param('ii', $id, $auth['id']); $pp->execute(); $part_paid = (float)$pp->get_result()->fetch_assoc()['paid']; $pp->close();
    if ($part_paid > 0) throw new Exception('You have already paid ₱' . number_format($part_paid, 2) . ' of your move-in bill. Please contact management to cancel, so the amount can be refunded.');
    $upd = $conn->prepare("UPDATE rent_applications SET status = 'Cancelled', rejection_reason = ?, cancelled_at = NOW() WHERE id = ? AND user_id = ? AND status IN ('Approved', 'Pending Review', 'Pending')"); $upd->bind_param('sii', $reason, $id, $auth['id']); $upd->execute(); if (!$upd->affected_rows) throw new Exception('Application status changed. Refresh and try again.'); $upd->close();
    $room = $conn->prepare("UPDATE rooms SET status = 'vacant', tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0 WHERE id = ? AND status = 'reserved'"); $room->bind_param('s', $app['room_name']); $room->execute(); $room->close();
    $open_statuses = billing_open_status_sql();
    $inv = $conn->prepare("UPDATE invoices SET status = 'cancelled', cancel_reason = 'Applicant cancelled before move-in' WHERE (rent_application_id = ? OR (user_id = ? AND security_deposit > 0)) AND status IN $open_statuses"); $inv->bind_param('ii', $id, $auth['id']); $inv->execute(); $inv->close();
    $conn->query("UPDATE advance_credits SET status = 'cancelled' WHERE (rent_application_id = " . (int)$id . " OR user_id = " . (int)$auth['id'] . ") AND status IN ('reserved', 'available')");
    $conn->query("UPDATE notifications SET status = 'Resolved', is_read = 1 WHERE user_id = " . (int)$auth['id'] . " AND type IN ('billing', 'rent_due', 'overdue') AND status = 'Pending'");
    $contract = $conn->prepare("DELETE FROM lease_contracts WHERE rent_application_id = ? AND status = 'draft'"); $contract->bind_param('i', $id); $contract->execute(); $contract->close();
    resolve_admin_queue($conn, 'rent_application', $id);
    notify_admins_queue($conn, 'rent_application', $id, 'Application Cancelled', "Applicant cancelled Unit {$app['room_name']}. Reason: $reason");
    $conn->commit();
    try {
        require_once __DIR__ . '/services/send_notification.php';
        dispatch_admin_action_notification($conn, (int)$auth['id'], 'application_update', 'Rental Application Cancelled', null,
            email_application_decision_template(notify_recipient_name($conn, (int)$auth['id']), $app['room_name'], 'Cancelled', $reason));
        $voided = $conn->prepare("SELECT id, user_id FROM invoices WHERE rent_application_id = ? AND status = 'cancelled' AND cancel_reason = 'Applicant cancelled before move-in'");
        $voided->bind_param('i', $id);
        $voided->execute();
        $voided_rows = $voided->get_result()->fetch_all(MYSQLI_ASSOC);
        $voided->close();
        foreach ($voided_rows as $voided_row) {
            dispatch_admin_action_notification($conn, (int)$voided_row['user_id'], 'billing', 'Move-In Invoice Voided', null,
                email_bill_voided_template(notify_recipient_name($conn, (int)$voided_row['user_id']), $voided_row['id'], $reason));
        }
    } catch (Throwable $notification_error) {
        error_log('Could not dispatch application cancellation email: ' . $notification_error->getMessage());
    }
    echo json_encode(['success' => true]);
} catch (Throwable $e) {
    $conn->rollback();
    // A refusal thrown above (already paid a part, status changed) is shown as
    // written; a database error stays a generic 500.
    if ($e instanceof mysqli_sql_exception || !($e instanceof Exception)) { server_error_response($e, 'Could not cancel application.'); exit; }
    http_response_code(409);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
$conn->close();
?>
