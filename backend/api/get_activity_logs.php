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

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

// Added 'AS' aliases to match the object keys your React map() function expects
$query = "SELECT 
            a.id,
            a.action,
            a.created_at,
            a.category AS entity_type,
            a.performed_by AS admin_id,
            a.id AS entity_id,
            u.first_name, 
            u.last_name 
          FROM activity_logs a 
          LEFT JOIN users u ON a.performed_by = u.id 
          ORDER BY a.created_at DESC LIMIT 100";

$result = $conn->query($query);
$logs = [];

if ($result) {
    while ($row = $result->fetch_assoc()) {
        $logs[] = $row;
    }
}

echo json_encode(["success" => true, "logs" => $logs]);
$conn->close();
?>