<?php
// Sweep for active lease contracts whose lease_end has passed: mark them Expired.
//
// Safe to call from a scheduled task (Windows Task Scheduler / cron) or from
// the admin Contracts page. Same shape as expire_reservations.php.
// get_contracts.php also runs the sweep opportunistically, so contracts still
// expire without anything scheduled.

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

$expired = expire_lapsed_contracts($conn);

// Log only when the sweep actually did something, and only when an admin
// triggered it (a cron run has no admin id to attribute).
$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if ($expired > 0 && verify_admin($conn, $admin_id)) {
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
