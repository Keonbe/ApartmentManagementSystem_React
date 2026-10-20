<?php
// Audit H8: create_invoice.php is insert-only now — re-issuing an invoice
// used to rewrite parking/water/electricity/late_fee/total_amount wholesale,
// silently erasing charges post_parking_charge()/sync_utility_to_invoice.php
// had already posted (while the source rows still said they'd been billed,
// so they could never be posted again). This is the separate adjustment
// action the audit calls for: it only ever touches the manual lines, and
// always recomputes total_amount from every column so a posted charge can
// never be dropped.
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, X-User-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

$admin_id = require_admin($conn);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$invoice_id = trim($input['invoiceId'] ?? '');

if (empty($invoice_id)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "invoiceId is required."]);
    exit;
}

$current = $conn->prepare("SELECT base_rent, water, electricity, parking, late_fee, late_fee_waived, services, maintenance, security_deposit, total_amount, amount_paid, due_date, status, advance_months FROM invoices WHERE id = ?");
$current->bind_param("s", $invoice_id);
$current->execute();
$row = $current->get_result()->fetch_assoc();
$current->close();

if (!$row) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Invoice not found."]);
    exit;
}

// An advance-rent invoice's total is the sum of its month credits; changing it
// here would leave the credits out of step.
if (!empty($row['advance_months'])) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Invoice {$invoice_id} is an advance payment. The tenant can cancel it and prepay again instead."]);
    exit;
}

if (!in_array($row['status'], INVOICE_ADJUSTABLE_STATUSES, true)) {
    $reason = match ($row['status']) {
        'processing' => 'has an online payment in progress',
        'pending-verification' => 'has a payment under verification',
        'paid' => 'is already paid; issue a manual credit instead',
        'cancelled' => 'is cancelled',
        default => 'can no longer be adjusted',
    };
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Invoice {$invoice_id} {$reason}."]);
    exit;
}

// Only the manual lines are ever writable here — services, maintenance and
// security_deposit are system-posted and must survive every adjustment.
$fields = ['baseRent' => 'base_rent', 'water' => 'water', 'electricity' => 'electricity', 'parking' => 'parking', 'lateFee' => 'late_fee'];
$new_values = [
    'base_rent' => (float)$row['base_rent'],
    'water' => (float)$row['water'],
    'electricity' => (float)$row['electricity'],
    'parking' => (float)$row['parking'],
    'late_fee' => (float)$row['late_fee'],
];

foreach ($fields as $key => $column) {
    if (!array_key_exists($key, $input)) continue;
    if ($input[$key] === '' || $input[$key] === null) continue;
    if (!is_numeric($input[$key]) || (float)$input[$key] < 0) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Amounts must be zero or a positive number."]);
        exit;
    }
    $new_values[$column] = (float)$input[$key];
}

$due_date = $row['due_date'];
if (array_key_exists('dueDate', $input) && !empty($input['dueDate'])) {
    $due_date = trim($input['dueDate']);
    $due_dt = DateTime::createFromFormat('Y-m-d', $due_date);
    if (!$due_dt || $due_dt->format('Y-m-d') !== $due_date) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Due date must be a valid date (YYYY-MM-DD)."]);
        exit;
    }
    // Same rule as create_invoice.php: a due date can move, but never into
    // the past. Resaving the invoice's own (already lapsed) date is allowed.
    if ($due_date !== $row['due_date'] && $due_date < date('Y-m-d')) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Due date cannot be in the past."]);
        exit;
    }
}

$old_total = (float)$row['total_amount'];
// Recomputed from every column, not just the manual ones being changed here —
// this is what makes it impossible to drop a posted charge on adjustment.
$new_total = $new_values['base_rent'] + $new_values['water'] + $new_values['electricity']
    + $new_values['parking'] + (float)$row['services'] + (float)$row['maintenance']
    + $new_values['late_fee'] + (float)$row['security_deposit'];

// Parts already received (installments) cannot be adjusted away: the new total
// must stay above what the tenant has paid.
$paid_cents = (int)round((float)$row['amount_paid'] * 100);
if ($paid_cents > 0 && (int)round($new_total * 100) <= $paid_cents) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "The tenant has already paid ₱" . number_format($paid_cents / 100, 2) . " of this invoice. The new total must be more than that."]);
    exit;
}

// Optimistic lock: the status this endpoint already validated must still
// hold at write time — a payment could have started at the gateway in the
// meantime.
// A late fee the admin takes off stays off: promote_overdue_invoices() charges
// any overdue invoice whose fee is 0 unless it is marked waived. Entering a fee
// again clears the mark.
$late_fee_waived = (int)$row['late_fee_waived'];
if ($new_values['late_fee'] > 0) {
    $late_fee_waived = 0;
} elseif ((float)$row['late_fee'] > 0) {
    $late_fee_waived = 1;
}

// A due date moved to today or later means the invoice is no longer overdue.
$new_status = ($row['status'] === 'overdue' && !empty($due_date) && $due_date >= date('Y-m-d')) ? 'pending' : $row['status'];

$stmt = $conn->prepare("UPDATE invoices SET base_rent = ?, water = ?, electricity = ?, parking = ?, late_fee = ?, late_fee_waived = ?, total_amount = ?, due_date = ?, status = ? WHERE id = ? AND status = ? AND amount_paid < total_amount");
$stmt->bind_param(
    "dddddidssss",
    $new_values['base_rent'],
    $new_values['water'],
    $new_values['electricity'],
    $new_values['parking'],
    $new_values['late_fee'],
    $late_fee_waived,
    $new_total,
    $due_date,
    $new_status,
    $invoice_id,
    $row['status']
);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

if ($affected === 0) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This invoice was changed by someone else. Refresh and try again."]);
    exit;
}

log_activity($conn, $admin_id, 'billing', 'Adjusted Invoice',
    "Invoice {$invoice_id}: total ₱" . number_format($old_total, 2) . " -> ₱" . number_format($new_total, 2));

$owner = $conn->prepare("SELECT user_id FROM invoices WHERE id = ?");
$owner->bind_param("s", $invoice_id);
$owner->execute();
$owner_row = $owner->get_result()->fetch_assoc();
$owner->close();

if ($owner_row && !empty($owner_row['user_id']) && abs($new_total - $old_total) >= 0.01) {
    create_notification($conn, (int)$owner_row['user_id'], 'billing', 'Invoice Adjusted',
        "Invoice {$invoice_id} was adjusted. New total: ₱" . number_format($new_total, 2) . ".");
}

echo json_encode([
    "success" => true,
    "message" => "Invoice {$invoice_id} adjusted successfully.",
    "invoice_id" => $invoice_id,
    "total_amount" => $new_total
]);

$conn->close();
?>
