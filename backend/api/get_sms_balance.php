<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";
require_once __DIR__ . '/services/send_notification.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Live Semaphore credit balance for Account Settings (checklist 6.6). Read-only:
// the key never leaves the server, only the balance comes back.
require_admin($conn);

$provider = strtolower(get_setting($conn, 'sms_provider', 'log'));
if ($provider !== 'semaphore') {
    echo json_encode(["success" => false, "provider" => $provider,
                      "message" => "Balance is only available when the SMS provider is Semaphore."]);
    exit;
}

$result = semaphore_account_balance($conn);
echo json_encode([
    "success"        => $result['ok'],
    "provider"       => $provider,
    "credit_balance" => $result['credit_balance'] ?? null,
    "account_name"   => $result['account_name'] ?? null,
    "account_status" => $result['status'] ?? null,
    "message"        => $result['ok'] ? null : $result['error'],
]);

$conn->close();
