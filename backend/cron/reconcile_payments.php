<?php
// Checks online (PayMongo) checkouts that have been waiting a while against PayMongo,
// for Windows Task Scheduler (SPRINT 183, panel audit F-08):
//
//   Program:   C:\xampp\php\php.exe
//   Arguments: C:\xampp\htdocs\ApartmentManagementSystem_React\backend\cron\reconcile_payments.php
//   Trigger:   Every 15 minutes (repeat the task; once a day also works, but a lost
//              webhook is then only found the next day)
//
// A bill is 'processing' while the tenant is at the PayMongo checkout. If PayMongo's
// "paid" webhook was lost, this finds the payment and records it by the webhook's own
// rules, and releases a checkout PayMongo says expired. It also runs automatically
// right before the sweeps that would clear a stuck checkout, so this script only makes
// the wait shorter. Re-running it is safe: a payment already recorded is a no-op.
// Needs the PayMongo secret key (Settings, or PAYMONGO_SECRET_KEY in the environment).

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "Forbidden";
    exit;
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../paymongo_gateway.php';

$result = reconcile_gateway_payments($conn);
$details = $result['details'];
unset($result['details']);

echo '[' . date('Y-m-d H:i:s') . "] PayMongo reconciliation\n";
foreach ($result as $key => $value) {
    echo str_pad($key, 14) . $value . "\n";
}
foreach ($details as $d) {
    echo '  ' . str_pad((string)$d['invoice'], 24) . $d['result'] . ($d['message'] ? ' - ' . $d['message'] : '') . "\n";
}

$conn->close();
