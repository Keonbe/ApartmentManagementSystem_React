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
    $proof_q = $conn->prepare("SELECT proof_of_payment_path FROM invoices WHERE id = ? AND user_id = ?");
    $proof_q->bind_param("si", $invoice_id, $user_id);
    $proof_q->execute();
    $proof_row = $proof_q->get_result()->fetch_assoc();
    $proof_q->close();

    if (empty($proof_row['proof_of_payment_path'])) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Upload a payment proof before submitting a non-cash payment."]);
        exit;
    }
}

// Only an invoice that is still genuinely open may be acted on. Without this
// guard a tenant could re-submit against an already-'paid' invoice and knock
// it back to 'pending-verification' (and the old code also blanked paid_at
// unconditionally, erasing when it was actually settled).
$stmt = $conn->prepare("UPDATE invoices SET payment_method = ?, payment_reference = ?, status = ? WHERE id = ? AND user_id = ? AND status IN " . billing_open_status_sql());
$stmt->bind_param("ssssi", $payment_method, $payment_reference, $status, $invoice_id, $user_id);

if ($stmt->execute()) {
    if ($stmt->affected_rows === 0) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This invoice is not open for payment — it may already be settled or cancelled."]);
        $stmt->close();
        $conn->close();
        exit;
    }
    log_activity($conn, $user_id, 'payment', "Tenant payment action", "Invoice ID: $invoice_id, Method: $payment_method, Status: $status, Ref: $payment_reference");
    echo json_encode(["success" => true, "message" => "Payment processed successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to process payment", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
