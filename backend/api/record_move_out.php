<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

// Move-out is always filed as the caller's own verified identity. The old
// body-supplied userId/email fallback defeated the point of the X-User-Id
// header entirely — anyone could file a move-out notice against any lease.
$auth = require_user($conn);
$user_id = $auth['id'];

$input = read_json_input();

// Find the latest approved/active rent application for this user
$stmt = $conn->prepare("SELECT id, room_name FROM rent_applications WHERE user_id = ? AND status IN ('Approved', 'active', 'pending-move-out') ORDER BY created_at DESC LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$res = $stmt->get_result();

if ($res->num_rows === 0) {
    echo json_encode(["success" => false, "message" => "No active approved room application found."]);
    $stmt->close();
    $conn->close();
    exit;
}

$app = $res->fetch_assoc();
$app_id = $app['id'];
$room_name = $app['room_name'];
$stmt->close();

// Read and validate move-out date
$move_out_date = $input['move_out_date'] ?? null;
if (empty($move_out_date)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Move-out date is required."]);
    $conn->close();
    exit;
}

try {
    $today = new DateTime(date('Y-m-d'));
    // new DateTime() takes "tomorrow" and rolls 2026-11-31 over to December 1; only a real YYYY-MM-DD passes.
    if (real_date($move_out_date) === null) throw new Exception("Invalid date format.");
    $selected_date = new DateTime($move_out_date);
    $interval = $today->diff($selected_date);
    $days_diff = (int)$interval->format('%r%a');

    // The notice window is an admin setting (Settings → Rental), default 15–30.
    $notice = move_out_notice_days($conn);
    if ($days_diff < $notice['min']) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Prior notice of at least {$notice['min']} days is required before your actual move-out."]);
        $conn->close();
        exit;
    }
    if ($days_diff > $notice['max']) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Move-out notice cannot exceed {$notice['max']} days in advance."]);
        $conn->close();
        exit;
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Invalid date format."]);
    $conn->close();
    exit;
}

// Update status to 'pending-move-out' and record move-out date. The status
// guard + affected_rows check catches the case where the application's
// status changed between the SELECT above and this UPDATE (e.g. it was
// concurrently moved-out/archived already).
$conn->begin_transaction();
$moved = transition_application($conn, (int)$app_id, 'pending-move-out', ['user_id' => $user_id, 'only_from' => ['Approved', 'active'], 'move_out_date' => $move_out_date]);

if ($moved['ok']) {
    $conn->commit();
    log_activity($conn, $user_id, 'tenant', "Requested Move Out", "Application ID: $app_id, Room: $room_name, Scheduled: $move_out_date");

    // The admin has to schedule clearance and final billing for this move-out
    // — it was logged before but never reached the action queue (audit M12).
    notify_admins_queue($conn, 'move_out_request', $app_id, 'Move-Out Notice Filed',
        "A tenant filed a move-out notice for Room $room_name, scheduled $move_out_date. Clearance and final billing required.");

    echo json_encode(["success" => true, "message" => "Move-out request recorded successfully."]);
} else {
    $conn->rollback();
    echo json_encode(["success" => false, "message" => "Failed to submit move-out request — your application may have already changed status."]);
}

$conn->close();
?>
