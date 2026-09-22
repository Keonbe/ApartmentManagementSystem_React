<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$query = "SELECT setting_key, setting_value FROM system_settings";
$result = $conn->query($query);
$settings = [];

if ($result) {
    while ($row = $result->fetch_assoc()) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }
}

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
$is_admin = verify_admin($conn, $admin_id);

// Never returned to a non-admin. Keep this list identical to $secret_keys in
// update_system_settings.php, which decides what the audit log hides. The
// legacy semaphore_api_key / smtp_user / smtp_pass names were never read or
// written anywhere; the channels migration deletes them.
$sensitive_keys = [
    'paymongo_secret_key',
    'paymongo_webhook_secret',
    'smtp_username',
    'smtp_password',
    'sms_api_key',
    'sms_twilio_sid',
    'sms_twilio_auth_token',
    'sms_vonage_api_key',
    'sms_vonage_api_secret',
    'sms_movider_api_key',
    'sms_movider_api_secret',
    'sms_itexmo_api_code',
    'sms_itexmo_password'
];

if (!$is_admin) {
    foreach ($sensitive_keys as $s_key) {
        unset($settings[$s_key]);
    }
}

// Ensure numeric values are converted properly
if(isset($settings['minLeaseDuration'])) $settings['minLeaseDuration'] = (int)$settings['minLeaseDuration'];
if(isset($settings['overdueThresholdDays'])) $settings['overdueThresholdDays'] = (int)$settings['overdueThresholdDays'];
if(isset($settings['reservation_hold_days'])) $settings['reservation_hold_days'] = (int)$settings['reservation_hold_days'];
if(isset($settings['reservationHoldDays'])) $settings['reservationHoldDays'] = (int)$settings['reservationHoldDays'];
if(isset($settings['maintenanceMonthlyBudget'])) $settings['maintenanceMonthlyBudget'] = (float)$settings['maintenanceMonthlyBudget'];
if(isset($settings['autoFlagEviction'])) $settings['autoFlagEviction'] = filter_var($settings['autoFlagEviction'], FILTER_VALIDATE_BOOLEAN);
if(isset($settings['max_parking_slots'])) $settings['max_parking_slots'] = (int)$settings['max_parking_slots'];
if(isset($settings['parking_allowed_vehicle_types'])) {
    $decoded = json_decode($settings['parking_allowed_vehicle_types'], true);
    $settings['parking_allowed_vehicle_types'] = is_array($decoded) ? $decoded : ['motorcycle'];
}

echo json_encode(["success" => true, "settings" => $settings]);
$conn->close();
?>
