<?php
// Sweep for unit reservations whose hold period has lapsed: mark them Expired
// and return the units to 'vacant'.
//
// Admin only: needs an admin session (the admin Inquiries page sends one).
// Nothing has to call this URL otherwise, because get_inquiries.php and
// get_rooms.php run the same sweep, so holds still lapse without anything
// scheduled.

header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

// This used to answer anyone with no session (as a cron target). The same sweep
// already runs from the read paths, so an anonymous caller gains nothing and now
// gets 401 (403 for a tenant).
$admin_id = require_admin($conn);

$released = release_expired_reservations($conn);

// Log only when the sweep actually did something.
if ($released > 0) {
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
