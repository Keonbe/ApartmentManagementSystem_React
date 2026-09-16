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
    $data = json_decode(file_get_contents("php://input"), true);

    $id = trim($data['id'] ?? '');
    $type = trim($data['type'] ?? '');
    $floor = trim($data['floor'] ?? '');
    $rent = $data['rent'] ?? null;

    if ($id === '' || $type === '' || $floor === '' || $rent === null || !is_numeric($rent) || (float)$rent <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Unit number, floor, type, and a positive rent are required.']);
        exit();
    }

    $stmt = $conn->prepare("SELECT id FROM rooms WHERE id = ?");
    $stmt->bind_param("s", $id);
    $stmt->execute();
    if ($stmt->get_result()->fetch_assoc()) {
        $stmt->close();
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => "Unit $id already exists."]);
        exit();
    }
    $stmt->close();

    $stmt = $conn->prepare("INSERT INTO rooms (id, type, floor, monthly_rent, status) VALUES (?, ?, ?, ?, 'vacant')");
    $stmt->bind_param("sssd", $id, $type, $floor, $rent);
    if (!$stmt->execute()) {
        throw new Exception("Failed to create unit: " . $stmt->error);
    }
    $stmt->close();

    log_activity($conn, $adminId, 'unit', "Created Unit $id", "Type: $type, Floor: $floor, Rent: $rent");

    echo json_encode(['success' => true, 'message' => "Unit $id created successfully."]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
