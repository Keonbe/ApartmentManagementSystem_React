<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

// Admin asks an applicant for more documents (system_design FR-9.7). The request is a
// notice to the applicant, with the admin's wording, pointing at Track Application; the
// applicant answers through the support chat or at the office. Only an application that
// is still open (under review or approved, not yet moved in) can be asked.
$admin_id = require_admin($conn);
$input = read_json_input();

$app_id = $input['id'] ?? null;
$message = trim((string)($input['message'] ?? ''));
$errors = array_filter([
    'id' => v_id($app_id, 'Application'),
    'message' => v_str($message, 'Message', 5, 500),
]);
if ($errors) validation_fail($errors);
$app_id = (int)$app_id;

$stmt = $conn->prepare("SELECT user_id, status, room_name FROM rent_applications WHERE id = ?");
$stmt->bind_param("i", $app_id);
$stmt->execute();
$app = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$app) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Application not found."]);
    exit;
}
if (!in_array($app['status'], ['Pending Review', 'Approved'], true)) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Documents can only be requested while the application is under review or approved and the tenant has not moved in."]);
    exit;
}

$nid = create_notification($conn, (int)$app['user_id'], 'application_update', 'More documents needed',
    "Management needs more documents for your application for Room {$app['room_name']}: $message Send them through the support chat or bring them to the office.");

log_activity($conn, $admin_id, 'tenant', 'Requested Application Documents', "Application ID: $app_id; Message: $message");

echo json_encode([
    "success" => true,
    "message" => $nid ? "The applicant was notified." : "Saved, but the applicant has switched this kind of notice off.",
    "notified" => (bool)$nid,
]);
$conn->close();
?>
