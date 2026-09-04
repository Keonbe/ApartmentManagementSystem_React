<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once __DIR__ . "/../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

$timeframe = $_GET['timeframe'] ?? 'monthly';
$month = isset($_GET['month']) ? (int)$_GET['month'] : date('n');
$year = isset($_GET['year']) ? (int)$_GET['year'] : date('Y');
$quarter = isset($_GET['quarter']) ? (int)$_GET['quarter'] : ceil(date('n') / 3);

// Current period date conditions for utility_readings (uses reading_date or created_at)
$dateCondition = "";
$invoiceDateCondition = "";
if ($timeframe === 'yearly') {
    $dateCondition = "YEAR(reading_date) = $year";
    $invoiceDateCondition = "YEAR(COALESCE(paid_at, created_at)) = $year";
} elseif ($timeframe === 'quarterly') {
    $dateCondition = "YEAR(reading_date) = $year AND QUARTER(reading_date) = $quarter";
    $invoiceDateCondition = "YEAR(COALESCE(paid_at, created_at)) = $year AND QUARTER(COALESCE(paid_at, created_at)) = $quarter";
} else {
    $dateCondition = "YEAR(reading_date) = $year AND MONTH(reading_date) = $month";
    $invoiceDateCondition = "YEAR(COALESCE(paid_at, created_at)) = $year AND MONTH(COALESCE(paid_at, created_at)) = $month";
}

$data = [
    'water' => [
        'totalM3' => 0.0,
        'avgM3' => 0.0,
        'totalBilled' => 0.0,
        'totalUnits' => 0
    ],
    'electric' => [
        'totalKwh' => 0.0,
        'avgKwh' => 0.0,
        'totalBilled' => 0.0,
        'totalUnits' => 0
    ],
    'financials' => [
        'totalBilled' => 0.0,
        'totalCollected' => 0.0,
        'outstanding' => 0.0,
        'recoveryRate' => 0
    ],
    'topUnits' => []
];

// 1. Utilities KPI Aggregation (from utility_readings)
$stmt = $conn->prepare("
    SELECT 
        SUM(water_consumption) as total_water_m3,
        SUM(water_amount + COALESCE(water_other_fees, 0)) as total_water_billed,
        SUM(electric_consumption) as total_electric_kwh,
        SUM(electric_amount + COALESCE(electric_other_fees, 0)) as total_electric_billed,
        COUNT(DISTINCT room_name) as units_count,
        COUNT(id) as readings_count
    FROM utility_readings
    WHERE $dateCondition
");
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $unitsCount = (int)$row['units_count'];
    $readingsCount = (int)$row['readings_count'];
    
    $data['water']['totalM3'] = (float)($row['total_water_m3'] ?? 0);
    $data['water']['totalBilled'] = (float)($row['total_water_billed'] ?? 0);
    $data['water']['totalUnits'] = $unitsCount;
    $data['water']['avgM3'] = $readingsCount > 0 ? round($data['water']['totalM3'] / $readingsCount, 2) : 0;
    
    $data['electric']['totalKwh'] = (float)($row['total_electric_kwh'] ?? 0);
    $data['electric']['totalBilled'] = (float)($row['total_electric_billed'] ?? 0);
    $data['electric']['totalUnits'] = $unitsCount;
    $data['electric']['avgKwh'] = $readingsCount > 0 ? round($data['electric']['totalKwh'] / $readingsCount, 2) : 0;
}
$stmt->close();

// 2. Financials Recovery (from invoices)
// Get Billed amount (sum of all utility charges on invoices generated in this period)
$stmt = $conn->prepare("
    SELECT 
        SUM(water + electricity) as total_billed,
        SUM(CASE WHEN status = 'paid' THEN water + electricity ELSE 0 END) as total_collected
    FROM invoices
    WHERE $invoiceDateCondition
");
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $data['financials']['totalBilled'] = (float)($row['total_billed'] ?? 0);
    $data['financials']['totalCollected'] = (float)($row['total_collected'] ?? 0);
    $data['financials']['outstanding'] = $data['financials']['totalBilled'] - $data['financials']['totalCollected'];
    $data['financials']['recoveryRate'] = $data['financials']['totalBilled'] > 0 
        ? round(($data['financials']['totalCollected'] / $data['financials']['totalBilled']) * 100, 1) 
        : ($data['financials']['totalCollected'] > 0 ? 100 : 0);
}
$stmt->close();

// 3. Top Consuming Units Ranking (Unit-Level Consumption Ranking)
$stmt = $conn->prepare("
    SELECT 
        room_name,
        SUM(water_consumption) as total_water,
        SUM(electric_consumption) as total_electric,
        SUM(water_amount + COALESCE(water_other_fees, 0) + electric_amount + COALESCE(electric_other_fees, 0)) as total_cost
    FROM utility_readings
    WHERE $dateCondition
    GROUP BY room_name
    ORDER BY total_cost DESC
    LIMIT 20
");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['topUnits'][] = [
        'unit' => $row['room_name'],
        'waterM3' => (float)$row['total_water'],
        'electricKwh' => (float)$row['total_electric'],
        'totalCost' => (float)$row['total_cost']
    ];
}
$stmt->close();

echo json_encode(['success' => true, 'data' => $data]);
$conn->close();
?>
