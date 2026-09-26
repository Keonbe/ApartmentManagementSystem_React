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

// Tenant advance payment (panel feedback 2026-09-26). The tenant picks how
// many upcoming months to prepay; each month becomes its own rent invoice
// (so each gets its own receipt), all sharing one payment_group 'ADV-…' that
// the pay endpoints accept in place of an invoice id.
//
//   GET                         preview: the months that can be prepaid, and
//                               any advance payment still awaiting payment
//   POST {action:'create', months}   bill the next N months as one group
//   POST {action:'cancel', group}    cancel an unpaid group (its months can
//                                    then be billed again)
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

// Up to ADVANCE_PAYMENT_MAX_MONTHS upcoming tenancy months that are not billed
// yet: starting today or later (a month already under way is ordinary rent,
// not an advance) and before the lease ends.
function advance_months($conn, $user_id, $tenancy, $rent) {
    $today = date('Y-m-d');
    $months = [];
    for ($k = 1; $k < 600 && count($months) < ADVANCE_PAYMENT_MAX_MONTHS; $k++) {
        $start = rent_period_start($tenancy['lease_start'], $k);
        if ($start >= $tenancy['lease_end']) break;
        if ($start < $today || rent_period_billed($conn, $user_id, $start)) continue;
        $months[] = [
            'period_start' => $start,
            'billing_period' => billing_period_label(new DateTime($start)),
            'due_date' => $start,
            'amount' => round($rent, 2),
        ];
    }
    return $months;
}

// The caller's advance payment that is still open (at most one at a time).
function open_advance_group($conn, $user_id) {
    $stmt = $conn->prepare("SELECT payment_group FROM invoices
                            WHERE user_id = ? AND payment_group IS NOT NULL AND status IN " . billing_open_status_sql() . "
                            ORDER BY due_date ASC LIMIT 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) return null;

    $rows = payment_key_invoices($conn, $row['payment_group'], $user_id, BILLING_OPEN_STATUSES);
    return [
        'group' => $row['payment_group'],
        'invoices' => array_map(fn($r) => [
            'id' => $r['id'],
            'billing_period' => $r['billing_period'],
            'due_date' => $r['due_date'],
            'status' => $r['status'],
            'amount' => (float)$r['total_amount'],
        ], $rows),
        'total' => round(array_sum(array_map(fn($r) => (float)$r['total_amount'], $rows)), 2),
    ];
}

$tenancy = advance_tenancy($conn, $user_id);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!$tenancy) {
        echo json_encode(["success" => true, "available" => false, "months" => [], "pending" => open_advance_group($conn, $user_id),
                          "message" => "Advance payment is available once your lease is active."]);
        exit;
    }
    $rent = tenancy_monthly_rent($conn, (int)$tenancy['app_id']);
    echo json_encode([
        "success" => true,
        "available" => $rent > 0,
        "monthly_rent" => round($rent, 2),
        "lease_end" => $tenancy['lease_end'],
        "months" => $rent > 0 ? advance_months($conn, $user_id, $tenancy, $rent) : [],
        "pending" => open_advance_group($conn, $user_id),
    ]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true) ?: [];
$action = $input['action'] ?? '';

if ($action === 'create') {
    if (!$tenancy) fail(403, "Advance payment is available once your lease is active.");
    if (open_advance_group($conn, $user_id)) {
        fail(409, "You already have an advance payment waiting. Pay or cancel it first.");
    }
    $count = filter_var($input['months'] ?? null, FILTER_VALIDATE_INT);
    if ($count === false || $count < 1 || $count > ADVANCE_PAYMENT_MAX_MONTHS) {
        fail(422, "Choose between 1 and " . ADVANCE_PAYMENT_MAX_MONTHS . " months.");
    }

    $rent = tenancy_monthly_rent($conn, (int)$tenancy['app_id']);
    if ($rent <= 0) fail(422, "Your monthly rent is not set. Please contact management.");
    $months = advance_months($conn, $user_id, $tenancy, $rent);
    if ($count > count($months)) {
        fail(422, count($months) === 0
            ? "There are no upcoming months left to prepay before your lease ends."
            : "Only " . count($months) . " upcoming month(s) can be prepaid before your lease ends.");
    }

    $group = 'ADV-' . strtoupper(bin2hex(random_bytes(6)));
    $created = [];
    $conn->begin_transaction();
    foreach (array_slice($months, 0, $count) as $m) {
        $invoice_id = create_rent_invoice($conn, $user_id, (int)$tenancy['app_id'], $m['period_start'], $rent, $group);
        if (!$invoice_id) {
            // Billed by someone else (the daily sweep) between preview and now.
            $conn->rollback();
            fail(409, "{$m['billing_period']} was just billed. Please review the months and try again.");
        }
        $created[] = ['id' => $invoice_id] + $m;
    }
    $conn->commit();

    $total = round($rent * $count, 2);
    $periods = implode(', ', array_column($created, 'billing_period'));
    log_activity($conn, $user_id, 'billing', 'Created Advance Payment',
        "Group $group: $count month(s) ($periods), ₱" . number_format($total, 2));

    echo json_encode([
        "success" => true,
        "message" => "$count month(s) billed for advance payment.",
        "group" => $group,
        "invoices" => $created,
        "total" => $total,
    ]);
    exit;
}

if ($action === 'cancel') {
    $group = (string)($input['group'] ?? '');
    if (!is_payment_group_key($group)) fail(422, "Invalid advance payment.");

    $rows = payment_key_invoices($conn, $group, $user_id);
    if (!$rows) fail(404, "Advance payment not found.");
    foreach ($rows as $r) {
        if (!in_array($r['status'], ['pending', 'unpaid', 'overdue', 'payment-failed'], true)) {
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
    // rent-period unique key, so these months can be billed again (by the
    // sweep or a new advance payment).
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
