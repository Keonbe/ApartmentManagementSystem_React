<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

// Tenant merges their open standalone utility bill into their monthly rent invoice
// so they can pay both together in one transaction on Pay Bills.
$auth = require_user($conn);
$user_id = (int)$auth['id'];

// Check if tenant self-payment is enabled
$self_pay_row = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'utility_allow_tenant_self_pay'")->fetch_assoc();
if (($self_pay_row['setting_value'] ?? '1') === '0') {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Tenant self-payment for utilities is disabled. Please settle directly with property management."]);
    exit;
}

$input = read_json_input();
$reading_id = (int)($input['reading_id'] ?? 0);

if ($reading_id <= 0) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Reading ID is required."]);
    exit;
}

$conn->begin_transaction();
try {
    // 1. Fetch reading and its current invoice
    $stmt = $conn->prepare("SELECT ur.*, inv.status AS invoice_status, inv.base_rent AS invoice_base_rent, inv.total_amount AS invoice_total
                            FROM utility_readings ur
                            LEFT JOIN invoices inv ON inv.id = ur.invoice_id
                            WHERE ur.id = ? AND ur.user_id = ? FOR UPDATE");
    $stmt->bind_param("ii", $reading_id, $user_id);
    $stmt->execute();
    $reading = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$reading) {
        throw new Exception("Utility reading not found.");
    }
    if (!$reading['is_invoiced'] || empty($reading['invoice_id'])) {
        throw new Exception("This reading has not been invoiced yet.");
    }
    if (in_array($reading['invoice_status'], ['paid', 'pending-verification', 'processing', 'scheduled'], true)) {
        throw new Exception("This utility bill is already paid or awaiting payment confirmation.");
    }
    if ((float)($reading['invoice_base_rent'] ?? 0) > 0) {
        throw new Exception("This utility bill is already merged with your rent invoice.");
    }

    $old_invoice_id = $reading['invoice_id'];
    $period = $reading['billing_period'];
    $label = is_valid_utility_period($period) ? utility_period_label($period) : $period;

    // 2. Find open rent invoice for this user & billing period
    $open_statuses = "('" . implode("','", SERVICE_ADJUSTABLE_INVOICE_STATUSES) . "')";
    $rent_stmt = $conn->prepare("SELECT id, base_rent, water, electricity, services, total_amount
                                 FROM invoices
                                 WHERE user_id = ? AND billing_period IN (?, ?) AND base_rent > 0
                                   AND status IN $open_statuses AND payment_group IS NULL
                                 ORDER BY created_at DESC LIMIT 1 FOR UPDATE");
    $rent_stmt->bind_param("iss", $user_id, $label, $period);
    $rent_stmt->execute();
    $rent_inv = $rent_stmt->get_result()->fetch_assoc();
    $rent_stmt->close();

    if (!$rent_inv) {
        throw new Exception("No open rent invoice found for {$label} to merge with. You can pay this utility bill separately.");
    }

    $target_rent_id = $rent_inv['id'];

    // 3. Compute utility amounts
    $water_amt = (float)$reading['water_amount'] + (float)$reading['water_other_fees'];
    $electric_amt = (float)$reading['electric_amount'] + (float)$reading['electric_other_fees'];

    // Extra utility types
    $extra_stmt = $conn->prepare("SELECT COALESCE(SUM(amount + other_fees), 0) AS extra_total FROM utility_reading_items WHERE reading_id = ?");
    $extra_stmt->bind_param("i", $reading_id);
    $extra_stmt->execute();
    $extra_row = $extra_stmt->get_result()->fetch_assoc();
    $extra_stmt->close();
    $extra_amt = (float)($extra_row['extra_total'] ?? 0);

    $total_utility_charge = round($water_amt + $electric_amt + $extra_amt, 2);

    // 4. Update the rent invoice: add water, electricity, extra services, and total_amount
    $new_water = round((float)$rent_inv['water'] + $water_amt, 2);
    $new_electric = round((float)$rent_inv['electricity'] + $electric_amt, 2);
    $new_services = round((float)$rent_inv['services'] + $extra_amt, 2);
    $new_total = round((float)$rent_inv['total_amount'] + $total_utility_charge, 2);

    $upd_rent = $conn->prepare("UPDATE invoices SET water = ?, electricity = ?, services = ?, total_amount = ? WHERE id = ?");
    $upd_rent->bind_param("dddds", $new_water, $new_electric, $new_services, $new_total, $target_rent_id);
    $upd_rent->execute();
    $upd_rent->close();

    // 5. Update utility_readings to point to the rent invoice
    $upd_ur = $conn->prepare("UPDATE utility_readings SET invoice_id = ? WHERE id = ?");
    $upd_ur->bind_param("si", $target_rent_id, $reading_id);
    $upd_ur->execute();
    $upd_ur->close();

    // 6. Cancel the standalone utility invoice
    $cancel_stmt = $conn->prepare("UPDATE invoices SET status = 'cancelled', cancel_reason = 'Merged with rent invoice by tenant' WHERE id = ?");
    $cancel_stmt->bind_param("s", $old_invoice_id);
    $cancel_stmt->execute();
    $cancel_stmt->close();

    create_notification($conn, $user_id, 'billing', "Utility Charges Merged with Rent",
        "Your {$label} utility charges (₱" . number_format($total_utility_charge, 2) . ") were combined into rent invoice {$target_rent_id}. You can now pay both together.");

    log_activity($conn, $user_id, 'billing', 'Merged Utility with Rent',
        "Merged utility reading #{$reading_id} into rent invoice {$target_rent_id} (₱" . number_format($total_utility_charge, 2) . ")");

    $conn->commit();
    echo json_encode([
        "success" => true,
        "message" => "Utility charges successfully combined with rent invoice {$target_rent_id}.",
        "target_invoice_id" => $target_rent_id,
        "rent_invoice_id" => $target_rent_id,
        "merged" => true
    ]);
} catch (Throwable $e) {
    $conn->rollback();
    http_response_code(422);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}
$conn->close();
