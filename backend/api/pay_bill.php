<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$auth = require_user($conn);
$user_id = $auth['id'];

$input = json_decode(file_get_contents("php://input"), true);

if (!$input) {
    echo json_encode(["success" => false, "message" => "No data received"]);
    exit;
}

$invoice_id = $input['invoiceId'] ?? '';
$payment_method = $input['paymentMethod'] ?? '';
$payment_reference = $input['paymentReference'] ?? null;
// proofOfPaymentPath used to be taken verbatim from the client and written
// straight to proof_of_payment_path (audit C3/H3) — a tenant could point it
// at another tenant's receipt (file names are guessable) or a fake receipt
// hosted elsewhere, and an admin reviewing "proof" would see it as genuine.
// The only endpoint allowed to store a proof path is upload_payment_proof.php,
// which saves the uploaded file itself and returns its own server-generated
// path. This input is accepted only so the request shape doesn't change, but
// it is never written to the database.
unset($input['proofOfPaymentPath']);

if (empty($invoice_id) || empty($payment_method)) {
    echo json_encode(["success" => false, "message" => "Invoice ID and payment method are required."]);
    exit;
}

$is_cash = ($payment_method === 'Cash on Hand');
$status = $is_cash ? 'pending' : 'pending-verification';

if (!$is_cash) {
    // A non-cash method may only reach 'pending-verification' when the server
    // already holds a proof it stored itself (audit C3). Without this guard,
    // a tenant could submit "GCash (Manual)" with an invented reference and no
    // file; the invoice would then drop off the overdue list, stop generating
    // reminders and disappear from the eviction-monitoring query with nothing
    // to show for it. upload_payment_proof.php must be called first — it sets
    // proof_of_payment_path and queues the admin review.
    // $invoice_id may be an advance payment's group id (config.php, "Advance
    // payments"): then every month in it must carry the proof.
    $proof_q = $conn->prepare("SELECT COUNT(*) AS n, MIN(proof_of_payment_path IS NOT NULL AND proof_of_payment_path <> '') AS all_have_proof
                               FROM invoices WHERE ? IN (id, payment_group) AND user_id = ? AND status <> 'cancelled'");
    $proof_q->bind_param("si", $invoice_id, $user_id);
    $proof_q->execute();
    $proof_row = $proof_q->get_result()->fetch_assoc();
    $proof_q->close();

    if (!(int)$proof_row['n'] || !(int)$proof_row['all_have_proof']) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Upload a payment proof before submitting a non-cash payment."]);
        exit;
    }
}

// Only an invoice that is still genuinely open may be acted on. Without this
// guard a tenant could re-submit against an already-'paid' invoice and knock
// it back to 'pending-verification' (and the old code also blanked paid_at
// unconditionally, erasing when it was actually settled).
// A non-cash payment keeps the reference upload_payment_proof.php stored with
// the proof: that is the one checked for reuse (Settings -> Payments), so it is
// never replaced here.
$stmt = $conn->prepare("UPDATE invoices SET payment_method = ?, payment_reference = IF(? = 'pending-verification', payment_reference, ?), status = ? WHERE ? IN (id, payment_group) AND user_id = ? AND status IN " . billing_open_status_sql());
$stmt->bind_param("sssssi", $payment_method, $status, $payment_reference, $status, $invoice_id, $user_id);

if ($stmt->execute()) {
    $changed = $stmt->affected_rows > 0;
    if (!$changed) {
        // Zero changed rows also happens when nothing needed changing: the
        // PayBills manual path calls this right after upload_payment_proof.php,
        // which already stored the same method, reference and status. That
        // used to be reported as "not open" after a successful submission.
        $same = $conn->prepare("SELECT 1 FROM invoices WHERE ? IN (id, payment_group) AND user_id = ? AND status = ? AND payment_method <=> ? LIMIT 1");
        $same->bind_param("siss", $invoice_id, $user_id, $status, $payment_method);
        $same->execute();
        $already_applied = (bool)$same->get_result()->fetch_assoc();
        $same->close();
        if (!$already_applied) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "This invoice is not open for payment — it may already be settled or cancelled."]);
            $stmt->close();
            $conn->close();
            exit;
        }
    }
    if ($changed) {
        log_activity($conn, $user_id, 'payment', "Tenant payment action", ucfirst(payment_key_label($invoice_id)) . ", Method: $payment_method, Status: $status, Ref: $payment_reference");
    }

    // A cash-on-hand declaration means the tenant intends to pay at the desk —
    // an admin should see it in the queue rather than only finding it by
    // scanning the billing list (audit M12). A non-cash declaration is
    // already queued by upload_payment_proof.php.
    if ($is_cash && $changed) {
        notify_admins_queue($conn, 'cash_payment_declared', $invoice_id, 'Cash Payment Declared',
            "A tenant declared a cash-on-hand payment for " . payment_key_label($invoice_id) . ". Expect them at the desk.");
        create_notification($conn, $user_id, 'payment', 'Cash Payment Declared',
            "Your cash payment for " . payment_key_label($invoice_id) . " is noted. Please pay at the admin office; you will be notified once management records it.",
            'Resolved', "invoice:$invoice_id");
    }

    echo json_encode(["success" => true, "message" => "Payment processed successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to process payment"]);
}

$stmt->close();
$conn->close();
?>
