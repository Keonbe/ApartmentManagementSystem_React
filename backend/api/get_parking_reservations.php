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
            p.id,
            p.user_id,
            p.vehicle_type,
            p.vehicle_model,
            p.plate_number,
            p.status,
            p.transmission,
            p.duration_months,
            p.total_cost,
            p.document_path,
            p.created_at,
            CONCAT(u.first_name, ' ', u.last_name) AS tenant_name,
            ra.room_name
        FROM parking_reservations p
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN rent_applications ra ON ra.user_id = p.user_id AND ra.status = 'Approved'
        ORDER BY p.created_at DESC
    ");
    $stmt->execute();
    $result = $stmt->get_result();
    $reservations = $result->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    echo json_encode(['success' => true, 'reservations' => $reservations]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}

$conn->close();
?>
