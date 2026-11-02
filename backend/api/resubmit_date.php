<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$auth = require_user($conn);
$user_id = $auth['id'];
$input = json_decode(file_get_contents("php://input"), true);
if (!is_array($input)) $input = [];
$app_id = $input['id'] ?? 0;
$new_date = trim((string)($input['preferred_move_in_date'] ?? ''));

// Same rule as the application form (the picker's min alone let 2023-02-01 through).
$errors = array_filter([
    'id' => v_id($app_id, 'Application'),
    'preferred_move_in_date' => $new_date === '' ? 'Choose a move-in date.' : move_in_date_error($conn, $new_date),
]);
if ($errors) validation_fail($errors);
$app_id = (int)$app_id;

$conn->begin_transaction();
$moved = transition_application($conn, $app_id, 'Pending Review', ['user_id' => $user_id, 'only_from' => ['Action Required'], 'cols' => ['preferred_move_in_date' => $new_date]]);
if ($moved['ok']) {
    $conn->commit();
    $shown_date = date('F j, Y', strtotime($new_date));
    log_activity($conn, $user_id, 'tenant', 'Resubmitted Move-In Date', "Application ID: $app_id, Date: $new_date");
    resolve_admin_queue($conn, 'rent_application', $app_id);
    notify_admins_queue($conn, 'rent_application', $app_id, 'Application Resubmitted',
        "Application #$app_id is back for review with a new preferred move-in date of $shown_date.");
    echo json_encode(['success' => true]);
} else {
    $conn->rollback();
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Could not update application. Status may have changed.']);
}
?>
