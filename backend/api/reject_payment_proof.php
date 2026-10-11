<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$invoice_id = trim((string)($input['invoiceId'] ?? ''));
$reason = trim((string)($input['reason'] ?? ''));

if ($invoice_id === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Invoice ID is required."]);
    exit;
}
if ($reason === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "A rejection reason is required so the tenant knows what to fix."]);
    exit;
}

$conn->begin_transaction();
try {
    // Before this endpoint, the only way out of 'pending-verification' was
    // recording the payment (audit C3) — a bogus or insufficient proof had
    // nowhere to go and the invoice quietly dropped off the overdue list,
    // reminders and eviction-monitoring queries forever. Only a row actually
    // in that status may be rejected; anything else has already moved on.
    // $invoice_id may be an advance payment's group id: all its months go back.
    $inv_q = $conn->prepare("SELECT user_id, due_date FROM invoices WHERE ? IN (id, payment_group) AND status = 'pending-verification' ORDER BY due_date LIMIT 1");
    $inv_q->bind_param("s", $invoice_id);
    $inv_q->execute();
    $invoice = $inv_q->get_result()->fetch_assoc();
    $inv_q->close();

    if (!$invoice) {
        throw new Exception("This invoice has no payment proof awaiting verification.");
    }

    // Land back on whichever open status the invoice actually deserves — a
    // proof that arrived after the due date returns to 'overdue' rather than
    // quietly resetting the clock back to 'pending'.
    $due_date = $invoice['due_date'];
    $new_status = ($due_date !== null && $due_date < date('Y-m-d')) ? 'overdue' : 'pending';

    $upd = $conn->prepare("UPDATE invoices SET status = CASE WHEN due_date IS NOT NULL AND due_date < CURDATE() THEN 'overdue' ELSE 'pending' END,
                                   proof_rejection_reason = ?, proof_of_payment_path = NULL, payment_reference = NULL
                            WHERE ? IN (id, payment_group) AND status = 'pending-verification'");
    $upd->bind_param("ss", $reason, $invoice_id);
    $upd->execute();
    if ($upd->affected_rows === 0) {
        $upd->close();
        throw new Exception("This invoice has no payment proof awaiting verification.");
    }
    $upd->close();

    $conn->commit();

    log_activity($conn, $admin_id, 'billing', "Rejected Payment Proof", ucfirst(payment_key_label($invoice_id)) . ", Reason: $reason");
    resolve_admin_queue($conn, 'payment_verification', $invoice_id);

    if (!empty($invoice['user_id'])) {
        create_notification($conn, (int)$invoice['user_id'], 'payment', 'Payment Proof Rejected',
            "Your payment proof for " . payment_key_label($invoice_id) . " was not accepted: $reason. Please submit a new payment.",
            'Resolved', "invoice:$invoice_id");
        try {
            require_once __DIR__ . '/services/send_notification.php';
            $breakdown_q = $conn->prepare("SELECT id, billing_period, total_amount FROM invoices WHERE ? IN (id, payment_group) ORDER BY due_date");
            $breakdown_q->bind_param('s', $invoice_id);
            $breakdown_q->execute();
            $invoice_rows = $breakdown_q->get_result()->fetch_all(MYSQLI_ASSOC);
            $breakdown_q->close();
            $email_html = email_payment_proof_template(notify_recipient_name($conn, (int)$invoice['user_id']), $invoice_id, 'Rejected', $reason, $invoice_rows);
            dispatch_admin_action_notification($conn, (int)$invoice['user_id'], 'payment', 'Payment Proof Rejected', null, $email_html);
        } catch (Throwable $notification_error) {
            error_log('Could not dispatch payment proof rejection email: ' . $notification_error->getMessage());
        }
    }

    echo json_encode(["success" => true, "message" => "Payment proof rejected; invoice returned to $new_status."]);
} catch (Exception $e) {
    $conn->rollback();
    http_response_code(409);
    echo json_encode(["success" => false, "message" => public_error_message($e)]);
}

$conn->close();
