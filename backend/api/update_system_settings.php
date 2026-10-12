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

$stmt = $conn->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?");
$changed = [];

foreach ($input as $key => $value) {
    if (!is_string($key) || !preg_match('/^[A-Za-z0-9_]{1,100}$/', $key)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Invalid setting key."]);
        exit;
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
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Parking slots must be a whole number between 1 and 500."]);
            exit;
        }
        if ((int)$value < $highest) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Slot #$highest is still assigned. Release it before reducing parking slots below $highest."]);
            exit;
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
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Each floor needs a rent above 0 and up to 1,000,000."]);
            exit;
        }
        $value = json_encode($clean, JSON_FORCE_OBJECT);
    }
    if ($key === 'min_household_age' && (!ctype_digit($value) || (int)$value > 17)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "The minimum household age must be a whole number from 0 to 17."]);
        exit;
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
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Age categories need a name, an age range between 0 and 17 that does not overlap another category, and rules under 500 characters."]);
            exit;
        }
        $value = json_encode($clean, JSON_UNESCAPED_UNICODE);
    }
    if ($key === 'parking_billing_mode' && !in_array($value, ['manual', 'auto'], true)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Parking billing mode must be manual or auto."]);
        exit;
    }
    if ($key === 'parking_monthly_fee' && (!is_numeric($value) || (float)$value <= 0 || (float)$value > 100000)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Parking monthly fee must be a positive amount."]);
        exit;
    }
    // The UI's slider goes 1-168 hours (one week); the endpoint used to store
    // whatever was posted, including 0 or non-numeric text, which then fell
    // back to 24 with no indication anything was wrong.
    if ($key === 'visitor_overstay_hours' && (!ctype_digit($value) || (int)$value < 1 || (int)$value > 168)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Visitor overstay threshold must be a whole number between 1 and 168 hours."]);
        exit;
    }
    if ($key === 'lease_end_reminder_days' && (!ctype_digit($value) || (int)$value < 0 || (int)$value > 180)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Rent-end reminder days must be a whole number between 0 and 180."]);
        exit;
    }

    if ($key === 'room_preview_mode' && !in_array($value, ['images', 'floor_plan'], true)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Room preview mode must be images or floor_plan."]);
        exit;
    }
    if ($key === 'max_rent_ahead_months' && (!ctype_digit($value) || (int)$value < 1 || (int)$value > MAX_RENT_AHEAD_MONTHS_CEILING)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Maximum months ahead must be a whole number between 1 and " . MAX_RENT_AHEAD_MONTHS_CEILING . "."]);
        exit;
    }
    if ($key === 'max_occupants_per_unit' && (!ctype_digit($value) || (int)$value < 1 || (int)$value > 20)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Maximum occupants per unit must be a whole number between 1 and 20."]);
        exit;
    }

    if (array_key_exists($key, $existing) && $existing[$key] === $value) continue;

    $stmt->bind_param("sss", $key, $value, $value);
    $stmt->execute();
    $changed[] = in_array($key, $secret_keys, true) ? "$key (value hidden)" : $key;
}
$stmt->close();

// The audit entry names what actually changed; it used to say "Updated multiple configuration keys" every time.
if ($changed) {
    log_activity($conn, $admin_id, 'system', 'Updated System Settings', "Changed " . count($changed) . " setting(s): " . implode(', ', $changed));
}

echo json_encode(["success" => true, "message" => "Settings updated successfully", "changed" => count($changed)]);
$conn->close();
?>
