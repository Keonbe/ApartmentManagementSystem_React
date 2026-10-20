<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// Admin edits the list of documents an applicant uploads. POST JSON with an
// `action`: create, update, reorder, deactivate, activate. There is no delete:
// a requirement stays in the table so the documents uploaded for it keep their
// link; deactivating it removes it from the form and the approval check.
const APP_REQ_LABEL_MIN = 2;
const APP_REQ_LABEL_MAX = 60;
const APP_REQ_MAX_ACTIVE = 12;
const APP_REQ_SORT_MAX = 999;

function req_fail($code, $msg, $field = null) {
    global $conn;
    // Leaves nothing half-written when a check fails inside the transaction
    // (a no-op before it starts).
    if ($conn) $conn->rollback();
    http_response_code($code);
    $body = ["success" => false, "message" => $msg];
    if ($field) $body['field'] = $field;
    echo json_encode($body);
    exit;
}

// true/false or 0/1 only; anything else (strings, 2, null) is refused.
function req_bool($in, $key, $default) {
    if (!array_key_exists($key, $in)) return $default;
    $v = $in[$key];
    if ($v === true || $v === 1) return 1;
    if ($v === false || $v === 0) return 0;
    $name = $key === 'is_required' ? 'Required' : 'Active';
    req_fail(422, "$name must be true or false.", $key);
}

function req_label($in) {
    $v = $in['label'] ?? null;
    if (!is_string($v)) req_fail(422, "Enter a document name.", 'label');
    $v = trim($v);
    $len = mb_strlen($v);
    if ($len < APP_REQ_LABEL_MIN || $len > APP_REQ_LABEL_MAX) {
        req_fail(422, "The document name must be " . APP_REQ_LABEL_MIN . " to " . APP_REQ_LABEL_MAX . " characters.", 'label');
    }
    if (preg_match('/[\x00-\x1F\x7F]|<\s*script/i', $v)) req_fail(422, "The document name contains characters that are not allowed.", 'label');
    return $v;
}

function req_label_fil($in) {
    if (!array_key_exists('label_fil', $in) || $in['label_fil'] === null) return null;
    if (!is_string($in['label_fil'])) req_fail(422, "The Filipino name must be text.", 'label_fil');
    $v = trim($in['label_fil']);
    if ($v === '') return null;
    if (mb_strlen($v) > APP_REQ_LABEL_MAX) req_fail(422, "The Filipino name can be at most " . APP_REQ_LABEL_MAX . " characters.", 'label_fil');
    if (preg_match('/[\x00-\x1F\x7F]|<\s*script/i', $v)) req_fail(422, "The Filipino name contains characters that are not allowed.", 'label_fil');
    return $v;
}

function req_sort_order($in, $default) {
    if (!array_key_exists('sort_order', $in)) return $default;
    $v = $in['sort_order'];
    if (!is_int($v) || $v < 0 || $v > APP_REQ_SORT_MAX) req_fail(422, "Order must be a whole number from 0 to " . APP_REQ_SORT_MAX . ".", 'sort_order');
    return $v;
}

function req_id($value) {
    if (!is_int($value) || $value < 1) req_fail(422, "Invalid requirement id.", 'id');
    return $value;
}

$admin_id = (int)require_admin($conn);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') req_fail(405, "Method Not Allowed");

$in = json_decode(file_get_contents("php://input"), true);
if (!is_array($in)) req_fail(400, "Invalid request body.");
$action = $in['action'] ?? '';
if (!in_array($action, ['create', 'update', 'reorder', 'deactivate', 'activate'], true)) req_fail(422, "Unknown action.");

// Every write locks the (small) table first, so two admins cannot both add the
// 13th active requirement or two rows with the same name.
$conn->begin_transaction();
$res = $conn->query("SELECT id, label, label_fil, is_required, is_active, sort_order FROM application_requirements ORDER BY sort_order, id FOR UPDATE");
if (!$res) req_fail(500, "Could not load the application requirements.");
$rows = [];
while ($r = $res->fetch_assoc()) $rows[(int)$r['id']] = $r;

$active_count = function ($except_id = 0) use (&$rows) {
    $n = 0;
    foreach ($rows as $id => $r) if ((int)$r['is_active'] === 1 && $id !== $except_id) $n++;
    return $n;
};
$duplicate_active = function ($label, $except_id = 0) use (&$rows) {
    foreach ($rows as $id => $r) {
        if ($id !== $except_id && (int)$r['is_active'] === 1 && mb_strtolower($r['label']) === mb_strtolower($label)) return true;
    }
    return false;
};
$find = function ($id) use (&$rows) {
    if (!isset($rows[$id])) req_fail(404, "That requirement no longer exists.", 'id');
    return $rows[$id];
};
$max_order = 0;
foreach ($rows as $r) $max_order = max($max_order, (int)$r['sort_order']);

$message = '';
if ($action === 'create') {
    $label = req_label($in);
    $label_fil = req_label_fil($in);
    $required = req_bool($in, 'is_required', 1);
    $active = req_bool($in, 'is_active', 1);
    $order = req_sort_order($in, min(APP_REQ_SORT_MAX, $max_order + 1));
    if ($active && $active_count() >= APP_REQ_MAX_ACTIVE) req_fail(422, "At most " . APP_REQ_MAX_ACTIVE . " requirements can be active. Deactivate one first.");
    if ($active && $duplicate_active($label)) req_fail(422, "A requirement named \"$label\" already exists.", 'label');

    $stmt = $conn->prepare("INSERT INTO application_requirements (label, label_fil, is_required, is_active, sort_order) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param("ssiii", $label, $label_fil, $required, $active, $order);
    if (!$stmt->execute()) req_fail(500, "Could not save the requirement.");
    $new_id = (int)$conn->insert_id;
    $stmt->close();
    $conn->commit();
    log_activity($conn, $admin_id, 'system', 'Added Application Requirement', "$label (#$new_id, " . ($required ? 'required' : 'optional') . ")");
    $message = "Requirement added.";
} elseif ($action === 'update') {
    $id = req_id($in['id'] ?? null);
    $row = $find($id);
    $label = req_label($in);
    $label_fil = array_key_exists('label_fil', $in) ? req_label_fil($in) : $row['label_fil'];
    $required = req_bool($in, 'is_required', (int)$row['is_required']);
    $active = req_bool($in, 'is_active', (int)$row['is_active']);
    $order = req_sort_order($in, (int)$row['sort_order']);
    if ($active && !(int)$row['is_active'] && $active_count($id) >= APP_REQ_MAX_ACTIVE) req_fail(422, "At most " . APP_REQ_MAX_ACTIVE . " requirements can be active. Deactivate one first.");
    if ($active && $duplicate_active($label, $id)) req_fail(422, "A requirement named \"$label\" already exists.", 'label');

    $stmt = $conn->prepare("UPDATE application_requirements SET label = ?, label_fil = ?, is_required = ?, is_active = ?, sort_order = ? WHERE id = ?");
    $stmt->bind_param("ssiiii", $label, $label_fil, $required, $active, $order, $id);
    if (!$stmt->execute()) req_fail(500, "Could not save the requirement.");
    $stmt->close();
    $conn->commit();
    log_activity($conn, $admin_id, 'system', 'Updated Application Requirement', "$label (#$id, " . ($required ? 'required' : 'optional') . ', ' . ($active ? 'active' : 'inactive') . ")");
    $message = "Requirement saved.";
} elseif ($action === 'reorder') {
    $ids = $in['ids'] ?? null;
    if (!is_array($ids) || !$ids || array_keys($ids) !== range(0, count($ids) - 1)) req_fail(422, "Send the requirements in their new order.", 'ids');
    if (count($ids) > APP_REQ_SORT_MAX) req_fail(422, "Too many requirements to reorder.", 'ids');
    $seen = [];
    foreach ($ids as $id) {
        req_id($id);
        $find($id);
        if (isset($seen[$id])) req_fail(422, "A requirement is listed twice.", 'ids');
        $seen[$id] = true;
    }
    $stmt = $conn->prepare("UPDATE application_requirements SET sort_order = ? WHERE id = ?");
    foreach ($ids as $i => $id) {
        $order = $i + 1;
        $stmt->bind_param("ii", $order, $id);
        if (!$stmt->execute()) req_fail(500, "Could not save the new order.");
    }
    $stmt->close();
    $conn->commit();
    log_activity($conn, $admin_id, 'system', 'Reordered Application Requirements', 'New order: #' . implode(', #', $ids));
    $message = "Order saved.";
} else {
    $id = req_id($in['id'] ?? null);
    $row = $find($id);
    $activate = $action === 'activate';
    if ((int)$row['is_active'] === ($activate ? 1 : 0)) {
        req_fail(409, $activate ? "This requirement is already active." : "This requirement is already inactive.");
    }
    if ($activate && $active_count() >= APP_REQ_MAX_ACTIVE) req_fail(422, "At most " . APP_REQ_MAX_ACTIVE . " requirements can be active. Deactivate one first.");
    if ($activate && $duplicate_active($row['label'], $id)) req_fail(422, "An active requirement named \"{$row['label']}\" already exists. Rename one first.");
    $flag = $activate ? 1 : 0;
    $stmt = $conn->prepare("UPDATE application_requirements SET is_active = ? WHERE id = ?");
    $stmt->bind_param("ii", $flag, $id);
    if (!$stmt->execute()) req_fail(500, "Could not save the requirement.");
    $stmt->close();
    $conn->commit();
    log_activity($conn, $admin_id, 'system', $activate ? 'Activated Application Requirement' : 'Deactivated Application Requirement', "{$row['label']} (#$id)");
    $message = $activate ? "Requirement activated." : "Requirement deactivated. Documents already uploaded for it are kept.";
}

echo json_encode(["success" => true, "message" => $message, "requirements" => application_requirements_list($conn, true)]);
$conn->close();
