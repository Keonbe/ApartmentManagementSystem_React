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
// keys before it saved.
$conn->begin_transaction();
$refuse = function ($message, $errors = null) use ($conn) {
    $conn->rollback();
    http_response_code(422);
    $body = ["success" => false, "message" => $message];
    if ($errors) $body["errors"] = $errors;
    echo json_encode($body);
    exit;
};

$stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?");
$changed = [];

foreach ($input as $key => $value) {
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

    // Parking settings drive capacity and billing, so a bad value is refused
    // instead of silently breaking the parking module.
    if ($key === 'max_parking_slots') {
        $highest = (int)($conn->query("SELECT COALESCE(MAX(slot_number), 0) AS m FROM parking_reservations WHERE status = 'Assigned'")->fetch_assoc()['m'] ?? 0);
        if (!ctype_digit($value) || (int)$value < 1 || (int)$value > 500) {
            $refuse("Parking slots must be a whole number between 1 and 500.");
        }
        if ((int)$value < $highest) {
            $refuse("Slot #$highest is still assigned. Release it before reducing parking slots below $highest.");
        }
    }
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
    if ($key === 'min_household_age' && (!ctype_digit($value) || (int)$value > 17)) {
        $refuse("The minimum household age must be a whole number from 0 to 17.");
    }
    // No young children on these floors (default 3F, because of the stairs).
    if ($key === 'child_restricted_below_age' && (!ctype_digit($value) || (int)$value > 17)) {
        $refuse("The child age limit must be a whole number from 0 to 17.");
    }
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
    if ($key === 'parking_billing_mode' && !in_array($value, ['manual', 'auto'], true)) {
        $refuse("Parking billing mode must be manual or auto.");
    }
    if ($key === 'parking_monthly_fee' && (!is_numeric($value) || (float)$value <= 0 || (float)$value > 100000)) {
        $refuse("Parking monthly fee must be a positive amount.");
    }
    // The UI's slider goes 1-168 hours (one week); the endpoint used to store
    // whatever was posted, including 0 or non-numeric text, which then fell
    // back to 24 with no indication anything was wrong.
    if ($key === 'visitor_overstay_hours' && (!ctype_digit($value) || (int)$value < 1 || (int)$value > 168)) {
        $refuse("Visitor overstay threshold must be a whole number between 1 and 168 hours.");
    }
    if ($key === 'qrph_active_slot' && (!ctype_digit($value) || (int)$value < 1 || (int)$value > 5)) {
        $refuse("Active QR Ph slot must be between 1 and 5.");
    }
    if ($key === 'qrph_slots') {
        $decoded = is_string($value) ? json_decode($value, true) : $value;
        if (!is_array($decoded) || count($decoded) > 5) {
            $refuse("QR Ph slots must be a list of up to 5 slots.");
        }
        $clean_slots = [];
        foreach ($decoded as $idx => $s) {
            $slot_num = (int)($s['slot'] ?? ($idx + 1));
            if ($slot_num < 1 || $slot_num > 5) $refuse("Invalid slot number.");
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
    if ($key === 'payment_window_days' && (!ctype_digit($value) || (int)$value < 1 || (int)$value > 30)) {
        $refuse("Payment window must be a whole number of days between 1 and 30.", ["paymentWindowDays" => "Enter 1 to 30 days."]);
    }
    if ($key === 'lease_end_reminder_days' && (!ctype_digit($value) || (int)$value < 0 || (int)$value > 180)) {
        $refuse("Rent-end reminder days must be a whole number between 0 and 180.");
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
    if ($key === 'room_preview_mode' && !in_array($value, ['images', 'floor_plan'], true)) {
        $refuse("Room preview mode must be images or floor_plan.");
    }
    if ($key === 'max_rent_ahead_months' && (!ctype_digit($value) || (int)$value < 1 || (int)$value > MAX_RENT_AHEAD_MONTHS_CEILING)) {
        $refuse("Maximum months ahead must be a whole number between 1 and " . MAX_RENT_AHEAD_MONTHS_CEILING . ".");
    }
    if ($key === 'min_lease_duration' && (!ctype_digit($value) || (int)$value < 1 || (int)$value > 24)) {
        $refuse("Minimum rent duration must be a whole number between 1 and 24 months.");
    }
    if ($key === 'max_occupants_per_unit' && (!ctype_digit($value) || (int)$value < 1 || (int)$value > 20)) {
        $refuse("Maximum occupants per unit must be a whole number between 1 and 20.");
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
    if ($key === 'glass_overlay_opacity' && (!ctype_digit($value) || (int)$value > 95)) {
        $refuse("The Glass overlay must be a whole number from 0 to 95 percent.", ["glassOverlayOpacity" => "Enter 0 to 95."]);
    }
    if ($key === 'glass_blur' && (!ctype_digit($value) || (int)$value > 20)) {
        $refuse("The Glass background blur must be a whole number from 0 to 20 pixels.", ["glassBlur" => "Enter 0 to 20."]);
    }
    if ($key === 'glass_tint') {
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $value)) {
            $refuse("The Glass tint must be a colour like #0f172a.", ["glassTint" => "Use a #rrggbb colour."]);
        }
        $value = strtolower($value);
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
}
$stmt->close();
$conn->commit();

// The photo it replaced stays in the recent list; switching can push an old
// one past the last GLASS_BG_KEEP. Pruned only after the commit, so a refused
// save never leaves the setting pointing at a deleted file.
if (in_array('glass_bg_image', $changed, true)) {
    prune_glass_bg_files(current_glass_bg($conn));
}

// The audit entry names what actually changed; it used to say "Updated multiple configuration keys" every time.
if ($changed) {
    log_activity($conn, $admin_id, 'system', 'Updated System Settings', "Changed " . count($changed) . " setting(s): " . implode(', ', $changed));
}

echo json_encode(["success" => true, "message" => "Settings updated successfully", "changed" => count($changed)]);
$conn->close();
?>
