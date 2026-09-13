<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $input = json_decode(file_get_contents("php://input"), true);
        $invoice_id = $input['invoiceId'] ?? '';
        $payment_method = $input['paymentMethod'] ?? 'Cash';
        // Checklist 3.2 calls for amount and reference to be recorded; both
        // were previously discarded, so every admin-recorded payment was
        // assumed to settle the full total with no reference kept.
        $payment_reference = trim($input['paymentReference'] ?? '') ?: null;
        $amount_paid = isset($input['amountPaid']) && $input['amountPaid'] !== '' ? (float)$input['amountPaid'] : null;

        if (empty($invoice_id)) {
            echo json_encode(["success" => false, "message" => "Invalid target invoice parameter."]);
            exit;
        }

        $conn->begin_transaction();

        // This system settles invoices in full — there is no partial-payment
        // ledger — so a short payment must be rejected rather than silently
        // recorded as fully paid.
        if ($amount_paid !== null) {
            $due_q = $conn->prepare("SELECT total_amount FROM invoices WHERE id = ?");
            $due_q->bind_param("s", $invoice_id);
            $due_q->execute();
            $due_row = $due_q->get_result()->fetch_assoc();
            $due_q->close();
            if ($due_row && $amount_paid + 0.009 < (float)$due_row['total_amount']) {
                throw new Exception("Amount tendered (₱" . number_format($amount_paid, 2) . ") is less than the invoice total (₱" . number_format((float)$due_row['total_amount'], 2) . "). Partial payments are not supported.");
            }
        }

        // Only a still-payable invoice can be settled — without this guard,
        // a bogus/already-settled invoice id still returned {"success":true}
        // and a replayed call could re-run the whole activation cascade below.
        // The open-status set includes 'scheduled'/'processing'/'payment-failed'
        // so an in-person booking or a failed online attempt can still be
        // settled at the desk.
        $stmt = $conn->prepare("UPDATE invoices SET status = 'paid', payment_method = ?, payment_reference = COALESCE(?, payment_reference), paid_at = NOW() WHERE id = ? AND status IN " . billing_open_status_sql());
        $stmt->bind_param("sss", $payment_method, $payment_reference, $invoice_id);
        $stmt->execute();
        if ($stmt->affected_rows === 0) {
            throw new Exception("Invoice not found or already settled.");
        }
        $stmt->close();

        // Check if invoice belongs to a rent application to activate occupancy & contract
        $inv_q = $conn->prepare("SELECT user_id, rent_application_id FROM invoices WHERE id = ?");
        $inv_q->bind_param("s", $invoice_id);
        $inv_q->execute();
        $inv_res = $inv_q->get_result()->fetch_assoc();
        $inv_q->close();

        if ($inv_res && !empty($inv_res['rent_application_id'])) {
            $app_id = (int)$inv_res['rent_application_id'];
            $app_q = $conn->prepare("SELECT first_name, last_name, room_name, months_of_rent, monthly_rent, occupants FROM rent_applications WHERE id = ?");
            $app_q->bind_param("i", $app_id);
            $app_q->execute();
            $app_data = $app_q->get_result()->fetch_assoc();
            $app_q->close();

            if ($app_data) {
                $tenant_name = $app_data['first_name'] . ' ' . $app_data['last_name'];
                $room_name = $app_data['room_name'];
                $months = (int)$app_data['months_of_rent'];
                $monthly_rent = (double)$app_data['monthly_rent'];
                $occupants = (int)$app_data['occupants'];
                $lease_start = date('Y-m-d');
                $lease_end = date('Y-m-d', strtotime("+$months months"));

                // Activate room occupancy
                $room_stmt = $conn->prepare("UPDATE rooms SET status = 'occupied', tenant_name = ?, lease_start = ?, lease_end = ?, occupants = ? WHERE id = ?");
                $room_stmt->bind_param("sssis", $tenant_name, $lease_start, $lease_end, $occupants, $room_name);
                $room_stmt->execute();
                $room_stmt->close();
                
                // Activate rent application
                $app_activate = $conn->prepare("UPDATE rent_applications SET status = 'active' WHERE id = ? AND status = 'Approved'");
                $app_activate->bind_param("i", $app_id);
                $app_activate->execute();
                $app_activate->close();

                // Ensure lease contract is registered
                $ctr_check = $conn->prepare("SELECT id FROM lease_contracts WHERE rent_application_id = ?");
                $ctr_check->bind_param("i", $app_id);
                $ctr_check->execute();
                $ctr_res = $ctr_check->get_result();
                if ($ctr_res->num_rows === 0) {
                    $contract_id = 'CTR-' . uniqid();
                    $ctr_stmt = $conn->prepare("INSERT INTO lease_contracts (id, rent_application_id, deposit_amount, lease_start, lease_end, status) VALUES (?, ?, ?, ?, ?, 'active')");
                    $ctr_stmt->bind_param("sidss", $contract_id, $app_id, $monthly_rent, $lease_start, $lease_end);
                    $ctr_stmt->execute();
                    $ctr_stmt->close();
                } else {
                    // Only promote a contract that's still in a "not yet
                    // fully active" state (draft, or lapsed and now
                    // resuming). A contract in 'eviction-pending' must not
                    // be silently reactivated to plain 'active' just because
                    // a payment landed — that would clear the eviction flag
                    // as a side effect instead of an explicit admin action.
                    $ctr_upd = $conn->prepare("UPDATE lease_contracts SET status = 'active' WHERE rent_application_id = ? AND status IN ('draft', 'expired')");
                    $ctr_upd->bind_param("i", $app_id);
                    $ctr_upd->execute();
                    $ctr_upd->close();
                }
                $ctr_check->close();
            }
        }

        $conn->commit();
        log_activity($conn, $admin_id, 'payment', "Approved Verification Pipeline", "Invoice ID: $invoice_id settled via $payment_method");
        echo json_encode(["success" => true, "message" => "Payment successfully finalized and saved."]);
    } catch (Exception $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Server Error: " . $e->getMessage()]);
    }
    
    $conn->close();
    exit;
}

echo json_encode(["success" => false, "message" => "Invalid request method."]);
?>