<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
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

// Values the log must never contain in clear text.
$secret_keys = ['paymongo_secret_key', 'paymongo_webhook_secret', 'semaphore_api_key', 'smtp_pass', 'smtp_user'];

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
        echo json_encode(["success" => false, "message" => "Lease-end reminder days must be a whole number between 0 and 180."]);
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
