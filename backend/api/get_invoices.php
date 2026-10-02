<?php
// Define CORS headers immediately before any processing occurs
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

// Per tenant (keyed by user id), for the current tenancy:
//   deposit: amount, contract status, and `state` — 'unpaid' (move-in invoice
//            still open), 'held', 'settled' (applied at move-out/termination,
//            `status` says how), or 'not-billed' (no move-in invoice or paid
//            deposit on record);
//   advance: prepaid-rent credits by advance_credits status — months and amount.
function tenant_billing_accounts($conn) {
    $accounts = [];
    $res = $conn->query("SELECT ra.user_id, ra.id AS app_id, lc.id AS contract_id, lc.deposit_amount, lc.deposit_status,
                COALESCE(lc.damage_deduction, 0) AS damage_deduction, COALESCE(lc.utility_deduction, 0) AS utility_deduction,
                mi.id AS move_in_invoice, mi.status AS move_in_status, mi.security_deposit AS move_in_deposit
            FROM rent_applications ra
            LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id
            LEFT JOIN invoices mi ON mi.id = (SELECT i.id FROM invoices i WHERE i.rent_application_id = ra.id
                                              AND i.security_deposit > 0 AND i.status <> 'cancelled'
                                              ORDER BY i.created_at DESC LIMIT 1)
            WHERE ra.user_id IS NOT NULL
              AND ra.id = (SELECT MAX(ra2.id) FROM rent_applications ra2 WHERE ra2.user_id = ra.user_id)");
    if ($res) {
        while ($r = $res->fetch_assoc()) {
            $status = $r['deposit_status'];
            if ($r['move_in_invoice'] && $r['move_in_status'] !== 'paid') {
                $state = 'unpaid';
            } elseif ($status === 'Held' || ($status === 'Pending' && $r['move_in_status'] === 'paid')) {
                $state = 'held';
            } elseif ($status && !in_array($status, ['Pending', 'Held'], true)) {
                $state = 'settled';
            } else {
                $state = 'not-billed';
            }
            $accounts[(int)$r['user_id']] = [
                'deposit' => [
                    'state' => $state,
                    'status' => $status,
                    'amount' => (float)($r['deposit_amount'] ?? $r['move_in_deposit'] ?? 0),
                    'deductions' => (float)$r['damage_deduction'] + (float)$r['utility_deduction'],
                    'contract_id' => $r['contract_id'],
                    'move_in_invoice' => $r['move_in_invoice'],
                    'move_in_status' => $r['move_in_status'],
                ],
                'advance' => [],
            ];
        }
    }

    $credits = $conn->query("SELECT user_id, status, COUNT(*) AS months, COALESCE(SUM(amount), 0) AS amount
            FROM advance_credits WHERE status IN ('reserved', 'available', 'refund-due') GROUP BY user_id, status");
    if ($credits) {
        while ($c = $credits->fetch_assoc()) {
            $uid = (int)$c['user_id'];
            if (!isset($accounts[$uid])) continue;
            $accounts[$uid]['advance'][$c['status']] = ['months' => (int)$c['months'], 'amount' => round((float)$c['amount'], 2)];
        }
    }
    return $accounts;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        // Billing data is financial PII (amounts, payment references, sender
        // names, proof paths), so this endpoint requires a real session — it
        // previously only compared a client-supplied X-User-Id against the
        // requested one, which meant OMITTING the header entirely skipped the
        // check and returned any tenant's full billing history unauthenticated.
        $auth = require_user($conn);
        $is_admin = $auth['role'] === 'admin';

        // Auto-mark lapsed invoices 'overdue' and apply the configured late fee
        promote_overdue_invoices($conn);

        $user_id_param = $_GET['userId'] ?? null;
        if ($user_id_param) {
            // A non-admin may only ever read their own invoices, whatever the
            // ?userId= parameter says.
            if (!$is_admin && (int)$user_id_param !== $auth['id']) {
                http_response_code(403);
                echo json_encode(["success" => false, "message" => "Forbidden: Access denied to other user's invoices"]);
                exit;
            }

            $stmt = $conn->prepare("SELECT
                        i.*, 
                        u.first_name, 
                        u.last_name, 
                        ra.room_name, " . INVOICE_PERIOD_COLUMNS . "
                      FROM invoices i
                      LEFT JOIN users u ON i.user_id = u.id
                      LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
                      WHERE i.user_id = ?
                      ORDER BY i.id DESC");
            $stmt->bind_param("i", $user_id_param);
            $stmt->execute();
            $result = $stmt->get_result();
        } else {
            // Admin-only global invoice list
            if (!$is_admin) {
                http_response_code(403);
                echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
                exit;
            }

            $query = "SELECT 
                        i.*, 
                        u.first_name, 
                        u.last_name, 
                        ra.room_name, " . INVOICE_PERIOD_COLUMNS . "
                      FROM invoices i
                      LEFT JOIN users u ON i.user_id = u.id
                      LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
                      ORDER BY i.id DESC";
            $result = $conn->query($query);
        }

        if (!$result) {
            throw new Exception("Database query failed: " . $conn->error);
        }

        $invoices = [];
        while ($row = $result->fetch_assoc()) {
            // The dates the bill covers, from the move-in day — shown instead
            // of the due date once a bill is past due.
            $covered = invoice_covered_period($row, $row['lease_start'] ?? null);
            $invoices[] = [
                'id' => $row['id'],
                // FIX FOR DUPLICATE PREFIX: Pass raw ID/Number or strip duplicate prefix
                'invoice_number' => $row['invoice_number'] ?? $row['id'], 
                'user_id' => $row['user_id'],
                'first_name' => $row['first_name'] ?? '',
                'last_name' => $row['last_name'] ?? '',
                'room_name' => $row['room_name'] ?? 'Unassigned',
                'base_rent' => $row['base_rent'],
                'water' => $row['water'] ?? 0,
                'electricity' => $row['electricity'] ?? 0,
                'parking' => $row['parking'] ?? 0,
                'services' => $row['services'] ?? 0,
                'maintenance' => $row['maintenance'] ?? 0,
                'security_deposit' => $row['security_deposit'] ?? 0,
                'late_fee' => $row['late_fee'] ?? 0.00,
                'total_amount' => $row['total_amount'] ?? 0.00,
                'status' => $row['status'],
                
                // FIX FOR INVALID DATE: Send created_at or issue_date timestamp
                'created_at' => $row['created_at'] ?? $row['issue_date'] ?? date('Y-m-d H:i:s'), 
                'due_date' => $row['due_date'] ?? '',
                'paid_at' => $row['paid_at'] ?? null,
                'payment_method' => !empty($row['payment_method']) ? $row['payment_method'] : (!empty($row['payment_gateway']) && strpos($row['payment_gateway'], 'paymongo') !== false ? 'PayMongo (Sandbox)' : null),
                'sender_name' => $row['sender_name'] ?? null,
                'payment_reference' => $row['payment_reference'] ?? null,
                'proof_of_payment_path' => $row['proof_of_payment_path'] ?? null,
                // Why an admin sent the proof back — the tenant's bill page shows it.
                'proof_rejection_reason' => $row['proof_rejection_reason'] ?? null,
                'rent_period_start' => $row['rent_period_start'] ?? null,
                'payment_group' => $row['payment_group'] ?? null,
                'period_start' => $covered[0] ?? null,
                'period_end' => $covered[1] ?? null,
                'advance_months' => isset($row['advance_months']) ? (int)$row['advance_months'] : null,
                'paid_from_advance' => ($row['payment_method'] ?? '') === 'Advance credit',
                'billing_period' => $row['billing_period'] ?? null,
                'scheduled_date' => $row['scheduled_date'] ?? null,
                'scheduled_time_slot' => $row['scheduled_time_slot'] ?? null,
                'payment_gateway' => $row['payment_gateway'] ?? null,
                'last_reminder_date' => $row['last_reminder_date'] ?? null,
                'reminder_count' => (int)($row['reminder_count'] ?? 0)
            ];
        }

        $response = ["success" => true, "invoices" => $invoices];
        // Admin list only: each tenant's deposit and prepaid-rent position, read
        // from the contract, the move-in invoice and advance_credits — the
        // payments page shows these as read-only status (payments audit 2026-09-30).
        if (!$user_id_param) $response['accounts'] = tenant_billing_accounts($conn);
        echo json_encode($response);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            "success" => false, 
            "message" => "Server Error: " . $e->getMessage()
        ]);
    } finally {
        if (isset($conn)) {
            $conn->close();
        }
    }
    exit;
}

echo json_encode(["success" => false, "message" => "Invalid request method"]);
?>