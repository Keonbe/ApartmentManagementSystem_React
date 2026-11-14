<?php
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config.php';

$adminId = require_admin($conn);

try {
    $data = read_json_input();

    $id = trim($data['id'] ?? '');
    $type = trim($data['type'] ?? '');
    $floor = trim($data['floor'] ?? '');
    $rent = $data['rent'] ?? null;
    $floor_rate = $floor !== '' ? floor_rate_for($conn, $floor) : null;
    // No rent given: the unit takes its floor's fixed rent (Settings → Floor Rent).
    if (($rent === null || $rent === '') && $floor_rate !== null) $rent = $floor_rate;

    if ($id === '' || $type === '' || $floor === '' || $rent === null || !is_numeric($rent) || (float)$rent <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Unit number, floor, type, and a positive rent are required. Set a rent for this floor in Settings to skip typing it.']);
        exit();
    }
    $custom = ($floor_rate === null || abs($floor_rate - (float)$rent) > 0.001) ? 1 : 0;

    $archiveColumn = $conn->query("SHOW COLUMNS FROM rooms LIKE 'archived_at'");
    if (!$archiveColumn || $archiveColumn->num_rows === 0) {
        throw new Exception('Apply the room archiving migration before restoring removed units.');
    }

    $stmt = $conn->prepare("SELECT id, archived_at FROM rooms WHERE id = ?");
    $stmt->bind_param("s", $id);
    $stmt->execute();
    $existingRoom = $stmt->get_result()->fetch_assoc();
    if ($existingRoom && $existingRoom['archived_at'] === null) {
        $stmt->close();
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => "Unit $id already exists."]);
        exit();
    }
    $stmt->close();

    if ($existingRoom) {
        $stmt = $conn->prepare("UPDATE rooms SET type = ?, floor = ?, monthly_rent = ?, rent_is_custom = ?, status = 'vacant', tenant_name = NULL, lease_start = NULL, lease_end = NULL, last_tenant = NULL, maintenance_flag = 0, occupants = 0, room_condition = 'Good', furnishing_status = 'Unfurnished', last_inspection_date = NULL, gallery = NULL, archived_at = NULL, archived_by = NULL WHERE id = ? AND archived_at IS NOT NULL");
        $stmt->bind_param("ssdis", $type, $floor, $rent, $custom, $id);
        if (!$stmt->execute()) {
            error_log("[AMS] Failed to restore unit: " . $stmt->error);
            throw new Exception("Failed to restore unit.");
        }
        $stmt->close();
        log_activity($conn, $adminId, 'unit', "Restored Unit $id", "Type: $type, Floor: $floor, Rent: $rent");
        echo json_encode(['success' => true, 'message' => "Unit $id restored successfully."]);
        exit();
    }

    $stmt = $conn->prepare("INSERT INTO rooms (id, type, floor, monthly_rent, rent_is_custom, status) VALUES (?, ?, ?, ?, ?, 'vacant')");
    $stmt->bind_param("sssdi", $id, $type, $floor, $rent, $custom);
    if (!$stmt->execute()) {
        error_log("[AMS] Failed to create unit: " . $stmt->error);
        throw new Exception("Failed to create unit.");
    }
    $stmt->close();

    log_activity($conn, $adminId, 'unit', "Created Unit $id", "Type: $type, Floor: $floor, Rent: $rent");

    echo json_encode(['success' => true, 'message' => "Unit $id created successfully."]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => public_error_message($e)]);
}
