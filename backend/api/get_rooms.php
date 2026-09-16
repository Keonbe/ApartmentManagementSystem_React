<?php
require_once __DIR__ . '/../cors.php';
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
            WHERE m.room_name = ?
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

        // Every tenant who has ever occupied this unit (current + past),
        // backing the "Occupancy History" tab which used to be hardcoded []
        // regardless of what data existed.
        $occ_stmt = $conn->prepare("
            SELECT ra.first_name, ra.last_name, ra.status, ra.monthly_rent, ra.archive_reason,
                   lc.lease_start, lc.lease_end
            FROM rent_applications ra
            LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id
            WHERE ra.room_name = ? AND ra.status IN ('Approved', 'active', 'pending-move-out', 'moved-out', 'archived')
            ORDER BY ra.created_at ASC
        ");
        $occ_stmt->bind_param("s", $roomId);
        $occ_stmt->execute();
        $occ_res = $occ_stmt->get_result();
        $occupancyHistory = [];
        while ($row = $occ_res->fetch_assoc()) {
            $tenantFullName = trim($row['first_name'] . ' ' . $row['last_name']);
            $isCurrent = in_array($row['status'], ['Approved', 'active', 'pending-move-out'], true) && $room['tenant_name'] === $tenantFullName;
            $occupancyHistory[] = [
                'tenant' => $tenantFullName,
                'status' => $isCurrent ? 'current' : 'ended',
                'leaseStart' => $row['lease_start'],
                'leaseEnd' => $row['lease_end'],
                'rent' => (float) $row['monthly_rent'],
                'moveOutReason' => $row['archive_reason'] ?: null
            ];
        }
        $occ_stmt->close();

        // Lease-extension events recorded for this unit's applications,
        // backing the "Lease History" tab (and the "Previous Extensions"
        // list) which used to be hardcoded [] regardless of what data existed.
        $lh_stmt = $conn->prepare("
            SELECT lr.added_months, lr.previous_lease_end, lr.new_lease_end, lr.created_at
            FROM lease_renewals lr
            JOIN lease_contracts lc ON lc.id = lr.contract_id
            JOIN rent_applications ra ON ra.id = lc.rent_application_id
            WHERE ra.room_name = ?
            ORDER BY lr.created_at ASC
        ");
        $lh_stmt->bind_param("s", $roomId);
        $lh_stmt->execute();
        $lh_res = $lh_stmt->get_result();
        $leaseHistory = [];
        while ($row = $lh_res->fetch_assoc()) {
            $leaseHistory[] = [
                'event' => 'Lease Extended',
                'date' => $row['created_at'] ? substr($row['created_at'], 0, 10) : null,
                'detail' => "Extended by {$row['added_months']} month(s)",
                'oldEnd' => $row['previous_lease_end'],
                'newEnd' => $row['new_lease_end']
            ];
        }
        $lh_stmt->close();

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
            'maintenanceHistory' => $maintHistory,
            'occupancyHistory' => $occupancyHistory,
            'leaseHistory' => $leaseHistory
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
