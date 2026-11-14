<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Tenant advance payment (panel feedback 2026-09-26, reworked 2026-09-28).
// The tenant picks how many upcoming months to prepay and pays one
// advance-rent invoice (invoices.advance_months = N) through any channel.
// Each month it covers is an advance_credits row; the daily sweep still
// issues that month's rent invoice on its usual date and settles it from the
// credit, so every month keeps its own invoice and receipt.
//
//   GET                              preview: the months that can be prepaid,
//                                    the advance awaiting payment, and credits
//   POST {action:'create', months}   create the advance-rent invoice
//   POST {action:'cancel', invoice}  cancel an unpaid advance (its months can
//                                    then be prepaid or billed again)
//   POST {action:'cancel', group}    cancel a legacy 'ADV-…' payment group
$auth = require_user($conn);
if ($auth['role'] === 'admin') {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Advance payments are made by the tenant."]);
    exit;
}
$user_id = (int)$auth['id'];

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

// The caller's running tenancy: an active contract with both lease dates.
function advance_tenancy($conn, $user_id) {
    $stmt = $conn->prepare("SELECT ra.id AS app_id, lc.lease_start, lc.lease_end
                            FROM rent_applications ra
                            JOIN lease_contracts lc ON lc.rent_application_id = ra.id
                            WHERE ra.user_id = ? AND ra.status IN ('Approved', 'active', 'pending-move-out')
                              AND lc.status = 'active' AND lc.lease_start IS NOT NULL AND lc.lease_end IS NOT NULL
                            ORDER BY ra.id DESC LIMIT 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

// Up to ADVANCE_PAYMENT_MAX_MONTHS upcoming tenancy months that are neither
// billed nor credited yet, starting after the billing window (a month inside
// it is billed by the sweep any day now) and before the lease ends.
function advance_months($conn, $user_id, $tenancy, $rent) {
    $after = date('Y-m-d', strtotime('+' . RENT_INVOICE_LEAD_DAYS . ' days'));
    $credited = advance_credits_by_month($conn, $user_id);
    $months = [];
    for ($k = 1; $k < 600 && count($months) < ADVANCE_PAYMENT_MAX_MONTHS; $k++) {
        $start = rent_period_start($tenancy['lease_start'], $k);
        if ($start >= $tenancy['lease_end']) break;
        if ($start <= $after || isset($credited[$start]) || rent_period_billed($conn, $user_id, $start)) continue;
        [, $end] = rent_period_bounds($tenancy['lease_start'], $start);
        $months[] = [
            'period_start' => $start,
            'period_end' => $end,
            'billing_period' => billing_period_label(new DateTime($start)),
            'amount' => round($rent, 2),
        ];
    }
    return $months;
}

// The caller's advance-rent invoice still awaiting payment, with its months.
function open_advance_invoice($conn, $user_id) {
    $stmt = $conn->prepare("SELECT id, status, total_amount, due_date, advance_months FROM invoices
                            WHERE user_id = ? AND advance_months IS NOT NULL AND status IN " . billing_open_status_sql() . "
                            ORDER BY created_at DESC LIMIT 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $inv = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$inv) return null;
    $inv['total_amount'] = (float)$inv['total_amount'];
    $inv['months'] = advance_invoice_months($conn, $inv['id']);
    return $inv;
}

function advance_invoice_months($conn, $invoice_id) {
    $stmt = $conn->prepare("SELECT period_start, amount, status, applied_invoice_id FROM advance_credits
                            WHERE advance_invoice_id = ? ORDER BY period_start");
    $stmt->bind_param("s", $invoice_id);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return array_map(fn($r) => [
        'period_start' => $r['period_start'],
        'billing_period' => billing_period_label(new DateTime($r['period_start'])),
        'amount' => (float)$r['amount'],
        'status' => $r['status'],
        'applied_invoice_id' => $r['applied_invoice_id'],
    ], $rows);
}

// Paid advance months: waiting for their month ('available') or already
// billed and settled ('applied'), for the tenant's "Prepaid months" list.
function advance_credits_list($conn, $user_id) {
    $stmt = $conn->prepare("SELECT c.advance_invoice_id, c.period_start, c.amount, c.status, c.applied_invoice_id, c.applied_at
                            FROM advance_credits c
                            WHERE c.user_id = ? AND c.status IN ('available', 'applied')
                            ORDER BY c.period_start DESC LIMIT 24");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return array_map(fn($r) => $r + ['billing_period' => billing_period_label(new DateTime($r['period_start']))], $rows);
}

// A legacy advance payment (payment_group 'ADV-…', every month billed at
// once) that is still open. New advances no longer create these.
function open_legacy_group($conn, $user_id) {
    $stmt = $conn->prepare("SELECT payment_group FROM invoices
                            WHERE user_id = ? AND payment_group LIKE 'ADV-%' AND status IN " . billing_open_status_sql() . " LIMIT 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row['payment_group'] ?? null;
}

$tenancy = advance_tenancy($conn, $user_id);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $pending = open_advance_invoice($conn, $user_id);
    $credits = advance_credits_list($conn, $user_id);
    if (!$tenancy) {
        echo json_encode(["success" => true, "available" => false, "months" => [], "pending" => $pending, "credits" => $credits,
                          "message" => "Advance payment is available once your rental is active."]);
        exit;
    }
    $rent = tenancy_monthly_rent($conn, (int)$tenancy['app_id']);
    echo json_encode([
        "success" => true,
        "available" => $rent > 0,
        "monthly_rent" => round($rent, 2),
        "lease_end" => $tenancy['lease_end'],
        "months" => $rent > 0 ? advance_months($conn, $user_id, $tenancy, $rent) : [],
        "pending" => $pending,
        "credits" => $credits,
    ]);
    exit;
}

$input = read_json_input();
$action = $input['action'] ?? '';

if ($action === 'create') {
    if (!$tenancy) fail(403, "Advance payment is available once your rental is active.");
    if (open_advance_invoice($conn, $user_id) || open_legacy_group($conn, $user_id)) {
        fail(409, "You already have an advance payment waiting. Pay or cancel it first.");
    }
    $count = filter_var($input['months'] ?? null, FILTER_VALIDATE_INT);
    if ($count === false || $count < 1 || $count > ADVANCE_PAYMENT_MAX_MONTHS) {
        fail(422, "Choose between 1 and " . ADVANCE_PAYMENT_MAX_MONTHS . " months.");
    }

    $app_id = (int)$tenancy['app_id'];
    $rent = tenancy_monthly_rent($conn, $app_id);
    if ($rent <= 0) fail(422, "Your monthly rent is not set. Please contact management.");
    $months = advance_months($conn, $user_id, $tenancy, $rent);
    if ($count > count($months)) {
        fail(422, count($months) === 0
            ? "There are no upcoming months left to prepay before your rent ends."
            : "Only " . count($months) . " upcoming month(s) can be prepaid before your rent ends.");
    }
    $months = array_slice($months, 0, $count);
    $first = $months[0];
    $last = $months[count($months) - 1];

    // Due within 3 days, and always before the first month's rent invoice is
    // issued — an advance still unpaid by then expires (expire_unpaid_advances()).
    $due = min(date('Y-m-d', strtotime('+3 days')),
               date('Y-m-d', strtotime($first['period_start'] . ' -' . (RENT_INVOICE_LEAD_DAYS + 1) . ' days')));
    $total = round($rent * $count, 2);
    $label = 'Advance rent: ' . (new DateTime($first['period_start']))->format('M Y')
           . ($count > 1 ? ' – ' . (new DateTime($last['period_start']))->format('M Y') : '');
    $invoice_id = 'INV-' . date('Ym') . '-' . strtoupper(bin2hex(random_bytes(4)));

    $conn->begin_transaction();
    $stmt = $conn->prepare("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, total_amount, billing_period, status, due_date, advance_months)
                            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)");
    $stmt->bind_param("siiddssi", $invoice_id, $user_id, $app_id, $total, $total, $label, $due, $count);
    $ok = $stmt->execute();
    $stmt->close();
    if (!$ok) {
        $conn->rollback();
        fail(500, "Could not prepare the advance payment.");
    }
    $credit = $conn->prepare("INSERT INTO advance_credits (advance_invoice_id, user_id, rent_application_id, period_start, amount, status)
                              VALUES (?, ?, ?, ?, ?, 'reserved')");
    foreach ($months as $m) {
        $credit->bind_param("siisd", $invoice_id, $user_id, $app_id, $m['period_start'], $m['amount']);
        if (!$credit->execute()) {
            // Credited by a concurrent request between preview and now.
            $credit->close();
            $conn->rollback();
            fail(409, "{$m['billing_period']} was just prepaid or billed. Please review the months and try again.");
        }
    }
    $credit->close();
    $conn->commit();

    $periods = implode(', ', array_column($months, 'billing_period'));
    log_activity($conn, $user_id, 'billing', 'Created Advance Payment',
        "Invoice $invoice_id: $count month(s) ($periods), ₱" . number_format($total, 2));

    echo json_encode([
        "success" => true,
        "message" => "Advance payment for $count month(s) is ready to pay.",
        "invoice_id" => $invoice_id,
        "months" => $months,
        "total" => $total,
        "due_date" => $due,
    ]);
    exit;
}

if ($action === 'cancel' && isset($input['invoice'])) {
    $invoice_id = (string)$input['invoice'];
    $stmt = $conn->prepare("SELECT status FROM invoices WHERE id = ? AND user_id = ? AND advance_months IS NOT NULL");
    $stmt->bind_param("si", $invoice_id, $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) fail(404, "Advance payment not found.");
    if (!in_array($row['status'], ADVANCE_UNPAID_STATUSES, true)) {
        fail(409, "This advance payment can no longer be cancelled — a payment for it is already awaiting confirmation or recorded.");
    }

    $conn->begin_transaction();
    $unpaid = "('" . implode("','", ADVANCE_UNPAID_STATUSES) . "')";
    $stmt = $conn->prepare("UPDATE invoices SET status = 'cancelled', cancel_reason = 'Advance payment cancelled' WHERE id = ? AND status IN $unpaid");
    $stmt->bind_param("s", $invoice_id);
    $stmt->execute();
    $cancelled = $stmt->affected_rows;
    $stmt->close();
    $credits = $conn->prepare("UPDATE advance_credits SET status = 'cancelled' WHERE advance_invoice_id = ? AND status = 'reserved'");
    $credits->bind_param("s", $invoice_id);
    $credits->execute();
    $credits->close();
    $conn->commit();
    if (!$cancelled) fail(409, "This advance payment can no longer be cancelled.");

    log_activity($conn, $user_id, 'billing', 'Cancelled Advance Payment', "Invoice $invoice_id cancelled");
    echo json_encode(["success" => true, "message" => "Advance payment cancelled."]);
    exit;
}

if ($action === 'cancel') {
    // Legacy 'ADV-…' group: every month was billed up front.
    $group = (string)($input['group'] ?? '');
    if (!is_payment_group_key($group) || is_bundle_key($group)) fail(422, "Invalid advance payment.");

    $rows = payment_key_invoices($conn, $group, $user_id);
    if (!$rows) fail(404, "Advance payment not found.");
    foreach ($rows as $r) {
        if (!in_array($r['status'], ADVANCE_UNPAID_STATUSES, true)) {
            fail(409, "This advance payment can no longer be cancelled — a payment for it is already awaiting confirmation or recorded.");
        }
    }

    $conn->begin_transaction();
    // A month that has already started is rent the tenant owes regardless, so
    // it leaves the group and stays as an ordinary bill instead of vanishing.
    $keep = $conn->prepare("UPDATE invoices SET payment_group = NULL
                            WHERE payment_group = ? AND user_id = ? AND due_date <= CURDATE()");
    $keep->bind_param("si", $group, $user_id);
    $keep->execute();
    $kept = $keep->affected_rows;
    $keep->close();

    // The months not started yet are cancelled. Cancelled rows drop out of the
    // rent-period unique key, so these months can be billed again.
    $stmt = $conn->prepare("UPDATE invoices SET status = 'cancelled', cancel_reason = 'Advance payment cancelled'
                            WHERE payment_group = ? AND user_id = ? AND status IN ('pending', 'unpaid', 'overdue', 'payment-failed')");
    $stmt->bind_param("si", $group, $user_id);
    $stmt->execute();
    $cancelled = $stmt->affected_rows;
    $stmt->close();
    $conn->commit();

    log_activity($conn, $user_id, 'billing', 'Cancelled Advance Payment',
        "Group $group: $cancelled invoice(s) cancelled" . ($kept ? ", $kept already-due month(s) kept as ordinary bills" : ""));
    echo json_encode([
        "success" => true,
        "message" => $kept
            ? "Advance payment cancelled. $kept month(s) already due stay on your bills."
            : "Advance payment cancelled.",
        "cancelled" => $cancelled,
        "kept" => $kept,
    ]);
    exit;
}

fail(422, "Unknown action.");
