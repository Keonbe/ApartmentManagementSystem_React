<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// Admin → Parking → Slots: the parking slots, one by one.
//
// GET                                   → { slots[], capacity }
// POST { action: 'create', label, quantity?, icon, vehicle_types[], requires_registration, status }
//      quantity 1 (default): one slot named `label`. 2-20: `label` is a prefix
//      and the slots are numbered after the highest one with that prefix
//      ("M" → M1, M2, M3).
// POST { action: 'update', id, label, icon, vehicle_types[], requires_registration, status }
//      A slot holding a vehicle cannot go under maintenance, or stop taking
//      that vehicle's type, until it is released.
// POST { action: 'remove', id }
//      Archived (old reservations keep the label); refused while assigned.
//      Pending requests for it keep waiting with no slot chosen.
//
// slot_number in parking_reservations is parking_slots.id.
$admin_id = require_admin($conn);

function slot_fail($code, $message, $field = null) {
    if ($field) validation_fail([$field => $message], $code);
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $slots = parking_slots($conn);
    $taken = parking_assigned_by_slot($conn);
    echo json_encode([
        'success' => true,
        'slots' => array_values(array_map(fn($s) => $s + ['assigned' => isset($taken[$s['id']])], $slots)),
        'capacity' => parking_capacity($conn, $slots, $taken),
    ]);
    $conn->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') slot_fail(405, 'Method not allowed.');

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) slot_fail(400, 'Send JSON.');
$action = (string)($in['action'] ?? '');

// The editable fields, checked the same way for create and update.
function slot_fields($in, $label_is_prefix = false) {
    $errors = [];
    $label = trim((string)($in['label'] ?? ''));
    $max = $label_is_prefix ? 15 : 20;
    if ($label === '' && !$label_is_prefix) {
        $errors['label'] = 'Give the slot a name, e.g. M1 or 12.';
    } elseif ($label !== '' && !preg_match('/^[A-Za-z0-9][A-Za-z0-9 \-]{0,' . ($max - 1) . '}$/', $label)) {
        $errors['label'] = "Use up to $max letters, numbers, spaces or dashes, starting with a letter or number.";
    }
    $icon = (string)($in['icon'] ?? '');
    if (!in_array($icon, PARKING_SLOT_ICONS, true)) $errors['icon'] = 'Choose an icon.';
    $types = $in['vehicle_types'] ?? null;
    if (!is_array($types) || !$types) {
        $errors['vehicle_types'] = 'Choose at least one vehicle type.';
    } else {
        $types = array_values(array_unique(array_map(fn($t) => strtolower((string)$t), $types)));
        if (array_diff($types, PARKING_VEHICLE_TYPES)) $errors['vehicle_types'] = 'Unknown vehicle type.';
    }
    if (!array_key_exists('requires_registration', $in) || !is_bool($in['requires_registration'])) {
        $errors['requires_registration'] = 'Say whether the OR/CR is required.';
    }
    $status = (string)($in['status'] ?? 'active');
    if (!in_array($status, PARKING_SLOT_STATUSES, true)) $errors['status'] = 'Status must be active or maintenance.';
    if ($errors) validation_fail($errors);
    // Kept in the fixed order of PARKING_VEHICLE_TYPES.
    $types = array_values(array_intersect(PARKING_VEHICLE_TYPES, $types));
    return [$label, $icon, json_encode($types), $in['requires_registration'] ? 1 : 0, $status, $types];
}

if ($action === 'create') {
    $quantity = $in['quantity'] ?? 1;
    if (!is_int($quantity) || $quantity < 1 || $quantity > 20) slot_fail(422, 'Add 1 to 20 slots at a time.', 'quantity');
    [$label, $icon, $types_json, $reg, $status, $types] = slot_fields($in, $quantity > 1);

    $conn->begin_transaction();
    try {
        // Lock the slot list so two admins adding at once number them apart.
        $rows = $conn->query("SELECT id, label, sort_order FROM parking_slots WHERE archived_at IS NULL FOR UPDATE")->fetch_all(MYSQLI_ASSOC);
        if (count($rows) + $quantity > PARKING_MAX_SLOTS) {
            $conn->rollback();
            slot_fail(422, 'There can be at most ' . PARKING_MAX_SLOTS . ' parking slots.', 'quantity');
        }
        $labels = [$label];
        if ($quantity > 1) {
            $highest = 0;
            foreach ($rows as $r) {
                if (preg_match('/^' . preg_quote($label, '/') . '(\d+)$/i', $r['label'], $m)) $highest = max($highest, (int)$m[1]);
            }
            $labels = array_map(fn($i) => $label . ($highest + $i), range(1, $quantity));
            foreach ($labels as $l) {
                if (mb_strlen($l) > 20) { $conn->rollback(); slot_fail(422, 'The numbered names would be longer than 20 characters.', 'label'); }
            }
        }
        $order = (int)array_reduce($rows, fn($m, $r) => max($m, (int)$r['sort_order']), 0);
        $ins = $conn->prepare("INSERT INTO parking_slots (label, icon, vehicle_types, requires_registration, status, sort_order) VALUES (?, ?, ?, ?, ?, ?)");
        $ids = [];
        foreach ($labels as $l) {
            $order++;
            $ins->bind_param('sssisi', $l, $icon, $types_json, $reg, $status, $order);
            $ins->execute();
            $ids[] = $ins->insert_id;
        }
        $ins->close();
        $conn->commit();
    } catch (mysqli_sql_exception $e) {
        $conn->rollback();
        if ($e->getCode() === 1062) slot_fail(409, 'A slot with that name already exists.', 'label');
        server_error_response($e, 'Could not add the parking slot.');
        exit;
    }
    log_activity($conn, $admin_id, 'service', 'Added Parking Slots',
        'Slot(s) ' . implode(', ', $labels) . ' for ' . implode(', ', $types) . ($reg ? ', OR/CR required' : ', no OR/CR'));
    echo json_encode(['success' => true, 'ids' => $ids, 'labels' => $labels,
        'message' => count($labels) === 1 ? "Slot {$labels[0]} added." : count($labels) . ' slots added: ' . implode(', ', $labels) . '.']);
    $conn->close();
    exit;
}

$id = $in['id'] ?? null;
if (!is_int($id) || $id < 1) slot_fail(422, 'Choose a slot.', 'id');

if ($action === 'update' || $action === 'remove') {
    // Checked before any row is locked.
    $fields = $action === 'update' ? slot_fields($in) : null;
    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("SELECT id, label, icon, vehicle_types, requires_registration, status, archived_at FROM parking_slots WHERE id = ? FOR UPDATE");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row || $row['archived_at'] !== null) { $conn->rollback(); slot_fail(404, 'That parking slot was not found.'); }

        // The vehicle parked here, if any (locked: a release cannot slip past this check).
        $held = $conn->prepare("SELECT id, vehicle_type FROM parking_reservations WHERE status = 'Assigned' AND slot_number = ? FOR UPDATE");
        $held->bind_param('i', $id);
        $held->execute();
        $occupant = $held->get_result()->fetch_assoc();
        $held->close();

        if ($action === 'remove') {
            if ($occupant) { $conn->rollback(); slot_fail(409, "Slot {$row['label']} is in use. Release it before removing the slot."); }
            $upd = $conn->prepare("UPDATE parking_slots SET archived_at = NOW() WHERE id = ? AND archived_at IS NULL");
            $upd->bind_param('i', $id);
            $upd->execute();
            $upd->close();
            // Requests that asked for this slot wait on with none chosen.
            $clear = $conn->prepare("UPDATE parking_reservations SET slot_number = NULL WHERE status = 'Pending' AND slot_number = ?");
            $clear->bind_param('i', $id);
            $clear->execute();
            $clear->close();
            $conn->commit();
            log_activity($conn, $admin_id, 'service', 'Removed Parking Slot', "Slot {$row['label']} (ID $id)");
            echo json_encode(['success' => true, 'message' => "Slot {$row['label']} removed."]);
            $conn->close();
            exit;
        }

        [$label, $icon, $types_json, $reg, $status, $types] = $fields;
        if ($occupant && $status === 'maintenance') {
            $conn->rollback();
            slot_fail(409, "Slot {$row['label']} is in use. Release it before putting it under maintenance.", 'status');
        }
        if ($occupant && !in_array(strtolower($occupant['vehicle_type']), $types, true)) {
            $conn->rollback();
            slot_fail(409, "Slot {$row['label']} holds a " . strtolower($occupant['vehicle_type']) . '. Keep that type, or release the slot first.', 'vehicle_types');
        }
        $upd = $conn->prepare("UPDATE parking_slots SET label = ?, icon = ?, vehicle_types = ?, requires_registration = ?, status = ? WHERE id = ?");
        $upd->bind_param('sssisi', $label, $icon, $types_json, $reg, $status, $id);
        $upd->execute();
        $upd->close();
        $conn->commit();
    } catch (mysqli_sql_exception $e) {
        $conn->rollback();
        if ($e->getCode() === 1062) slot_fail(409, 'A slot with that name already exists.', 'label');
        server_error_response($e, 'Could not save the parking slot.');
        exit;
    }
    log_activity($conn, $admin_id, 'service', 'Updated Parking Slot',
        "Slot $label (ID $id): " . implode(', ', $types) . ($reg ? ', OR/CR required' : ', no OR/CR') . ($status === 'maintenance' ? ', under maintenance' : ''));
    echo json_encode(['success' => true, 'message' => "Slot $label saved."]);
    $conn->close();
    exit;
}

slot_fail(422, 'Unknown action.', 'action');
