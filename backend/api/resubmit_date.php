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
$input = read_json_input();
if (!is_array($input)) $input = [];
$app_id = $input['id'] ?? 0;
$new_date = trim((string)($input['preferred_move_in_date'] ?? ''));

// Same rule as the application form (the picker's min alone let 2023-02-01 through),
// including "not before the unit is free" for a unit that is still occupied.
$errors = array_filter(['id' => v_id($app_id, 'Application')]);
$available_from = null;
if (!$errors) {
    $app_id = (int)$app_id;
    $room_stmt = $conn->prepare("SELECT room_name FROM rent_applications WHERE id = ? AND user_id = ?");
    $room_stmt->bind_param("ii", $app_id, $user_id);
    $room_stmt->execute();
    $app_room = $room_stmt->get_result()->fetch_assoc();
    $room_stmt->close();
    $available_from = $app_room ? room_open_for_application($conn, (string)$app_room['room_name'])[0] : null;
}
$errors += array_filter([
    'preferred_move_in_date' => $new_date === '' ? 'Choose a move-in date.' : move_in_date_error($conn, $new_date, $available_from),
]);
if ($errors) validation_fail($errors);

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
