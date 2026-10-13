<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../config.php';

// Identity comes from the session token only. This endpoint used to trust the
// X-User-Id header, so anyone could read any tenant's readings by sending it.
$user = require_user($conn);
$is_admin = $user['role'] === 'admin';

$room_name = $_GET['room_name'] ?? null;
$billing_period = $_GET['billing_period'] ?? null;

// Previous reading for the same unit = the latest earlier billing period, used
// for month-over-month change and spike detection (checklist 8.7).
$query = "SELECT ur.*,
                 prev.water_consumption    AS prev_water_cons,
                 prev.electric_consumption AS prev_elec_cons,
                 prev.user_id              AS prev_user_id,
                 u.first_name    AS tenant_first_name,
                 u.last_name     AS tenant_last_name,
                 u.email_address AS tenant_email,
                 inv.status AS invoice_status,
                 inv.total_amount AS invoice_total,
                 inv.proof_of_payment_path AS invoice_proof_path,
                 inv.proof_rejection_reason AS invoice_proof_rejection
          FROM utility_readings ur
          LEFT JOIN invoices inv ON inv.id = ur.invoice_id
          LEFT JOIN users u ON ur.user_id = u.id
          LEFT JOIN utility_readings prev
                 ON prev.room_name = ur.room_name
                AND prev.entry_mode = 'metered'
                AND prev.billing_period = (
                    SELECT MAX(p2.billing_period) FROM utility_readings p2
                    WHERE p2.room_name = ur.room_name AND p2.entry_mode = 'metered' AND p2.billing_period < ur.billing_period
                )
          WHERE 1=1";
$types = "";
$params = [];

if (!$is_admin) {
    $query .= " AND ur.user_id = ?";
    $types .= "i";
    $params[] = $user['id'];
} else {
    if ($room_name) {
        $query .= " AND ur.room_name = ?";
        $types .= "s";
        $params[] = $room_name;
    }
    if ($billing_period) {
        $query .= " AND ur.billing_period = ?";
        $types .= "s";
        $params[] = $billing_period;
    }
}

$query .= " ORDER BY ur.billing_period DESC, ur.room_name ASC";

$stmt = $conn->prepare($query);
if (!$stmt) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Query preparation failed."]);
    exit;
}
if (count($params) > 0) {
    $stmt->bind_param($types, ...$params);
}
$stmt->execute();
$result = $stmt->get_result();

function change_pct($current, $previous) {
    $previous = (float)$previous;
    if ($previous <= 0) return null;
    return round((((float)$current - $previous) / $previous) * 100, 1);
}

$readings = [];
while ($row = $result->fetch_assoc()) {
    // A tenant only compares against their own earlier usage, never a previous occupant's.
    $has_prev = ($row['entry_mode'] ?? 'metered') === 'metered' && $row['prev_water_cons'] !== null && ($is_admin || (int)$row['prev_user_id'] === $user['id']);

    $row['water_change_pct'] = $has_prev ? change_pct($row['water_consumption'], $row['prev_water_cons']) : null;
    $row['electric_change_pct'] = $has_prev ? change_pct($row['electric_consumption'], $row['prev_elec_cons']) : null;
    $row['has_spike'] = ($row['water_change_pct'] ?? 0) > UTILITY_SPIKE_THRESHOLD_PCT
                     || ($row['electric_change_pct'] ?? 0) > UTILITY_SPIKE_THRESHOLD_PCT;
    $row['billing_period_label'] = is_valid_utility_period($row['billing_period']) ? utility_period_label($row['billing_period']) : $row['billing_period'];

    unset($row['prev_water_cons'], $row['prev_elec_cons'], $row['prev_user_id']);
    if (!$is_admin) {
        unset($row['recorded_by'], $row['tenant_email']);
    }

    $readings[] = $row;
}
$stmt->close();

// Extra utility types (internet, gas, ...) per reading.
if ($readings) {
    $ids = implode(',', array_map(fn($r) => (int)$r['id'], $readings)); // ints only
    $by_reading = [];
    $res = $conn->query("SELECT i.reading_id, i.type_id, t.name, t.unit_label, t.billing_mode, i.prev_reading, i.curr_reading, i.consumption, i.rate, i.amount, i.other_fees
                         FROM utility_reading_items i JOIN utility_types t ON t.id = i.type_id
                         WHERE i.reading_id IN ($ids) ORDER BY t.sort_order, t.id");
    while ($it = $res->fetch_assoc()) $by_reading[(int)$it['reading_id']][] = $it;
    foreach ($readings as &$r) $r['items'] = $by_reading[(int)$r['id']] ?? [];
    unset($r);
}

echo json_encode(["success" => true, "spike_threshold_pct" => UTILITY_SPIKE_THRESHOLD_PCT, "data" => $readings]);
$conn->close();
?>
