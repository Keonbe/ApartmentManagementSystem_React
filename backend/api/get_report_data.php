<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once __DIR__ . "/../config.php";

// Keep report queries compatible with deployments that enable strict grouping;
// grouped report queries below explicitly group their selected expressions.
$conn->query("SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''))");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

try {
// Bring invoice states up to date first, so an invoice that lapsed since anyone
// last opened the billing pages is already counted as overdue here.
promote_overdue_invoices($conn);

$timeframe = $_GET['timeframe'] ?? 'monthly';
if (!in_array($timeframe, ['monthly', 'quarterly', 'yearly'], true)) {
    $timeframe = 'monthly';
}
$month = isset($_GET['month']) ? (int)$_GET['month'] : date('n');
$year = isset($_GET['year']) ? (int)$_GET['year'] : date('Y');
$quarter = isset($_GET['quarter']) ? (int)$_GET['quarter'] : ceil(date('n') / 3);
$month = min(12, max(1, $month));
$quarter = min(4, max(1, $quarter));

// Collected money is dated by when it was paid; created_at stands in only for a
// paid row with no paid_at stamp. The 6-month trend below uses the same rule, so
// the period figures and the chart can no longer disagree.
$paidAt = "COALESCE(paid_at, created_at)";
$paidAtI = "COALESCE(i.paid_at, i.created_at)";
// A repair is an expense of the month it was finished, not the month it was reported.
$resolvedAt = "COALESCE(resolved_at, created_at)";

// Current period date conditions
$dateCondition = "";
if ($timeframe === 'yearly') {
    $dateCondition = "YEAR(created_at) = $year";
    $paidDateCondition = "YEAR($paidAt) = $year";
    $maintDateCondition = "YEAR(m.created_at) = $year";
    $maintDirectDateCondition = "YEAR($resolvedAt) = $year";
    $parkingDateCondition = "YEAR(p.created_at) = $year";
    $invoiceDateCondition = "YEAR($paidAtI) = $year";
} elseif ($timeframe === 'quarterly') {
    $dateCondition = "YEAR(created_at) = $year AND QUARTER(created_at) = $quarter";
    $paidDateCondition = "YEAR($paidAt) = $year AND QUARTER($paidAt) = $quarter";
    $maintDateCondition = "YEAR(m.created_at) = $year AND QUARTER(m.created_at) = $quarter";
    $maintDirectDateCondition = "YEAR($resolvedAt) = $year AND QUARTER($resolvedAt) = $quarter";
    $parkingDateCondition = "YEAR(p.created_at) = $year AND QUARTER(p.created_at) = $quarter";
    $invoiceDateCondition = "YEAR($paidAtI) = $year AND QUARTER($paidAtI) = $quarter";
} else {
    $dateCondition = "YEAR(created_at) = $year AND MONTH(created_at) = $month";
    $paidDateCondition = "YEAR($paidAt) = $year AND MONTH($paidAt) = $month";
    $maintDateCondition = "YEAR(m.created_at) = $year AND MONTH(m.created_at) = $month";
    $maintDirectDateCondition = "YEAR($resolvedAt) = $year AND MONTH($resolvedAt) = $month";
    $parkingDateCondition = "YEAR(p.created_at) = $year AND MONTH(p.created_at) = $month";
    $invoiceDateCondition = "YEAR($paidAtI) = $year AND MONTH($paidAtI) = $month";
}

// Previous period date conditions (for period comparison & growth rates)
$prevYear = $year;
$prevMonth = $month - 1;
$prevQuarter = $quarter - 1;

if ($timeframe === 'yearly') {
    $prevYear = $year - 1;
    $prevPaidCondition = "YEAR($paidAt) = $prevYear";
    $prevMaintCondition = "YEAR($resolvedAt) = $prevYear";
} elseif ($timeframe === 'quarterly') {
    if ($prevQuarter < 1) {
        $prevQuarter = 4;
        $prevYear = $year - 1;
    }
    $prevPaidCondition = "YEAR($paidAt) = $prevYear AND QUARTER($paidAt) = $prevQuarter";
    $prevMaintCondition = "YEAR($resolvedAt) = $prevYear AND QUARTER($resolvedAt) = $prevQuarter";
} else {
    if ($prevMonth < 1) {
        $prevMonth = 12;
        $prevYear = $year - 1;
    }
    $prevPaidCondition = "YEAR($paidAt) = $prevYear AND MONTH($paidAt) = $prevMonth";
    $prevMaintCondition = "YEAR($resolvedAt) = $prevYear AND MONTH($resolvedAt) = $prevMonth";
}

// Overhead is only charged when the admin has configured a real percentage
// (system_settings.report_overhead_pct). The report used to invent a flat 15%
// overhead — and 25% of revenue when there were no costs at all — so the
// income statement showed expenses the building never had.
$overheadPct = 0.0;
$stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'report_overhead_pct'");
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $overheadPct = min(100, max(0, (float)$row['setting_value']));
}
$stmt->close();

$data = [
    'totalOccupied' => 0,
    'totalRooms' => 0,
    'moveIns' => 0,
    'moveOuts' => 0,
    'rentCollected' => 0,
    'waterCollected' => 0,
    'electricCollected' => 0,
    'parkingCollected' => 0,
    'servicesCollected' => 0,
    'maintenanceCollected' => 0,
    'depositCollected' => 0,
    'lateFeesCollected' => 0,
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
$roomsArchiveColumn = $conn->query("SHOW COLUMNS FROM rooms LIKE 'archived_at'");
$roomsActiveFilter = ($roomsArchiveColumn && $roomsArchiveColumn->num_rows > 0) ? ' WHERE archived_at IS NULL' : '';
$stmt = $conn->prepare("SELECT COUNT(*) as total FROM rooms" . $roomsActiveFilter);
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['totalRooms'] = (int)$row['total'];
}
$stmt->close();

// 2. Room occupancy (Active rooms right now)
$stmt = $conn->prepare("SELECT COUNT(*) as occupied FROM rooms" . ($roomsActiveFilter ? " WHERE archived_at IS NULL AND status = 'Occupied'" : " WHERE status = 'Occupied'"));
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['totalOccupied'] = (int)$row['occupied'];
}
$stmt->close();

// 3. Financials (Current Period from Invoices)
// Gross revenue leaves out security deposits (payments audit 2026-09-30): a
// deposit is money held for the tenant — a liability — not income.
// depositCollected is reported on its own as deposits received and held.
$stmt = $conn->prepare("SELECT 
    SUM(base_rent) as rent, 
    SUM(water) as water, 
    SUM(electricity) as electric, 
    SUM(parking) as parking,
    SUM(COALESCE(services, 0)) as services,
    SUM(COALESCE(maintenance, 0)) as maintenance,
    SUM(COALESCE(security_deposit, 0)) as deposit,
    SUM(late_fee) as late_fee,
    SUM(total_amount - COALESCE(security_deposit, 0)) as total
FROM invoices
WHERE status = 'paid' AND advance_months IS NULL AND $paidDateCondition");
$stmt->execute();
$res = $stmt->get_result();
$grossRevenue = 0.0;
if ($row = $res->fetch_assoc()) {
    $data['rentCollected'] = (float)($row['rent'] ?? 0);
    $data['waterCollected'] = (float)($row['water'] ?? 0);
    $data['electricCollected'] = (float)($row['electric'] ?? 0);
    $data['parkingCollected'] = (float)($row['parking'] ?? 0);
    $data['servicesCollected'] = (float)($row['services'] ?? 0);
    $data['maintenanceCollected'] = (float)($row['maintenance'] ?? 0);
    $data['depositCollected'] = (float)($row['deposit'] ?? 0);
    $data['lateFeesCollected'] = (float)($row['late_fee'] ?? 0);
    $grossRevenue = (float)($row['total'] ?? 0);
}
$stmt->close();

// 4. Financials (Previous Period from Invoices)
$prevRent = 0.0;
$prevWater = 0.0;
$prevElectric = 0.0;
$prevParking = 0.0;
$prevServices = 0.0;
$prevMaintenance = 0.0;
$prevDeposit = 0.0;
$prevLateFee = 0.0;
$prevGrossRevenue = 0.0;

$stmt = $conn->prepare("SELECT
    SUM(base_rent) as rent,
    SUM(water) as water,
    SUM(electricity) as electric,
    SUM(parking) as parking,
    SUM(COALESCE(services, 0)) as services,
    SUM(COALESCE(maintenance, 0)) as maintenance,
    SUM(COALESCE(security_deposit, 0)) as deposit,
    SUM(late_fee) as late_fee,
    SUM(total_amount - COALESCE(security_deposit, 0)) as total
FROM invoices
WHERE status = 'paid' AND advance_months IS NULL AND $prevPaidCondition");
if ($stmt) {
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $prevRent = (float)($row['rent'] ?? 0);
        $prevWater = (float)($row['water'] ?? 0);
        $prevElectric = (float)($row['electric'] ?? 0);
        $prevParking = (float)($row['parking'] ?? 0);
        $prevServices = (float)($row['services'] ?? 0);
        $prevMaintenance = (float)($row['maintenance'] ?? 0);
        $prevDeposit = (float)($row['deposit'] ?? 0);
        $prevLateFee = (float)($row['late_fee'] ?? 0);
        $prevGrossRevenue = (float)($row['total'] ?? 0);
    }
    $stmt->close();
}

// 5. Maintenance Expenses (Current Period)
$actualMaintExpenses = 0.0;
// Actual cost where recorded (the estimate only as a fallback), and never a
// tenant-responsible repair — that is billed to the tenant, not a building expense.
$stmt = $conn->prepare("SELECT SUM(COALESCE(actual_cost, estimated_cost, 0)) as maint_cost FROM maintenance_requests WHERE status IN ('Completed', 'Resolved') AND tenant_responsible = 0 AND $maintDirectDateCondition");
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
$stmt = $conn->prepare("SELECT SUM(COALESCE(actual_cost, estimated_cost, 0)) as maint_cost FROM maintenance_requests WHERE status IN ('Completed', 'Resolved') AND tenant_responsible = 0 AND $prevMaintCondition");
if ($stmt) {
    $stmt->execute();
    $res = $stmt->get_result();
    if ($row = $res->fetch_assoc()) {
        $prevMaintExpenses = (float)($row['maint_cost'] ?? 0);
    }
    $stmt->close();
}

// Other building expenses entered by an admin (expenses table, decided 2026-09-16).
// Maintenance is not in that table, so nothing is counted twice.
function period_condition($col, $timeframe, $year, $month, $quarter) {
    $year = (int)$year; $month = (int)$month; $quarter = (int)$quarter;
    if ($timeframe === 'yearly') return "YEAR($col) = $year";
    if ($timeframe === 'quarterly') return "YEAR($col) = $year AND QUARTER($col) = $quarter";
    return "YEAR($col) = $year AND MONTH($col) = $month";
}
function sum_manual_expenses($conn, $condition) {
    $row = $conn->query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE $condition")->fetch_assoc();
    return (float)($row['total'] ?? 0);
}
$otherExpenses = sum_manual_expenses($conn, period_condition('expense_date', $timeframe, $year, $month, $quarter));
$prevOtherExpenses = sum_manual_expenses($conn, period_condition('expense_date', $timeframe, $prevYear, $prevMonth, $prevQuarter));

$expenseBreakdown = [];
$res = $conn->query("SELECT category, SUM(amount) AS total FROM expenses WHERE " . period_condition('expense_date', $timeframe, $year, $month, $quarter) . " GROUP BY category ORDER BY total DESC");
while ($row = $res->fetch_assoc()) {
    $expenseBreakdown[] = ['category' => $row['category'], 'amount' => (float)$row['total']];
}

// Operating expenses = recorded maintenance cost + admin-entered expenses + the configured overhead (0% unless set)
$operatingOverhead = round($grossRevenue * $overheadPct / 100, 2);
$operatingExpenses = $actualMaintExpenses + $otherExpenses + $operatingOverhead;
$data['expenses'] = $operatingExpenses;

$prevOperatingOverhead = round($prevGrossRevenue * $overheadPct / 100, 2);
$prevOperatingExpenses = $prevMaintExpenses + $prevOtherExpenses + $prevOperatingOverhead;

$netIncome = $grossRevenue - $operatingExpenses;
$prevNetIncome = $prevGrossRevenue - $prevOperatingExpenses;

// Growth calculations
$revenueGrowthPct = $prevGrossRevenue > 0 ? round((($grossRevenue - $prevGrossRevenue) / $prevGrossRevenue) * 100, 1) : 0;
$netGrowthPct = $prevNetIncome > 0 ? round((($netIncome - $prevNetIncome) / $prevNetIncome) * 100, 1) : 0;
$netMarginPct = $grossRevenue > 0 ? round(($netIncome / $grossRevenue) * 100, 1) : 0;

// Outstanding arrears: every still-owed status past its due date. This used to
// match only 'pending', but promote_overdue_invoices() turns a lapsed invoice
// into 'overdue' — so arrears read ₱0 and collection efficiency 100% while
// tenants were in fact behind.
$totalOutstanding = 0.0;
$stmt = $conn->prepare("SELECT SUM(" . invoice_balance_sql('i') . ") as overdue FROM invoices i WHERE " . invoice_owed_where_sql('i', true));
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
    'serviceRevenue' => $data['servicesCollected'],
    'maintenanceRevenue' => $data['maintenanceCollected'],
    'depositRevenue' => $data['depositCollected'],
    'lateFeeRevenue' => $data['lateFeesCollected'],
    'maintenanceExpenses' => $actualMaintExpenses,
    'otherExpenses' => $otherExpenses,
    'expenseBreakdown' => $expenseBreakdown,
    'operatingOverhead' => $operatingOverhead,
    'overheadPct' => $overheadPct,
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
        'id' => 'services',
        'category' => 'Add-On Services',
        'amount' => $data['servicesCollected'],
        'pct' => $grossRevenue > 0 ? round(($data['servicesCollected'] / $grossRevenue) * 100, 1) : 0,
        'prevAmount' => $prevServices,
        'growthPct' => $prevServices > 0 ? round((($data['servicesCollected'] - $prevServices) / $prevServices) * 100, 1) : 0,
        'color' => '#8b5cf6',
        'icon' => 'faConciergeBell'
    ],
    // Audit H10: tenant-caused repair costs, recharged onto the tenant's
    // invoice — kept out of "Add-On Services" so a repair recharge doesn't
    // blend into voluntary service bookings.
    [
        'id' => 'maintenance',
        'category' => 'Maintenance Recharge',
        'amount' => $data['maintenanceCollected'],
        'pct' => $grossRevenue > 0 ? round(($data['maintenanceCollected'] / $grossRevenue) * 100, 1) : 0,
        'prevAmount' => $prevMaintenance,
        'growthPct' => $prevMaintenance > 0 ? round((($data['maintenanceCollected'] - $prevMaintenance) / $prevMaintenance) * 100, 1) : 0,
        'color' => '#14b8a6',
        'icon' => 'faScrewdriverWrench'
    ],
    // No security deposit stream: a deposit is held for the tenant, not
    // earned (see the gross revenue query above).
    // Late fees are part of every paid invoice's total_amount; without this stream
    // the categories did not add up to gross revenue.
    [
        'id' => 'late_fees',
        'category' => 'Late Payment Fees',
        'amount' => $data['lateFeesCollected'],
        'pct' => $grossRevenue > 0 ? round(($data['lateFeesCollected'] / $grossRevenue) * 100, 1) : 0,
        'prevAmount' => $prevLateFee,
        'growthPct' => $prevLateFee > 0 ? round((($data['lateFeesCollected'] - $prevLateFee) / $prevLateFee) * 100, 1) : 0,
        'color' => '#ef4444',
        'icon' => 'faExclamationTriangle'
    ]
];
$data['revenueStreams'] = $streams;

// Utility recovery: share of the water/electricity invoiced this period that has been paid.
$utilityBilled = 0.0;
$utilityPaid = 0.0;
$stmt = $conn->prepare("SELECT SUM(water + electricity) as billed, SUM(CASE WHEN status = 'paid' THEN water + electricity ELSE 0 END) as paid FROM invoices WHERE status <> 'cancelled' AND $dateCondition");
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $utilityBilled = (float)($row['billed'] ?? 0);
    $utilityPaid = (float)($row['paid'] ?? 0);
}
$stmt->close();

// Revenue Diversification metrics
$data['diversification'] = [
    'coreRentPct' => $grossRevenue > 0 ? round(($data['rentCollected'] / $grossRevenue) * 100, 1) : 0,
    'utilitiesPct' => $grossRevenue > 0 ? round((($data['waterCollected'] + $data['electricCollected']) / $grossRevenue) * 100, 1) : 0,
    'ancillaryPct' => $grossRevenue > 0 ? round((($data['parkingCollected'] + $data['servicesCollected'] + $data['lateFeesCollected']) / $grossRevenue) * 100, 1) : 0,
    // Was hardcoded to 100 whenever any utility money came in.
    'utilityRecoveryRatio' => $utilityBilled > 0 ? round(($utilityPaid / $utilityBilled) * 100, 1) : 0
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
    SUM(COALESCE(i.services, 0)) as services_total,
    SUM(COALESCE(i.maintenance, 0)) as maintenance_total,
    SUM(COALESCE(i.security_deposit, 0)) as deposit_total,
    SUM(i.late_fee) as late_fee_total,
    SUM(i.total_amount - COALESCE(i.security_deposit, 0)) as total_collected,
    COUNT(i.id) as invoice_count
FROM invoices i
LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
LEFT JOIN rooms r ON ra.room_name = r.id
WHERE i.status = 'paid' AND i.advance_months IS NULL AND $invoiceDateCondition
GROUP BY COALESCE(r.id, ra.room_name, 'General'), r.type, r.floor
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
            'services' => (float)$row['services_total'],
            'maintenance' => (float)$row['maintenance_total'],
            'deposit' => (float)$row['deposit_total'],
            'lateFee' => (float)$row['late_fee_total'],
            'total' => $uTotal,
            'pct' => $grossRevenue > 0 ? round(($uTotal / $grossRevenue) * 100, 1) : 0,
            'invoicesCount' => (int)$row['invoice_count']
        ];
    }
    $stmt->close();
}

// Period filter on an arbitrary date expression (all inputs are cast ints).
$periodOn = function ($expr) use ($timeframe, $year, $month, $quarter) {
    if ($timeframe === 'yearly') return "YEAR($expr) = $year";
    if ($timeframe === 'quarterly') return "YEAR($expr) = $year AND QUARTER($expr) = $quarter";
    return "YEAR($expr) = $year AND MONTH($expr) = $month";
};

// Move-ins: tenancies whose lease started in the period (the application date
// when no contract exists). This used to count applications *submitted* in the
// period, and dropped anyone who had since moved out or been archived.
$stmt = $conn->prepare("SELECT COUNT(*) as count FROM rent_applications ra
                        LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id
                        WHERE ra.status IN ('Approved', 'active', 'pending-move-out', 'moved-out', 'archived')
                          AND " . $periodOn("COALESCE(lc.lease_start, DATE(ra.created_at))"));
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['moveIns'] = (int)$row['count'];
}
$stmt->close();

// Move-outs: tenancies that ended with a move-out date in the period. This used
// to count moved-out applications by the date they were *submitted*.
$stmt = $conn->prepare("SELECT COUNT(*) as count FROM rent_applications
                        WHERE status IN ('moved-out', 'archived') AND requested_move_out_date IS NOT NULL
                          AND " . $periodOn("requested_move_out_date"));
$stmt->execute();
$data['moveOuts'] = 0;
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['moveOuts'] = (int)$row['count'];
}
$stmt->close();

// Deposits settled at move-out in the period. Kept out of revenue like
// depositCollected: an applied deposit only offsets what the tenant owed.
// depositDeductions = the itemized lines recorded in the period, by category;
// depositsApplied = deposits of contracts settled ('Applied…') in the period.
$data['depositDeductions'] = ['total' => 0.0, 'byCategory' => []];
$res = $conn->query("SELECT category, SUM(amount) AS total FROM deposit_deductions
                     WHERE " . $periodOn('created_at') . " GROUP BY category ORDER BY total DESC");
while ($res && ($row = $res->fetch_assoc())) {
    $amount = round((float)$row['total'], 2);
    $data['depositDeductions']['byCategory'][] = [
        'category' => $row['category'], 'label' => deposit_deduction_label($row['category']), 'amount' => $amount,
    ];
    $data['depositDeductions']['total'] += $amount;
}
$data['depositDeductions']['total'] = round($data['depositDeductions']['total'], 2);
$row = $conn->query("SELECT COALESCE(SUM(deposit_amount), 0) AS total FROM lease_contracts
                     WHERE deposit_status LIKE 'Applied%' AND refund_date IS NOT NULL AND " . $periodOn('refund_date'))->fetch_assoc();
$data['depositsApplied'] = round((float)($row['total'] ?? 0), 2);

// Average lease stay duration
$stmt = $conn->prepare("SELECT IFNULL(AVG(months_of_rent), 6.0) as avg_duration FROM rent_applications WHERE status IN ('Approved', 'active', 'pending-move-out', 'moved-out')");
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
    $target_start_date = sprintf('%04d-%02d-01', $target_year, $target_month);
    $target_end_date = date('Y-m-t', strtotime($target_start_date));
    
    // Multi-stream revenue query directly from paid invoices
    $rev_stmt = $conn->prepare("SELECT 
        SUM(base_rent) as rent,
        SUM(electricity) as electric,
        SUM(water) as water,
        SUM(parking) as parking,
        SUM(COALESCE(services, 0)) as services,
        SUM(COALESCE(security_deposit, 0)) as deposit,
        SUM(late_fee) as late_fee,
        SUM(total_amount - COALESCE(security_deposit, 0)) as total
    FROM invoices
    WHERE status = 'paid' AND advance_months IS NULL AND YEAR(COALESCE(paid_at, created_at)) = ? AND MONTH(COALESCE(paid_at, created_at)) = ?");
    $rev_stmt->bind_param("ii", $target_year, $target_month);
    $rev_stmt->execute();
    $rev_res = $rev_stmt->get_result()->fetch_assoc();
    
    $monthRent = (float)($rev_res['rent'] ?? 0);
    $monthElectric = (float)($rev_res['electric'] ?? 0);
    $monthWater = (float)($rev_res['water'] ?? 0);
    $monthParking = (float)($rev_res['parking'] ?? 0);
    $monthServices = (float)($rev_res['services'] ?? 0);
    $monthDeposit = (float)($rev_res['deposit'] ?? 0);
    $monthLateFee = (float)($rev_res['late_fee'] ?? 0);
    $monthRevenue = (float)($rev_res['total'] ?? 0);
    if ($monthRevenue == 0 && ($monthRent > 0 || $monthElectric > 0 || $monthWater > 0 || $monthParking > 0 || $monthServices > 0 || $monthLateFee > 0)) {
        $monthRevenue = $monthRent + $monthElectric + $monthWater + $monthParking + $monthServices + $monthLateFee;
    }
    $rev_stmt->close();
    
    // Maintenance cost for that target month from real completed maintenance records
    $maint_stmt = $conn->prepare("SELECT SUM(COALESCE(actual_cost, estimated_cost, 0)) as cost FROM maintenance_requests WHERE status IN ('Completed', 'Resolved') AND tenant_responsible = 0 AND YEAR(COALESCE(resolved_at, created_at)) = ? AND MONTH(COALESCE(resolved_at, created_at)) = ?");
    $maint_stmt->bind_param("ii", $target_year, $target_month);
    $maint_stmt->execute();
    $m_cost = (float)($maint_stmt->get_result()->fetch_assoc()['cost'] ?? 0);
    $maint_stmt->close();
    
    $m_other = sum_manual_expenses($conn, period_condition('expense_date', 'monthly', $target_year, $target_month, 0));
    $monthExpenses = $m_cost + $m_other + round($monthRevenue * $overheadPct / 100, 2);
    $monthNet = $monthRevenue - $monthExpenses;
    
    // Occupied rooms in target month from database lease contracts & approved applications
    $occ_stmt = $conn->prepare("
        SELECT COUNT(DISTINCT room_name) as count FROM (
            SELECT ra.room_name 
            FROM lease_contracts lc
            JOIN rent_applications ra ON lc.rent_application_id = ra.id
             WHERE lc.lease_start IS NOT NULL
               AND lc.lease_start <= ?
               AND (lc.lease_end IS NULL OR lc.lease_end >= ?)
            UNION
            SELECT ra2.room_name
            FROM rent_applications ra2
            -- Fallback for applications with no matching lease_contracts row
            -- (or one with no lease_start yet). Bounded on both ends using the
            -- application's own dates, same as the first branch: without the
            -- lower bound here, any still-Approved/active application counted
            -- as occupied in every month since its creation forever, making
            -- the trend line monotonically non-decreasing by construction.
            WHERE ra2.status IN ('Approved', 'active', 'pending-move-out')
               AND ra2.created_at <= ?
               AND DATE_ADD(ra2.created_at, INTERVAL ra2.months_of_rent MONTH) >= ?
        ) as occ
    ");
    $occ_stmt->bind_param(
        "ssss",
        $target_end_date,
        $target_start_date,
        $target_end_date,
        $target_start_date
    );
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
        'lateFee' => $monthLateFee,
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
    // An application approved in the period and since activated (or moved out) is still an approval.
    if (in_array($row['status'], ['Approved', 'active', 'pending-move-out', 'moved-out', 'archived'], true)) $data['roomApproved'] += (int)$row['count'];
    if (in_array($row['status'], ['Rejected', 'Declined'], true)) $data['roomRejected'] += (int)$row['count'];
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

// Open maintenance by priority right now (checklist 8.5), untriaged tickets included
$data['maintOpenByPriority'] = [];
$res = $conn->query("SELECT urgency, COUNT(*) AS c FROM maintenance_requests WHERE status IN ('Pending', 'In Progress') GROUP BY urgency");
while ($row = $res->fetch_assoc()) {
    $data['maintOpenByPriority'][$row['urgency'] ?: 'Needs Triage'] = (int)$row['c'];
}

// Maintenance budget for the period: the admin's monthly setting (₱50,000 when
// unset) times the months covered. The page used a hardcoded ₱50,000 regardless.
$monthly_budget = get_setting($conn, 'maintenance_monthly_budget', '50000');
$monthly_budget = is_numeric($monthly_budget) ? (float)$monthly_budget : 50000.0;
$data['maintenanceBudget'] = $monthly_budget * ($timeframe === 'yearly' ? 12 : ($timeframe === 'quarterly' ? 3 : 1));

// Monthly rent not being earned on vacant units — the "Occupancy Gap" figure
// used to assume ₱4,000 for every vacant unit.
$vacantRoomsFilter = $roomsActiveFilter ? " WHERE archived_at IS NULL AND LOWER(status) = 'vacant'" : " WHERE LOWER(status) = 'vacant'";
$row = $conn->query("SELECT COALESCE(SUM(monthly_rent), 0) AS potential FROM rooms" . $vacantRoomsFilter)->fetch_assoc();
$data['vacantRentPotential'] = (float)$row['potential'];

// Average resolution time for requests resolved in the period (null when none were)
$data['maintAvgResolutionHours'] = null;
$stmt = $conn->prepare("SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, resolved_at)) / 60 as avg_hours FROM maintenance_requests WHERE resolved_at IS NOT NULL AND $maintDirectDateCondition");
$stmt->execute();
if ($row = $stmt->get_result()->fetch_assoc()) {
    $data['maintAvgResolutionHours'] = $row['avg_hours'] !== null ? round((float)$row['avg_hours'], 1) : null;
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
$stmt = $conn->prepare("SELECT 
    ra.id as application_id,
    ra.user_id,
    COALESCE(ra.room_name, r.id, 'Unassigned') as unit,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))), ''), TRIM(CONCAT_WS(' ', ra.first_name, ra.last_name, NULLIF(TRIM(ra.suffix), ''))), 'Active Tenant') as tenant_name,
    COALESCE(u.email_address, ra.email, '') as email_address,
    COALESCE(u.contact_no, ra.contact_no, '') as contact_no,
    COALESCE(lc.lease_start, ra.created_at) as created_at,
    COALESCE(ra.monthly_rent, r.monthly_rent, 0) as monthly_rent,
    COALESCE(lc.lease_end, r.lease_end, '') as lease_end,
    ra.status
FROM rent_applications ra
LEFT JOIN users u ON ra.user_id = u.id
LEFT JOIN rooms r ON ra.room_name = r.id
LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id
-- Every current tenant, not just 'Approved': a tenant becomes 'active' once the
-- move-in invoice is paid, and was dropped from this list (and the invoice picker) from then on.
WHERE ra.status IN ('Approved', 'active', 'pending-move-out')
ORDER BY ra.room_name ASC");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['tenantList'][] = [
        'unit' => $row['unit'],
        'name' => $row['tenant_name'],
        'email' => $row['email_address'],
        'phone' => $row['contact_no'],
        'moveIn' => $row['created_at'] ? date('Y-m-d', strtotime($row['created_at'])) : '',
        'rent' => (float)$row['monthly_rent'],
        'leaseEnd' => $row['lease_end'],
        'userId' => $row['user_id'] ? (int)$row['user_id'] : null,
        'appId' => $row['application_id'],
        // Was always 'active', so tenants serving move-out notice never showed as "Ending".
        'status' => $row['status'] === 'pending-move-out' ? 'pending-move-out' : 'active'
    ];
}
$stmt->close();

// Fallback if rent_applications had no approved entries yet: check occupied rooms
if (empty($data['tenantList'])) {
    $stmt = $conn->prepare("SELECT r.id as unit, u.id as user_id, u.first_name, u.last_name, u.suffix, u.email_address, u.contact_no, r.monthly_rent, r.lease_end FROM rooms r LEFT JOIN rent_applications ra ON r.id = ra.room_name LEFT JOIN users u ON ra.user_id = u.id WHERE r.status = 'Occupied'");
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $name = person_name($row);
        $data['tenantList'][] = [
            'unit' => $row['unit'],
            'name' => !empty($name) ? $name : "Unit {$row['unit']} Tenant",
            'email' => $row['email_address'] ?? '',
            'phone' => $row['contact_no'] ?? '',
            'moveIn' => '',
            'rent' => (float)($row['monthly_rent'] ?? 4000),
            'leaseEnd' => $row['lease_end'] ?? '',
            'userId' => $row['user_id'] ? (int)$row['user_id'] : null,
            'appId' => null,
            'status' => 'active'
        ];
    }
    $stmt->close();
}

// 2. methodsBreakdown & payment records
$data['methodsBreakdown'] = ['Cash' => 0, 'GCash' => 0, 'BDO' => 0, 'BPI' => 0];
$data['paymentRecords'] = [];
$stmt = $conn->prepare("SELECT i.id, u.first_name, u.last_name, u.suffix, r.id as unit, i.billing_period, i.total_amount, i.payment_method, i.paid_at, i.base_rent, i.water, i.electricity, i.parking, i.services, i.late_fee, i.security_deposit FROM invoices i LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id LEFT JOIN rooms r ON ra.room_name = r.id LEFT JOIN users u ON i.user_id = u.id WHERE i.status = 'paid' AND i.advance_months IS NULL AND $invoiceDateCondition ORDER BY i.paid_at DESC LIMIT 50");
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
        'tenant' => person_name($row),
        'unit' => $row['unit'] ?? 'N/A',
        'period' => $row['billing_period'],
        'amount' => (float)$row['total_amount'],
        'method' => $method,
        'datePaid' => date('Y-m-d', strtotime($row['paid_at'])),
        'breakdown' => "Rent: ₱{$row['base_rent']} | Water: ₱{$row['water']} | Elec: ₱{$row['electricity']}" . ($row['parking'] > 0 ? " | Park: ₱{$row['parking']}" : "") . ($row['services'] > 0 ? " | Svc: ₱{$row['services']}" : "") . ($row['late_fee'] > 0 ? " | Late: ₱{$row['late_fee']}" : "") . ($row['security_deposit'] > 0 ? " | Dep: ₱{$row['security_deposit']}" : "")
    ];
}
$stmt->close();

// 3. outstandingBalances
$data['outstandingBalances'] = [];
$stmt = $conn->prepare("SELECT i.id, i.status, u.first_name, u.last_name, u.suffix, COALESCE(r.id, ra.room_name) as unit, " . invoice_balance_sql('i') . " AS balance, DATEDIFF(CURDATE(), i.due_date) as days_overdue FROM invoices i LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id LEFT JOIN rooms r ON ra.room_name = r.id LEFT JOIN users u ON i.user_id = u.id WHERE " . invoice_owed_where_sql('i', true) . " ORDER BY i.due_date ASC");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['outstandingBalances'][] = [
        'invoiceId' => $row['id'],
        'status' => $row['status'],
        'tenant' => person_name($row),
        'unit' => $row['unit'] ?? 'N/A',
        'balance' => (float)$row['balance'],
        'daysOverdue' => max(1, (int)$row['days_overdue'])
    ];
}
$stmt->close();

// 4. maintenanceRecords
$data['maintenanceRecords'] = [];
// The unit is the one snapshotted on the ticket; joining through an 'Approved'
// application lost it for 'active' tenants. Cost is the actual cost where recorded.
$stmt = $conn->prepare("SELECT m.id, u.first_name, u.last_name, u.suffix, m.room_name as unit, m.issue_category, m.urgency, m.created_at, m.status, m.description, COALESCE(m.actual_cost, m.estimated_cost) as estimated_cost FROM maintenance_requests m LEFT JOIN users u ON m.user_id = u.id WHERE $maintDateCondition ORDER BY m.created_at DESC LIMIT 50");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['maintenanceRecords'][] = [
        'id' => 'MR-'.str_pad($row['id'], 4, '0', STR_PAD_LEFT),
        'unit' => $row['unit'] ?? 'N/A',
        'tenant' => person_name($row),
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
$stmt = $conn->prepare("SELECT id, first_name, last_name, suffix, room_name, monthly_rent, months_of_rent, created_at, status FROM rent_applications WHERE $dateCondition ORDER BY created_at DESC LIMIT 50");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['roomList'][] = [
        'id' => 'APP-'.str_pad($row['id'], 4, '0', STR_PAD_LEFT),
        'name' => person_name($row),
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
$stmt = $conn->prepare("SELECT p.id, u.first_name, u.last_name, u.suffix, p.vehicle_model, p.vehicle_type, p.plate_number, p.total_cost, p.duration_months, p.created_at, p.status FROM parking_reservations p LEFT JOIN users u ON p.user_id = u.id WHERE $parkingDateCondition ORDER BY p.created_at DESC LIMIT 50");
$stmt->execute();
$res = $stmt->get_result();
while ($row = $res->fetch_assoc()) {
    $data['parkingList'][] = [
        'id' => 'PKG-'.str_pad($row['id'], 4, '0', STR_PAD_LEFT),
        'tenant' => person_name($row),
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

// Inquiry conversion (decided 2026-09-16, inquiry_reservation_design.md §8).
// Inquiries are counted by when they were received; conversion = reached Converted.
$inqCondition = period_condition('created_at', $timeframe, $year, $month, $quarter);
$inquiryStatusCounts = ['New' => 0, 'Contacted' => 0, 'Scheduled' => 0, 'Reserved' => 0, 'Converted' => 0, 'Closed' => 0];
$res = $conn->query("SELECT status, COUNT(*) AS c FROM inquiries WHERE $inqCondition GROUP BY status");
while ($row = $res->fetch_assoc()) {
    $inquiryStatusCounts[$row['status']] = (int)$row['c'];
}
$inquiriesReceived = array_sum($inquiryStatusCounts);
$reservationCounts = ['Active' => 0, 'Converted' => 0, 'Expired' => 0, 'Cancelled' => 0];
$res = $conn->query("SELECT status, COUNT(*) AS c FROM unit_reservations WHERE $inqCondition GROUP BY status");
while ($row = $res->fetch_assoc()) {
    $reservationCounts[$row['status']] = (int)$row['c'];
}
$data['inquiryConversion'] = [
    'received' => $inquiriesReceived,
    'byStatus' => $inquiryStatusCounts,
    'converted' => $inquiryStatusCounts['Converted'],
    'conversionRatePct' => $inquiriesReceived > 0 ? round($inquiryStatusCounts['Converted'] / $inquiriesReceived * 100, 1) : 0,
    'reservations' => $reservationCounts,
];

echo json_encode(['success' => true, 'data' => $data]);
$conn->close();
} catch (Throwable $e) {
    error_log('[AMS] get_report_data.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to generate report data.',
        'data' => [],
    ]);
    if (isset($conn) && $conn instanceof mysqli) {
        $conn->close();
    }
}
?>
