<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
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

$sensitive_keys = [
    'paymongo_secret_key',
    'paymongo_webhook_secret',
    'semaphore_api_key',
    'smtp_pass',
    'smtp_user'
];

if (!$is_admin) {
    foreach ($sensitive_keys as $s_key) {
        unset($settings[$s_key]);
    }
}

// Ensure numeric values are converted properly
if(isset($settings['minLeaseDuration'])) $settings['minLeaseDuration'] = (int)$settings['minLeaseDuration'];
if(isset($settings['overdueThresholdDays'])) $settings['overdueThresholdDays'] = (int)$settings['overdueThresholdDays'];
if(isset($settings['maintenanceMonthlyBudget'])) $settings['maintenanceMonthlyBudget'] = (float)$settings['maintenanceMonthlyBudget'];
if(isset($settings['autoFlagEviction'])) $settings['autoFlagEviction'] = filter_var($settings['autoFlagEviction'], FILTER_VALIDATE_BOOLEAN);

echo json_encode(["success" => true, "settings" => $settings]);
$conn->close();
?>
