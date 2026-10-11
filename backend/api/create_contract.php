<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";
require_once __DIR__ . '/../contract_template.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Session-verified admin — the legacy `X-Admin-Id` + verify_admin() pair let
// any caller name their own admin id.
$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true);

if (!$input) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "No data received"]);
    exit;
}

$rent_application_id = $input['rentApplicationId'] ?? null;
$deposit_amount = $input['depositAmount'] ?? null;
$lease_start = $input['leaseStart'] ?? null;
$lease_end = $input['leaseEnd'] ?? null;

if (empty($rent_application_id) || empty($lease_start) || empty($lease_end)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Rent Application ID, Rent Start, and Rent End are required."]);
    exit;
}

$start_dt = DateTime::createFromFormat('Y-m-d', $lease_start);
$end_dt = DateTime::createFromFormat('Y-m-d', $lease_end);
if (!$start_dt || !$end_dt) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Dates must be in YYYY-MM-DD format."]);
    exit;
}
if ($end_dt <= $start_dt) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Rent end must be after rent start."]);
    exit;
}
$max_end = (clone $start_dt)->modify('+24 months');
if ($end_dt > $max_end) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "The maximum rent period is 24 months."]);
    exit;
}

// Only an application the tenant has actually moved into can have a
// contract generated for it — mirrors the AdminContracts.jsx tenant picker,
// which should exclude anything still Pending Review.
$app_stmt = $conn->prepare("SELECT monthly_rent, status FROM rent_applications WHERE id = ?");
$app_stmt->bind_param("i", $rent_application_id);
$app_stmt->execute();
$app = $app_stmt->get_result()->fetch_assoc();
$app_stmt->close();

if (!$app) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Rent application not found."]);
    exit;
}
if (!in_array($app['status'], ['Approved', 'active', 'pending-move-out'], true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "A contract can only be generated for an approved tenant."]);
    exit;
}

// Every approved application already gets a contract automatically
// (update_tenant_status.php on Approved). This modal used to insert a
// second lease_contracts row with no check, and every consumer query
// (get_contracts.php, my_room.php, get_rooms.php) joins with LIMIT 1 and
// picks between them arbitrarily.
$dupe_stmt = $conn->prepare("SELECT id FROM lease_contracts WHERE rent_application_id = ?");
$dupe_stmt->bind_param("i", $rent_application_id);
$dupe_stmt->execute();
$dupe = $dupe_stmt->get_result()->fetch_assoc();
$dupe_stmt->close();
if ($dupe) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "A contract already exists for this application ({$dupe['id']})."]);
    exit;
}

// Deposit defaults to one month's rent, matching the invoice generated on
// approval, if the admin left the field blank.
$deposit_amount = ($deposit_amount === null || $deposit_amount === '') ? (float)$app['monthly_rent'] : (float)$deposit_amount;

$id = $input['id'] ?? uniqid('CTR-');

// The contract keeps the clauses in force today, even if the template is edited later.
$template_version_id = contract_template_pin_version_id($conn);

$stmt = $conn->prepare("INSERT INTO lease_contracts (id, rent_application_id, deposit_amount, lease_start, lease_end, status, template_version_id) VALUES (?, ?, ?, ?, ?, 'draft', ?)");
$stmt->bind_param("sidssi", $id, $rent_application_id, $deposit_amount, $lease_start, $lease_end, $template_version_id);

if ($stmt->execute()) {
    log_activity($conn, $admin_id, 'contract', "Generated Rent Contract", "Contract ID: $id for Application: $rent_application_id");
    echo json_encode(["success" => true, "message" => "Contract created successfully", "contractId" => $id]);
} else {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Failed to create contract"]);
}

$stmt->close();
$conn->close();
?>
