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
    $maintByRoom = $occByRoom = $leaseByRoom = $extByContract = $deductionsByApp = [];
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
            SELECT ra.id AS application_id, ra.room_name, ra.first_name, ra.last_name, ra.suffix, ra.status, ra.monthly_rent, ra.archive_reason,
                   lc.id AS contract_id, lc.status AS contract_status, lc.lease_start, lc.lease_end,
                   lc.deposit_amount, lc.deposit_status, lc.deposit_refundable, lc.refund_amount, lc.damage_deduction, lc.utility_deduction,
                   lc.refund_date, lc.termination_reason
            FROM rent_applications ra
            LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id
            WHERE ra.status IN ('Approved', 'active', 'pending-move-out', 'moved-out', 'archived')
            ORDER BY ra.created_at ASC
        ");
        $occAppIds = [];
        while ($row = $res->fetch_assoc()) {
            $occByRoom[$row['room_name']][] = $row;
            if (in_array($row['status'], ['moved-out', 'archived'], true)) $occAppIds[] = (int)$row['application_id'];
        }

        // Extension events: per room for the "Previous Extensions" list, and
        // per contract so each Occupancy History stay shows its own.
        $res = $conn->query("
            SELECT ra.room_name, ra.id AS application_id, lr.contract_id, lr.added_months, lr.previous_lease_end, lr.new_lease_end, lr.created_at
            FROM lease_renewals lr
            JOIN lease_contracts lc ON lc.id = lr.contract_id
            JOIN rent_applications ra ON ra.id = lc.rent_application_id
            ORDER BY lr.created_at ASC
        ");
        while ($row = $res->fetch_assoc()) {
            $leaseByRoom[$row['room_name']][] = $row;
            $extByContract[$row['contract_id']][] = [
                'date' => $row['created_at'] ? substr($row['created_at'], 0, 10) : null,
                'addedMonths' => (int)$row['added_months'],
                'oldEnd' => $row['previous_lease_end'],
                'newEnd' => $row['new_lease_end'],
            ];
        }

        // Itemized deposit deductions of every ended stay: one query in total.
        $deductionsByApp = deposit_deductions_for($conn, $occAppIds);
    }

    // Format the response to match frontend expectations
    // The frontend expects: id, type, rent, status, tenant, lastTenant, floor, leaseStart, leaseEnd, maintenanceFlag
    // Read once: extension_month_range() per room used to cost two queries each.
    $rangeSettings = $is_admin ? extension_range_settings($conn) : null;
    // Occupied units that will free up (Preview's "Coming soon"): only the
    // date, never who is leaving. Settings → Contract End can turn it off.
    $upcoming = (!$is_admin && setting_is_on($conn, 'upcoming_rooms_enabled')) ? upcoming_room_dates($conn) : [];
    $formattedRooms = array_map(function($room) use ($conn, $is_admin, $maintByRoom, $occByRoom, $leaseByRoom, $extByContract, $deductionsByApp, $rangeSettings, $upcoming) {
        $roomId = $room['id'];

        // Showcase photos are meant for guests browsing Preview.jsx, so they're
        // included regardless of $is_admin — unlike everything else below,
        // which is tenant-identifying and admin-only (H1).
        $images = room_gallery_items($room['gallery'] ?? null);

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
                'availableDate' => $room['available_date'],
                'availableFrom' => $room['available_date'] ?? $upcoming[$room['id']] ?? null,
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
            $tenantFullName = person_name($row);
            $isCurrent = in_array($row['status'], ['Approved', 'active', 'pending-move-out'], true) && $room['tenant_name'] === $tenantFullName;
            $ended = in_array($row['status'], ['moved-out', 'archived'], true);
            $appId = (int)$row['application_id'];
            $deposit = null;
            if ($ended && $row['contract_id'] !== null) {
                $deposit = [
                    'status' => $row['deposit_status'],
                    'amount' => round((float)$row['deposit_amount'], 2),
                    'damage' => round((float)$row['damage_deduction'], 2),
                    'utility' => round((float)$row['utility_deduction'], 2),
                    'refundDate' => $row['refund_date'],
                    'refundable' => (bool)$row['deposit_refundable'],
                    'refundAmount' => round((float)$row['refund_amount'], 2),
                    'items' => array_map(fn($d) => [
                        'label' => $d['label'], 'category' => $d['category'], 'reason' => $d['reason'],
                        'amount' => $d['amount'], 'date' => $d['created_at'] ? substr($d['created_at'], 0, 10) : null,
                    ], $deductionsByApp[$appId] ?? []),
                ];
            }
            $occupancyHistory[] = [
                'applicationId' => $appId,
                'contractId' => $row['contract_id'],
                'contractStatus' => $row['contract_status'],
                'tenant' => $tenantFullName,
                'status' => $isCurrent ? 'current' : 'ended',
                'leaseStart' => $row['lease_start'],
                'leaseEnd' => $row['lease_end'],
                'rent' => (float) $row['monthly_rent'],
                'moveOutReason' => $row['archive_reason'] ?: null,
                'terminationReason' => $row['termination_reason'] ?: null,
                'extensions' => $row['contract_id'] !== null ? ($extByContract[$row['contract_id']] ?? []) : [],
                'deposit' => $deposit,
            ];
        }

        // Rent-extension events recorded for this unit's applications,
        // backing the "Previous Extensions" list on the Extend Rent form (each
        // Occupancy History stay carries its own copy in `extensions`).
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
            'availableDate' => $room['available_date'],
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
