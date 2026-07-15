<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$response = [
    'success' => true,
    'stats' => [
        'total_revenue' => 0,
        'pending_dues' => 0,
        'total_tenants' => 0,
        'occupancy_rate' => 0,
        'occupied_rooms' => 0,
        'total_rooms' => 0,
        'vacant_rooms' => 0,
        'open_maintenance' => 0,
    ],
    'income_data' => [],
    'new_tenants' => [],
];

// 1. Total Revenue (Current Month)
$stmt = $conn->prepare("SELECT SUM(amount) as total FROM invoices WHERE status = 'Paid' AND MONTH(paid_at) = MONTH(CURRENT_DATE()) AND YEAR(paid_at) = YEAR(CURRENT_DATE())");
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $response['stats']['total_revenue'] = (float)($row['total'] ?? 0);
}
$stmt->close();

// 2. Pending Dues
$stmt = $conn->prepare("SELECT SUM(amount) as total FROM invoices WHERE status IN ('Pending', 'Overdue')");
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $response['stats']['pending_dues'] = (float)($row['total'] ?? 0);
}
$stmt->close();

// 3. Total Active Tenants
$stmt = $conn->prepare("SELECT COUNT(*) as total FROM rent_applications WHERE status = 'Approved'");
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $response['stats']['total_tenants'] = (int)($row['total'] ?? 0);
}
$stmt->close();

// 4. Room Stats
$stmt = $conn->prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) as occupied, SUM(CASE WHEN status = 'Vacant' THEN 1 ELSE 0 END) as vacant FROM rooms");
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $response['stats']['total_rooms'] = (int)($row['total'] ?? 0);
    $response['stats']['occupied_rooms'] = (int)($row['occupied'] ?? 0);
    $response['stats']['vacant_rooms'] = (int)($row['vacant'] ?? 0);
    if ($response['stats']['total_rooms'] > 0) {
        $response['stats']['occupancy_rate'] = round(($response['stats']['occupied_rooms'] / $response['stats']['total_rooms']) * 100);
    }
}
$stmt->close();

// 5. Open Maintenance Requests
$stmt = $conn->prepare("SELECT COUNT(*) as total FROM maintenance_requests WHERE status IN ('Pending', 'In Progress')");
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $response['stats']['open_maintenance'] = (int)($row['total'] ?? 0);
}
$stmt->close();

// 6. Income Data (Last 6 Months)
// Creating a list of the last 6 months first to ensure zero-fill for empty months
$months = [];
for ($i = 5; $i >= 0; $i--) {
    $months[date('M', strtotime("-$i months"))] = [
        'month' => date('M', strtotime("-$i months")),
        'value' => 0,
        'expenses' => 0, // Mocked expenses
    ];
}

$stmt = $conn->prepare("
    SELECT DATE_FORMAT(paid_at, '%b') as m, SUM(amount) as val 
    FROM invoices 
    WHERE status = 'Paid' AND paid_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
    GROUP BY YEAR(paid_at), MONTH(paid_at), DATE_FORMAT(paid_at, '%b')
    ORDER BY YEAR(paid_at), MONTH(paid_at)
");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    if (isset($months[$row['m']])) {
        $months[$row['m']]['value'] = (float)$row['val'];
        // Mock expense as 30% of revenue for the chart to have data
        $months[$row['m']]['expenses'] = round((float)$row['val'] * 0.3);
    }
}
$response['income_data'] = array_values($months);
$stmt->close();

// 7. Newest Tenants
$stmt = $conn->prepare("SELECT first_name, last_name, room_name, created_at FROM rent_applications WHERE status = 'Approved' ORDER BY created_at DESC LIMIT 5");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $response['new_tenants'][] = [
        'name' => trim($row['first_name'] . ' ' . $row['last_name']),
        'unit' => $row['room_name'],
        'date' => date('M d, Y', strtotime($row['created_at']))
    ];
}
$stmt->close();

echo json_encode($response);
$conn->close();
?>
