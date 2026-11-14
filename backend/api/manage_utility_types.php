<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

function type_fail($code, $msg) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $msg]);
    exit;
}

// Utility types beyond water and electricity. Everyone signed in may read the
// active list; only an admin changes it. DELETE only deactivates, so old
// readings keep their line items.
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET') {
    $auth = require_user($conn);
    $where = ($auth['role'] === 'admin' && !empty($_GET['all'])) ? '' : 'WHERE is_active = 1';
    $res = $conn->query("SELECT id, code, name, unit_label, billing_mode, default_rate, is_active, sort_order FROM utility_types $where ORDER BY sort_order, id");
    echo json_encode(["success" => true, "types" => $res->fetch_all(MYSQLI_ASSOC)]);
    exit;
}

$admin_id = (int)require_admin($conn);
$in = read_json_input();

if ($method === 'DELETE') {
    $id = (int)($in['id'] ?? 0);
    $stmt = $conn->prepare("UPDATE utility_types SET is_active = 0 WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    if ($stmt->affected_rows < 1) type_fail(404, "Utility type not found or already inactive.");
    log_activity($conn, $admin_id, 'utilities', 'Deactivated Utility Type', "Utility type #$id");
    echo json_encode(["success" => true, "message" => "Utility type deactivated."]);
    exit;
}

if (!in_array($method, ['POST', 'PUT'], true)) type_fail(405, "Method Not Allowed");

$name = trim((string)($in['name'] ?? ''));
$unit_label = trim((string)($in['unit_label'] ?? ''));
$mode = $in['billing_mode'] ?? '';
$rate = $in['default_rate'] ?? null;
$active = array_key_exists('is_active', $in) ? (int)!empty($in['is_active']) : 1;

$errors = array_filter([
    'id' => $method === 'PUT' ? v_id($in['id'] ?? null, 'Utility type') : '',
    'name' => $name === '' || mb_strlen($name) > 60 ? "Enter a name up to 60 characters." : '',
    'unit_label' => v_str($unit_label, 'The unit label', 1, 20, false),
    'billing_mode' => in_array($mode, ['metered', 'flat'], true) ? '' : "Billing mode must be metered or flat.",
    'default_rate' => !is_numeric($rate) || (float)$rate < 0 || (float)$rate > 100000 ? "Enter a rate or fee between 0 and 100,000." : '',
]);
if ($errors) validation_fail($errors);
$rate = round((float)$rate, 2);
$unit_label = $unit_label === '' ? null : $unit_label;

if ($method === 'POST') {
    // Stable code from the name; a suffix keeps it unique.
    $base = substr(preg_replace('/[^a-z0-9]+/', '_', strtolower($name)), 0, 24) ?: 'utility';
    $code = $base;
    for ($n = 2; $n < 50; $n++) {
        $c = $conn->prepare("SELECT 1 FROM utility_types WHERE code = ?");
        $c->bind_param("s", $code);
        $c->execute();
        $taken = $c->get_result()->num_rows > 0;
        $c->close();
        if (!$taken) break;
        $code = $base . '_' . $n;
    }
    $stmt = $conn->prepare("INSERT INTO utility_types (code, name, unit_label, billing_mode, default_rate, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $next_order = (int)$conn->query("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM utility_types")->fetch_row()[0];
    $stmt->bind_param("ssssdii", $code, $name, $unit_label, $mode, $rate, $active, $next_order);
    if (!$stmt->execute()) type_fail(500, "Could not save the utility type.");
    log_activity($conn, $admin_id, 'utilities', 'Added Utility Type', "$name ($mode, ₱$rate)");
    echo json_encode(["success" => true, "message" => "Utility type added.", "id" => $conn->insert_id]);
    exit;
}

$id = (int)$in['id'];
// An unchanged save also leaves affected_rows at 0, so existence is checked first.
$exists = $conn->prepare("SELECT 1 FROM utility_types WHERE id = ?");
$exists->bind_param("i", $id);
$exists->execute();
$found = (bool)$exists->get_result()->fetch_row();
$exists->close();
if (!$found) type_fail(404, "Utility type not found.");
$stmt = $conn->prepare("UPDATE utility_types SET name = ?, unit_label = ?, billing_mode = ?, default_rate = ?, is_active = ? WHERE id = ?");
$stmt->bind_param("sssdii", $name, $unit_label, $mode, $rate, $active, $id);
if (!$stmt->execute()) type_fail(500, "Could not save the utility type.");
log_activity($conn, $admin_id, 'utilities', 'Updated Utility Type', "$name (#$id)");
echo json_encode(["success" => true, "message" => "Utility type saved."]);
$conn->close();
