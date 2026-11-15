<?php
// Admin → Reports. GET ?report=<type>&from=YYYY-MM-DD&to=YYYY-MM-DD&group=day|week|month|year
// One report over a date range, cut into periods. The reports and the money
// rules are in backend/reports.php; this file checks the request and answers.
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../reports.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Use GET.']);
    exit();
}

require_admin($conn);

$type = is_string($_GET['report'] ?? null) ? $_GET['report'] : '';
$from = real_date($_GET['from'] ?? null);
$to = real_date($_GET['to'] ?? null);
$group = is_string($_GET['group'] ?? null) ? $_GET['group'] : '';

$errors = [];
if (!isset(REPORT_TYPES[$type])) $errors['report'] = 'Choose a report.';
if ($from === null) $errors['from'] = 'Enter a start date (YYYY-MM-DD).';
if ($to === null) $errors['to'] = 'Enter an end date (YYYY-MM-DD).';
if (!in_array($group, REPORT_GROUPS, true)) $errors['group'] = 'Group by day, week, month or year.';
if (!$errors) {
    if ($from > $to) $errors['to'] = 'The end date cannot be before the start date.';
    elseif ($from < '2000-01-01' || $to > '2099-12-31') $errors['from'] = 'Choose dates between 2000 and 2099.';
}
if ($errors) validation_fail($errors);

// Meter readings are monthly, so Utilities groups by month at the least.
$note = null;
if ($type === 'utilities' && in_array($group, ['day', 'week'], true)) {
    $group = 'month';
    $note = 'Meter readings are monthly, so this report is grouped by month.';
}
$periods = count(report_periods($from, $to, $group));
if ($periods > REPORT_MAX_PERIODS[$group]) {
    validation_fail(['group' => "That is $periods {$group}s; the most is " . REPORT_MAX_PERIODS[$group] . ". Choose a shorter range or a longer period."]);
}

try {
    // The grouped queries select only their group keys and aggregates; this
    // keeps MySQL 8 (prod) answering like MariaDB (dev) if a mode differs.
    $conn->query("SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''))");
    // Lapsed bills count as overdue in the figures, as on the billing pages.
    promote_overdue_invoices($conn);
    $report = build_report($conn, $type, $from, $to, $group);
    if ($note) $report['note'] = $note;
    echo json_encode(['success' => true] + $report);
} catch (Throwable $e) {
    error_log('get_reports.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'The report could not be built. Try again, or a shorter range.']);
}
$conn->close();
