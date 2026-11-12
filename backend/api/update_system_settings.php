<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true);
if (!is_array($input) || !$input) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "No data received"]);
    exit;
}

// Values the log must never contain in clear text. The same list decides what
// get_system_settings.php masks; it lives in config.php so the two cannot drift.
$secret_keys = SECRET_SETTING_KEYS;

$existing = [];
$res = $conn->query("SELECT setting_key, setting_value FROM system_settings");
while ($row = $res->fetch_assoc()) {
    $existing[$row['setting_key']] = $row['setting_value'];
}

// All keys save together or not at all: one rejected key used to leave the
// keys before it saved. Every key is checked, and all refusals are reported
// together: $refuse stops only the current key.
class SettingRefused extends Exception {
    public $errors;
    public function __construct($message, $errors = null) {
        parent::__construct($message);
        $this->errors = $errors;
    }
}
$conn->begin_transaction();
$refuse = function ($message, $errors = null) {
    throw new SettingRefused($message, $errors);
};
$refused = [];

// Plain single-value rules, one row per key. type 'int' = whole number in
// [min, max]; 'num' = number in [min, max] (min_exclusive: above min); 'enum' =
// one of values. 'field' is the inline message under that input (the field name
// is the key in camelCase). Keys with cross-checks or structured values
// (move-out / move-in pairs, parking slots, JSON lists, glass image) are
// handled in the loop below. A key not listed here is stored as posted.
$SETTING_RULES = [
    'min_lease_duration'       => ['type' => 'int', 'min' => 1, 'max' => 24, 'message' => 'Minimum rent duration must be a whole number between 1 and 24 months.'],
    'max_rent_ahead_months'    => ['type' => 'int', 'min' => 1, 'max' => MAX_RENT_AHEAD_MONTHS_CEILING, 'message' => 'Maximum months ahead must be a whole number between 1 and ' . MAX_RENT_AHEAD_MONTHS_CEILING . '.'],
    'payment_window_days'      => ['type' => 'int', 'min' => 1, 'max' => 30, 'message' => 'Payment window must be a whole number of days between 1 and 30.', 'field' => 'Enter 1 to 30 days.'],
    'deposit_refundable_default' => ['type' => 'enum', 'values' => ['0', '1'], 'message' => 'The deposit refund default must be on or off.'],
    'cancellation_fee'         => ['type' => 'num', 'min' => 0, 'max' => 100000, 'message' => 'The cancellation fee must be an amount from 0 to 100,000.', 'field' => 'Enter 0 to 100,000.'],
    'deposit_refund_days'      => ['type' => 'int', 'min' => 1, 'max' => 90, 'message' => 'The deposit refund period must be a whole number of days between 1 and 90.', 'field' => 'Enter 1 to 90 days.'],
    'overdue_threshold_days'   => ['type' => 'int', 'min' => 1, 'max' => 365, 'message' => 'The overdue threshold must be a whole number of days between 1 and 365.'],
    'reservation_hold_days'    => ['type' => 'int', 'min' => 1, 'max' => 90, 'message' => 'A unit reservation must hold for a whole number of days between 1 and 90.'],
    'lease_end_reminder_days'  => ['type' => 'int', 'min' => 0, 'max' => 180, 'message' => 'Rent-end reminder days must be a whole number between 0 and 180.'],
    'maintenance_monthly_budget' => ['type' => 'num', 'min' => 0, 'max' => 100000000, 'message' => 'The monthly maintenance budget must be an amount from 0 to 100,000,000.'],
    'max_occupants_per_unit'   => ['type' => 'int', 'min' => 1, 'max' => 20, 'message' => 'Maximum occupants per unit must be a whole number between 1 and 20.'],
    'included_occupants'       => ['type' => 'int', 'min' => 1, 'max' => 20, 'message' => 'Occupants included in the rent must be a whole number between 1 and 20.', 'field' => 'Enter 1 to 20.'],
    'occupant_surcharge_per_person' => ['type' => 'float', 'min' => 0, 'max' => 100000, 'message' => 'The charge per extra person must be an amount from 0 to 100,000.', 'field' => 'Enter 0 to 100,000.'],
    'inquiry_move_in_max_months' => ['type' => 'int', 'min' => 1, 'max' => 24, 'message' => 'The inquiry move-in limit must be a whole number of months from 1 to 24.', 'field' => 'Enter 1 to 24 months.'],
    'min_household_age'        => ['type' => 'int', 'min' => 0, 'max' => 17, 'message' => 'The minimum household age must be a whole number from 0 to 17.'],
    'child_restricted_below_age' => ['type' => 'int', 'min' => 0, 'max' => 17, 'message' => 'The child age limit must be a whole number from 0 to 17.'],
    'parking_billing_mode'     => ['type' => 'enum', 'values' => ['manual', 'auto'], 'message' => 'Parking billing mode must be manual or auto.'],
    'parking_monthly_fee'      => ['type' => 'num', 'min' => 0, 'min_exclusive' => true, 'max' => 100000, 'message' => 'Parking monthly fee must be a positive amount.', 'field' => 'Enter an amount above 0 (use Free parking for no fee).'],
    // Parking settings (Admin → Parking → gear): permit length and open reservations per tenant.
    'parking_max_duration_months' => ['type' => 'int', 'min' => 1, 'max' => 12, 'message' => 'The longest parking permit must be 1 to 12 months.', 'field' => 'Enter 1 to 12 months.'],
    'parking_max_per_tenant'   => ['type' => 'int', 'min' => 1, 'max' => 5, 'message' => 'Parking reservations per tenant must be 1 to 5.', 'field' => 'Enter 1 to 5.'],
    // The UI's slider goes 1-168 hours (one week).
    'visitor_overstay_hours'   => ['type' => 'int', 'min' => 1, 'max' => 168, 'message' => 'Visitor overstay threshold must be a whole number between 1 and 168 hours.'],
    'qrph_active_slot'         => ['type' => 'int', 'min' => 1, 'max' => QRPH_SLOT_COUNT, 'message' => 'Active QR Ph slot must be between 1 and ' . QRPH_SLOT_COUNT . '.'],
    'room_preview_mode'        => ['type' => 'enum', 'values' => ['images', 'floor_plan'], 'message' => 'Room preview mode must be images or floor_plan.'],
    'payment_mode'             => ['type' => 'enum', 'values' => ['manual', 'sandbox', 'both'], 'message' => 'Payment mode must be manual, sandbox or both.'],
    'email_driver'             => ['type' => 'enum', 'values' => ['log', 'smtp'], 'message' => 'Email driver must be log or smtp.'],
    'sms_provider'             => ['type' => 'enum', 'values' => ['log', 'semaphore'], 'message' => 'SMS provider must be log or semaphore.'],
    'notifications_dispatch_mode' => ['type' => 'enum', 'values' => ['queue', 'sync'], 'message' => 'Dispatch mode must be queue or sync.'],
    'smtp_port'                => ['type' => 'int', 'min' => 1, 'max' => 65535, 'message' => 'The SMTP port must be a whole number between 1 and 65535.'],
    'sms_daily_cap'            => ['type' => 'int', 'min' => 0, 'max' => 100000, 'message' => 'The daily SMS cap must be a whole number from 0 (no cap) to 100,000.'],
    'sms_unit_cost'            => ['type' => 'num', 'min' => 0, 'max' => 1000, 'message' => 'The SMS unit cost must be an amount from 0 to 1,000.'],
    'notifications_quiet_start' => ['type' => 'int', 'min' => 0, 'max' => 23, 'message' => 'Quiet hours start must be an hour from 0 to 23.'],
    'notifications_quiet_end'  => ['type' => 'int', 'min' => 0, 'max' => 23, 'message' => 'Quiet hours end must be an hour from 0 to 23.'],
    // 0 = keep the notification log forever.
    'notification_log_retention_days' => ['type' => 'int', 'min' => 0, 'max' => 3650, 'message' => 'Log retention must be a whole number of days from 0 (keep forever) to 3650.'],
    'rent_due_reminder_days'   => ['type' => 'int', 'min' => 0, 'max' => 30, 'message' => 'Rent-due reminder days must be a whole number between 0 and 30.'],
    'overdue_reminder_interval_days' => ['type' => 'int', 'min' => 1, 'max' => 30, 'message' => 'The overdue reminder interval must be a whole number between 1 and 30 days.'],
    // Settings -> CCTV. The footage window cannot exceed what the building keeps.
    'cctv_lookback_days'       => ['type' => 'int', 'min' => 1, 'max' => 365, 'message' => 'The footage window must be a whole number of days between 1 and 365.', 'field' => 'Enter 1 to 365 days.'],
    'cctv_footage_days'        => ['type' => 'int', 'min' => 1, 'max' => 90, 'message' => 'Footage availability must be a whole number of days between 1 and 90.', 'field' => 'Enter 1 to 90 days.'],
    'cctv_min_reason_length'   => ['type' => 'int', 'min' => 5, 'max' => 200, 'message' => 'The shortest reason must be a whole number of characters between 5 and 200.', 'field' => 'Enter 5 to 200.'],
    'glass_overlay_opacity'    => ['type' => 'int', 'min' => 0, 'max' => 95, 'message' => 'The Glass overlay must be a whole number from 0 to 95 percent.', 'field' => 'Enter 0 to 95.'],
    'glass_blur'               => ['type' => 'int', 'min' => 0, 'max' => 20, 'message' => 'The Glass background blur must be a whole number from 0 to 20 pixels.', 'field' => 'Enter 0 to 20.'],
];
function setting_value_invalid(array $rule, string $value): bool {
    if ($rule['type'] === 'enum') return !in_array($value, $rule['values'], true);
    if ($rule['type'] === 'int') return !ctype_digit($value) || (int)$value < $rule['min'] || (int)$value > $rule['max'];
    if (!is_numeric($value)) return true;
    $n = (float)$value;
    return $n < $rule['min'] || (!empty($rule['min_exclusive']) && $n == $rule['min']) || $n > $rule['max'];
}

$stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?");
$changed = [];

foreach ($input as $key => $value) {
  try {
    if (!is_string($key) || !preg_match('/^[A-Za-z0-9_]{1,100}$/', $key)) {
        $refuse("Invalid setting key.");
    }
    // Owned by cron/check_environment.php --claim; the settings page echoes it
    // back with everything else, so it is skipped rather than refused.
    if ($key === 'deployment_id') continue;

    // The form renders credentials as the mask get_system_settings.php handed
    // out. Posting that mask back means "unchanged" — writing it would replace
    // a working API key with four bullets and the last four characters.
    if (in_array($key, $secret_keys, true) && is_masked_secret($value)) continue;
    if (is_bool($value)) {
        $value = $value ? 'true' : 'false';
    } elseif (is_array($value)) {
        // Arrays used to be cast with (string), which stored the literal word "Array".
        $value = json_encode($value);
    } else {
        $value = (string)$value;
    }

    if (isset($SETTING_RULES[$key]) && setting_value_invalid($SETTING_RULES[$key], $value)) {
        $rule = $SETTING_RULES[$key];
        $field = lcfirst(str_replace('_', '', ucwords($key, '_')));
        $refuse($rule['message'], isset($rule['field']) ? [$field => $rule['field']] : null);
    }

    // The parking slots themselves are managed in parking_slots.php; the old
    // slot count and vehicle-type list are no longer settings.
    if (in_array($key, ['max_parking_slots', 'parking_allowed_vehicle_types'], true)) continue;
    // Floor → monthly rent table. Stored as a JSON object {"1F": 5000}.
    if ($key === 'floor_rates') {
        $decoded = json_decode($value, true);
        $clean = [];
        $bad = !is_array($decoded);
        if (!$bad) {
            foreach ($decoded as $floor => $price) {
                $floor = trim((string)$floor);
                if ($floor === '' || mb_strlen($floor) > 50 || !is_numeric($price) || (float)$price <= 0 || (float)$price > 1000000) { $bad = true; break; }
                $clean[$floor] = round((float)$price, 2);
            }
        }
        if ($bad) {
            $refuse("Each floor needs a rent above 0 and up to 1,000,000.");
        }
        $value = json_encode($clean, JSON_FORCE_OBJECT);
    }
    // CCTV request form choices (Settings -> CCTV): stored canonical, so what
    // cctv_request.php validates against is exactly what was saved here.
    if ($key === 'cctv_locations') {
        [$clean, $problem] = cctv_normalize_locations(json_decode($value, true));
        if ($clean === null) $refuse($problem, ["cctvLocations" => $problem]);
        $value = json_encode($clean, JSON_UNESCAPED_UNICODE);
    }
    if ($key === 'cctv_incident_types') {
        [$clean, $problem] = cctv_normalize_incident_types(json_decode($value, true));
        if ($clean === null) $refuse($problem, ["cctvIncidentTypes" => $problem]);
        $value = json_encode($clean, JSON_UNESCAPED_UNICODE);
    }
    // No young children on these floors (default 3F, because of the stairs).
    if ($key === 'child_restricted_floors') {
        $decoded = json_decode($value, true);
        $is_list = is_array($decoded) && array_keys($decoded) === range(0, count($decoded) - 1);
        if (!is_array($decoded) || ($decoded && !$is_list) || count($decoded) > 10) {
            $refuse("Restricted floors must be a list of up to 10 floors.");
        }
        $floor_res = $conn->query("SELECT DISTINCT floor FROM rooms");
        $known = $floor_res ? array_column($floor_res->fetch_all(MYSQLI_ASSOC), 'floor') : [];
        $clean = [];
        foreach ($decoded as $f) {
            if (!is_string($f) || !in_array($f, $known, true)) $refuse("Restricted floors must be floors that have units.");
            if (in_array($f, $clean, true)) $refuse("Each restricted floor can be listed once.");
            $clean[] = $f;
        }
        $value = json_encode($clean);
    }
    // Age categories for children (infant / toddler / minor ...): non-overlapping ranges within 0-17.
    if ($key === 'age_categories') {
        $decoded = json_decode($value, true);
        $clean = [];
        $bad = !is_array($decoded) || count($decoded) < 1 || count($decoded) > 6;
        if (!$bad) {
            $used_keys = [];
            foreach ($decoded as $c) {
                $label = trim((string)($c['label'] ?? ''));
                $min = $c['min_age'] ?? null;
                $max = $c['max_age'] ?? null;
                $rule = trim((string)($c['rule'] ?? ''));
                $rule_fil = trim((string)($c['rule_fil'] ?? ''));
                if ($label === '' || mb_strlen($label) > 40 || !is_numeric($min) || !is_numeric($max)
                    || (int)$min < 0 || (int)$max > 17 || (int)$min > (int)$max
                    || mb_strlen($rule) > 500 || mb_strlen($rule_fil) > 500) { $bad = true; break; }
                $k = trim((string)($c['key'] ?? ''));
                if (!preg_match('/^[a-z0-9_]{1,30}$/', $k)) $k = substr(preg_replace('/[^a-z0-9]+/', '_', strtolower($label)), 0, 30) ?: 'category';
                while (isset($used_keys[$k])) $k = substr($k, 0, 27) . '_' . count($used_keys);
                $used_keys[$k] = true;
                $clean[] = ['key' => $k, 'label' => $label, 'min_age' => (int)$min, 'max_age' => (int)$max, 'rule' => $rule, 'rule_fil' => $rule_fil];
            }
            usort($clean, fn($a, $b) => $a['min_age'] <=> $b['min_age']);
            for ($i = 1; !$bad && $i < count($clean); $i++) {
                if ($clean[$i]['min_age'] <= $clean[$i - 1]['max_age']) $bad = true;
            }
        }
        if ($bad) {
            $refuse("Age categories need a name, an age range between 0 and 17 that does not overlap another category, and rules under 500 characters.");
        }
        $value = json_encode($clean, JSON_UNESCAPED_UNICODE);
    }
    if ($key === 'qrph_slots') {
        $decoded = is_string($value) ? json_decode($value, true) : $value;
        // Up to 5 entries are still read (a page loaded before the change to
        // QRPH_SLOT_COUNT sends the old list); slots above the count are dropped.
        if (!is_array($decoded) || count($decoded) > 5) {
            $refuse("QR Ph slots must be a list of up to " . QRPH_SLOT_COUNT . " slots.");
        }
        $clean_slots = [];
        foreach ($decoded as $idx => $s) {
            $slot_num = (int)($s['slot'] ?? ($idx + 1));
            if ($slot_num < 1 || $slot_num > 5) $refuse("Invalid slot number.");
            if ($slot_num > QRPH_SLOT_COUNT) continue;
            $label = mb_substr(trim((string)($s['label'] ?? '')), 0, 100);
            $image_path = mb_substr(trim((string)($s['image_path'] ?? '')), 0, 255);
            $account_name = mb_substr(trim((string)($s['account_name'] ?? '')), 0, 100);
            $account_number = mb_substr(trim((string)($s['account_number'] ?? '')), 0, 50);
            $clean_slots[] = [
                'slot' => $slot_num,
                'label' => $label,
                'image_path' => $image_path,
                'account_name' => $account_name,
                'account_number' => $account_number,
            ];
        }
        $value = json_encode($clean_slots, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    // Move-out notice window: min 1-60 days, max up to 90 and never below min.
    // The other bound is read from this same request when it is being saved too.
    if ($key === 'move_out_min_notice_days' || $key === 'move_out_max_notice_days') {
        if (!is_string($value) || !ctype_digit($value)) {
            $refuse("Move-out notice days must be whole numbers.");
        }
        $n = (int)$value;
        if ($key === 'move_out_min_notice_days' && ($n < 1 || $n > 60)) {
            $refuse("Minimum move-out notice must be between 1 and 60 days.", ["moveOutMinNoticeDays" => "Enter 1 to 60 days."]);
        }
        if ($key === 'move_out_max_notice_days' && ($n < 1 || $n > 90)) {
            $refuse("Maximum move-out notice must be between 1 and 90 days.", ["moveOutMaxNoticeDays" => "Enter 1 to 90 days."]);
        }
        $pair_min = $key === 'move_out_min_notice_days' ? $n : (int)($input['move_out_min_notice_days'] ?? $existing['move_out_min_notice_days'] ?? MOVE_OUT_NOTICE_DEFAULT_MIN);
        $pair_max = $key === 'move_out_max_notice_days' ? $n : (int)($input['move_out_max_notice_days'] ?? $existing['move_out_max_notice_days'] ?? MOVE_OUT_NOTICE_DEFAULT_MAX);
        if ($pair_max < $pair_min) {
            $refuse("The maximum move-out notice ($pair_max days) cannot be shorter than the minimum ($pair_min days).", ["moveOutMaxNoticeDays" => "Must be at least the minimum."]);
        }
    }

    // Move-in date window (rent applications and resubmitted dates): earliest
    // 0-60 days from today (0 = today), latest 1-365, never below the earliest.
    if ($key === 'move_in_min_days' || $key === 'move_in_max_days') {
        if (!is_string($value) || !ctype_digit($value)) {
            $refuse("Move-in date days must be whole numbers.");
        }
        $n = (int)$value;
        if ($key === 'move_in_min_days' && $n > 60) {
            $refuse("The earliest move-in date must be between 0 and 60 days from today.", ["moveInMinDays" => "Enter 0 to 60 days."]);
        }
        if ($key === 'move_in_max_days' && ($n < 1 || $n > 365)) {
            $refuse("The latest move-in date must be between 1 and 365 days from today.", ["moveInMaxDays" => "Enter 1 to 365 days."]);
        }
        $pair_min = $key === 'move_in_min_days' ? $n : (int)($input['move_in_min_days'] ?? $existing['move_in_min_days'] ?? MOVE_IN_DEFAULT_MIN_DAYS);
        $pair_max = $key === 'move_in_max_days' ? $n : (int)($input['move_in_max_days'] ?? $existing['move_in_max_days'] ?? MOVE_IN_DEFAULT_MAX_DAYS);
        if ($pair_max < $pair_min) {
            $refuse("The latest move-in date ($pair_max days) cannot be earlier than the earliest ($pair_min days).", ["moveInMaxDays" => "Must be at least the earliest."]);
        }
    }

    // Reused payment reference (Settings -> Payments): flag it, or refuse it.
    if ($key === 'duplicate_reference_policy' && (!is_string($input[$key]) || !in_array($value, DUPLICATE_REFERENCE_POLICIES, true))) {
        $refuse("Reused payment reference must be warn or block.", ["duplicateReferencePolicy" => "Choose warn or block."]);
    }

    // Tenant Glass theme backdrop (Other Settings -> Glass Mode). Every visitor's
    // page loads the image, so only a file upload_glass_background.php created
    // (or '' for the built-in photo) is accepted. Checked only when it changes:
    // the settings form posts every key, and a file removed by hand must not
    // block saving the parking fee.
    if ($key === 'glass_bg_image' && ($existing[$key] ?? '') !== $value) {
        if ($value !== '' && !is_valid_glass_bg_path($value)) {
            $refuse("Upload the background image again, or reset to the default photo.", ["glassBgImage" => "This image was not found."]);
        }
    }
    if ($key === 'glass_tint') {
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $value)) {
            $refuse("The Glass tint must be a colour like #0f172a.", ["glassTint" => "Use a #rrggbb colour."]);
        }
        $value = strtolower($value);
    }

    // Contract End (Other Settings): on/off switches are stored as '1' / '0'.
    // Language (Other Settings): language_switch_enabled shows the EN / FIL switch to tenants and guests.
    // Parking: parking_free makes new requests free (no fee, never billed).
    if (in_array($key, ['lease_end_reminders_enabled', 'lease_end_reminder_email', 'lease_end_reminder_sms', 'upcoming_rooms_enabled', 'language_switch_enabled', 'parking_free'], true)) {
        if (!in_array($value, ['1', '0', 'true', 'false'], true)) {
            $refuse("Choose on or off for $key.");
        }
        $value = in_array($value, ['1', 'true'], true) ? '1' : '0';
    }
    if ($key === 'extension_deadline_days' && (!ctype_digit($value) || (int)$value > EXTENSION_DEADLINE_MAX_DAYS)) {
        $refuse("The extension deadline must be a whole number of days from 0 to " . EXTENSION_DEADLINE_MAX_DAYS . ".",
            ["extensionDeadlineDays" => "Enter 0 to " . EXTENSION_DEADLINE_MAX_DAYS . " days."]);
    }
    // The reminder has to reach tenants before requests close, or it tells
    // them about a door that already shut. The other value comes from this
    // request when it is being saved too.
    if ($key === 'extension_deadline_days' || $key === 'lease_end_reminder_days') {
        $pair_deadline = (int)($input['extension_deadline_days'] ?? $existing['extension_deadline_days'] ?? 0);
        $pair_reminder = (int)($input['lease_end_reminder_days'] ?? $existing['lease_end_reminder_days'] ?? 30);
        if ($pair_deadline > 0 && $pair_reminder <= $pair_deadline) {
            $refuse("The rent-end reminder ($pair_reminder days before) must go out before extension requests close ($pair_deadline days before).",
                ["leaseEndReminderDays" => "Send it more than $pair_deadline days before the end."]);
        }
    }

    // Preview page hero (Other Settings -> Preview Page). The photo is checked
    // like the Glass one: only an upload this app made, and only when it changes.
    if ($key === 'preview_hero') {
        [$clean, $problem] = normalize_preview_hero($input[$key]);
        if ($clean === null) $refuse($problem, ["previewHero" => $problem]);
        [$stored] = normalize_preview_hero($existing[$key] ?? '');
        $old_image = $stored['image'] ?? '';
        if ($clean['image'] !== $old_image) {
            if ($clean['image'] !== '' && !is_valid_preview_hero_path($clean['image'])) {
                $refuse("Upload the Preview photo again, or use the default photo.", ["previewHero" => "This image was not found."]);
            }
            $preview_image_changed = true;
        }
        $value = json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    // Home page text (Other Settings -> Home Page): four known items, each with
    // a show switch and plain English / Filipino text; stored canonical.
    if ($key === 'home_content') {
        [$clean, $problem] = normalize_home_content($input[$key]);
        if ($clean === null) $refuse($problem, ["homeContent" => $problem]);
        $value = json_encode($clean, JSON_UNESCAPED_UNICODE);
    }

    if (array_key_exists($key, $existing) && $existing[$key] === $value) continue;

    $stmt->bind_param("sss", $key, $value, $value);
    $stmt->execute();
    $changed[] = in_array($key, $secret_keys, true) ? "$key (value hidden)" : $key;
  } catch (SettingRefused $e) {
    // Field keys are the settings form's camelCase names (systemSettings.js).
    $field = is_string($key) ? lcfirst(str_replace('_', '', ucwords($key, '_'))) : (string)$key;
    $refused += $e->errors ?: [$field => $e->getMessage()];
  }
}
$stmt->close();
if ($refused) {
    $conn->rollback();
    validation_fail($refused);
}
$conn->commit();

// The photo it replaced stays in the recent list; switching can push an old
// one past the last GLASS_BG_KEEP. Pruned only after the commit, so a refused
// save never leaves the setting pointing at a deleted file.
if (in_array('glass_bg_image', $changed, true)) {
    prune_glass_bg_files(current_glass_bg($conn));
}
// Same for the Preview photo: the one it replaced stays in its recent list.
if (!empty($preview_image_changed) && in_array('preview_hero', $changed, true)) {
    prune_site_images('preview', current_site_image($conn, 'preview'));
}

// The audit entry names what actually changed; it used to say "Updated multiple configuration keys" every time.
if ($changed) {
    log_activity($conn, $admin_id, 'system', 'Updated System Settings', "Changed " . count($changed) . " setting(s): " . implode(', ', $changed));
}

echo json_encode(["success" => true, "message" => "Settings updated successfully", "changed" => count($changed)]);
$conn->close();
?>
