<?php
// Notification queue drain (checklist 6.6 / 6.7) for Windows Task Scheduler:
//
//   Program:   C:\xampp\php\php.exe
//   Arguments: C:\xampp\htdocs\ApartmentManagementSystem_React\backend\cron\process_queue.php
//   Trigger:   Every 1 minute
//
//   php backend/cron/process_queue.php            drain the default 20 jobs
//   php backend/cron/process_queue.php --limit=5  drain at most 5
//
// This is the only place a provider is contacted: endpoints enqueue and return.
// No lock file is needed — process_notification_queue() claims its batch with a
// token before reading it, so two drains racing cannot pick up the same job.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "Forbidden";
    exit;
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../api/services/send_notification.php';

$limit = 20;
foreach ($argv as $arg) {
    if (preg_match('/^--limit=(\d+)$/', $arg, $m)) $limit = (int)$m[1];
}

$result = process_notification_queue($conn, $limit);

echo '[' . date('Y-m-d H:i:s') . "] Notification queue drain\n";
foreach ($result as $key => $value) {
    echo str_pad($key, 12) . $value . "\n";
}

$conn->close();
