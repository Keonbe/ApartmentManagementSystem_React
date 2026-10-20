<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Ownership is checked against the session. It used to compare ?userId= with the
// X-User-Id header — two values the same client supplies — so sending a matching
// pair read any tenant's contract and contact details.
$auth = require_user($conn);
$is_admin = $auth['role'] === 'admin';

// Expire any contract whose lease_end has already passed before reading, so a
// lapsed lease never reports 'active' just because no admin has looked at it.
// Runs after require_user() above — expiring contracts (and notifying their
// tenants) is a side effect of reading, not something an unauthenticated
// request should be able to trigger.
expire_lapsed_contracts($conn);

$user_id = $_GET['userId'] ?? null;
$email = $_GET['email'] ?? null;

if (!$is_admin) {
    if (!empty($user_id) && (int)$user_id !== $auth['id']) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Forbidden: Access denied to other user's contract"]);
        exit;
    }
    // A tenant always gets their own contract, whatever else was asked for.
    $user_id = $auth['id'];
}

if (!empty($user_id)) {
    $stmt = $conn->prepare("SELECT lc.*, ra.first_name, ra.last_name, ra.contact_no, ra.previous_address, ra.room_name, ra.monthly_rent, ra.email, rm.type, ra.created_at as app_created_at
                            FROM rent_applications ra 
                            LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id 
                            LEFT JOIN rooms rm ON ra.room_name = rm.id
                            WHERE ra.user_id = ? AND ra.status IN ('Approved', 'active', 'pending-move-out')
                            ORDER BY ra.created_at DESC LIMIT 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $res = $stmt->get_result();
    $contract = $res && $res->num_rows > 0 ? $res->fetch_assoc() : null;
    $stmt->close();
    echo json_encode(["success" => !empty($contract), "contract" => $contract, "contracts" => $contract ? [$contract] : []]);
} else if (!empty($email)) {
    // Lookup by email exists only for the admin contract preview. Tenants read
    // their own contract through the ?userId= branch above, which is scoped to
    // the X-User-Id header.
    if (!$is_admin) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
        exit;
    }

    $stmt = $conn->prepare("SELECT lc.*, ra.first_name, ra.last_name, ra.contact_no, ra.previous_address, ra.room_name, ra.monthly_rent, ra.email, rm.type, ra.created_at as app_created_at
                            FROM rent_applications ra
                            LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id
                            LEFT JOIN rooms rm ON ra.room_name = rm.id
                            WHERE ra.email = ? AND ra.status IN ('Approved', 'active', 'pending-move-out')
                            ORDER BY ra.created_at DESC LIMIT 1");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $res = $stmt->get_result();
    $contract = $res && $res->num_rows > 0 ? $res->fetch_assoc() : null;
    $stmt->close();
    echo json_encode(["success" => !empty($contract), "contract" => $contract, "contracts" => $contract ? [$contract] : []]);
} else {
    // Admin-only global contract list
    if (!$is_admin) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
        exit;
    }

    $query = "SELECT c.*, r.user_id, r.first_name, r.last_name, r.email, r.room_name, r.monthly_rent, rm.type
              FROM lease_contracts c
              LEFT JOIN rent_applications r ON c.rent_application_id = r.id
              LEFT JOIN rooms rm ON r.room_name = rm.id
              ORDER BY c.generated_at DESC";
    $result = $conn->query($query);
    $contracts = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $contracts[] = $row;
        }
    }

    // Attach overdue-payment info per tenant so the admin eviction-monitoring
    // UI (banner/panel/stat card in AdminContracts.jsx) has real data instead
    // of always-null. Same 'oldest unpaid invoice' definition already used by
    // check_due_date_reminders.php / get_invoices.php.
    // The shared promotion, so late fees and every open status apply here too
    // (this used to be a private UPDATE that only moved 'pending' invoices).
    // At most once a minute, shared with get_invoices.php (audit L7).
    if (throttle_claim($conn, 'billing_checks_last_run', 60)) {
        promote_overdue_invoices($conn);
    }
    $overdue_by_user = [];
    // A past-due invoice stuck in 'pending-verification' (an unverified proof
    // submitted against an already-overdue bill) is still money owed and a
    // real eviction-monitoring signal — it must not disappear from this view
    // just because a proof, verified or not, was attached (audit C3).
    $overdue_res = $conn->query("SELECT user_id, MIN(due_date) AS oldest_due_date, SUM(total_amount) AS outstanding_amount, COUNT(*) AS invoice_count
                                  FROM invoices
                                  WHERE status = 'overdue' OR (status = 'pending-verification' AND due_date IS NOT NULL AND due_date < CURDATE())
                                  GROUP BY user_id");
    if ($overdue_res) {
        while ($row = $overdue_res->fetch_assoc()) {
            $overdue_by_user[(int)$row['user_id']] = $row;
        }
    }

    $last_payment_by_user = [];
    $paid_res = $conn->query("SELECT user_id, MAX(paid_at) AS last_paid_at FROM invoices WHERE status = 'paid' GROUP BY user_id");
    if ($paid_res) {
        while ($row = $paid_res->fetch_assoc()) {
            $last_payment_by_user[(int)$row['user_id']] = $row['last_paid_at'];
        }
    }

    // Itemized deposit deductions for the Security Deposit Ledger: one query
    // for every contract, keyed by rent application.
    $deductions_by_app = deposit_deductions_for($conn, array_column($contracts, 'rent_application_id'));

    $today = new DateTime(date('Y-m-d'));
    foreach ($contracts as &$c) {
        $c['deposit_items'] = $deductions_by_app[(int)($c['rent_application_id'] ?? 0)] ?? [];
        $uid = isset($c['user_id']) ? (int)$c['user_id'] : null;
        if ($uid !== null && isset($overdue_by_user[$uid])) {
            $info = $overdue_by_user[$uid];
            $daysOverdue = (int)$today->diff(new DateTime($info['oldest_due_date']))->format('%a');
            $last_paid_at = $last_payment_by_user[$uid] ?? null;
            $c['overdueInfo'] = [
                'daysOverdue' => $daysOverdue,
                'oldestDueDate' => $info['oldest_due_date'],
                'outstandingAmount' => (float)$info['outstanding_amount'],
                'invoiceCount' => (int)$info['invoice_count'],
                'lastPaymentDate' => $last_paid_at ? substr($last_paid_at, 0, 10) : 'Never',
            ];
        } else {
            $c['overdueInfo'] = null;
        }
    }
    unset($c);

    echo json_encode(["success" => true, "contracts" => $contracts]);
}
$conn->close();
?>
