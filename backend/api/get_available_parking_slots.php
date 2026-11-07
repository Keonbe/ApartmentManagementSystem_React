<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$auth = require_user($conn);

// The tenant's parking page: every slot with its state as this tenant sees it,
// the rules for a new request, and the tenant's own reservations.
//   slots[].state  free | taken (someone else's) | mine (assigned to me) |
//                  requested (my pending request is for it) | maintenance
// Other tenants' requests do not hold a slot, so a slot someone asked for still
// shows as free; who parks where is never shown.
$slots = parking_slots($conn);
$taken = parking_assigned_by_slot($conn);
$capacity = parking_capacity($conn, $slots, $taken);
$uid = (int)$auth['id'];

$stmt = $conn->prepare("SELECT p.id, p.vehicle_type, p.vehicle_model, p.plate_number, p.transmission, p.status, p.slot_number,
                               s.label AS slot_label, p.assigned_at, p.released_at, p.release_reason, p.rejection_reason,
                               p.duration_months, p.total_cost, p.monthly_fee, p.created_at
                        FROM parking_reservations p LEFT JOIN parking_slots s ON s.id = p.slot_number
                        WHERE p.user_id = ? ORDER BY FIELD(p.status, 'Pending', 'Assigned') DESC, p.id DESC LIMIT 20");
$stmt->bind_param("i", $uid);
$stmt->execute();
$mine = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
$stmt->close();

// Billed months for all of them in one query.
$billed = [];
if ($mine) {
    $ids = implode(',', array_map(fn($r) => (int)$r['id'], $mine));
    $res = $conn->query("SELECT reservation_id, billing_period FROM parking_charges WHERE reservation_id IN ($ids) ORDER BY billing_period");
    while ($res && ($row = $res->fetch_assoc())) $billed[(int)$row['reservation_id']][] = $row['billing_period'];
}

$requested = [];
foreach ($mine as &$r) {
    $r['id'] = (int)$r['id'];
    $r['slot_number'] = $r['slot_number'] !== null ? (int)$r['slot_number'] : null;
    $r['duration_months'] = (int)$r['duration_months'];
    $r['monthly_fee'] = parking_reservation_fee($conn, $r);
    $r['total_cost'] = (float)$r['total_cost'];
    $end = parking_term_end($r['assigned_at'], $r['duration_months']);
    $r['term_ends_at'] = $end ? $end->format('Y-m-d') : null;
    $r['billed_periods'] = $billed[$r['id']] ?? [];
    if ($r['status'] === 'Pending' && $r['slot_number']) $requested[$r['slot_number']] = true;
}
unset($r);

$slot_view = [];
foreach ($slots as $s) {
    $holder = $taken[$s['id']] ?? null;
    $state = $s['status'] === 'maintenance' ? 'maintenance'
        : ($holder ? ((int)$holder['user_id'] === $uid ? 'mine' : 'taken')
        : (isset($requested[$s['id']]) ? 'requested' : 'free'));
    $slot_view[] = [
        'id' => $s['id'],
        'label' => $s['label'],
        'icon' => $s['icon'],
        'vehicle_types' => $s['vehicle_types'],
        'requires_registration' => $s['requires_registration'],
        'state' => $state,
    ];
}

$open = count(array_filter($mine, fn($r) => in_array($r['status'], ['Pending', 'Assigned'], true)));
$response = [
    "success" => true,
    "slots" => $slot_view,
    "max_slots" => $capacity['max'],
    "occupied_count" => $capacity['occupied'],
    "available_slots" => $capacity['available'],
    "free_by_type" => $capacity['free_by_type'],
    "monthly_fee" => parking_monthly_fee($conn),
    "free" => parking_is_free($conn),
    "billing_mode" => get_setting($conn, 'parking_billing_mode', 'manual') === 'auto' ? 'auto' : 'manual',
    "max_duration_months" => parking_max_duration_months($conn),
    "max_per_tenant" => parking_max_per_tenant($conn),
    "open_count" => $open,
    "no_plate_types" => PARKING_NO_PLATE_TYPES,
    "my_reservations" => $mine,
    // The latest one, for older pages.
    "my_reservation" => $mine[0] ?? null,
];

if ($auth['role'] === 'admin') {
    $response['taken_slots'] = $capacity['taken'];
}

echo json_encode($response);
$conn->close();
?>
