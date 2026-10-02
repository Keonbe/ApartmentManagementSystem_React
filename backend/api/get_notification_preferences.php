<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// The caller's own notification preferences, per category and per channel
// (checklist 6.8, extended for SMS and email in 6.6 / 6.7).
$auth = require_user($conn);

$saved = [];
$stmt = $conn->prepare("SELECT category, in_app_enabled, sms_enabled, email_enabled FROM notification_preferences WHERE user_id = ?");
$stmt->bind_param("i", $auth['id']);
$stmt->execute();
foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
    $saved[$row['category']] = [
        'in_app' => (bool)$row['in_app_enabled'],
        'sms'    => (bool)$row['sms_enabled'],
        'email'  => (bool)$row['email_enabled'],
    ];
}
$stmt->close();

// No row means the user has never saved a preference, which counts as opted in
// on every channel — the same default create_notification() applies.
$preferences = [];
foreach (NOTIFICATION_PREF_CATEGORIES as $key => $cat) {
    $preferences[] = [
        'category' => $key,
        'label' => $cat['label'],
        'in_app_enabled' => $saved[$key]['in_app'] ?? true,
        'sms_enabled' => $saved[$key]['sms'] ?? true,
        'email_enabled' => $saved[$key]['email'] ?? true,
    ];
}

// The global switches live on users, not in the table above, because most
// notification types belong to no category at all (see user_channel_allowed()).
$me_stmt = $conn->prepare("SELECT contact_no, email_address, sms_opt_out, email_opt_out FROM users WHERE id = ?");
$me_stmt->bind_param("i", $auth['id']);
$me_stmt->execute();
$me = $me_stmt->get_result()->fetch_assoc() ?: [];
$me_stmt->close();

echo json_encode([
    "success" => true,
    "preferences" => $preferences,
    // Shown to the user as the list of notices that cannot be switched off.
    "always_on" => ['Overdue payment alerts', 'Bills and payment confirmations', 'Application and rent decisions', 'Maintenance updates', 'Contract and move-out notices'],
    // Whether the building has each channel switched on at all. A tenant's
    // per-category SMS choice means nothing while sms_available is false.
    "channels" => [
        "sms_available" => get_setting($conn, 'notifications_sms_enabled', '0') === '1',
        "email_available" => get_setting($conn, 'notifications_email_enabled', '0') === '1',
    ],
    "sms_opt_out" => (bool)($me['sms_opt_out'] ?? 0),
    "email_opt_out" => (bool)($me['email_opt_out'] ?? 0),
    // So the UI can warn when a channel is on but the account is unreachable.
    "has_contact_no" => !empty($me['contact_no']),
    "has_email" => !empty($me['email_address']),
]);
$conn->close();
?>
