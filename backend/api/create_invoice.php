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

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

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
        $invoice_id = !empty($input['invoiceNumber']) ? trim($input['invoiceNumber']) : ('INV-' . date('Ym') . '-' . rand(1000, 9999));

        $total_amount = $base_rent + $water + $electricity + $parking + $late_fee;

        // If user_id wasn't provided directly, look it up by unit / active application
        $rent_app_id = !empty($input['appId']) ? (int)$input['appId'] : null;
        if (!$user_id && !empty($unit)) {
            $lookup = $conn->prepare("
                SELECT ra.user_id, ra.id 
                FROM rent_applications ra 
                WHERE ra.room_name = ? 
                  AND ra.status IN ('Approved', 'pending-move-out')
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
            id, user_id, rent_application_id, base_rent, water, electricity, parking, total_amount, billing_period, status, due_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())
        ON DUPLICATE KEY UPDATE 
            base_rent = VALUES(base_rent),
            water = VALUES(water),
            electricity = VALUES(electricity),
            parking = VALUES(parking),
            total_amount = VALUES(total_amount),
            billing_period = VALUES(billing_period),
            due_date = VALUES(due_date)");

        $stmt->bind_param(
            "siiddddsss",
            $invoice_id,
            $user_id,
            $rent_app_id,
            $base_rent,
            $water,
            $electricity,
            $parking,
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
