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
if(isset($settings['min_lease_duration'])) $settings['min_lease_duration'] = (int)$settings['min_lease_duration'];
if(isset($settings['max_rent_ahead_months'])) $settings['max_rent_ahead_months'] = (int)$settings['max_rent_ahead_months'];
if(isset($settings['payment_window_days'])) $settings['payment_window_days'] = (int)$settings['payment_window_days'];
if(isset($settings['overdue_threshold_days'])) $settings['overdue_threshold_days'] = (int)$settings['overdue_threshold_days'];
if(isset($settings['move_out_min_notice_days'])) $settings['move_out_min_notice_days'] = (int)$settings['move_out_min_notice_days'];
if(isset($settings['move_out_max_notice_days'])) $settings['move_out_max_notice_days'] = (int)$settings['move_out_max_notice_days'];
if(isset($settings['move_in_min_days'])) $settings['move_in_min_days'] = (int)$settings['move_in_min_days'];
if(isset($settings['move_in_max_days'])) $settings['move_in_max_days'] = (int)$settings['move_in_max_days'];
if(isset($settings['reservation_hold_days'])) $settings['reservation_hold_days'] = (int)$settings['reservation_hold_days'];
if(isset($settings['maintenance_monthly_budget'])) $settings['maintenance_monthly_budget'] = (float)$settings['maintenance_monthly_budget'];
if(isset($settings['max_parking_slots'])) $settings['max_parking_slots'] = (int)$settings['max_parking_slots'];
if(isset($settings['parking_allowed_vehicle_types'])) {
    $decoded = json_decode($settings['parking_allowed_vehicle_types'], true);
    $settings['parking_allowed_vehicle_types'] = is_array($decoded) ? $decoded : ['motorcycle'];
}

if (isset($settings['min_household_age'])) $settings['min_household_age'] = (int)$settings['min_household_age'];
if (isset($settings['child_restricted_below_age'])) $settings['child_restricted_below_age'] = (int)$settings['child_restricted_below_age'];
if (isset($settings['child_restricted_floors'])) {
    $decoded = json_decode($settings['child_restricted_floors'], true);
    $settings['child_restricted_floors'] = is_array($decoded) ? array_values($decoded) : [];
}
if (isset($settings['age_categories'])) {
    $decoded = json_decode($settings['age_categories'], true);
    $settings['age_categories'] = is_array($decoded) ? $decoded : [];
}
// 'warn' (default) or 'block'; anything else stored reads as 'warn', as find_reference_reuse() treats it.
$settings['duplicate_reference_policy'] = ($settings['duplicate_reference_policy'] ?? 'warn') === 'block' ? 'block' : 'warn';
if (isset($settings['floor_rates'])) {
    $decoded = json_decode($settings['floor_rates']);
    $settings['floor_rates'] = is_object($decoded) ? $decoded : new stdClass();
}
if (isset($settings['glass_overlay_opacity'])) $settings['glass_overlay_opacity'] = (int)$settings['glass_overlay_opacity'];
if (isset($settings['glass_blur'])) $settings['glass_blur'] = (int)$settings['glass_blur'];
// Always an object of the four items; a missing or garbled row reads as the
// app's own wording, all shown.
[$home_content] = normalize_home_content($settings['home_content'] ?? '');
$settings['home_content'] = $home_content ?? home_content_defaults();
// Same for the Preview page hero.
[$preview_hero] = normalize_preview_hero($settings['preview_hero'] ?? '');
$settings['preview_hero'] = $preview_hero ?? preview_hero_defaults();
$settings['extension_deadline_days'] = extension_deadline_days($conn);
if (isset($settings['qrph_active_slot'])) {
    $settings['qrph_active_slot'] = (int)$settings['qrph_active_slot'];
}
if (isset($settings['qrph_slots'])) {
    $decoded = json_decode($settings['qrph_slots'], true);
    $settings['qrph_slots'] = is_array($decoded) ? $decoded : [];
}

echo json_encode(["success" => true, "settings" => $settings]);
$conn->close();
?>
