<?php
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

require_once '../config.php';
$adminId = require_admin($conn);

// Copies a floor's fixed rent onto its VACANT units. Occupied or reserved units
// keep the rent their tenant agreed to; units whose rent an admin set by hand
// (rooms.rent_is_custom) are skipped too. `preview: true` only counts.
$data = read_json_input();
$floor = trim((string)($data['floor'] ?? ''));
$preview = !empty($data['preview']);
if ($floor === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Choose a floor.']);
    exit;
}
$rate = floor_rate_for($conn, $floor);
if ($rate === null) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => "Save a rent for floor $floor first."]);
    exit;
}

$count = function ($where) use ($conn, $floor, $rate) {
    $stmt = $conn->prepare("SELECT COUNT(*) FROM rooms WHERE floor = ? AND archived_at IS NULL AND $where");
    $stmt->bind_param("s", $floor);
    $stmt->execute();
    $n = 0;
    $stmt->bind_result($n);
    $stmt->fetch();
    $stmt->close();
    return (int)$n;
};

$vacant_total = $count("status = 'vacant'");
$custom = $count("status = 'vacant' AND rent_is_custom = 1");
$occupied = $count("status <> 'vacant'");
$already = $count("status = 'vacant' AND rent_is_custom = 0 AND monthly_rent = " . number_format($rate, 2, '.', ''));
$will_change = $vacant_total - $custom - $already;

if (!$preview && $will_change > 0) {
    $stmt = $conn->prepare("UPDATE rooms SET monthly_rent = ? WHERE floor = ? AND archived_at IS NULL AND status = 'vacant' AND rent_is_custom = 0 AND monthly_rent <> ?");
    $stmt->bind_param("dsd", $rate, $floor, $rate);
    $stmt->execute();
    $stmt->close();
    log_activity($conn, $adminId, 'unit', 'Applied Floor Rent', "Floor $floor: rent set to $rate on $will_change vacant unit(s); $custom custom and $occupied occupied/reserved left unchanged");
}

echo json_encode([
    'success' => true,
    'preview' => $preview,
    'rate' => $rate,
    'updated' => $will_change,
    'skippedCustom' => $custom,
    'skippedOccupied' => $occupied,
]);
$conn->close();
