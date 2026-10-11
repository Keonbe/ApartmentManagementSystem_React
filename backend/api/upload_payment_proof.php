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

if (empty($invoice_id)) {
    echo json_encode(["success" => false, "message" => "Invoice ID is required."]);
    exit;
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

// A fresh proof replaces any earlier rejection, so the tenant's bill page
// stops showing the old rejection reason.
$query = "UPDATE invoices SET payment_method = ?, payment_reference = ?, sender_name = ?, bank_name = ?, status = 'pending-verification', proof_rejection_reason = NULL";
$params = [$payment_method, $payment_reference, $sender_name, $bank_name ?: null];
$types = "ssss";

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

if ($stmt->execute()) {
    if ($stmt->affected_rows === 0) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This invoice is not open for payment — it may already be settled or cancelled."]);
        $stmt->close();
        $conn->close();
        exit;
    }

    log_activity($conn, $user_id, 'billing', "Submitted Payment Proof", "Invoice ID: $invoice_id, Method: $payment_method, Ref: $payment_reference");

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
} else {
    echo json_encode(["success" => false, "message" => "Failed to update invoice payment details"]);
}

$stmt->close();
$conn->close();
?>