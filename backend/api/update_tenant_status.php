<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, X-User-Id");

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
            // Get application details to update the room
            $app_stmt = $conn->prepare("SELECT first_name, last_name, room_name, months_of_rent FROM rent_applications WHERE id = ?");
            $app_stmt->bind_param("i", $id);
            $app_stmt->execute();
            $app_res = $app_stmt->get_result();
            if ($app_res->num_rows > 0) {
                $app = $app_res->fetch_assoc();
                $tenant_name = $app['first_name'] . ' ' . $app['last_name'];
                $room_name = $app['room_name'];
                $months = (int)$app['months_of_rent'];
                
                $lease_start = date('Y-m-d');
                $lease_end = date('Y-m-d', strtotime("+$months months"));
                $room_status = 'occupied';
                
                $room_stmt = $conn->prepare("UPDATE rooms SET status = ?, tenant_name = ?, lease_start = ?, lease_end = ? WHERE id = ?");
                $room_stmt->bind_param("sssss", $room_status, $tenant_name, $lease_start, $lease_end, $room_name);
                $room_stmt->execute();
                $room_stmt->close();
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