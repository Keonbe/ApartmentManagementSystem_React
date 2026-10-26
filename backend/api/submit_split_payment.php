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

// A tenant splitting one bill (or one combined/advance payment) across cash,
// GCash and bank transfer. Each GCash/bank portion brings its own reference and
// proof; the bill then waits for the admin, who confirms it from Record
// Payment with the same portions (record_payment_admin.php) or rejects it.
$auth = require_user($conn);
if ($auth['role'] === 'admin') {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Only a tenant can submit a split payment."]);
    exit;
}
$user_id = (int)$auth['id'];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["success" => false, "message" => "Invalid request method."]);
    exit;
}

const SPLIT_MAX_PORTIONS = 2;

function split_fail($message, $code = 422) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

$key = trim((string)($_POST['invoice_id'] ?? ''));
$raw_parts = json_decode((string)($_POST['parts'] ?? ''), true);
if ($key === '') split_fail("Invoice ID is required.");
if (!is_array($raw_parts) || count($raw_parts) < 2) split_fail("A split payment needs at least two portions.");

$checked = normalize_payment_portions($raw_parts, SPLIT_MAX_PORTIONS);
if (!$checked['ok']) split_fail($checked['message']);
$parts = $checked['parts'];

$rows = payment_key_invoices($conn, $key, $user_id, BILLING_OPEN_STATUSES);
if (!$rows) split_fail("This invoice is not open for payment — it may already be settled or cancelled.", 409);
foreach ($rows as $row) {
    if ($row['status'] === 'processing') split_fail("An online checkout is in progress for this bill.", 409);
}
// What is still owed after any parts already received (installments).
$open_total_cents = 0;
foreach ($rows as $row) $open_total_cents += invoice_balance_cents($row);
// Optional `amount`: pay only a part of a single bill now (default = the whole balance).
$target_cents = $open_total_cents;
$amount_raw = $_POST['amount'] ?? '';
if ($amount_raw !== '' && $amount_raw !== null) {
    if (!is_numeric($amount_raw) || !is_finite((float)$amount_raw) || (float)$amount_raw <= 0) split_fail("Enter the amount you are paying (more than ₱0).");
    $target_cents = (int)round((float)$amount_raw * 100);
    if ($target_cents > $open_total_cents) split_fail("The amount is more than the balance (₱" . number_format($open_total_cents / 100, 2) . ").");
    if ($target_cents < $open_total_cents && (is_payment_group_key($key) || count($rows) !== 1 || (int)($rows[0]['advance_months'] ?? 0) > 0)) {
        split_fail("A grouped or advance payment is paid in full. Pay the whole amount, or pay a single bill in parts.");
    }
}
if ($checked['total_cents'] !== $target_cents) split_fail("Payment portions must add up exactly to the amount you are paying.");
$proof_amount = $target_cents < $open_total_cents ? $target_cents / 100 : null;

// A cash portion is paid at the office, so the tenant books the visit, as with
// an in-person payment (schedule_payment.php): a real date up to 60 days ahead.
$scheduled_date = null;
$scheduled_slot = null;
if (array_filter($parts, fn($p) => $p['method'] === 'cash')) {
    $scheduled_date = trim((string)($_POST['scheduled_date'] ?? ''));
    $scheduled_slot = trim((string)($_POST['scheduled_time_slot'] ?? ''));
    $parsed = DateTime::createFromFormat('Y-m-d', $scheduled_date);
    if (!$parsed || $parsed->format('Y-m-d') !== $scheduled_date) split_fail("Choose the date you will pay the cash portion at the office.");
    $today = new DateTime(date('Y-m-d'));
    if ($parsed < $today) split_fail("The cash visit date cannot be in the past.");
    if ((int)$today->diff($parsed)->format('%a') > 60) split_fail("The cash visit date cannot be more than 60 days ahead.");
    if (!in_array($scheduled_slot, ['morning', 'afternoon', 'evening'], true)) split_fail("Choose a time slot for the cash visit.");
}

$manual = array_filter($parts, fn($p) => $p['method'] !== 'cash');
if (!$manual) split_fail("Include at least one GCash or bank transfer portion, or pay in cash at the office.");

// Every GCash/bank portion needs its reference and a proof file; check all of
// them before any file is written.
$allowed_ext = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
$allowed_mime = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$uploads = [];
foreach ($parts as $i => $part) {
    if ($part['method'] === 'cash') continue;
    $label = 'Portion ' . ($i + 1);
    if ($part['reference_number'] === null) split_fail("$label needs a reference number.");
    $file = $_FILES["proof_$i"] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK) split_fail("$label needs a payment proof.");
    if ($file['size'] > 10 * 1024 * 1024) split_fail("$label: payment proof exceeds the 10MB size limit.");
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed_ext, true)) split_fail("$label: invalid payment proof file format. Allowed: JPG, PNG, WEBP, PDF.");
    if (!in_array(finfo_file($finfo, $file['tmp_name']), $allowed_mime, true)) split_fail("$label: file content does not match allowed formats.");
    $uploads[$i] = [$file['tmp_name'], $ext];
}
finfo_close($finfo);

$upload_dir = '../uploads/payment_proofs/';
if (!file_exists($upload_dir)) mkdir($upload_dir, 0755, true);
$saved = [];
$discard = function () use (&$saved, $upload_dir) {
    foreach ($saved as $path) @unlink($upload_dir . basename($path));
};
foreach ($uploads as $i => [$tmp, $ext]) {
    $name = 'proof_' . bin2hex(random_bytes(16)) . '.' . $ext;
    if (!move_uploaded_file($tmp, $upload_dir . $name)) {
        $discard();
        split_fail("Failed to save the payment proof. Please try again.", 500);
    }
    $saved[$i] = 'uploads/payment_proofs/' . $name;
}

// Reused reference (Settings -> Payments) and double submit, per GCash/bank
// portion: checked under the reference lock and the bill's row lock, in the
// transaction that stores the portions.
if (!payment_reference_lock($conn)) {
    $discard();
    split_fail("Another payment is being submitted. Please try again in a moment.", 409);
}
$reuse_notes = [];
$conn->begin_transaction();
try {
    // Lock the bill and re-read it: it may have been settled, or the amount
    // changed, since the check above.
    $lock = $conn->prepare("SELECT id, status, total_amount, amount_paid, proof_amount, payment_reference, scheduled_date, scheduled_time_slot FROM invoices WHERE ? IN (id, payment_group) AND user_id = ? FOR UPDATE");
    $lock->bind_param('si', $key, $user_id);
    if (!$lock->execute()) throw new Exception("Could not submit the payment. Please try again.");
    $locked = $lock->get_result()->fetch_all(MYSQLI_ASSOC);
    $lock->close();
    $open = array_filter($locked, fn($r) => in_array($r['status'], BILLING_OPEN_STATUSES, true));
    $open_cents = 0;
    foreach ($open as $r) $open_cents += invoice_balance_cents($r);
    if (!$open || array_filter($open, fn($r) => $r['status'] === 'processing') || $open_cents !== $open_total_cents) {
        throw new Exception("This bill changed while you were submitting. Refresh the page and try again.");
    }

    $open_ids = array_column($open, 'id');
    // The whole split again, unchanged (a double click, or resent while it is
    // under review): refused, so the tenant is not notified twice. Changing
    // any portion, or the cash visit, is a resubmission that replaces it.
    $sig = fn($method, $bank, $amount, $ref) => implode('|', [$method, payment_reference_channel($method, $bank), (int)round((float)$amount * 100), normalize_payment_reference($ref)]);
    $pending_sig = array_map(fn($p) => $sig($p['method'], $p['bank_name'], $p['amount'], $p['reference_number']), payment_proof_parts($conn, $key));
    $new_sig = array_map(fn($p) => $sig($p['method'], $p['bank_name'], $p['amount'], $p['reference_number']), $parts);
    sort($pending_sig);
    sort($new_sig);
    $first = reset($locked);
    if ($pending_sig === $new_sig && array_filter($open, fn($r) => $r['status'] === 'pending-verification')
        && ($first['scheduled_date'] ?? null) === $scheduled_date && ($first['scheduled_time_slot'] ?? null) === $scheduled_slot) {
        throw new Exception("This payment was already submitted and is awaiting verification.");
    }
    $blocks = reference_reuse_blocks($conn);
    foreach ($manual as $part) {
        $part_cents = (int)round($part['amount'] * 100);
        // The same portion recorded on this bill a moment ago. Its own pending
        // parts are not checked: this submission replaces them.
        if (payment_double_submitted($conn, count($open_ids) === 1 ? $open_ids : [], null, $part['reference_number'], $part_cents)) {
            throw new Exception("This payment was already submitted.");
        }
        $reuse = find_reference_reuse($conn, $part['method'], $part['bank_name'], $part['reference_number'], $key, $open_ids);
        if ($reuse && $blocks) {
            // No invoice number or tenant: another payment's details are not the applicant's to see.
            throw new Exception("This reference number was already used on another payment. Check the number or contact management.");
        }
        if ($reuse) $reuse_notes[] = "reference {$part['reference_number']} also used on invoice {$reuse['invoice_id']}";
    }

    clear_payment_proof_parts($conn, $key);
    $ins = $conn->prepare("INSERT INTO payment_proof_parts (payment_key, position, method, bank_name, amount, reference_number, proof_path) VALUES (?, ?, ?, ?, ?, ?, ?)");
    foreach ($parts as $i => $part) {
        $proof = $saved[$i] ?? null;
        $ins->bind_param('sissdss', $key, $i, $part['method'], $part['bank_name'], $part['amount'], $part['reference_number'], $proof);
        if (!$ins->execute()) throw new Exception("Could not submit the payment. Please try again.");
    }
    $ins->close();

    // The invoice carries the first proof so the existing review screens and
    // the reject endpoint see a proof awaiting verification.
    $first_proof = reset($saved);
    $label = SPLIT_PAYMENT_LABEL;
    $upd = $conn->prepare("UPDATE invoices SET payment_method = ?, payment_reference = NULL, sender_name = NULL, bank_name = NULL, status = 'pending-verification', proof_rejection_reason = NULL, proof_of_payment_path = ?, scheduled_date = ?, scheduled_time_slot = ?, proof_amount = ?
                           WHERE ? IN (id, payment_group) AND user_id = ? AND status IN " . billing_open_status_sql());
    $upd->bind_param('ssssdsi', $label, $first_proof, $scheduled_date, $scheduled_slot, $proof_amount, $key, $user_id);
    if (!$upd->execute()) throw new Exception("Could not submit the payment. Please try again.");
    $changed = $upd->affected_rows;
    $upd->close();
    if ($changed === 0) throw new Exception("This invoice is not open for payment — it may already be settled or cancelled.");

    $conn->commit();
    payment_reference_unlock($conn);
} catch (Exception $e) {
    $conn->rollback();
    payment_reference_unlock($conn);
    $discard();
    split_fail(public_error_message($e), 409);
}

$summary = implode(', ', array_map(fn($p) => $p['method'] . ' ₱' . number_format($p['amount'], 2), $parts))
    . ($scheduled_date ? " (cash at the office on $scheduled_date, $scheduled_slot)" : '');
log_activity($conn, $user_id, 'billing', "Submitted Split Payment", "Invoice ID: $key, Portions: $summary"
    . ($reuse_notes ? " (" . implode('; ', $reuse_notes) . ")" : ""));

$queued = $conn->prepare("SELECT 1 FROM notifications WHERE type = 'payment_verification' AND metadata_value = ? AND status = 'Pending'");
$queue_key = "payment_verification:$key";
$queued->bind_param('s', $queue_key);
$queued->execute();
$already_queued = (bool)$queued->get_result()->fetch_assoc();
$queued->close();
if (!$already_queued) {
    notify_admins_queue($conn, 'payment_verification', $key, 'Split Payment Submitted',
        "A split payment ($summary) was submitted for " . payment_key_label($key) . " and is waiting for verification.");
}

create_notification($conn, $user_id, 'payment', 'Payment Submitted',
    "Your split payment for " . payment_key_label($key) . " was submitted and is awaiting verification by management. You will be notified once it is confirmed.",
    'Resolved', "invoice:$key");

echo json_encode(["success" => true, "message" => "Split payment submitted for verification."]);
$conn->close();
