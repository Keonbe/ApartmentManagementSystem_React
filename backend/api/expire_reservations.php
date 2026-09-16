<?php
// Sweep for unit reservations whose hold period has lapsed: mark them Expired
// and return the units to 'vacant'.
//
// Safe to call from a scheduled task (Windows Task Scheduler / cron) or from
// the admin Inquiries page. Same shape as check_due_date_reminders.php.
// get_inquiries.php and get_rooms.php also run the sweep opportunistically, so
// holds still lapse without anything scheduled.

header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

$released = release_expired_reservations($conn);

// Log only when the sweep actually did something, and only when an admin
// triggered it (a cron run has no admin id to attribute).
$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if ($released > 0 && verify_admin($conn, $admin_id)) {
    log_activity($conn, (int)$admin_id, 'inquiry', "Released Expired Reservations", "$released reservation(s) expired and returned to vacant");
}

echo json_encode([
    "success" => true,
    "released" => $released,
    "message" => $released > 0
        ? "$released expired reservation(s) released."
        : "No expired reservations found."
]);

$conn->close();
?>
