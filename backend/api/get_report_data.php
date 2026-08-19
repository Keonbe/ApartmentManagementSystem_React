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

$timeframe = $_GET['timeframe'] ?? 'monthly';
$month = isset($_GET['month']) ? (int)$_GET['month'] : date('n');
$year = isset($_GET['year']) ? (int)$_GET['year'] : date('Y');
$quarter = isset($_GET['quarter']) ? (int)$_GET['quarter'] : ceil(date('n') / 3);

// Current period date conditions
$dateCondition = "";
if ($timeframe === 'yearly') {
    $dateCondition = "YEAR(created_at) = $year";
    $paidDateCondition = "YEAR(paid_at) = $year";
    $maintDateCondition = "YEAR(m.created_at) = $year";
    $maintDirectDateCondition = "YEAR(created_at) = $year";
    $parkingDateCondition = "YEAR(p.created_at) = $year";
    $invoiceDateCondition = "YEAR(i.paid_at) = $year";
} elseif ($timeframe === 'quarterly') {
    $dateCondition = "YEAR(created_at) = $year AND QUARTER(created_at) = $quarter";
    $paidDateCondition = "YEAR(paid_at) = $year AND QUARTER(paid_at) = $quarter";
    $maintDateCondition = "YEAR(m.created_at) = $year AND QUARTER(m.created_at) = $quarter";
    $maintDirectDateCondition = "YEAR(created_at) = $year AND QUARTER(created_at) = $quarter";
    $parkingDateCondition = "YEAR(p.created_at) = $year AND QUARTER(p.created_at) = $quarter";
    $invoiceDateCondition = "YEAR(i.paid_at) = $year AND QUARTER(i.paid_at) = $quarter";
} else {
    $dateCondition = "YEAR(created_at) = $year AND MONTH(created_at) = $month";
    $paidDateCondition = "YEAR(paid_at) = $year AND MONTH(paid_at) = $month";
    $maintDateCondition = "YEAR(m.created_at) = $year AND MONTH(m.created_at) = $month";
    $maintDirectDateCondition = "YEAR(created_at) = $year AND MONTH(created_at) = $month";
    $parkingDateCondition = "YEAR(p.created_at) = $year AND MONTH(p.created_at) = $month";
    $invoiceDateCondition = "YEAR(i.paid_at) = $year AND MONTH(i.paid_at) = $month";
}

// Previous period date conditions (for period comparison & growth rates)
$prevYear = $year;
$prevMonth = $month - 1;
$prevQuarter = $quarter - 1;

if ($timeframe === 'yearly') {
    $prevYear = $year - 1;
    $prevPaidCondition = "YEAR(paid_at) = $prevYear";
    $prevMaintCondition = "YEAR(created_at) = $prevYear";
} elseif ($timeframe === 'quarterly') {
    if ($prevQuarter < 1) {
        $prevQuarter = 4;
        $prevYear = $year - 1;
    }
    $prevPaidCondition = "YEAR(paid_at) = $prevYear AND QUARTER(paid_at) = $prevQuarter";
    $prevMaintCondition = "YEAR(created_at) = $prevYear AND QUARTER(created_at) = $prevQuarter";
} else {
    if ($prevMonth < 1) {
        $prevMonth = 12;
        $prevYear = $year - 1;
    }
    $prevPaidCondition = "YEAR(paid_at) = $prevYear AND MONTH(paid_at) = $prevMonth";
    $prevMaintCondition = "YEAR(created_at) = $prevYear AND MONTH(created_at) = $prevMonth";
}

$data = [
    'totalOccupied' => 0,
    'totalRooms' => 15,
    'moveIns' => 0,
    'moveOuts' => 0,
    'rentCollected' => 0,
    'waterCollected' => 0,
    'electricCollected' => 0,
    'parkingCollected' => 0,
    'depositCollected' => 0,
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

// 1. Total rooms count in building
$stmt = $conn->prepare("SELECT COUNT(*) as total FROM rooms");
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['totalRooms'] = (int)$row['total'];
}
$stmt->close();

// 2. Room occupancy (Active rooms right now)
$stmt = $conn->prepare("SELECT COUNT(*) as occupied FROM rooms WHERE status = 'Occupied'");
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['totalOccupied'] = (int)$row['occupied'];
}
$stmt->close();

// 3. Financials (Current Period from Invoices)
$stmt = $conn->prepare("SELECT 
    SUM(base_rent) as rent, 
    SUM(water) as water, 
    SUM(electricity) as electric, 
    SUM(parking) as parking, 
    SUM(COALESCE(security_deposit, 0)) as deposit, 
    SUM(total_amount) as total 
FROM invoices 
WHERE status = 'paid' AND $paidDateCondition");
$stmt->execute();
$res = $stmt->get_result();
$grossRevenue = 0.0;
if ($row = $res->fetch_assoc()) {
    $data['rentCollected'] = (float)($row['rent'] ?? 0);
    $data['waterCollected'] = (float)($row['water'] ?? 0);
    $data['electricCollected'] = (float)($row['electric'] ?? 0);
    $data['parkingCollected'] = (float)($row['parking'] ?? 0);
    $data['depositCollected'] = (float)($row['deposit'] ?? 0);
    $grossRevenue = (float)($row['total'] ?? 0);
}
$stmt->close();

// 4. Financials (Previous Period from Invoices)
$prevRent = 0.0;
$prevWater = 0.0;
$prevElectric = 0.0;
$prevParking = 0.0;
$prevDeposit = 0.0;
$prevGrossRevenue = 0.0;

$stmt = $conn->prepare("SELECT 
    SUM(base_rent) as rent, 
    SUM(water) as water, 
    SUM(electricity) as electric, 
    SUM(parking) as parking, 
    SUM(COALESCE(security_deposit, 0)) as deposit, 
    SUM(total_amount) as total 
FROM invoices 
WHERE status = 'paid' AND $prevPaidCondition");
if ($stmt) {
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $prevRent = (float)($row['rent'] ?? 0);
        $prevWater = (float)($row['water'] ?? 0);
        $prevElectric = (float)($row['electric'] ?? 0);
        $prevParking = (float)($row['parking'] ?? 0);
        $prevDeposit = (float)($row['deposit'] ?? 0);
        $prevGrossRevenue = (float)($row['total'] ?? 0);
    }
    $stmt->close();
}

// 5. Maintenance Expenses (Current Period)
$actualMaintExpenses = 0.0;
$stmt = $conn->prepare("SELECT SUM(COALESCE(estimated_cost, 0)) as maint_cost FROM maintenance_requests WHERE status IN ('Completed', 'Resolved') AND $maintDirectDateCondition");
if ($stmt) {
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $actualMaintExpenses = (float)($row['maint_cost'] ?? 0);
    }
    $stmt->close();
}

// Prior maintenance expenses
$prevMaintExpenses = 0.0;
$stmt = $conn->prepare("SELECT SUM(COALESCE(estimated_cost, 0)) as maint_cost FROM maintenance_requests WHERE status IN ('Completed', 'Resolved') AND $prevMaintCondition");
if ($stmt) {
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $prevMaintExpenses = (float)($row['maint_cost'] ?? 0);
    }
    $stmt->close();
}

// Operating Expenses calculation: Real maintenance + estimated utility/property operations overhead
$operatingOverhead = round($grossRevenue * 0.15); // 15% operations & facility overhead
$operatingExpenses = $actualMaintExpenses + $operatingOverhead;
if ($operatingExpenses == 0 && $grossRevenue > 0) {
    $operatingExpenses = round($grossRevenue * 0.25);
}
$data['expenses'] = $operatingExpenses;

$prevOperatingOverhead = round($prevGrossRevenue * 0.15);
$prevOperatingExpenses = $prevMaintExpenses + $prevOperatingOverhead;
if ($prevOperatingExpenses == 0 && $prevGrossRevenue > 0) {
    $prevOperatingExpenses = round($prevGrossRevenue * 0.25);
}

$netIncome = $grossRevenue - $operatingExpenses;
$prevNetIncome = $prevGrossRevenue - $prevOperatingExpenses;

// Growth calculations
$revenueGrowthPct = $prevGrossRevenue > 0 ? round((($grossRevenue - $prevGrossRevenue) / $prevGrossRevenue) * 100, 1) : 0;
$netGrowthPct = $prevNetIncome > 0 ? round((($netIncome - $prevNetIncome) / $prevNetIncome) * 100, 1) : 0;
$netMarginPct = $grossRevenue > 0 ? round(($netIncome / $grossRevenue) * 100, 1) : 0;

// Outstanding Overdue Invoices
$totalOutstanding = 0.0;
$stmt = $conn->prepare("SELECT SUM(total_amount) as overdue FROM invoices WHERE status = 'pending' AND due_date < CURDATE()");
if ($stmt) {
    $stmt->execute();
    if ($row = $stmt->get_result()->fetch_assoc()) {
        $totalOutstanding = (float)($row['overdue'] ?? 0);
    }
    $stmt->close();
}
$billedTotal = $grossRevenue + $totalOutstanding;
$collectionEfficiency = $billedTotal > 0 ? round(($grossRevenue / $billedTotal) * 100, 1) : 100;

// Income Statement Summary Structure (8.2)
$data['incomeStatement'] = [
    'grossRevenue' => $grossRevenue,
    'rentalRevenue' => $data['rentCollected'] + $data['parkingCollected'],
    'utilityRevenue' => $data['waterCollected'] + $data['electricCollected'],
    'depositRevenue' => $data['depositCollected'],
    'maintenanceExpenses' => $actualMaintExpenses,
    'operatingOverhead' => $operatingOverhead,
    'operatingExpenses' => $operatingExpenses,
    'netOperatingIncome' => $netIncome,
    'netMarginPct' => $netMarginPct,
    'collectionEfficiency' => $collectionEfficiency,
    'totalOutstanding' => $totalOutstanding,
    'prevGrossRevenue' => $prevGrossRevenue,
    'revenueGrowthPct' => $revenueGrowthPct,
    'prevNetIncome' => $prevNetIncome,
    'netGrowthPct' => $netGrowthPct
];

// Revenue Streams Analysis Breakdown (8.3)
$streams = [
    [
        'id' => 'rent',
        'category' => 'Base Room Rent',
        'amount' => $data['rentCollected'],
        'pct' => $grossRevenue > 0 ? round(($data['rentCollected'] / $grossRevenue) * 100, 1) : 0,
        'prevAmount' => $prevRent,
        'growthPct' => $prevRent > 0 ? round((($data['rentCollected'] - $prevRent) / $prevRent) * 100, 1) : 0,
        'color' => '#6366f1',
        'icon' => 'faBuilding'
    ],
    [
        'id' => 'electric',
        'category' => 'Electricity Utility',
        'amount' => $data['electricCollected'],
        'pct' => $grossRevenue > 0 ? round(($data['electricCollected'] / $grossRevenue) * 100, 1) : 0,
        'prevAmount' => $prevElectric,
        'growthPct' => $prevElectric > 0 ? round((($data['electricCollected'] - $prevElectric) / $prevElectric) * 100, 1) : 0,
        'color' => '#f59e0b',
        'icon' => 'faBolt'
    ],
    [
        'id' => 'water',
        'category' => 'Water Utility',
        'amount' => $data['waterCollected'],
        'pct' => $grossRevenue > 0 ? round(($data['waterCollected'] / $grossRevenue) * 100, 1) : 0,
        'prevAmount' => $prevWater,
        'growthPct' => $prevWater > 0 ? round((($data['waterCollected'] - $prevWater) / $prevWater) * 100, 1) : 0,
        'color' => '#3b82f6',
        'icon' => 'faTint'
    ],
    [
        'id' => 'parking',
        'category' => 'Parking Space',
        'amount' => $data['parkingCollected'],
        'pct' => $grossRevenue > 0 ? round(($data['parkingCollected'] / $grossRevenue) * 100, 1) : 0,
        'prevAmount' => $prevParking,
        'growthPct' => $prevParking > 0 ? round((($data['parkingCollected'] - $prevParking) / $prevParking) * 100, 1) : 0,
        'color' => '#ec4899',
        'icon' => 'faSquareParking'
    ],
    [
        'id' => 'deposit',
        'category' => 'Security Deposits & Fees',
        'amount' => $data['depositCollected'],
        'pct' => $grossRevenue > 0 ? round(($data['depositCollected'] / $grossRevenue) * 100, 1) : 0,
        'prevAmount' => $prevDeposit,
        'growthPct' => $prevDeposit > 0 ? round((($data['depositCollected'] - $prevDeposit) / $prevDeposit) * 100, 1) : 0,
        'color' => '#10b981',
        'icon' => 'faShieldAlt'
    ]
];
$data['revenueStreams'] = $streams;

// Revenue Diversification metrics
$data['diversification'] = [
    'coreRentPct' => $grossRevenue > 0 ? round(($data['rentCollected'] / $grossRevenue) * 100, 1) : 0,
    'utilitiesPct' => $grossRevenue > 0 ? round((($data['waterCollected'] + $data['electricCollected']) / $grossRevenue) * 100, 1) : 0,
    'ancillaryPct' => $grossRevenue > 0 ? round((($data['parkingCollected'] + $data['depositCollected']) / $grossRevenue) * 100, 1) : 0,
    'utilityRecoveryRatio' => ($data['waterCollected'] + $data['electricCollected']) > 0 ? 100 : 0
];

// Unit-by-Unit Income Ledger
$data['unitIncome'] = [];
$stmt = $conn->prepare("SELECT 
    COALESCE(r.id, ra.room_name, 'General') as unit,
    COALESCE(r.type, 'Standard Unit') as room_type,
    COALESCE(r.floor, 1) as floor,
    SUM(i.base_rent) as rent_total,
    SUM(i.water) as water_total,
    SUM(i.electricity) as electric_total,
    SUM(i.parking) as parking_total,
    SUM(COALESCE(i.security_deposit, 0)) as deposit_total,
    SUM(i.total_amount) as total_collected,
    COUNT(i.id) as invoice_count
FROM invoices i
LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
LEFT JOIN rooms r ON ra.room_name = r.id
WHERE i.status = 'paid' AND $invoiceDateCondition
GROUP BY unit, r.type, r.floor
ORDER BY total_collected DESC");
if ($stmt) {
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $uTotal = (float)$row['total_collected'];
        $data['unitIncome'][] = [
            'unit' => $row['unit'],
            'roomType' => $row['room_type'],
            'floor' => (int)$row['floor'],
            'rent' => (float)$row['rent_total'],
            'water' => (float)$row['water_total'],
            'electric' => (float)$row['electric_total'],
            'parking' => (float)$row['parking_total'],
            'deposit' => (float)$row['deposit_total'],
            'total' => $uTotal,
            'pct' => $grossRevenue > 0 ? round(($uTotal / $grossRevenue) * 100, 1) : 0,
            'invoicesCount' => (int)$row['invoice_count']
        ];
    }
    $stmt->close();
}

// Move-ins (Approved applications in period)
$stmt = $conn->prepare("SELECT COUNT(*) as count FROM rent_applications WHERE status = 'Approved' AND $dateCondition");
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['moveIns'] = (int)$row['count'];
}
$stmt->close();

// Move-outs (Applications changed to 'moved-out' in period)
$stmt = $conn->prepare("SELECT COUNT(*) as count FROM rent_applications WHERE status = 'moved-out' AND $dateCondition");
$stmt->execute();
$data['moveOuts'] = 0;
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['moveOuts'] = (int)$row['count'];
}
$stmt->close();

// Average lease stay duration
$stmt = $conn->prepare("SELECT IFNULL(AVG(months_of_rent), 6.0) as avg_duration FROM rent_applications WHERE status IN ('Approved', 'moved-out')");
$stmt->execute();
$data['avgStayDuration'] = 6.0;
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['avgStayDuration'] = round((float)$row['avg_duration'], 1);
}
$stmt->close();

// Generate 6-month historical trend points with multi-stream decomposition from real database records
$trendPoints = [];

// Determine anchor timestamp based on selected timeframe
if ($timeframe === 'yearly') {
    $anchor_time = strtotime("$year-12-01");
} elseif ($timeframe === 'quarterly') {
    $end_month = min(12, max(1, $quarter * 3));
    $anchor_time = strtotime("$year-$end_month-01");
} else {
    $anchor_time = strtotime("$year-$month-01");
}

for ($i = 5; $i >= 0; $i--) {
    $target_date = date('Y-m-d', strtotime("-$i months", $anchor_time));
    $target_year = (int)date('Y', strtotime($target_date));
    $target_month = (int)date('n', strtotime($target_date));
    $month_label = date('M', strtotime($target_date));
    
    // Multi-stream revenue query directly from paid invoices
    $rev_stmt = $conn->prepare("SELECT 
        SUM(base_rent) as rent,
        SUM(electricity) as electric,
        SUM(water) as water,
        SUM(parking) as parking,
        SUM(COALESCE(security_deposit, 0)) as deposit,
        SUM(total_amount) as total
    FROM invoices 
    WHERE status = 'paid' AND YEAR(COALESCE(paid_at, created_at)) = ? AND MONTH(COALESCE(paid_at, created_at)) = ?");
    $rev_stmt->bind_param("ii", $target_year, $target_month);
    $rev_stmt->execute();
    $rev_res = $rev_stmt->get_result()->fetch_assoc();
    
    $monthRent = (float)($rev_res['rent'] ?? 0);
    $monthElectric = (float)($rev_res['electric'] ?? 0);
    $monthWater = (float)($rev_res['water'] ?? 0);
    $monthParking = (float)($rev_res['parking'] ?? 0);
    $monthDeposit = (float)($rev_res['deposit'] ?? 0);
    $monthRevenue = (float)($rev_res['total'] ?? 0);
    if ($monthRevenue == 0 && ($monthRent > 0 || $monthElectric > 0 || $monthWater > 0 || $monthParking > 0 || $monthDeposit > 0)) {
        $monthRevenue = $monthRent + $monthElectric + $monthWater + $monthParking + $monthDeposit;
    }
    $rev_stmt->close();
    
    // Maintenance cost for that target month from real completed maintenance records
    $maint_stmt = $conn->prepare("SELECT SUM(COALESCE(estimated_cost, 0)) as cost FROM maintenance_requests WHERE status IN ('Completed', 'Resolved') AND YEAR(created_at) = ? AND MONTH(created_at) = ?");
    $maint_stmt->bind_param("ii", $target_year, $target_month);
    $maint_stmt->execute();
    $m_cost = (float)($maint_stmt->get_result()->fetch_assoc()['cost'] ?? 0);
    $maint_stmt->close();
    
    $monthExpenses = $m_cost;
    if ($monthRevenue > 0) {
        $monthExpenses += round($monthRevenue * 0.15); // Standard overhead
    }
    $monthNet = $monthRevenue - $monthExpenses;
    
    // Occupied rooms in target month from database lease contracts & approved applications
    $occ_stmt = $conn->prepare("
        SELECT COUNT(DISTINCT room_name) as count FROM (
            SELECT ra.room_name 
            FROM lease_contracts lc
            JOIN rent_applications ra ON lc.rent_application_id = ra.id
            WHERE lc.lease_start IS NOT NULL AND lc.lease_start != ''
              AND lc.lease_start <= LAST_DAY(STR_TO_DATE(CONCAT(?, '-', ?, '-01'), '%Y-%m-%d'))
              AND (lc.lease_end IS NULL OR lc.lease_end = '' OR lc.lease_end >= STR_TO_DATE(CONCAT(?, '-', ?, '-01'), '%Y-%m-%d'))
            UNION
            SELECT ra2.room_name 
            FROM rent_applications ra2
            WHERE ra2.status IN ('Approved', 'occupied')
              AND ra2.created_at <= LAST_DAY(STR_TO_DATE(CONCAT(?, '-', ?, '-01'), '%Y-%m-%d'))
        ) as occ
    ");
    $occ_stmt->bind_param("iiiiii", $target_year, $target_month, $target_year, $target_month, $target_year, $target_month);
    $occ_stmt->execute();
    $occ_res = $occ_stmt->get_result()->fetch_assoc();
    $occupied = (int)($occ_res['count'] ?? 0);
    $occ_stmt->close();
    
    // If it's the current active month and occupied count is 0, check live occupied rooms in rooms table
    if ($occupied == 0 && $target_year == (int)date('Y') && $target_month == (int)date('n')) {
        $occupied = $data['totalOccupied'];
    }
    
    $total_rooms = $data['totalRooms'];
    $occ_rate = $total_rooms > 0 ? round(($occupied / $total_rooms) * 100) : 0;
    
    $trendPoints[] = [
        'label' => $month_label,
        'year' => (int)$target_year,
        'month' => $target_month,
        'revenue' => $monthRevenue,
        'rent' => $monthRent,
        'electric' => $monthElectric,
        'water' => $monthWater,
        'parking' => $monthParking,
        'deposit' => $monthDeposit,
        'expenses' => $monthExpenses,
        'net' => $monthNet,
        'occupancyRate' => $occ_rate
    ];
}
$data['trendPoints'] = $trendPoints;

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

// Detail Lists:

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
$stmt = $conn->prepare("SELECT i.id, u.first_name, u.last_name, r.id as unit, i.billing_period, i.total_amount, i.payment_method, i.paid_at, i.base_rent, i.water, i.electricity, i.parking, i.security_deposit FROM invoices i LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id LEFT JOIN rooms r ON ra.room_name = r.id LEFT JOIN users u ON i.user_id = u.id WHERE i.status = 'paid' AND $invoiceDateCondition ORDER BY i.paid_at DESC LIMIT 50");
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
        'breakdown' => "Rent: ₱{$row['base_rent']} | Water: ₱{$row['water']} | Elec: ₱{$row['electricity']}" . ($row['parking'] > 0 ? " | Park: ₱{$row['parking']}" : "") . ($row['security_deposit'] > 0 ? " | Dep: ₱{$row['security_deposit']}" : "")
    ];
}
$stmt->close();

// 3. outstandingBalances
$data['outstandingBalances'] = [];
$stmt = $conn->prepare("SELECT u.first_name, u.last_name, r.id as unit, i.total_amount, DATEDIFF(CURDATE(), i.due_date) as days_overdue FROM invoices i LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id LEFT JOIN rooms r ON ra.room_name = r.id LEFT JOIN users u ON i.user_id = u.id WHERE i.status = 'pending' AND i.due_date < CURDATE()");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['outstandingBalances'][] = [
        'tenant' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
        'unit' => $row['unit'] ?? 'N/A',
        'balance' => (float)$row['total_amount'],
        'daysOverdue' => max(1, (int)$row['days_overdue'])
    ];
}
$stmt->close();

// 4. maintenanceRecords
$data['maintenanceRecords'] = [];
$stmt = $conn->prepare("SELECT m.id, u.first_name, u.last_name, r.id as unit, m.issue_category, m.urgency, m.created_at, m.status, m.description, m.estimated_cost FROM maintenance_requests m LEFT JOIN users u ON m.user_id = u.id LEFT JOIN rent_applications ra ON u.id = ra.user_id AND ra.status = 'Approved' LEFT JOIN rooms r ON ra.room_name = r.id WHERE $maintDateCondition ORDER BY m.created_at DESC LIMIT 50");
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
        'description' => $row['description'],
        'cost' => (float)($row['estimated_cost'] ?? 0)
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
$stmt = $conn->prepare("SELECT p.id, u.first_name, u.last_name, p.vehicle_model, p.vehicle_type, p.plate_number, p.total_cost, p.duration_months, p.created_at, p.status FROM parking_reservations p LEFT JOIN users u ON p.user_id = u.id WHERE $parkingDateCondition ORDER BY p.created_at DESC LIMIT 50");
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
