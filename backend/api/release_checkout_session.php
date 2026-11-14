<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// Releases an invoice left in 'processing' by an online checkout the tenant
// abandoned or cancelled. create_checkout_session.php flips the invoice to
// 'processing' before redirecting to the gateway, and nothing used to put it
// back — so cancelling payment stranded the invoice: hidden from the tenant's
// bill view, absent from receivables, and never marked overdue.
$auth = require_user($conn);
$user_id = $auth['id'];

$data = read_json_input();
$invoice_id = $data['invoice_id'] ?? null;

if (!$invoice_id) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Invoice ID is required."]);
    exit;
}

// A tenant releases only their own checkout. An admin may release any
// tenant's (payments audit follow-up 2026-10-01): the desk cannot record a
// payment while a checkout is open, so a stale one would otherwise strand a
// walk-in payment until the due date passes. Clearing checkout_session_id
// means a late webhook for it can no longer settle the bill.
$is_admin = $auth['role'] === 'admin';
$owner_id = $user_id;
if ($is_admin) {
    $owner_q = $conn->prepare("SELECT user_id FROM invoices WHERE ? IN (id, payment_group) AND status = 'processing' LIMIT 1");
    $owner_q->bind_param("s", $invoice_id);
    $owner_q->execute();
    $owner_row = $owner_q->get_result()->fetch_assoc();
    $owner_q->close();
    $owner_id = $owner_row ? (int)$owner_row['user_id'] : 0;
}

// Return it to 'overdue' if the due date has already passed, otherwise
// 'pending', so releasing never hides a debt that is already late.
$stmt = $conn->prepare("
    UPDATE invoices
    SET status = CASE WHEN due_date IS NOT NULL AND due_date < CURDATE() THEN 'overdue' ELSE 'pending' END,
        checkout_session_id = NULL, checkout_payment_intent_id = NULL, processing_since = NULL
    WHERE ? IN (id, payment_group) AND user_id = ? AND status = 'processing'
");
$stmt->bind_param("si", $invoice_id, $owner_id);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to release the payment session."]);
    $stmt->close();
    $conn->close();
    exit;
}

$released = $stmt->affected_rows > 0;
$stmt->close();

if ($released && $is_admin) {
    log_activity($conn, $user_id, 'billing', 'Released Online Checkout', ucfirst(payment_key_label($invoice_id)) . " (tenant $owner_id)");
    create_notification($conn, $owner_id, 'payment', 'Online Checkout Cancelled',
        "The office cancelled your unfinished online checkout for " . payment_key_label($invoice_id) . ". You can pay again from Pay Bills.",
        'Resolved', "invoice:$invoice_id");
} elseif ($released) {
    log_activity($conn, $user_id, 'payment', 'Online checkout released', payment_key_label($invoice_id));
}

// Not being in 'processing' is not an error — the webhook may have already
// settled it, or the tenant may have hit cancel twice.
echo json_encode([
    "success" => true,
    "released" => $released,
    "message" => $released ? "Payment session released." : "No pending payment session to release."
]);
$conn->close();
