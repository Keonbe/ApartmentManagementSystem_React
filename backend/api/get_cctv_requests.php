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

try {
    $stmt = $conn->prepare("
        SELECT 
            c.id,
            c.user_id,
            c.incident_date,
            c.incident_time,
            c.location_details,
            c.reason_request,
            c.status,
            c.created_at,
            CONCAT(u.first_name, ' ', u.last_name) AS tenant_name,
            ra.room_name
        FROM cctv_requests c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN rent_applications ra ON ra.user_id = c.user_id AND ra.status = 'Approved'
        ORDER BY c.created_at DESC
    ");
    $stmt->execute();
    $result = $stmt->get_result();
    $requests = $result->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    echo json_encode(['success' => true, 'requests' => $requests]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}

$conn->close();
?>
