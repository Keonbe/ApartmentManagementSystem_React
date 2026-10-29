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

// The old code accepted $_POST['userId'] as a fallback identity, so anyone
// could post a payment reference and proof onto another tenant's invoice.
// Identity now comes only from the verified session.
$auth = require_user($conn);
$user_id = $auth['id'];
$is_admin = $auth['role'] === 'admin';

$invoice_id = $_POST['invoice_id'] ?? $_POST['invoiceId'] ?? null;
$payment_reference = $_POST['payment_reference'] ?? $_POST['referenceNo'] ?? null;
$payment_method = $_POST['payment_method'] ?? $_POST['paymentMethod'] ?? 'GCash';
$sender_name = $_POST['sender_name'] ?? $_POST['senderName'] ?? null;
$bank_name = trim((string)($_POST['bank_name'] ?? $_POST['bankName'] ?? ''));

if (preg_match('/bank|bdo|bpi|metrobank|landbank|rcbc|unionbank|security|maya bank/i', (string)$payment_method)) {
    if (!in_array($bank_name, PHILIPPINE_BANKS, true)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Choose a supported originating bank."]);
        exit;
    }
} else {
    $bank_name = '';
}

if (!$is_admin) {
    if (get_setting($conn, 'service_pay_bills_active', 'true') === 'false') {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Payment service is currently disabled by management."]);
        exit;
    }
    $pmode = get_setting($conn, 'payment_mode', 'manual');
    if ($pmode === 'sandbox') {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Manual payment proof upload is currently disabled (Sandbox mode active)."]);
        exit;
    }
    $method_lower = strtolower((string)$payment_method);
    if (strpos($method_lower, 'qr') !== false) {
        $ch_val = get_setting($conn, 'payment_ch_qrph_manual', 'true');
        if ($ch_val === 'false' || $ch_val === '0') {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "QR Ph payment is currently disabled by management."]);
            exit;
        }
    } elseif (strpos($method_lower, 'gcash') !== false) {
        $ch_val = get_setting($conn, 'payment_ch_gcash_manual', 'true');
        if ($ch_val === 'false' || $ch_val === '0') {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "GCash receipt upload is currently disabled by management."]);
            exit;
        }
    } elseif (preg_match('/bank|bdo|bpi/i', $method_lower)) {
        $ch_val = get_setting($conn, 'payment_ch_bank_manual', 'true');
        if ($ch_val === 'false' || $ch_val === '0') {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "Bank transfer receipt upload is currently disabled by management."]);
            exit;
        }
    }
}

if (empty($invoice_id)) {
    echo json_encode(["success" => false, "message" => "Invoice ID is required."]);
    exit;
}

// The column holds 100 characters; longer would fail the write after the
// proof file is saved.
if (mb_strlen((string)$payment_reference, 'UTF-8') > 100) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "The reference number is too long (100 characters at most)."]);
    exit;
}

// Optional `amount`: the part of the bill this proof pays (installments).
// Absent or empty = the whole remaining balance, as before. Checked against the
// caller's own open invoice before any file is saved.
$proof_amount = null;
$amount_raw = $_POST['amount'] ?? '';
if ($amount_raw !== '' && $amount_raw !== null) {
    $owned = payment_key_invoices($conn, $invoice_id, $is_admin ? null : $user_id, BILLING_OPEN_STATUSES);
    if (!$owned) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This invoice is not open for payment — it may already be settled or cancelled."]);
        exit;
    }
    $balance_cents = 0;
    foreach ($owned as $row) $balance_cents += invoice_balance_cents($row);
    if (!is_numeric($amount_raw) || !is_finite((float)$amount_raw) || (float)$amount_raw <= 0) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Enter the amount you paid (more than ₱0)."]);
        exit;
    }
    $amount_cents = (int)round((float)$amount_raw * 100);
    if ($amount_cents > $balance_cents) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "The amount is more than the balance (₱" . number_format($balance_cents / 100, 2) . ")."]);
        exit;
    }
    if ($amount_cents < $balance_cents) {
        if (is_payment_group_key($invoice_id) || count($owned) !== 1 || (int)($owned[0]['advance_months'] ?? 0) > 0) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "A grouped or advance payment is paid in full. Pay the whole amount, or pay a single bill in parts."]);
            exit;
        }
        $proof_amount = $amount_cents / 100;
    }
}

$proof_file = null;
if (isset($_FILES['proof']) && $_FILES['proof']['error'] === UPLOAD_ERR_OK) {
    $proof_file = $_FILES['proof'];
} else if (isset($_FILES['proofImage']) && $_FILES['proofImage']['error'] === UPLOAD_ERR_OK) {
    $proof_file = $_FILES['proofImage'];
}

$proof_path = null;
if ($proof_file) {
    // Match the 10MB ceiling the other upload endpoints enforce; this one
    // previously accepted a file of any size.
    if ($proof_file['size'] > 10 * 1024 * 1024) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Payment proof exceeds the 10MB size limit."]);
        exit;
    }

    $file_extension = strtolower(pathinfo($proof_file['name'], PATHINFO_EXTENSION));
    $allowed_extensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];

    if (!in_array($file_extension, $allowed_extensions)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Invalid payment proof file format. Allowed: JPG, PNG, WEBP, PDF."]);
        exit;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $proof_file['tmp_name']);
    finfo_close($finfo);

    $allowed_mimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!in_array($mime, $allowed_mimes)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "File content does not match allowed formats."]);
        exit;
    }

    $upload_dir = '../uploads/payment_proofs/';
    if (!file_exists($upload_dir)) {
        mkdir($upload_dir, 0755, true);
    }

    $file_name = 'proof_' . bin2hex(random_bytes(16)) . '.' . $file_extension;
    $target_file = $upload_dir . $file_name;
    
    if (move_uploaded_file($proof_file['tmp_name'], $target_file)) {
        $proof_path = 'uploads/payment_proofs/' . $file_name;
    } else {
        // Failing silently here used to leave the invoice marked
        // 'pending-verification' with no proof attached, while still telling
        // the tenant their upload succeeded.
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Failed to save the payment proof. Please try again."]);
        exit;
    }
}

$discard_proof = function () use ($proof_path) {
    if ($proof_path) @unlink(__DIR__ . '/../' . $proof_path);
};
$refuse = function ($code, $message) use ($conn, $discard_proof) {
    $conn->rollback();
    payment_reference_unlock($conn);
    $discard_proof();
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    $conn->close();
    exit;
};

// Reused reference (Settings -> Payments) and double submit: checked under
// the reference lock and the bill's row lock, in the same transaction as the
// write, so two submissions of one reference cannot both pass.
$ref_channel = payment_reference_channel($payment_method, $bank_name);
$checks_reference = normalize_payment_reference($payment_reference) !== '' && $ref_channel !== null && $ref_channel !== 'CASH';
if ($checks_reference && !payment_reference_lock($conn)) {
    $discard_proof();
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Another payment is being submitted. Please try again in a moment."]);
    exit;
}
$conn->begin_transaction();
$reuse = null;
try {
    if ($checks_reference) {
        $lock_sql = "SELECT id, status, total_amount, amount_paid, proof_amount, payment_reference, payment_group FROM invoices WHERE ? IN (id, payment_group)"
            . ($is_admin ? "" : " AND user_id = ?") . " FOR UPDATE";
        $lock = $conn->prepare($lock_sql);
        if ($is_admin) $lock->bind_param("s", $invoice_id);
        else $lock->bind_param("si", $invoice_id, $user_id);
        $lock->execute();
        $locked = $lock->get_result()->fetch_all(MYSQLI_ASSOC);
        $lock->close();
        $open = array_values(array_filter($locked, fn($r) => in_array($r['status'], BILLING_OPEN_STATUSES, true)));
        if ($open) {
            $norm_ref = normalize_payment_reference($payment_reference);
            $ids = array_column($open, 'id');
            // The same proof again (double click, or resent while it is still
            // under review), or a part with this reference and amount just recorded.
            $proof_cents = $proof_amount !== null ? (int)round($proof_amount * 100) : null;
            foreach ($open as $r) {
                $pending_cents = $r['proof_amount'] !== null ? (int)round((float)$r['proof_amount'] * 100) : null;
                if ($r['status'] === 'pending-verification' && normalize_payment_reference($r['payment_reference']) === $norm_ref && $pending_cents === $proof_cents) {
                    $refuse(409, "This payment was already submitted and is awaiting verification.");
                }
            }
            $effective_cents = $proof_cents ?? array_sum(array_map('invoice_balance_cents', $open));
            if (count($open) === 1 && payment_double_submitted($conn, $ids, $invoice_id, $payment_reference, $effective_cents)) {
                $refuse(409, "This payment was already submitted.");
            }
            // A part already recorded on this bill with this reference (another
            // installment) is a reuse; this bill's own pending proof is not.
            $reuse = find_reference_reuse($conn, $payment_method, $bank_name, $payment_reference, $invoice_id, $ids);
            if ($reuse && reference_reuse_blocks($conn)) {
                // The tenant is told neither whose payment it was nor which invoice.
                $refuse(409, "This reference number was already used on another payment. Check the number or contact management.");
            }
        }
    }

    // A fresh proof replaces any earlier rejection, so the tenant's bill page
    // stops showing the old rejection reason.
    $query = "UPDATE invoices SET payment_method = ?, payment_reference = ?, sender_name = ?, bank_name = ?, status = 'pending-verification', proof_rejection_reason = NULL, proof_amount = ?";
    $params = [$payment_method, $payment_reference, $sender_name, $bank_name ?: null, $proof_amount];
    $types = "ssssd";

    if ($proof_path) {
        $query .= ", proof_of_payment_path = ?";
        $params[] = $proof_path;
        $types .= "s";
    }

    if ($is_admin) {
        $query .= " WHERE ? IN (id, payment_group)";
        $params[] = $invoice_id;
        $types .= "s";
    } else {
        $query .= " WHERE ? IN (id, payment_group) AND user_id = ?";
        $params[] = $invoice_id;
        $params[] = $user_id;
        $types .= "si";
    }

    // Never let a settled or cancelled invoice be reopened by attaching a proof.
    $query .= " AND status IN " . billing_open_status_sql();

    $stmt = $conn->prepare($query);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $updated = $stmt->affected_rows;
    $stmt->close();
    if ($updated === 0) {
        $refuse(409, "This invoice is not open for payment — it may already be settled or cancelled.");
    }

    // A single-method proof replaces an earlier split submission.
    clear_payment_proof_parts($conn, $invoice_id);
    $conn->commit();
} catch (Throwable $e) {
    // Rolled back, the saved proof file removed and the lock released.
    error_log('[AMS] upload_payment_proof: ' . $e->getMessage());
    $refuse(500, "Failed to update invoice payment details");
}
payment_reference_unlock($conn);

// 'warn': accepted; the admin sees the flag on the payment (get_invoices.php).
log_activity($conn, $user_id, 'billing', "Submitted Payment Proof", "Invoice ID: $invoice_id, Method: $payment_method, Ref: $payment_reference"
    . ($reuse ? " (reference also used on invoice {$reuse['invoice_id']})" : ""));

// The admin used to learn about a waiting proof only by opening Payments.
// One queue row per invoice: a re-upload does not add a second one.
$queued = $conn->prepare("SELECT 1 FROM notifications WHERE type = 'payment_verification' AND metadata_value = ? AND status = 'Pending'");
$queue_key = "payment_verification:$invoice_id";
$queued->bind_param("s", $queue_key);
$queued->execute();
$already_queued = (bool)$queued->get_result()->fetch_assoc();
$queued->close();
if (!$already_queued) {
    notify_admins_queue($conn, 'payment_verification', $invoice_id, 'Payment Proof Submitted',
        "A $payment_method payment proof was submitted for " . payment_key_label($invoice_id) . " and is waiting for verification.");
}

// The tenant's own receipt of the submission; the admin's decision
// follows as "Payment Received" (settle_invoice) or "Payment Proof Rejected".
if (!$is_admin) {
    create_notification($conn, $user_id, 'payment', 'Payment Submitted',
        "Your $payment_method payment for " . payment_key_label($invoice_id) . " was submitted and is awaiting verification by management. You will be notified once it is confirmed.",
        'Resolved', "invoice:$invoice_id");
    try {
        require_once __DIR__ . '/services/send_notification.php';
        $breakdown_q = $conn->prepare("SELECT id, billing_period, total_amount FROM invoices WHERE ? IN (id, payment_group) ORDER BY due_date");
        $breakdown_q->bind_param('s', $invoice_id);
        $breakdown_q->execute();
        $invoice_rows = $breakdown_q->get_result()->fetch_all(MYSQLI_ASSOC);
        $breakdown_q->close();
        $proof_mail = email_payment_proof_template(notify_recipient_name($conn, $user_id), $invoice_id, 'Received', '', $invoice_rows);
        dispatch_admin_action_notification($conn, $user_id, 'payment', 'Payment Proof Received', null, $proof_mail);
    } catch (Throwable $notification_error) {
        error_log('Could not dispatch payment proof received email: ' . $notification_error->getMessage());
    }
}

echo json_encode([
    "success" => true,
    "message" => "Payment proof and reference uploaded successfully.",
    "proof_path" => $proof_path
]);
$conn->close();
?>
