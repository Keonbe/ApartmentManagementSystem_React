<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Admin-Id, X-User-Id, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config.php';

try {
    $stmt = $conn->prepare("SELECT * FROM rooms ORDER BY id");
    $stmt->execute();
    $result = $stmt->get_result();
    $rooms = $result->fetch_all(MYSQLI_ASSOC);

    // Format the response to match frontend expectations
    // The frontend expects: id, type, rent, status, tenant, lastTenant, floor, leaseStart, leaseEnd, maintenanceFlag
    $formattedRooms = array_map(function($room) {
        return [
            'id' => $room['id'],
            'type' => $room['type'],
            'floor' => $room['floor'],
            'rent' => (float) $room['monthly_rent'],
            'status' => $room['status'],
            'tenant' => $room['tenant_name'],
            'leaseStart' => $room['lease_start'],
            'leaseEnd' => $room['lease_end'],
            'lastTenant' => $room['last_tenant'],
            'maintenanceFlag' => (bool) $room['maintenance_flag']
        ];
    }, $rooms);

    echo json_encode([
        'success' => true,
        'rooms' => $formattedRooms
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
