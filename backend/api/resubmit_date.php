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
$app_id = $input['id'] ?? 0;
$new_date = $input['preferred_move_in_date'] ?? '';

if ($app_id <= 0 || empty($new_date)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Missing application ID or date.']);
    exit;
}
// Same rule as the application form (the picker's min alone let 2023-02-01 through),
// including "not before the unit is free" for a unit that is still occupied.
$room_stmt = $conn->prepare("SELECT room_name FROM rent_applications WHERE id = ? AND user_id = ?");
$room_stmt->bind_param("ii", $app_id, $user_id);
$room_stmt->execute();
$app_room = $room_stmt->get_result()->fetch_assoc();
$room_stmt->close();
$available_from = $app_room ? room_open_for_application($conn, (string)$app_room['room_name'])[0] : null;
$date_error = move_in_date_error($conn, $new_date, $available_from);
if ($date_error !== '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => $date_error, 'field' => 'preferred_move_in_date']);
    exit;
}

$stmt = $conn->prepare("UPDATE rent_applications SET preferred_move_in_date = ?, status = 'Pending Review', rejection_reason = NULL WHERE id = ? AND user_id = ? AND status = 'Action Required'");
$stmt->bind_param("sii", $new_date, $app_id, $user_id);
$stmt->execute();

if ($stmt->affected_rows > 0) {
    $shown_date = date('F j, Y', strtotime($new_date));
    log_activity($conn, $user_id, 'tenant', 'Resubmitted Move-In Date', "Application ID: $app_id, Date: $new_date");
    resolve_admin_queue($conn, 'rent_application', $app_id);
    notify_admins_queue($conn, 'rent_application', $app_id, 'Application Resubmitted',
        "Application #$app_id is back for review with a new preferred move-in date of $shown_date.");
    echo json_encode(['success' => true]);
} else {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Could not update application. Status may have changed.']);
}
$stmt->close();
?>
