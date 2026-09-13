<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, X-User-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

$admin_id = require_admin($conn);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $input = json_decode(file_get_contents("php://input"), true);
        
        $user_id = !empty($input['userId']) ? (int)$input['userId'] : null;
        $unit = trim($input['unit'] ?? '');
        $tenant_name = trim($input['tenantName'] ?? 'Tenant');
        $base_rent = (float)($input['baseRent'] ?? 0);
        $water = (float)($input['water'] ?? 0);
        $electricity = (float)($input['electricity'] ?? 0);
        $parking = (float)($input['parking'] ?? 0);
        $late_fee = (float)($input['lateFee'] ?? 0);
        $due_date = !empty($input['dueDate']) ? $input['dueDate'] : date('Y-m-d', strtotime('+15 days'));
        $billing_period = trim($input['billingPeriod'] ?? date('Y-m'));
        // rand(1000,9999) gave only 9000 ids per month, and the statement below
        // uses ON DUPLICATE KEY UPDATE — so a collision silently rewrote an
        // existing invoice's amounts instead of failing.
        $invoice_id = !empty($input['invoiceNumber']) ? trim($input['invoiceNumber']) : ('INV-' . date('Ym') . '-' . strtoupper(bin2hex(random_bytes(4))));

        // Re-issuing an existing invoice must not drop service charges already
        // posted onto it by post_service_charge(), nor the move-in security
        // deposit, since the UPDATE below rewrites total_amount wholesale.
        $existing_services = 0.00;
        $existing_deposit = 0.00;
        $svc_lookup = $conn->prepare("SELECT services, security_deposit, status FROM invoices WHERE id = ?");
        $svc_lookup->bind_param("s", $invoice_id);
        $svc_lookup->execute();
        if ($svc_row = $svc_lookup->get_result()->fetch_assoc()) {
            $existing_services = (float)$svc_row['services'];
            $existing_deposit = (float)$svc_row['security_deposit'];

            // Re-issuing over a settled or cancelled invoice would rewrite what
            // the tenant already paid, with no record of the original amounts.
            if (in_array($svc_row['status'], ['paid', 'cancelled'], true)) {
                http_response_code(409);
                echo json_encode([
                    "success" => false,
                    "message" => "Invoice {$invoice_id} is already {$svc_row['status']} and cannot be re-issued. Create a new invoice instead."
                ]);
                exit;
            }
        }
        $svc_lookup->close();

        $total_amount = $base_rent + $water + $electricity + $parking + $late_fee + $existing_services + $existing_deposit;

        // If user_id wasn't provided directly, look it up by unit / active application
        $rent_app_id = !empty($input['appId']) ? (int)$input['appId'] : null;
        if (!$user_id && !empty($unit)) {
            $lookup = $conn->prepare("
                SELECT ra.user_id, ra.id 
                FROM rent_applications ra 
                WHERE ra.room_name = ? 
                  AND ra.status IN ('Approved', 'active', 'pending-move-out')
                  AND NOT EXISTS (
                      SELECT 1 FROM invoices i 
                      WHERE i.rent_application_id = ra.id 
                        AND i.status IN ('pending', 'pending-verification')
                        AND i.security_deposit > 0
                  )
                ORDER BY ra.id DESC LIMIT 1");
            $lookup->bind_param("s", $unit);
            $lookup->execute();
            if ($row = $lookup->get_result()->fetch_assoc()) {
                $user_id = (int)$row['user_id'];
                if (!$rent_app_id) {
                    $rent_app_id = (int)$row['id'];
                }
            }
            $lookup->close();
        }

        // Insert invoice record
        $stmt = $conn->prepare("INSERT INTO invoices (
            id, user_id, rent_application_id, base_rent, water, electricity, parking, late_fee, total_amount, billing_period, status, due_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())
        ON DUPLICATE KEY UPDATE
            base_rent = VALUES(base_rent),
            water = VALUES(water),
            electricity = VALUES(electricity),
            parking = VALUES(parking),
            late_fee = VALUES(late_fee),
            total_amount = VALUES(total_amount),
            billing_period = VALUES(billing_period),
            due_date = VALUES(due_date)");

        $stmt->bind_param(
            "siiddddddss",
            $invoice_id,
            $user_id,
            $rent_app_id,
            $base_rent,
            $water,
            $electricity,
            $parking,
            $late_fee,
            $total_amount,
            $billing_period,
            $due_date
        );

        if (!$stmt->execute()) {
            throw new Exception("Failed to insert invoice: " . $stmt->error);
        }
        $stmt->close();

        // Create tenant notification if user_id is resolved
        if ($user_id) {
            $notif_title = "New Invoice Issued: {$billing_period}";
            $notif_msg = "Your billing invoice for {$billing_period} (Total: ₱" . number_format($total_amount, 2) . ") is now ready. Due date: {$due_date}.";
            $notif_stmt = $conn->prepare("INSERT INTO notifications (user_id, title, message, type, is_read, created_at) VALUES (?, ?, ?, 'billing', 0, NOW())");
            $notif_stmt->bind_param("iss", $user_id, $notif_title, $notif_msg);
            $notif_stmt->execute();
            $notif_stmt->close();
        }

        // Log admin activity audit trail
        log_activity($conn, $admin_id, 'invoice', 'create', "Generated & issued invoice {$invoice_id} for {$tenant_name} (Unit {$unit}) — Total: ₱" . number_format($total_amount, 2));

        echo json_encode([
            "success" => true,
            "message" => "Invoice {$invoice_id} created and issued successfully.",
            "invoice_id" => $invoice_id,
            "total_amount" => $total_amount
        ]);
        exit;

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
        exit;
    }
}
?>
