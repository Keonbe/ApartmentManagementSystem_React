<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// System activity log (checklist 8.6). Filtering and paging happen here, over the
// whole table — the page used to receive only the newest 100 rows and filter
// those in the browser, so anything older was simply unreachable.
$admin_id = require_admin($conn);

$category  = $_GET['category'] ?? 'all';
$search    = trim((string)($_GET['search'] ?? ''));
$performer = $_GET['performer'] ?? 'all';
$from      = trim((string)($_GET['from'] ?? ''));
$to        = trim((string)($_GET['to'] ?? ''));
$export    = ($_GET['export'] ?? '') === '1';
$page      = max(1, (int)($_GET['page'] ?? 1));
$limit     = $export ? 5000 : min(100, max(1, (int)($_GET['limit'] ?? 25)));

$valid_date = fn($d) => $d !== '' && ($dt = DateTime::createFromFormat('!Y-m-d', $d)) && $dt->format('Y-m-d') === $d;

$where = [];
$types = "";
$params = [];

if ($category !== 'all') {
    if (!array_key_exists($category, LOG_CATEGORIES)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Unknown category."]);
        exit;
    }
    $where[] = "a.category = ?";
    $types .= "s";
    $params[] = $category;
}
if ($performer === 'admin') {
    $where[] = "u.role = 'admin'";
} elseif ($performer === 'tenant') {
    $where[] = "u.role = 'user'";
} elseif ($performer === 'system') {
    $where[] = "a.performed_by IS NULL";
}
if ($search !== '') {
    // Escape LIKE wildcards so "50%" or "user_id" match literally rather than
    // acting as patterns. A log reference "LOG-0012" (or just "12") matches id 12;
    // the old ltrim($search, 'LOG-0') stripped any of those characters from both
    // ends, so "LOG-0100" searched for id 1.
    $like = '%' . addcslashes($search, '\\%_') . '%';
    $log_id = preg_match('/^(?:LOG-)?0*(\d+)$/i', $search, $m) ? (int)$m[1] : 0;
    $where[] = "(a.action LIKE ? OR a.details LIKE ? OR TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) LIKE ? OR u.email_address LIKE ? OR a.id = ?)";
    $types .= "ssssi";
    array_push($params, $like, $like, $like, $like, $log_id);
}
if ($valid_date($from)) {
    $where[] = "a.created_at >= ?";
    $types .= "s";
    $params[] = "$from 00:00:00";
}
if ($valid_date($to)) {
    $where[] = "a.created_at < DATE_ADD(?, INTERVAL 1 DAY)";
    $types .= "s";
    $params[] = $to;
}

$from_sql = "FROM activity_logs a LEFT JOIN users u ON a.performed_by = u.id" . ($where ? " WHERE " . implode(" AND ", $where) : "");

$stmt = $conn->prepare("SELECT COUNT(*) AS total $from_sql");
if ($params) $stmt->bind_param($types, ...$params);
$stmt->execute();
$total = (int)$stmt->get_result()->fetch_assoc()['total'];
$stmt->close();

$offset = ($page - 1) * $limit;
$stmt = $conn->prepare("SELECT a.id, a.category, a.action, a.details, a.created_at, a.performed_by,
                               u.first_name, u.last_name, u.suffix, u.email_address, u.role
                        $from_sql
                        ORDER BY a.created_at DESC, a.id DESC
                        LIMIT ? OFFSET ?");
$stmt->bind_param($types . "ii", ...array_merge($params, [$limit, $offset]));
$stmt->execute();
$res = $stmt->get_result();

$logs = [];
while ($row = $res->fetch_assoc()) {
    $name = person_name($row);
    $logs[] = [
        'id' => (int)$row['id'],
        'category' => $row['category'],
        'categoryLabel' => LOG_CATEGORIES[$row['category']] ?? LOG_CATEGORIES['system'],
        'action' => $row['action'],
        'details' => $row['details'] ?? '',
        'createdAt' => $row['created_at'],
        'performedBy' => $row['performed_by'] !== null ? (int)$row['performed_by'] : null,
        'performerName' => $row['performed_by'] === null ? 'System' : ($name !== '' ? $name : 'Deleted user'),
        'performerEmail' => $row['email_address'] ?? '',
        'performerRole' => $row['performed_by'] === null ? 'system' : ($row['role'] === 'admin' ? 'admin' : 'tenant'),
    ];
}
$stmt->close();

// Totals per category, for the filter tabs (independent of the other filters)
$category_counts = array_fill_keys(array_keys(LOG_CATEGORIES), 0);
$res = $conn->query("SELECT category, COUNT(*) AS c FROM activity_logs GROUP BY category");
while ($row = $res->fetch_assoc()) {
    $key = array_key_exists($row['category'], LOG_CATEGORIES) ? $row['category'] : 'system';
    $category_counts[$key] += (int)$row['c'];
}

// Exporting the audit trail is itself an auditable action. The export is capped at
// $limit rows; the entry used to claim the full total even when it was cut short.
$exported = count($logs);
$truncated = $export && $total > $exported;
if ($export) {
    log_activity($conn, $admin_id, 'system', 'Exported Activity Log', "Exported $exported of $total log entr" . ($total === 1 ? 'y' : 'ies') . " (category: $category, performer: $performer" . ($from || $to ? ", range: " . ($from ?: '…') . " to " . ($to ?: '…') : "") . ($search !== '' ? ", search: \"$search\"" : "") . ")");
}

echo json_encode([
    "success" => true,
    "logs" => $logs,
    "total" => $total,
    "truncated" => $truncated,
    "page" => $page,
    "limit" => $limit,
    "pages" => max(1, (int)ceil($total / $limit)),
    "categories" => LOG_CATEGORIES,
    "categoryCounts" => $category_counts,
]);
$conn->close();
?>
