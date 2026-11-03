<?php
// Daily notification sweep (checklist 6.2 / 6.3 / 10.3) for Windows Task Scheduler:
//
//   Program:   C:\xampp\php\php.exe
//   Arguments: C:\xampp\htdocs\ApartmentManagementSystem_React\backend\cron\daily_sweep.php
//   Trigger:   Daily, e.g. 07:00
//
// The same sweep also runs on the first get_notifications.php request of each day,
// so this script is a guarantee rather than a requirement. Re-running it is safe:
// every reminder and every parking month is claimed individually.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "Forbidden";
    exit;
}

require_once __DIR__ . '/../config.php';

$result = run_notification_sweep($conn, true);
unset($result['ran']);
$result += void_lapsed_payments($conn);
$result += purge_expired_cctv_footage($conn);

echo '[' . date('Y-m-d H:i:s') . "] Notification sweep\n";
foreach ($result as $key => $value) {
    echo str_pad($key, 26) . $value . "\n";
}

$conn->close();
