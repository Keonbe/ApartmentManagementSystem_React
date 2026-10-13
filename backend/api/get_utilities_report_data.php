<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once __DIR__ . "/../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

$timeframe = in_array($_GET['timeframe'] ?? '', ['monthly', 'quarterly', 'yearly'], true) ? $_GET['timeframe'] : 'monthly';
$month = min(12, max(1, (int)($_GET['month'] ?? date('n'))));
$year = (int)($_GET['year'] ?? date('Y'));
$quarter = min(4, max(1, (int)($_GET['quarter'] ?? ceil(date('n') / 3))));

// Readings are filtered by the month they cover (billing_period), not the day the
// meter happened to be read — an August reading taken on September 2 is August usage.
if ($timeframe === 'yearly') {
    [$startMonth, $endMonth] = [1, 12];
} elseif ($timeframe === 'quarterly') {
    $startMonth = ($quarter - 1) * 3 + 1;
    $endMonth = $startMonth + 2;
} else {
    [$startMonth, $endMonth] = [$month, $month];
}
$periodStart = sprintf('%04d-%02d', $year, $startMonth);
$periodEnd = sprintf('%04d-%02d', $year, $endMonth);
$rangeStart = "$periodStart-01";
$rangeEnd = date('Y-m-t', strtotime("$periodEnd-01"));

$data = [
    'period' => ['start' => $periodStart, 'end' => $periodEnd],
    'water' => ['totalM3' => 0.0, 'avgM3' => 0.0, 'totalBilled' => 0.0, 'totalUnits' => 0],
    'electric' => ['totalKwh' => 0.0, 'avgKwh' => 0.0, 'totalBilled' => 0.0, 'totalUnits' => 0],
    'financials' => ['totalBilled' => 0.0, 'totalCollected' => 0.0, 'outstanding' => 0.0, 'recoveryRate' => 0],
    'pendingSync' => ['count' => 0, 'amount' => 0.0],
    'spikeThresholdPct' => UTILITY_SPIKE_THRESHOLD_PCT,
    'spikeCount' => 0,
    'topUnits' => [],
    'coverage' => null,
];

// 1. Consumption, per-unit ranking and spikes — one pass over the period's readings.
$stmt = $conn->prepare("
    SELECT ur.room_name, ur.billing_period, ur.is_invoiced,
           ur.water_consumption, ur.electric_consumption,
           ur.water_amount + ur.water_other_fees       AS water_cost,
           ur.electric_amount + ur.electric_other_fees AS electric_cost,
           prev.water_consumption    AS prev_water,
           prev.electric_consumption AS prev_electric
    FROM utility_readings ur
    LEFT JOIN utility_readings prev
           ON prev.room_name = ur.room_name
          AND prev.billing_period = (
              SELECT MAX(p2.billing_period) FROM utility_readings p2
              WHERE p2.room_name = ur.room_name AND p2.billing_period < ur.billing_period
          )
    WHERE ur.billing_period BETWEEN ? AND ?
");
$stmt->bind_param("ss", $periodStart, $periodEnd);
$stmt->execute();
$res = $stmt->get_result();

$readingsCount = 0;
$units = [];
while ($row = $res->fetch_assoc()) {
    $readingsCount++;
    $water = (float)$row['water_consumption'];
    $electric = (float)$row['electric_consumption'];
    $waterCost = (float)$row['water_cost'];
    $electricCost = (float)$row['electric_cost'];
    // A recorded total has no water/electric split: it counts toward the unit cost and sync queue only.
    $totalOnly = ($row['entry_mode'] ?? 'metered') === 'total' ? (float)$row['total_amount'] : 0.0;

    $data['water']['totalM3'] += $water;
    $data['water']['totalBilled'] += $waterCost;
    $data['electric']['totalKwh'] += $electric;
    $data['electric']['totalBilled'] += $electricCost;

    if (!(int)$row['is_invoiced']) {
        $data['pendingSync']['count']++;
        $data['pendingSync']['amount'] += $waterCost + $electricCost + $totalOnly;
    }

    $prevWater = (float)$row['prev_water'];
    $prevElectric = (float)$row['prev_electric'];
    $spike = ($prevWater > 0 && ($water - $prevWater) / $prevWater * 100 > UTILITY_SPIKE_THRESHOLD_PCT)
          || ($prevElectric > 0 && ($electric - $prevElectric) / $prevElectric * 100 > UTILITY_SPIKE_THRESHOLD_PCT);
    if ($spike) $data['spikeCount']++;

    $unit = $row['room_name'];
    if (!isset($units[$unit])) {
        $units[$unit] = ['unit' => $unit, 'waterM3' => 0.0, 'electricKwh' => 0.0, 'totalCost' => 0.0, 'readings' => 0, 'hasSpike' => false];
    }
    $units[$unit]['waterM3'] += $water;
    $units[$unit]['electricKwh'] += $electric;
    $units[$unit]['totalCost'] += $waterCost + $electricCost + $totalOnly;
    $units[$unit]['readings']++;
    $units[$unit]['hasSpike'] = $units[$unit]['hasSpike'] || $spike;
}
$stmt->close();

$unitCount = count($units);
$data['water']['totalUnits'] = $unitCount;
$data['electric']['totalUnits'] = $unitCount;
// Averages are per unit-month (per reading), so a quarter doesn't read as three times the usage.
$data['water']['avgM3'] = $readingsCount > 0 ? round($data['water']['totalM3'] / $readingsCount, 2) : 0;
$data['electric']['avgKwh'] = $readingsCount > 0 ? round($data['electric']['totalKwh'] / $readingsCount, 2) : 0;
foreach (['water' => 'totalM3', 'electric' => 'totalKwh'] as $key => $total) {
    $data[$key][$total] = round($data[$key][$total], 2);
    $data[$key]['totalBilled'] = round($data[$key]['totalBilled'], 2);
}
$data['pendingSync']['amount'] = round($data['pendingSync']['amount'], 2);

usort($units, fn($a, $b) => $b['totalCost'] <=> $a['totalCost']);
foreach (array_slice($units, 0, 20) as $u) {
    $u['waterM3'] = round($u['waterM3'], 2);
    $u['electricKwh'] = round($u['electricKwh'], 2);
    $u['totalCost'] = round($u['totalCost'], 2);
    $data['topUnits'][] = $u;
}

// 2. Recovery: of the utility charges invoiced in this period, how much has been paid.
// Cancelled invoices are not money owed, so they are excluded from both sides.
$stmt = $conn->prepare("
    SELECT SUM(water + electricity) AS billed,
           SUM(CASE WHEN status = 'paid' THEN water + electricity ELSE 0 END) AS collected,
           SUM(CASE WHEN status IN " . billing_open_status_sql() . " THEN water + electricity ELSE 0 END) AS outstanding
    FROM invoices
    WHERE status <> 'cancelled' AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
");
$stmt->bind_param("ss", $rangeStart, $rangeEnd);
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $billed = (float)($row['billed'] ?? 0);
    $collected = (float)($row['collected'] ?? 0);
    $data['financials']['totalBilled'] = round($billed, 2);
    $data['financials']['totalCollected'] = round($collected, 2);
    $data['financials']['outstanding'] = round((float)($row['outstanding'] ?? 0), 2);
    $data['financials']['recoveryRate'] = $billed > 0 ? round($collected / $billed * 100, 1) : 0;
}
$stmt->close();

// 3. Reading coverage (monthly view): occupied units that have no reading for the month yet.
if ($timeframe === 'monthly') {
    $occupied = [];
    $res = $conn->query("SELECT DISTINCT room_name FROM rent_applications WHERE status IN ('Approved', 'active', 'pending-move-out') AND room_name IS NOT NULL ORDER BY room_name");
    while ($row = $res->fetch_assoc()) {
        $occupied[] = $row['room_name'];
    }
    $read = array_map(fn($u) => $u['unit'], $units);
    $missing = array_values(array_diff($occupied, $read));
    $data['coverage'] = [
        'occupiedUnits' => count($occupied),
        'unitsRead' => count(array_intersect($occupied, $read)),
        'missingUnits' => $missing,
    ];
}

echo json_encode(['success' => true, 'data' => $data]);
$conn->close();
?>
