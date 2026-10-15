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

// This endpoint has no login requirement — the guest Preview page browses it —
// so it must never leak who lives where. Only a genuinely authenticated admin
// gets tenant identity, lease dates, occupancy history, lease history and
// maintenance history; everyone else (guest or logged-in tenant alike) gets
// only what's needed to browse and apply for a unit (audit H1).
$caller = get_authenticated_user($conn);
$is_admin = $caller && $caller['role'] === 'admin';

// Release lapsed unit reservations before listing, so a hold that expired
// frees the unit for browsing visitors without needing an admin present.
// At most once a minute: the Units and Preview pages call this often (L7).
if (throttle_claim($conn, 'room_hold_check_last_run', 60)) {
    release_expired_reservations($conn);
}

try {
    $archiveColumn = $conn->query("SHOW COLUMNS FROM rooms LIKE 'archived_at'");
    $activeRoomFilter = ($archiveColumn && $archiveColumn->num_rows > 0) ? ' WHERE archived_at IS NULL' : '';
    $stmt = $conn->prepare("SELECT * FROM rooms" . $activeRoomFilter . " ORDER BY id");
    $stmt->execute();
    $result = $stmt->get_result();
    $rooms = $result->fetch_all(MYSQLI_ASSOC);

    // Admin history tabs: three queries for all rooms, grouped by room, instead
    // of three queries per room (audit L7). Each keeps its original ordering.
    $maintByRoom = $occByRoom = $leaseByRoom = [];
    if ($is_admin) {
        $res = $conn->query("
            SELECT m.room_name, m.issue_category as issue, m.status, m.estimated_cost as cost, DATE(m.created_at) as date
            FROM maintenance_requests m
            ORDER BY m.created_at DESC
        ");
        while ($row = $res->fetch_assoc()) {
            $maintByRoom[$row['room_name']][] = $row;
        }

        $res = $conn->query("
            SELECT ra.room_name, ra.first_name, ra.last_name, ra.status, ra.monthly_rent, ra.archive_reason,
                   lc.lease_start, lc.lease_end
            FROM rent_applications ra
            LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id
            WHERE ra.status IN ('Approved', 'active', 'pending-move-out', 'moved-out', 'archived')
            ORDER BY ra.created_at ASC
        ");
        while ($row = $res->fetch_assoc()) {
            $occByRoom[$row['room_name']][] = $row;
        }

        $res = $conn->query("
            SELECT ra.room_name, lr.added_months, lr.previous_lease_end, lr.new_lease_end, lr.created_at
            FROM lease_renewals lr
            JOIN lease_contracts lc ON lc.id = lr.contract_id
            JOIN rent_applications ra ON ra.id = lc.rent_application_id
            ORDER BY lr.created_at ASC
        ");
        while ($row = $res->fetch_assoc()) {
            $leaseByRoom[$row['room_name']][] = $row;
        }
    }

    // Format the response to match frontend expectations
    // The frontend expects: id, type, rent, status, tenant, lastTenant, floor, leaseStart, leaseEnd, maintenanceFlag
    // Read once: extension_month_range() per room used to cost two queries each.
    $rangeSettings = $is_admin ? extension_range_settings($conn) : null;
    $formattedRooms = array_map(function($room) use ($conn, $is_admin, $maintByRoom, $occByRoom, $leaseByRoom, $rangeSettings) {
        $roomId = $room['id'];

        // Showcase photos are meant for guests browsing Preview.jsx, so they're
        // included regardless of $is_admin — unlike everything else below,
        // which is tenant-identifying and admin-only (H1).
        $images = json_decode($room['gallery'] ?? '[]', true) ?: [];

        if (!$is_admin) {
            return [
                'id' => $room['id'],
                'type' => $room['type'],
                'floor' => $room['floor'],
                'rent' => (float) $room['monthly_rent'],
                'status' => $room['status'],
                'roomCondition' => $room['room_condition'] ?? 'Good',
                'furnishingStatus' => $room['furnishing_status'] ?? 'Unfurnished',
                'images' => $images,
            ];
        }

        // Real maintenance requests for this room.
        $maintHistory = [];
        foreach ($maintByRoom[$roomId] ?? [] as $row) {
            $maintHistory[] = [
                'issue' => $row['issue'],
                'status' => $row['status'],
                'cost' => $row['cost'] ? (float)$row['cost'] : 0.0,
                'date' => $row['date']
            ];
        }

        // Every tenant who has ever occupied this unit (current + past),
        // backing the "Occupancy History" tab.
        $occupancyHistory = [];
        foreach ($occByRoom[$roomId] ?? [] as $row) {
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

        // Rent-extension events recorded for this unit's applications,
        // backing the "Lease History" tab and the "Previous Extensions" list.
        $leaseHistory = [];
        foreach ($leaseByRoom[$roomId] ?? [] as $row) {
            $leaseHistory[] = [
                'event' => 'Rent Extended',
                'date' => $row['created_at'] ? substr($row['created_at'], 0, 10) : null,
                'detail' => "Extended by {$row['added_months']} month(s)",
                'oldEnd' => $row['previous_lease_end'],
                'newEnd' => $row['new_lease_end']
            ];
        }

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
            'leaseHistory' => $leaseHistory,
            // Units -> Extend Rent: the months it may add (min shrinks to what
            // fits under the months-ahead limit; max 0 = nothing fits).
            'extensionRange' => $is_admin && $room['tenant_name'] ? extension_month_range($conn, $room['lease_end'], $rangeSettings) : null,
            'images' => $images
        ];
    }, $rooms);

    echo json_encode([
        'success' => true,
        'rooms' => $formattedRooms
    ]);
} catch (Exception $e) {
    server_error_response($e, 'Could not load units. Please try again.');
}
?>
