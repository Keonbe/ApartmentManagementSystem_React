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
                p.id,
                p.id AS rawId,
                p.user_id,
                CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS tenant,
                COALESCE(ra.room_name, '—') AS unit,
                p.vehicle_type AS vehicleType,
                p.vehicle_model AS vehicleModel,
                p.plate_number AS plateNumber,
                p.transmission,
                p.duration_months AS durationMonths,
                p.total_cost AS totalCost,
                p.status,
                p.document_path AS documentPath,
                p.created_at
            FROM parking_reservations p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN rent_applications ra ON ra.user_id = p.user_id AND ra.status = 'Approved'
            ORDER BY p.id DESC";

    $res = $conn->query($sql);
    if (!$res) {
        throw new Exception("Database query error: " . $conn->error);
    }

    $reservations = [];
    while ($row = $res->fetch_assoc()) {
        $row['tenant'] = trim($row['tenant']) !== '' ? trim($row['tenant']) : 'Unknown Tenant';
        $reservations[] = $row;
    }

    echo json_encode(["success" => true, "reservations" => $reservations]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>