<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";
require_once __DIR__ . '/services/send_notification.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Sends one notification to the admin's own contact details so the channel
// configuration can be checked without waiting for a real event (checklist
// 6.6 / 6.7). Always synchronous — the point is to see the result now — and
// always to the caller, so this cannot be used to message a tenant.
$admin_id = require_admin($conn);

$input   = json_decode(file_get_contents("php://input"), true) ?? [];
$channel = $input['channel'] ?? 'both';
if (!in_array($channel, ['sms', 'email', 'both'], true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Channel must be sms, email or both."]);
    exit;
}

$stmt = $conn->prepare("SELECT first_name, email_address, contact_no FROM users WHERE id = ?");
$stmt->bind_param("i", $admin_id);
$stmt->execute();
$me = $stmt->get_result()->fetch_assoc();
$stmt->close();

$sms_enabled   = get_setting($conn, 'notifications_sms_enabled', '0') === '1';
$email_enabled = get_setting($conn, 'notifications_email_enabled', '0') === '1';
$sms_provider  = get_setting($conn, 'sms_provider', 'log');
$email_driver  = get_setting($conn, 'email_driver', 'log');

$stamp     = date('M j, H:i');
$sms_text  = sms_single_segment("AMS: Test message sent $stamp. If you received this, SMS notifications are working.");
$subject   = "AMS test notification - $stamp";
$email_html = email_announcement_template(
    'Test notification',
    "This is a test message sent from Account Settings on $stamp.\n\nIf you are reading this, email notifications are configured correctly.",
    'General'
);

$results = [];

if (($channel === 'sms' || $channel === 'both')) {
    if (empty($me['contact_no'])) {
        $results['sms'] = ['status' => 'skipped', 'reason' => 'Your account has no contact number.'];
    } elseif (!$sms_enabled) {
        $results['sms'] = ['status' => 'skipped', 'reason' => 'SMS notifications are switched off.'];
    } else {
        $ok = send_sms($conn, $me['contact_no'], $sms_text, 'test', $admin_id);
        $results['sms'] = [
            'status'    => $ok ? 'sent' : 'failed',
            'driver'    => $sms_provider,
            'recipient' => $me['contact_no'],
            'reason'    => $ok ? null : _last_delivery_error($conn, $admin_id, 'sms'),
        ];
    }
}

if (($channel === 'email' || $channel === 'both')) {
    if (empty($me['email_address'])) {
        $results['email'] = ['status' => 'skipped', 'reason' => 'Your account has no email address.'];
    } elseif (!$email_enabled) {
        $results['email'] = ['status' => 'skipped', 'reason' => 'Email notifications are switched off.'];
    } else {
        $ok = send_email($conn, $me['email_address'], $subject, $email_html, 'test', $admin_id);
        $results['email'] = [
            'status'    => $ok ? 'sent' : 'failed',
            'driver'    => $email_driver,
            'recipient' => $me['email_address'],
            'reason'    => $ok ? null : _last_delivery_error($conn, $admin_id, 'email'),
        ];
    }
}

log_activity($conn, $admin_id, 'system', 'Sent Test Notification', 'Channel: ' . $channel . ' (sms driver: ' . $sms_provider . ', email driver: ' . $email_driver . ')');

// The rendered bodies come back so the caller can print exactly what would have
// gone out. dry_run says whether anything actually left the building, so a log
// driver's success can never be mistaken for a delivery.
echo json_encode([
    "success"  => true,
    "dry_run"  => ($sms_provider === 'log' || $email_driver === 'log'),
    "drivers"  => ["sms" => $sms_provider, "email" => $email_driver],
    "channels" => ["sms_enabled" => $sms_enabled, "email_enabled" => $email_enabled],
    "results"  => $results,
    "rendered" => [
        "sms_text"   => $sms_text,
        "sms_length" => mb_strlen($sms_text),
        "subject"    => $subject,
        "email_html" => $email_html,
    ],
]);

function _last_delivery_error($conn, $user_id, $channel) {
    $stmt = $conn->prepare("SELECT error_message FROM notification_log
                            WHERE user_id = ? AND channel = ? ORDER BY id DESC LIMIT 1");
    $stmt->bind_param("is", $user_id, $channel);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? $row['error_message'] : null;
}

$conn->close();
