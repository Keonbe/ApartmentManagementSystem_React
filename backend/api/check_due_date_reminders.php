<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . "/../config.php";

// Admin "Run reminder check now". The work itself lives in
// run_notification_sweep() (config.php), which also runs once a day on its own —
// from get_notifications.php and from backend/cron/daily_sweep.php. It used to run
// only when an admin happened to open the Payments page, and selected, notified,
// then updated with no claim, so two tabs could send the same reminder twice.
require_admin($conn);

try {
    $result = run_notification_sweep($conn, true);
    unset($result['ran']);
    echo json_encode(array_merge(["success" => true, "message" => "Due date reminder check completed."], $result));
} catch (Exception $e) {
    server_error_response($e, "The reminder check failed.");
}

$conn->close();
?>
