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

// Admin → Parking: every reservation, every slot (with who is parked in it),
// the capacity figures and the parking settings. slotNumber is parking_slots.id;
// slotLabel is the slot's name (kept for removed slots).
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
                p.monthly_fee AS monthlyFee,
                p.status,
                p.slot_number AS slotNumber,
                s.label AS slotLabel,
                p.assigned_at AS assignedAt,
                p.released_at AS releasedAt,
                p.release_reason AS releaseReason,
                p.rejection_reason AS rejectionReason,
                p.document_path AS documentPath,
                p.created_at,
                (SELECT GROUP_CONCAT(pc.billing_period ORDER BY pc.billing_period) FROM parking_charges pc WHERE pc.reservation_id = p.id) AS billed
            FROM parking_reservations p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN parking_slots s ON s.id = p.slot_number
            ORDER BY FIELD(p.status, 'Pending', 'Assigned') DESC, p.id DESC";

    $res = $conn->query($sql);
    $reservations = [];
    $occupants = [];
    while ($row = $res->fetch_assoc()) {
        $row['tenant'] = trim((string)$row['tenant']) !== '' ? trim($row['tenant']) : 'Unknown Tenant';
        $row['slotNumber'] = $row['slotNumber'] !== null ? (int)$row['slotNumber'] : null;
        $row['monthlyFee'] = parking_reservation_fee($conn, ['monthly_fee' => $row['monthlyFee']]);
        $row['billedPeriods'] = $row['billed'] ? explode(',', $row['billed']) : [];
        unset($row['billed']);
        $end = parking_term_end($row['assignedAt'], $row['durationMonths']);
        $row['termEndsAt'] = $end ? $end->format('Y-m-d') : null;
        if ($row['status'] === 'Assigned' && $row['slotNumber']) {
            $occupants[$row['slotNumber']] = [
                'reservation_id' => (int)$row['id'],
                'tenant' => $row['tenant'],
                'unit' => $row['unit'],
                'vehicle' => $row['vehicleModel'],
                'vehicle_type' => strtolower((string)$row['vehicleType']),
                'plate' => $row['plateNumber'],
                'term_ends_at' => $row['termEndsAt'],
            ];
        }
        $reservations[] = $row;
    }

    $slots = parking_slots($conn);
    $taken = parking_assigned_by_slot($conn);
    $capacity = parking_capacity($conn, $slots, $taken);
    // Pending requests per slot asked for (a request does not hold the slot).
    $asked = [];
    foreach ($reservations as $r) {
        if ($r['status'] === 'Pending' && $r['slotNumber']) $asked[$r['slotNumber']] = ($asked[$r['slotNumber']] ?? 0) + 1;
    }
    $slot_list = array_values(array_map(fn($s) => $s + [
        'occupant' => $occupants[$s['id']] ?? null,
        'requests' => $asked[$s['id']] ?? 0,
    ], $slots));

    $monthly_total = array_sum(array_map(fn($r) => $r['status'] === 'Assigned' ? $r['monthlyFee'] : 0, $reservations));

    echo json_encode([
        "success" => true,
        "reservations" => $reservations,
        "slots" => $slot_list,
        "capacity" => [
            "max_slots" => $capacity['max'],
            "taken_slots" => $capacity['taken'],
            "occupied_count" => $capacity['occupied'],
            "available_slots" => $capacity['available'],
            "maintenance_slots" => $capacity['maintenance'],
            "free_by_type" => $capacity['free_by_type'],
        ],
        "monthly_fee" => (float)get_setting($conn, 'parking_monthly_fee', 300),
        "monthly_total" => $monthly_total,
        "free" => parking_is_free($conn),
        "billing_mode" => get_setting($conn, 'parking_billing_mode', 'manual') === 'auto' ? 'auto' : 'manual',
        "max_duration_months" => parking_max_duration_months($conn),
        "max_per_tenant" => parking_max_per_tenant($conn),
        "current_period" => (new DateTime('now', new DateTimeZone('Asia/Manila')))->format('Y-m'),
    ]);
} catch (Exception $e) {
    server_error_response($e, "Failed to load parking reservations.");
}

$conn->close();
?>
