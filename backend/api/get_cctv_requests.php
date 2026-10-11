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

require_admin($conn);

try {
    $sql = "SELECT
                c.id,
                c.id AS rawId,
                c.user_id,
                CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS tenant,
                COALESCE((SELECT ra.room_name FROM rent_applications ra
                          WHERE ra.user_id = c.user_id AND ra.status IN ('Approved', 'active', 'pending-move-out')
                          ORDER BY ra.id DESC LIMIT 1), '—') AS unit,
                c.incident_date AS incidentDate,
                c.incident_time AS time,
                c.location_details AS location,
                c.reason_request AS reason,
                c.status,
                c.created_at
            FROM cctv_requests c
            LEFT JOIN users u ON c.user_id = u.id
            ORDER BY c.id DESC";

    $res = $conn->query($sql);
    if (!$res) {
        error_log("[AMS] Database query error: " . $conn->error);
        throw new Exception("Database query error.");
    }

    $requests = [];
    while ($row = $res->fetch_assoc()) {
        $row['tenant'] = trim($row['tenant']) !== '' ? trim($row['tenant']) : 'Unknown Tenant';
        $requests[] = $row;
    }

    echo json_encode(["success" => true, "requests" => $requests]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to load CCTV requests."]);
}

$conn->close();
?>