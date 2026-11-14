<?php
header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../cors.php';
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../config.php';
$adminId = require_admin($conn);
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);
if (!is_array($input)) {
    $input = $_POST;
}
// A value sent as an array would reach the (string) cast below as the text "Array".
foreach (['id', 'roomId', 'room_id', 'room_name'] as $room_key) {
    if (is_array($input[$room_key] ?? null) || is_array($_POST[$room_key] ?? null) || is_array($_GET[$room_key] ?? null)) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Field '$room_key' must be a single value.", "field" => $room_key]);
        exit;
    }
}
$roomId = trim((string)(
    $input['id'] ??
    $input['roomId'] ??
    $input['room_id'] ??
    $input['room_name'] ??
    $_POST['id'] ??
    $_POST['roomId'] ??
    $_POST['room_id'] ??
    $_GET['id'] ??
    $_GET['roomId'] ??
    ''
));

// Older databases may not yet have the room-archiving migration applied.
$columns = $conn->query("SHOW COLUMNS FROM rooms LIKE 'archived_at'");
if (!$columns || $columns->num_rows === 0) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'Unit removal is unavailable until the room archiving migration is applied.']);
    exit();
}

if ($roomId === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Unit ID is required.']);
    exit();
}

try {
    $conn->begin_transaction();

    $stmt = $conn->prepare("SELECT id, status, tenant_name FROM rooms WHERE id = ? AND archived_at IS NULL FOR UPDATE");
    $stmt->bind_param('s', $roomId);
    $stmt->execute();
    $room = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$room) {
        $conn->rollback();
        $existsStmt = $conn->prepare('SELECT id FROM rooms WHERE id = ?');
        $existsStmt->bind_param('s', $roomId);
        $existsStmt->execute();
        $alreadyArchived = (bool)$existsStmt->get_result()->fetch_assoc();
        $existsStmt->close();
        http_response_code($alreadyArchived ? 409 : 404);
        echo json_encode(['success' => false, 'message' => $alreadyArchived ? 'This unit has already been removed.' : 'Unit not found.']);
        exit();
    }
    if ($room['status'] !== 'vacant' || !empty($room['tenant_name'])) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Only vacant units with no assigned tenant can be removed.']);
        exit();
    }

    $stmt = $conn->prepare("SELECT id FROM rent_applications WHERE room_name = ? AND status IN ('Approved', 'active', 'pending-move-out', 'Pending Review', 'Pending', 'Pending Deposit') LIMIT 1");
    $stmt->bind_param('s', $roomId);
    $stmt->execute();
    $hasActiveTenancy = (bool)$stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($hasActiveTenancy) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'This unit has an active tenancy or a pending application and cannot be removed.']);
        exit();
    }

    $stmt = $conn->prepare("SELECT id FROM unit_reservations WHERE room_name = ? AND status = 'Active' AND hold_expires_at >= CURRENT_DATE() LIMIT 1");
    $stmt->bind_param('s', $roomId);
    $stmt->execute();
    $hasActiveReservation = (bool)$stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($hasActiveReservation) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'This unit has an active reservation. Release or let it expire before removing the unit.']);
        exit();
    }

    $stmt = $conn->prepare('UPDATE rooms SET archived_at = NOW(), archived_by = ? WHERE id = ? AND archived_at IS NULL');
    $stmt->bind_param('is', $adminId, $roomId);
    $stmt->execute();
    if ($stmt->affected_rows !== 1) {
        $stmt->close();
        throw new RuntimeException('The unit could not be removed. Refresh and try again.');
    }
    $stmt->close();

    log_activity($conn, $adminId, 'unit', "Removed Unit $roomId", 'Unit archived from active listings; historical records retained.');
    $conn->commit();
    echo json_encode(['success' => true, 'message' => "Unit $roomId was removed from active listings."]);
} catch (Throwable $e) {
    try { $conn->rollback(); } catch (Throwable $ignored) {}
    error_log('[AMS] archive_room.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to remove unit. Please try again.']);
}

$conn->close();