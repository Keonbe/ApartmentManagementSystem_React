<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config.php';

// Release lapsed unit reservations before listing, so a hold that expired
// frees the unit for browsing visitors without needing an admin present.
release_expired_reservations($conn);

try {
    $stmt = $conn->prepare("SELECT * FROM rooms ORDER BY id");
    $stmt->execute();
    $result = $stmt->get_result();
    $rooms = $result->fetch_all(MYSQLI_ASSOC);

    // Format the response to match frontend expectations
    // The frontend expects: id, type, rent, status, tenant, lastTenant, floor, leaseStart, leaseEnd, maintenanceFlag
    $formattedRooms = array_map(function($room) use ($conn) {
        $roomId = $room['id'];
        
        // Fetch real maintenance requests associated with this room's applicants
        $m_stmt = $conn->prepare("
            SELECT m.issue_category as issue, m.status, m.estimated_cost as cost, DATE(m.created_at) as date
            FROM maintenance_requests m
            JOIN users u ON m.user_id = u.id
            JOIN rent_applications ra ON u.id = ra.user_id
            WHERE ra.room_name = ?
            ORDER BY m.created_at DESC
        ");
        $m_stmt->bind_param("s", $roomId);
        $m_stmt->execute();
        $m_res = $m_stmt->get_result();
        $maintHistory = [];
        while ($row = $m_res->fetch_assoc()) {
            $maintHistory[] = [
                'issue' => $row['issue'],
                'status' => $row['status'],
                'cost' => $row['cost'] ? (float)$row['cost'] : 0.0,
                'date' => $row['date']
            ];
        }
        $m_stmt->close();

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
            'maintenanceFlag' => (bool) $room['maintenance_flag'],
            'occupants' => (int) ($room['occupants'] ?? 0),
            'roomCondition' => $room['room_condition'] ?? 'Good',
            'furnishingStatus' => $room['furnishing_status'] ?? 'Unfurnished',
            'lastInspectionDate' => $room['last_inspection_date'],
            'maintenanceHistory' => $maintHistory
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
