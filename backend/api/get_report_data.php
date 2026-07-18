<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$timeframe = $_GET['timeframe'] ?? 'monthly';
$month = isset($_GET['month']) ? (int)$_GET['month'] : date('n');
$year = isset($_GET['year']) ? (int)$_GET['year'] : date('Y');

$dateCondition = "";
if ($timeframe === 'yearly') {
    $dateCondition = "YEAR(created_at) = $year";
    $paidDateCondition = "YEAR(paid_at) = $year";
} else {
    $dateCondition = "YEAR(created_at) = $year AND MONTH(created_at) = $month";
    $paidDateCondition = "YEAR(paid_at) = $year AND MONTH(paid_at) = $month";
}

$data = [
    'totalOccupied' => 0,
    'moveIns' => 0,
    'moveOuts' => 0,
    'rentCollected' => 0,
    'waterCollected' => 0,
    'electricCollected' => 0,
    'parkingCollected' => 0,
    'expenses' => 0,
    'totalMaintenance' => 0,
    'maintCompleted' => 0,
    'maintInProgress' => 0,
    'maintPending' => 0,
    'maintCategoryCounts' => [],
    'maintUrgencyCounts' => [],
    'roomApplications' => 0,
    'roomApproved' => 0,
    'roomRejected' => 0,
    'roomPending' => 0,
    'parkingReservationsCount' => 0
];

// Financials (from Invoices)
$stmt = $conn->prepare("SELECT SUM(base_rent) as rent, SUM(water) as water, SUM(electricity) as electric, SUM(parking) as parking, SUM(total_amount) as total FROM invoices WHERE status = 'Paid' AND $paidDateCondition");
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $data['rentCollected'] = (float)($row['rent'] ?? 0);
    $data['waterCollected'] = (float)($row['water'] ?? 0);
    $data['electricCollected'] = (float)($row['electric'] ?? 0);
    $data['parkingCollected'] = (float)($row['parking'] ?? 0);
    $totalRevenue = (float)($row['total'] ?? 0);
    $data['expenses'] = round($totalRevenue * 0.3); // Mocking expenses as 30% of revenue
}
$stmt->close();

// Room occupancy (Active rooms right now)
$stmt = $conn->prepare("SELECT COUNT(*) as occupied FROM rooms WHERE status = 'Occupied'");
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['totalOccupied'] = (int)$row['occupied'];
}
$stmt->close();

// Move-ins (Approved applications in period)
$stmt = $conn->prepare("SELECT COUNT(*) as count FROM rent_applications WHERE status = 'Approved' AND $dateCondition");
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['moveIns'] = (int)$row['count'];
}
$stmt->close();

// Room Applications breakdown
$stmt = $conn->prepare("SELECT status, COUNT(*) as count FROM rent_applications WHERE $dateCondition GROUP BY status");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['roomApplications'] += (int)$row['count'];
    if ($row['status'] === 'Approved') $data['roomApproved'] = (int)$row['count'];
    if ($row['status'] === 'Rejected') $data['roomRejected'] = (int)$row['count'];
    if ($row['status'] === 'Pending Review' || $row['status'] === 'Pending') $data['roomPending'] = (int)$row['count'];
}
$stmt->close();

// Maintenance breakdown
$stmt = $conn->prepare("SELECT status, issue_category, urgency FROM maintenance_requests WHERE $dateCondition");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['totalMaintenance']++;
    if ($row['status'] === 'Completed' || $row['status'] === 'Resolved') $data['maintCompleted']++;
    else if ($row['status'] === 'In Progress') $data['maintInProgress']++;
    else if ($row['status'] === 'Pending') $data['maintPending']++;

    $cat = $row['issue_category'];
    $data['maintCategoryCounts'][$cat] = ($data['maintCategoryCounts'][$cat] ?? 0) + 1;

    $urg = $row['urgency'];
    $data['maintUrgencyCounts'][$urg] = ($data['maintUrgencyCounts'][$urg] ?? 0) + 1;
}
$stmt->close();

// Parking Reservations
$stmt = $conn->prepare("SELECT COUNT(*) as count FROM parking_reservations WHERE $dateCondition");
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['parkingReservationsCount'] = (int)$row['count'];
}
$stmt->close();

echo json_encode(['success' => true, 'data' => $data]);
$conn->close();
?>
