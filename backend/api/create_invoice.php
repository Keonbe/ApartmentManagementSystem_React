<?php
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

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $input = json_decode(file_get_contents("php://input"), true);

        $unit = trim($input['unit'] ?? '');
        $tenant_name = trim($input['tenantName'] ?? 'Tenant');

        // Audit M8: negative amounts used to be accepted outright.
        foreach (['baseRent', 'water', 'electricity', 'parking', 'lateFee'] as $field) {
            if (isset($input[$field]) && $input[$field] !== '' && (!is_numeric($input[$field]) || (float)$input[$field] < 0)) {
                http_response_code(422);
                echo json_encode(["success" => false, "message" => "Amounts must be zero or a positive number."]);
                exit;
            }
        }
        $base_rent = (float)($input['baseRent'] ?? 0);
        $water = (float)($input['water'] ?? 0);
        $electricity = (float)($input['electricity'] ?? 0);
        $parking = (float)($input['parking'] ?? 0);
        $late_fee = (float)($input['lateFee'] ?? 0);

        // Audit M8: dueDate was free text, so it could be malformed or in the past.
        $due_date = !empty($input['dueDate']) ? trim($input['dueDate']) : date('Y-m-d', strtotime('+15 days'));
        $due_dt = DateTime::createFromFormat('Y-m-d', $due_date);
        if (!$due_dt || $due_dt->format('Y-m-d') !== $due_date || $due_date < date('Y-m-d')) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Due date must be a valid date (YYYY-MM-DD) that is not in the past."]);
            exit;
        }

        // Audit M8: billingPeriod was free text (e.g. "2026-9"), which never
        // matches the "September 2026" label post_invoice_charge('service') and
        // post_invoice_charge('maintenance') look invoices up by — a manual invoice in
        // that shape silently never received an accumulated charge again.
        // Accept only the canonical label produced by billing_period_label().
        $billing_period = trim($input['billingPeriod'] ?? '') ?: billing_period_label(new DateTime('now', new DateTimeZone('Asia/Manila')));
        $period_dt = DateTime::createFromFormat('!F Y', $billing_period);
        if (!$period_dt || $period_dt->format('F Y') !== $billing_period) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Billing period must be in the form \"Month YYYY\", e.g. \"September 2026\"."]);
            exit;
        }

        // rand(1000,9999) gave only 9000 ids per month; now that this endpoint
        // is insert-only (audit H8), a collision here is a genuine conflict
        // rather than something ON DUPLICATE KEY UPDATE could paper over.
        $invoice_id = !empty($input['invoiceNumber']) ? trim($input['invoiceNumber']) : ('INV-' . date('Ym') . '-' . strtoupper(bin2hex(random_bytes(4))));

        $exists = $conn->prepare("SELECT id FROM invoices WHERE id = ?");
        $exists->bind_param("s", $invoice_id);
        $exists->execute();
        if ($exists->get_result()->fetch_assoc()) {
            $exists->close();
            http_response_code(409);
            echo json_encode([
                "success" => false,
                "message" => "Invoice {$invoice_id} already exists. Use the adjustment action to change an existing invoice instead of re-issuing it."
            ]);
            exit;
        }
        $exists->close();

        // Audit M8: userId/appId weren't checked against each other, so C1's
        // move-in cascade could act on the wrong application. Resolve the
        // tenant's rent_application_id server-side from their actual active
        // tenancy instead of trusting the client's appId outright.
        $user_id = !empty($input['userId']) ? (int)$input['userId'] : null;
        if (!$user_id && !empty($unit)) {
            $lookup = $conn->prepare("SELECT user_id FROM rent_applications WHERE room_name = ? AND status IN ('Approved', 'active', 'pending-move-out') ORDER BY id DESC LIMIT 1");
            $lookup->bind_param("s", $unit);
            $lookup->execute();
            if ($row = $lookup->get_result()->fetch_assoc()) {
                $user_id = (int)$row['user_id'];
            }
            $lookup->close();
        }

        if (!$user_id) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Could not resolve a tenant for this invoice — provide userId or a unit with an active tenancy."]);
            exit;
        }

        $tenancy = get_active_tenancy($conn, $user_id);
        if (!$tenancy) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "This tenant has no active rental to bill."]);
            exit;
        }
        $rent_app_id = (int)$tenancy['id'];

        if (!empty($input['appId']) && (int)$input['appId'] !== $rent_app_id) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "The supplied application does not match this tenant's active rental."]);
            exit;
        }

        // Audit M8: nothing stopped a second rent invoice for the same tenant
        // and period.
        if ($base_rent > 0) {
            $dup = $conn->prepare("SELECT id FROM invoices WHERE user_id = ? AND billing_period = ? AND base_rent > 0 AND status != 'cancelled' LIMIT 1");
            $dup->bind_param("is", $user_id, $billing_period);
            $dup->execute();
            if ($dup_row = $dup->get_result()->fetch_assoc()) {
                $dup->close();
                http_response_code(409);
                echo json_encode(["success" => false, "message" => "A rent invoice for {$billing_period} already exists ({$dup_row['id']})."]);
                exit;
            }
            $dup->close();

            // A month the tenant already prepaid is billed by the daily sweep
            // and settled from the credit. Billing it here would charge the
            // rent again and leave the credit unused until move-out.
            foreach (advance_credits_by_month($conn, $user_id) as $period_start => $credit) {
                if ($credit['status'] === 'available' && billing_period_label(new DateTime($period_start)) === $billing_period) {
                    http_response_code(409);
                    echo json_encode(["success" => false, "message" => "Rent for {$billing_period} is already covered by this tenant's advance payment ({$credit['advance_invoice_id']}). It is billed and settled automatically."]);
                    exit;
                }
            }
        }

        // Audit H8: creation is insert-only. A fresh invoice starts with no
        // services/maintenance/security deposit — those only ever accumulate
        // via post_invoice_charge('service')/post_invoice_charge('maintenance') or the move-in
        // flow, never here.
        $total_amount = $base_rent + $water + $electricity + $parking + $late_fee;

        $stmt = $conn->prepare("INSERT INTO invoices (
            id, user_id, rent_application_id, base_rent, water, electricity, parking, late_fee, total_amount, billing_period, status, due_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())");

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
            error_log("[AMS] Failed to insert invoice: " . $stmt->error);
            throw new Exception("Failed to insert invoice.");
        }
        $stmt->close();

        // Create tenant notification if user_id is resolved
        if ($user_id) {
            $notif_title = "New Invoice Issued: {$billing_period}";
            $notif_msg = "Your billing invoice for {$billing_period} (Total: ₱" . number_format($total_amount, 2) . ") is now ready. Due date: {$due_date}.";
            create_notification($conn, $user_id, 'billing', $notif_title, $notif_msg);
        }

        // Log admin activity audit trail
        log_activity($conn, $admin_id, 'billing', 'Created Invoice',"Generated & issued invoice {$invoice_id} for {$tenant_name} (Unit {$unit}) — Total: ₱" . number_format($total_amount, 2));

        try {
            require_once __DIR__ . '/services/send_notification.php';
            $mail_row = ['id' => $invoice_id, 'billing_period' => $billing_period, 'due_date' => $due_date,
                'base_rent' => $base_rent, 'water' => $water, 'electricity' => $electricity,
                'parking' => $parking, 'services' => 0, 'maintenance' => 0, 'late_fee' => $late_fee,
                'total_amount' => $total_amount];
            dispatch_admin_action_notification($conn, $user_id, 'billing', "New Monthly Bill — {$billing_period}", null,
                email_invoice_template(notify_recipient_name($conn, $user_id), $mail_row));
        } catch (Throwable $notification_error) {
            error_log('Could not dispatch new invoice email: ' . $notification_error->getMessage());
        }

        echo json_encode([
            "success" => true,
            "message" => "Invoice {$invoice_id} created and issued successfully.",
            "invoice_id" => $invoice_id,
            "total_amount" => $total_amount
        ]);
        exit;

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => public_error_message($e)]);
        exit;
    }
}
?>
