<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);

if (!$input) {
    echo json_encode(["success" => false, "message" => "No data received"]);
    exit;
}

$contract_id = $input['contractId'] ?? '';
$action = $input['action'] ?? ''; // 'flag' or 'clear'

if (empty($contract_id) || empty($action)) {
    echo json_encode(["success" => false, "message" => "Contract ID and action are required."]);
    exit;
}

$status = $action === 'flag' ? 'eviction-pending' : 'active';
$eviction_status = $action === 'flag' ? 'flagged' : null;

$stmt = $conn->prepare("UPDATE lease_contracts SET status = ?, eviction_status = ? WHERE id = ?");
$stmt->bind_param("sss", $status, $eviction_status, $contract_id);

if ($stmt->execute()) {
    log_activity($conn, $admin_id, 'tenant', "Updated Contract Eviction Status", "Contract: $contract_id, Action: $action");
    echo json_encode(["success" => true, "message" => "Eviction status updated successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to update eviction status", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
