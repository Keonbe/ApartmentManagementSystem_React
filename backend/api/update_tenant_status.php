<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['id'] ?? 0;
$status = $input['status'] ?? '';

if ($id > 0 && !empty($status)) {
    // Start transaction to ensure data integrity
    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("UPDATE rent_applications SET status = ? WHERE id = ?");
        $stmt->bind_param("si", $status, $id);
        $stmt->execute();
        
        if ($status === 'Approved') {
            // Get application details to update the room and generate invoice
            $app_stmt = $conn->prepare("SELECT first_name, last_name, room_name, months_of_rent, user_id, monthly_rent, occupants FROM rent_applications WHERE id = ?");
            $app_stmt->bind_param("i", $id);
            $app_stmt->execute();
            $app_res = $app_stmt->get_result();
            if ($app_res->num_rows > 0) {
                $app = $app_res->fetch_assoc();
                $tenant_name = $app['first_name'] . ' ' . $app['last_name'];
                $room_name = $app['room_name'];
                $months = (int)$app['months_of_rent'];
                $user_id = $app['user_id'];
                $monthly_rent = (double)$app['monthly_rent'];
                
                $lease_start = date('Y-m-d');
                $lease_end = date('Y-m-d', strtotime("+$months months"));
                $room_status = 'occupied';
                
                $room_stmt = $conn->prepare("UPDATE rooms SET status = ?, tenant_name = ?, lease_start = ?, lease_end = ?, occupants = ? WHERE id = ?");
                $room_stmt->bind_param("ssssis", $room_status, $tenant_name, $lease_start, $lease_end, $app['occupants'], $room_name);
                $room_stmt->execute();
                $room_stmt->close();

                // Check if invoice already exists for this application
                $check_inv = $conn->prepare("SELECT id FROM invoices WHERE rent_application_id = ?");
                $check_inv->bind_param("i", $id);
                $check_inv->execute();
                $check_res = $check_inv->get_result();
                if ($check_res->num_rows === 0) {
                    $invoice_id = 'INV-' . uniqid();
                    $billing_period = date('F Y');
                    $due_date = date('Y-m-d', strtotime('+7 days'));
                    $total_amount = $monthly_rent * 2;
                    
                    $inv_stmt = $conn->prepare("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, security_deposit, total_amount, billing_period, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)");
                    $inv_stmt->bind_param("siidddss", $invoice_id, $user_id, $id, $monthly_rent, $monthly_rent, $total_amount, $billing_period, $due_date);
                    $inv_stmt->execute();
                    $inv_stmt->close();
                }
                $check_inv->close();
            }
            $app_stmt->close();
        }

        $conn->commit();
        
        log_activity($conn, $admin_id, 'tenant', "Updated Tenant Status", "Application ID: $id, New Status: $status");
        echo json_encode(["success" => true]);
        
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
}
$conn->close();
?>