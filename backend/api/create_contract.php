<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id");

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

$id = $input['id'] ?? uniqid('CTR-');
$rent_application_id = $input['rentApplicationId'] ?? null;
$deposit_amount = $input['depositAmount'] ?? 0;
$lease_start = $input['leaseStart'] ?? null;
$lease_end = $input['leaseEnd'] ?? null;

if (empty($rent_application_id) || empty($lease_start) || empty($lease_end)) {
    echo json_encode(["success" => false, "message" => "Rent Application ID, Lease Start, and Lease End are required."]);
    exit;
}

$stmt = $conn->prepare("INSERT INTO lease_contracts (id, rent_application_id, deposit_amount, lease_start, lease_end) VALUES (?, ?, ?, ?, ?)");
$stmt->bind_param("sidss", $id, $rent_application_id, $deposit_amount, $lease_start, $lease_end);

if ($stmt->execute()) {
    log_activity($conn, $admin_id, 'tenant', "Generated Lease Contract", "Contract ID: $id for Application: $rent_application_id");
    echo json_encode(["success" => true, "message" => "Contract created successfully", "contractId" => $id]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to create contract", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
