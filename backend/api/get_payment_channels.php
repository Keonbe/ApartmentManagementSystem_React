<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;

if (!$user_id && !verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

$query = "SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'payment_%'";
$result = $conn->query($query);
$settings = [];
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }
}

$mode = $settings['payment_mode'] ?? 'both'; 
$sandbox_master = $settings['payment_sandbox_enabled'] ?? '1';
$sandbox_enabled = ($sandbox_master === '1' || $sandbox_master === 'true' || $mode === 'sandbox');

$all_channels = [
    [ "id" => "gcash_sandbox",  "label" => "GCash",          "family" => "sandbox", "icon" => "gcash", "key" => "payment_ch_gcash_sandbox" ],
    [ "id" => "bank_sandbox",   "label" => "Bank Transfer",  "family" => "sandbox", "icon" => "bank",  "key" => "payment_ch_bank_sandbox" ],
    [ "id" => "qrph",           "label" => "QR Ph",          "family" => "sandbox", "icon" => "qr",    "key" => "payment_ch_qrph" ],
    [ "id" => "paymaya",        "label" => "Maya",           "family" => "sandbox", "icon" => "maya",  "key" => "payment_ch_maya" ],
    [ "id" => "gcash_manual",   "label" => "GCash (Manual)", "family" => "manual",  "icon" => "gcash", "key" => "payment_ch_gcash_manual" ],
    [ "id" => "bank_manual",    "label" => "Bank Transfer (Manual)", "family" => "manual", "icon" => "bank", "key" => "payment_ch_bank_manual" ],
    [ "id" => "in_person",      "label" => "In-Person Payment", "family" => "in_person", "icon" => "cash", "key" => "payment_ch_in_person" ]
];

$active_channels = [];

foreach ($all_channels as $ch) {
    if ($ch['family'] === 'sandbox') {
        if ($mode === 'manual') continue;
        if (!$sandbox_enabled) continue;
    } else {
        if ($mode === 'sandbox') continue;
    }

    $is_enabled = !isset($settings[$ch['key']]) || $settings[$ch['key']] === '1' || $settings[$ch['key']] === 'true';
    if ($is_enabled) {
        $active_channels[] = [
            "id" => $ch['id'],
            "label" => $ch['label'],
            "family" => $ch['family'],
            "icon" => $ch['icon']
        ];
    }
}

echo json_encode(["success" => true, "channels" => array_values($active_channels)]);
$conn->close();
?>
