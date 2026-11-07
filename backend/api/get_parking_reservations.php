<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_admin($conn);

try {
    // The unit comes from the tenant's latest current application only. Joining
    // every matching application listed a tenant once per application.
    $sql = "SELECT
                p.id,
                p.id AS rawId,
                p.user_id,
                TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) AS tenant,
                COALESCE((SELECT ra.room_name FROM rent_applications ra
                          WHERE ra.user_id = p.user_id AND ra.status IN ('Approved', 'active', 'pending-move-out')
                          ORDER BY ra.id DESC LIMIT 1), '—') AS unit,
                p.vehicle_type AS vehicleType,
                p.vehicle_model AS vehicleModel,
                p.plate_number AS plateNumber,
                p.transmission,
                p.duration_months AS durationMonths,
                p.total_cost AS totalCost,
                p.status,
                p.slot_number AS slotNumber,
                p.assigned_at AS assignedAt,
                p.released_at AS releasedAt,
                p.release_reason AS releaseReason,
                p.rejection_reason AS rejectionReason,
                p.document_path AS documentPath,
                p.created_at,
                (SELECT GROUP_CONCAT(pc.billing_period ORDER BY pc.billing_period) FROM parking_charges pc WHERE pc.reservation_id = p.id) AS billed
            FROM parking_reservations p
            LEFT JOIN users u ON p.user_id = u.id
            ORDER BY FIELD(p.status, 'Pending', 'Assigned') DESC, p.id DESC";

    $res = $conn->query($sql);
    if (!$res) {
        error_log("[AMS] Database query error: " . $conn->error);
        throw new Exception("Database query error.");
    }

    $reservations = [];
    while ($row = $res->fetch_assoc()) {
        $row['tenant'] = trim($row['tenant']) !== '' ? trim($row['tenant']) : 'Unknown Tenant';
        $row['slotNumber'] = $row['slotNumber'] !== null ? (int)$row['slotNumber'] : null;
        $row['billedPeriods'] = $row['billed'] ? explode(',', $row['billed']) : [];
        unset($row['billed']);
        $end = parking_term_end($row['assignedAt'], $row['durationMonths']);
        $row['termEndsAt'] = $end ? $end->format('Y-m-d') : null;
        $reservations[] = $row;
    }

    $capacity = parking_capacity($conn);

    echo json_encode([
        "success" => true,
        "reservations" => $reservations,
        "capacity" => [
            "max_slots" => $capacity['max'],
            "taken_slots" => $capacity['taken'],
            "occupied_count" => $capacity['occupied'],
            "available_slots" => $capacity['available'],
        ],
        "monthly_fee" => parking_monthly_fee($conn),
        "billing_mode" => get_setting($conn, 'parking_billing_mode', 'manual') === 'auto' ? 'auto' : 'manual',
        "current_period" => (new DateTime('now', new DateTimeZone('Asia/Manila')))->format('Y-m'),
    ]);
} catch (Exception $e) {
    server_error_response($e, "Failed to load parking reservations.");
}

$conn->close();
?>
