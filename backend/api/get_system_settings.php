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

// Credentials (SECRET_SETTING_KEYS in config.php) are removed entirely for a
// non-admin, and masked for an admin. The settings form has to render these
// fields, but it does not need their values: sending the real SMTP password and
// every API key as cleartext JSON puts them in browser history, devtools and
// any screen-shared demo. update_system_settings.php treats a returned mask as
// "leave this one alone".
foreach (SECRET_SETTING_KEYS as $s_key) {
    if (!array_key_exists($s_key, $settings)) continue;
    if ($is_admin) {
        $settings[$s_key] = mask_secret_value($settings[$s_key]);
    } else {
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
