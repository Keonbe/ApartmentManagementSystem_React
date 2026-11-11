<?php
// Sweep for active lease contracts whose lease_end has passed: mark them Expired.
//
// Admin only: needs an admin session. Nothing has to call this URL, because
// get_contracts.php and the daily notification sweep run the same sweep, so
// contracts still expire without anything scheduled. Same shape as
// expire_reservations.php.

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
// already runs from the read paths and the daily sweep, so an anonymous caller
// gains nothing and now gets 401 (403 for a tenant).
$admin_id = require_admin($conn);

$expired = expire_lapsed_contracts($conn);

// Log only when the sweep actually did something.
if ($expired > 0) {
    log_activity($conn, (int)$admin_id, 'contract', "Expired Lapsed Contracts", "$expired contract(s) auto-expired (lease_end passed)");
}

echo json_encode([
    "success" => true,
    "expired" => $expired,
    "message" => $expired > 0
        ? "$expired contract(s) expired."
        : "No lapsed contracts found."
]);

$conn->close();
?>
