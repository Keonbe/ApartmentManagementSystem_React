<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

require_user($conn);

if (get_setting($conn, 'service_pay_bills_active', 'true') === 'false') {
    echo json_encode(["success" => true, "channels" => []]);
    $conn->close();
    exit;
}

$query = "SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'payment_%' OR setting_key LIKE 'qrph_%'";
$result = $conn->query($query);
$settings = [];
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }
}

$raw_mode = $settings['payment_mode'] ?? 'manual';
$mode = in_array($raw_mode, ['sandbox', 'both', 'manual'], true) ? $raw_mode : 'manual'; 
$sandbox_master = $settings['payment_sandbox_enabled'] ?? '1';
$sandbox_enabled = ($sandbox_master === '1' || $sandbox_master === 'true' || $mode === 'sandbox' || $mode === 'both');

$raw_slots = $settings['qrph_slots'] ?? '[]';
$slots = json_decode($raw_slots, true);
$active_slot_id = (int)($settings['qrph_active_slot'] ?? 1);
if ($active_slot_id < 1 || $active_slot_id > QRPH_SLOT_COUNT) $active_slot_id = 1; // left from the 5-slot list
$active_qr = null;
if (is_array($slots)) {
    foreach ($slots as $slot) {
        if ((int)($slot['slot'] ?? 0) === $active_slot_id) {
            $active_qr = [
                'slot' => (int)($slot['slot'] ?? 1),
                'label' => $slot['label'] ?? '',
                'image_path' => $slot['image_path'] ?? '',
                'account_name' => $slot['account_name'] ?? '',
                'account_number' => $slot['account_number'] ?? '',
            ];
            break;
        }
    }
}

$all_channels = [
    [ "id" => "qrph_manual",    "label" => "QR Ph",          "family" => "manual",  "icon" => "qr",    "key" => "payment_ch_qrph_manual", "qr_data" => $active_qr ],
    [ "id" => "gcash_sandbox",  "label" => "GCash",          "family" => "sandbox", "icon" => "gcash", "key" => "payment_ch_gcash_sandbox" ],
    [ "id" => "bank_sandbox",   "label" => "Bank Transfer",  "family" => "sandbox", "icon" => "bank",  "key" => "payment_ch_bank_sandbox" ],
    [ "id" => "paymaya",        "label" => "Maya",           "family" => "sandbox", "icon" => "maya",  "key" => "payment_ch_maya" ],
    [ "id" => "gcash_manual",   "label" => "GCash (Manual)", "family" => "manual",  "icon" => "gcash", "key" => "payment_ch_gcash_manual" ],
    // Manual bank transfers, one per bank (2026-10-01), so the admin records
    // the bank the tenant actually used. Both follow the one bank-transfer
    // switch in Settings (payment_ch_bank_manual).
    [ "id" => "bdo_manual",     "label" => "BDO (Manual)",   "family" => "manual",  "icon" => "bank",  "key" => "payment_ch_bank_manual" ],
    [ "id" => "bpi_manual",     "label" => "BPI (Manual)",   "family" => "manual",  "icon" => "bank",  "key" => "payment_ch_bank_manual" ],
    [ "id" => "in_person",      "label" => "In-Person Payment", "family" => "in_person", "icon" => "cash", "key" => "payment_ch_in_person" ]
];

$active_channels = [];

// Channel families are no longer mutually exclusive. Previously `payment_mode`
// picked exactly one family, so enabling online sandbox payments silently
// removed In-Person/Cash entirely (and vice versa) — a building can obviously
// accept cash at the office and GCash online at the same time.
//
// `payment_mode` now only decides which *remote* family is offered (sandbox
// gateway vs. manual transfer-and-upload); in-person is always available
// unless explicitly switched off via its own payment_ch_in_person setting.
foreach ($all_channels as $ch) {
    if ($ch['family'] === 'sandbox') {
        if ($mode === 'manual' || !$sandbox_enabled) continue;
    } elseif ($ch['family'] === 'manual') {
        if ($mode === 'sandbox') continue;
    }
    // 'in_person' falls through: always a candidate, gated only by its own key.

    $is_enabled = !isset($settings[$ch['key']]) || $settings[$ch['key']] === '1' || $settings[$ch['key']] === 'true';
    if ($is_enabled) {
        $ch_row = [
            "id" => $ch['id'],
            "label" => $ch['label'],
            "family" => $ch['family'],
            "icon" => $ch['icon']
        ];
        if (!empty($ch['qr_data'])) {
            $ch_row['qr_data'] = $ch['qr_data'];
        }
        $active_channels[] = $ch_row;
    }
}

echo json_encode(["success" => true, "channels" => array_values($active_channels)]);
$conn->close();
?>
