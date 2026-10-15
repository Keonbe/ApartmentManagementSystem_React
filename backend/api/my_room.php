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

expire_lapsed_contracts($conn);

// A non-admin caller may only ever read their own room — ?userId=/?email=
// are honoured only for a genuinely authenticated admin (e.g. the contract
// preview in ViewContract.jsx, opened from AdminContracts.jsx). Anyone else
// passing a different id/email is redirected back to their own.
$auth = require_user($conn);
$is_admin = $auth['role'] === 'admin';

$user_id = $auth['id'];
if ($is_admin) {
    $requested_id = $_GET['userId'] ?? null;
    if (!empty($requested_id)) {
        $user_id = $requested_id;
    } elseif (!empty($_GET['email'])) {
        $u_stmt = $conn->prepare("SELECT id FROM users WHERE email_address = ? LIMIT 1");
        $u_stmt->bind_param("s", $_GET['email']);
        $u_stmt->execute();
        $u_res = $u_stmt->get_result();
        if ($u_row = $u_res->fetch_assoc()) {
            $user_id = $u_row['id'];
        }
        $u_stmt->close();
    }
}

$stmt = $conn->prepare("SELECT ra.id, ra.first_name, ra.middle_name, ra.last_name, ra.suffix, ra.contact_no, ra.gender, ra.email, ra.room_name, ra.monthly_rent, ra.months_of_rent, ra.status, ra.created_at, ra.occupants, ra.rejection_reason, ra.rejection_attachment_path, ra.preferred_move_in_date, ra.move_in_date, ra.move_in_notified_at, ra.requested_move_out_date, lc.lease_start, lc.lease_end, lc.status AS contract_status, lc.id as contract_id, lc.signed_lease_path, lc.notarized_lease_path FROM rent_applications ra LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id WHERE ra.user_id = ? ORDER BY ra.created_at DESC LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows > 0) {
    $room_data = $result->fetch_assoc();
    $app_id = $room_data['id'];
    
    // Check if there is a pending move-in invoice (security_deposit > 0) for this application
    $inv_stmt = $conn->prepare("SELECT id, status, payment_method, base_rent, security_deposit, total_amount FROM invoices WHERE rent_application_id = ? AND status IN ('pending', 'pending-verification') AND security_deposit > 0 LIMIT 1");
    $inv_stmt->bind_param("i", $app_id);
    $inv_stmt->execute();
    $inv_res = $inv_stmt->get_result();
    
    $room_data['has_pending_first_payment'] = false;
    $room_data['pending_invoice_id'] = null;
    $room_data['pending_invoice_status'] = null;
    $room_data['pending_payment_method'] = null;
    $room_data['pending_base_rent'] = null;
    $room_data['pending_security_deposit'] = null;
    $room_data['pending_total_amount'] = null;
    $room_data['initial_payment_paid'] = false;
    
    $is_inactive_app = in_array(strtolower($room_data['status'] ?? ''), ['cancelled', 'rejected', 'declined', 'moved-out', 'archived'], true);

    if (!$is_inactive_app && $inv_res->num_rows > 0) {
        $inv_row = $inv_res->fetch_assoc();
        $room_data['has_pending_first_payment'] = true;
        $room_data['pending_invoice_id'] = $inv_row['id'];
        $room_data['pending_invoice_status'] = $inv_row['status'];
        $room_data['pending_payment_method'] = $inv_row['payment_method'];
        $room_data['pending_base_rent'] = $inv_row['base_rent'];
        $room_data['pending_security_deposit'] = $inv_row['security_deposit'];
        $room_data['pending_total_amount'] = $inv_row['total_amount'];
    }
    $inv_stmt->close();
    $paid_stmt = $conn->prepare("SELECT 1 FROM invoices WHERE rent_application_id = ? AND security_deposit > 0 AND status = 'paid' LIMIT 1");
    $paid_stmt->bind_param("i", $app_id);
    $paid_stmt->execute();
    $room_data['initial_payment_paid'] = (bool)$paid_stmt->get_result()->fetch_assoc();
    $paid_stmt->close();
    
    // Whether the rent can be extended right now, and why not (config.php
    // extension_block_reason(): scheduled move-out, contract state, overdue
    // bills, months-ahead limit). minMonths/maxMonths are the months a request
    // may ask for (config.php extension_month_range()).
    $room_data['extension'] = null;
    if (in_array($room_data['status'], ['active', 'pending-move-out'], true)) {
        $contract = $room_data['contract_id'] ? ['status' => $room_data['contract_status'], 'lease_end' => $room_data['lease_end']] : null;
        $reason = extension_block_reason($conn, $room_data + ['user_id' => $user_id], $contract, 0);
        $range = extension_month_range($conn, $contract['lease_end'] ?? null);
        if ($reason === null && $range['max'] < 1) {
            $reason = rent_end_ahead_error($conn, date('Y-m-d', strtotime($contract['lease_end'] . ' +1 month')));
        }
        $overdue = tenant_overdue_summary($conn, (int)$user_id);
        $room_data['extension'] = [
            'allowed' => $reason === null,
            'reason' => $reason,
            'overdueTotal' => $overdue['total'],
            'maxMonthsAhead' => max_rent_ahead_months($conn),
            'minMonths' => $range['min'],
            'maxMonths' => $range['max'],
        ];
    }

    echo json_encode(["success" => true, "data" => $room_data]);
} else {
    echo json_encode(["success" => false, "message" => "No room application found for this user."]);
}

$stmt->close();
$conn->close();
?>
