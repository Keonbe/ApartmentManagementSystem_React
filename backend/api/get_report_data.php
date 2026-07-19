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

// -- ADD MISSING ARRAYS FOR ADMIN REPORTS UI --

// 1. tenantList (Occupancy)
$data['tenantList'] = [];
$stmt = $conn->prepare("SELECT r.id as unit, u.first_name, u.last_name, u.email_address, u.contact_no, ra.created_at, r.monthly_rent, r.lease_end, r.status FROM rooms r LEFT JOIN rent_applications ra ON r.id = ra.room_name AND ra.status = 'Approved' LEFT JOIN users u ON ra.user_id = u.id WHERE r.status = 'Occupied'");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['tenantList'][] = [
        'unit' => $row['unit'],
        'name' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
        'email' => $row['email_address'] ?? '',
        'phone' => $row['contact_no'] ?? '',
        'moveIn' => $row['created_at'] ? date('Y-m-d', strtotime($row['created_at'])) : '',
        'rent' => (float)$row['monthly_rent'],
        'leaseEnd' => $row['lease_end'] ?? '',
        'status' => 'active'
    ];
}
$stmt->close();

// 2. methodsBreakdown & payment records
$data['methodsBreakdown'] = ['Cash' => 0, 'GCash' => 0, 'Bank Transfer' => 0];
$data['paymentRecords'] = [];
$stmt = $conn->prepare("SELECT i.id, u.first_name, u.last_name, r.id as unit, i.billing_period, i.total_amount, i.payment_method, i.paid_at, i.base_rent, i.water, i.electricity FROM invoices i LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id LEFT JOIN rooms r ON ra.room_name = r.id LEFT JOIN users u ON i.user_id = u.id WHERE i.status = 'paid' AND $paidDateCondition ORDER BY i.paid_at DESC LIMIT 50");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $method = $row['payment_method'] ?? 'Cash';
    if (isset($data['methodsBreakdown'][$method])) {
        $data['methodsBreakdown'][$method]++;
    } else {
        $data['methodsBreakdown'][$method] = 1;
    }
    
    $data['paymentRecords'][] = [
        'id' => $row['id'],
        'tenant' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
        'unit' => $row['unit'] ?? 'N/A',
        'period' => $row['billing_period'],
        'amount' => (float)$row['total_amount'],
        'method' => $method,
        'datePaid' => date('Y-m-d', strtotime($row['paid_at'])),
        'breakdown' => "Rent: {$row['base_rent']} | Water: {$row['water']} | Elec: {$row['electricity']}"
    ];
}
$stmt->close();

// 3. outstandingBalances
$data['outstandingBalances'] = [];
$stmt = $conn->prepare("SELECT u.first_name, u.last_name, r.id as unit, i.total_amount FROM invoices i LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id LEFT JOIN rooms r ON ra.room_name = r.id LEFT JOIN users u ON i.user_id = u.id WHERE i.status = 'pending' AND i.due_date < CURDATE()");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['outstandingBalances'][] = [
        'tenant' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
        'unit' => $row['unit'] ?? 'N/A',
        'balance' => (float)$row['total_amount']
    ];
}
$stmt->close();

// 4. maintenanceRecords
$data['maintenanceRecords'] = [];
$stmt = $conn->prepare("SELECT m.id, u.first_name, u.last_name, r.id as unit, m.issue_category, m.urgency, m.created_at, m.status, m.description FROM maintenance_requests m LEFT JOIN users u ON m.user_id = u.id LEFT JOIN rent_applications ra ON u.id = ra.user_id AND ra.status = 'Approved' LEFT JOIN rooms r ON ra.room_name = r.id WHERE $dateCondition ORDER BY m.created_at DESC LIMIT 50");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['maintenanceRecords'][] = [
        'id' => 'MR-'.str_pad($row['id'], 4, '0', STR_PAD_LEFT),
        'unit' => $row['unit'] ?? 'N/A',
        'tenant' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
        'category' => $row['issue_category'],
        'urgency' => $row['urgency'],
        'dateSubmitted' => date('Y-m-d', strtotime($row['created_at'])),
        'status' => $row['status'],
        'description' => $row['description']
    ];
}
$stmt->close();

// 5. roomList
$data['roomList'] = [];
$stmt = $conn->prepare("SELECT id, first_name, last_name, room_name, monthly_rent, months_of_rent, created_at, status FROM rent_applications WHERE $dateCondition ORDER BY created_at DESC LIMIT 50");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['roomList'][] = [
        'id' => 'APP-'.str_pad($row['id'], 4, '0', STR_PAD_LEFT),
        'name' => trim($row['first_name'] . ' ' . $row['last_name']),
        'unit' => $row['room_name'] ?? 'N/A',
        'rent' => (float)$row['monthly_rent'],
        'duration' => $row['months_of_rent'],
        'dateSubmitted' => date('Y-m-d', strtotime($row['created_at'])),
        'status' => $row['status']
    ];
}
$stmt->close();

// 6. parkingList
$data['parkingList'] = [];
$stmt = $conn->prepare("SELECT p.id, u.first_name, u.last_name, p.vehicle_model, p.vehicle_type, p.plate_number, p.total_cost, p.duration_months, p.created_at, p.status FROM parking_reservations p LEFT JOIN users u ON p.user_id = u.id WHERE $dateCondition ORDER BY p.created_at DESC LIMIT 50");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['parkingList'][] = [
        'id' => 'PKG-'.str_pad($row['id'], 4, '0', STR_PAD_LEFT),
        'tenant' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
        'vehicleModel' => $row['vehicle_model'],
        'vehicleType' => $row['vehicle_type'],
        'plateNumber' => $row['plate_number'],
        'totalCost' => (float)$row['total_cost'],
        'duration' => $row['duration_months'],
        'dateSubmitted' => date('Y-m-d', strtotime($row['created_at'])),
        'status' => $row['status'] ?? 'Pending'
    ];
}
$stmt->close();

echo json_encode(['success' => true, 'data' => $data]);
$conn->close();
?>
