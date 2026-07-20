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
        // ADMIN VIEW: Exclude tenant-facing confirmation receipts ('Resolved' or 'Request Approved/Declined')
        $query = "SELECT * FROM notifications 
                  WHERE status != 'Resolved' 
                  AND title NOT IN ('Request Approved', 'Request Declined')
                  ORDER BY CASE WHEN status = 'Pending' THEN 1 ELSE 2 END, created_at DESC 
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