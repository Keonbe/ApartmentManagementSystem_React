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
    $sql = "SELECT 
                c.id,
                c.id AS rawId,
                c.user_id,
                CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS tenant,
                COALESCE(ra.room_name, '—') AS unit,
                c.incident_date AS incidentDate,
                c.incident_time AS time,
                c.location_details AS location,
                c.reason_request AS reason,
                c.status,
                c.created_at
            FROM cctv_requests c
            LEFT JOIN users u ON c.user_id = u.id
            LEFT JOIN rent_applications ra ON ra.user_id = c.user_id AND ra.status IN ('Approved', 'active', 'pending-move-out')
            ORDER BY c.id DESC";

    $res = $conn->query($sql);
    if (!$res) {
        throw new Exception("Database query error: " . $conn->error);
    }

    $requests = [];
    while ($row = $res->fetch_assoc()) {
        $row['tenant'] = trim($row['tenant']) !== '' ? trim($row['tenant']) : 'Unknown Tenant';
        $requests[] = $row;
    }

    echo json_encode(["success" => true, "requests" => $requests]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>