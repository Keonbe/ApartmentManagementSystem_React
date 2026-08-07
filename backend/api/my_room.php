<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$user_id = $_GET['userId'] ?? $_SERVER['HTTP_X_USER_ID'] ?? null;

if (empty($user_id)) {
    echo json_encode(["success" => false, "message" => "User ID is required."]);
    exit;
}

$stmt = $conn->prepare("SELECT ra.id, ra.room_name, ra.monthly_rent, ra.months_of_rent, ra.status, ra.created_at, ra.occupants, ra.rejection_reason, lc.lease_start, lc.lease_end, lc.id as contract_id, lc.signed_lease_path, lc.notarized_lease_path FROM rent_applications ra LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id WHERE ra.user_id = ? ORDER BY ra.created_at DESC LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows > 0) {
    $room_data = $result->fetch_assoc();
    $app_id = $room_data['id'];
    
    // Check if there is a pending invoice for this application
    $inv_stmt = $conn->prepare("SELECT id, status, payment_method, base_rent, security_deposit, total_amount FROM invoices WHERE rent_application_id = ? AND status IN ('pending', 'pending-verification') LIMIT 1");
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
    
    if ($inv_res->num_rows > 0) {
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
    
    echo json_encode(["success" => true, "data" => $room_data]);
} else {
    echo json_encode(["success" => false, "message" => "No room application found for this user."]);
}

$stmt->close();
$conn->close();
?>