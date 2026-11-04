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
    $input = json_decode(file_get_contents("php://input"), true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON input.']);
        exit();
    }

    $unitId = trim($input['unitId'] ?? $input['unit_id'] ?? '');
    $action = trim($input['action'] ?? 'start');
    $completionDate = trim($input['completionDate'] ?? $input['completion_date'] ?? '');
    $notes = trim($input['notes'] ?? '');

    if (empty($unitId)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Unit identifier is required.']);
        exit();
    }

    // Verify room exists
    $stmt = $conn->prepare("SELECT id, status, tenant_name, maintenance_flag, available_date FROM rooms WHERE id = ?");
    $stmt->bind_param("s", $unitId);
    $stmt->execute();
    $room = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$room) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => "Unit $unitId was not found."]);
        exit();
    }

    if ($action === 'start') {
        // Validation: Only units that are available or coming to be available can be set under maintenance
        if ($room['status'] === 'occupied' || !empty($room['tenant_name'])) {
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'message' => "Cannot set Unit $unitId as under maintenance while an active tenant occupies the unit."
            ]);
            exit();
        }

        // Validation: Valid completion date is required
        if (empty($completionDate) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $completionDate)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'A valid estimated completion date is required.']);
            exit();
        }

        // Validation: No setting completion date to the past
        $today = date('Y-m-d');
        if ($completionDate < $today) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Estimated completion date cannot be in the past.']);
            exit();
        }

        $condition = 'Under Maintenance';
        $flag = 1;
        $upd = $conn->prepare("UPDATE rooms SET maintenance_flag = ?, available_date = ?, room_condition = ? WHERE id = ?");
        $upd->bind_param("isss", $flag, $completionDate, $condition, $unitId);
        $upd->execute();
        $upd->close();

        $logDesc = "Unit $unitId placed under maintenance until $completionDate." . ($notes !== '' ? " Note: $notes" : '');
        log_activity($conn, $adminId, 'unit', 'Unit Under Maintenance', $logDesc);

        echo json_encode([
            'success' => true,
            'message' => "Unit $unitId is now set as Under Maintenance (Coming Soon: $completionDate).",
            'unitId' => $unitId,
            'availableDate' => $completionDate,
            'maintenanceFlag' => true,
        ]);
        exit();
    } elseif ($action === 'complete') {
        $flag = 0;
        $nullDate = null;
        $condition = 'Good';
        $upd = $conn->prepare("UPDATE rooms SET maintenance_flag = ?, available_date = NULL, room_condition = ? WHERE id = ?");
        $upd->bind_param("iss", $flag, $condition, $unitId);
        $upd->execute();
        $upd->close();

        $logDesc = "Maintenance completed for Unit $unitId. Unit marked as Available.";
        log_activity($conn, $adminId, 'unit', 'Unit Maintenance Completed', $logDesc);

        echo json_encode([
            'success' => true,
            'message' => "Maintenance for Unit $unitId has been marked as complete. Unit is now available.",
            'unitId' => $unitId,
            'availableDate' => null,
            'maintenanceFlag' => false,
        ]);
        exit();
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "Unknown maintenance action: $action."]);
        exit();
    }
} catch (Exception $e) {
    server_error_response($e, 'Failed to update unit maintenance status.');
}
?>

