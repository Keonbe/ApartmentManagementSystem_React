<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(200); 
    exit(); 
}

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
$is_admin = verify_admin($conn, $admin_id);

try {
    if ($is_admin) {
        // ADMIN VIEW: Only notification types that represent an admin action queue,
        // and only while still awaiting that action (status = 'Pending'). This excludes
        // tenant-specific notices (rent_due, overdue, billing, maintenance_update, etc.)
        // even though several of them also default to status = 'Pending'.
        $query = "SELECT * FROM notifications
                  WHERE status = 'Pending'
                  AND type IN ('rent_application', 'maintenance_request', 'cctv_request', 'parking_reservation', 'service_request', 'inquiry', 'occupancy_request', 'lease_extension_request')
                  ORDER BY created_at DESC
                  LIMIT 100";
        $stmt = $conn->prepare($query);
    } else {
        // TENANT VIEW: Only fetch notifications meant for this specific tenant
        $user_id = $_GET['userId'] ?? 0;
        $query = "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50";
        $stmt = $conn->prepare($query);
        $stmt->bind_param("i", $user_id);
    }

    $stmt->execute();
    $result = $stmt->get_result();
    
    $notifications = [];
    while ($row = $result->fetch_assoc()) {
        $notifications[] = $row;
    }
    $stmt->close();

    echo json_encode(["success" => true, "notifications" => $notifications]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>