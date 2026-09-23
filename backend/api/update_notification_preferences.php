<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Saves the caller's own preferences. Two payload shapes are accepted:
//
//   { "preferences": { "<category>": true|false } }                    (in-app only)
//   { "preferences": { "<category>": { "in_app": …, "sms": …, "email": … } },
//     "sms_opt_out": false, "email_opt_out": false }
//
// The flat shape is what the notifications page still sends, so it has to keep
// working unchanged: any channel it omits is left exactly as it was, or a save
// from that page would quietly switch SMS back on for every category.
//
// Only the categories in NOTIFICATION_PREF_CATEGORIES can be changed; critical
// notices (overdue alerts, billing, decisions) are not preferences at all —
// those are governed by the global sms_opt_out / email_opt_out flags below.
$auth = require_user($conn);

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$prefs = $input['preferences'] ?? null;
$has_globals = array_key_exists('sms_opt_out', $input) || array_key_exists('email_opt_out', $input);

if ((!is_array($prefs) || empty($prefs)) && !$has_globals) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "No preferences provided."]);
    exit;
}
if ($prefs !== null && !is_array($prefs)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "No preferences provided."]);
    exit;
}
$prefs = is_array($prefs) ? $prefs : [];

$bad_value = function ($v) {
    return !is_bool($v) && !in_array($v, [0, 1, '0', '1'], true);
};

foreach ($prefs as $category => $value) {
    if (!isset(NOTIFICATION_PREF_CATEGORIES[$category])) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Unknown notification category: " . substr((string)$category, 0, 40)]);
        exit;
    }
    if (!is_array($value)) {
        if ($bad_value($value)) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Preference values must be true or false."]);
            exit;
        }
        continue;
    }
    foreach (['in_app', 'sms', 'email'] as $channel) {
        if (array_key_exists($channel, $value) && $bad_value($value[$channel])) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Preference values must be true or false."]);
            exit;
        }
    }
}

// Read the saved rows once, so an omitted channel can be written back as it is
// rather than as the column default.
$current = [];
$read = $conn->prepare("SELECT category, in_app_enabled, sms_enabled, email_enabled FROM notification_preferences WHERE user_id = ?");
$read->bind_param("i", $auth['id']);
$read->execute();
foreach ($read->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
    $current[$row['category']] = [
        'in_app' => (int)$row['in_app_enabled'],
        'sms'    => (int)$row['sms_enabled'],
        'email'  => (int)$row['email_enabled'],
    ];
}
$read->close();

$changed = [];
$stmt = $conn->prepare("INSERT INTO notification_preferences (user_id, category, in_app_enabled, sms_enabled, email_enabled)
                        VALUES (?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE in_app_enabled = VALUES(in_app_enabled),
                                                sms_enabled = VALUES(sms_enabled),
                                                email_enabled = VALUES(email_enabled)");
foreach ($prefs as $category => $value) {
    // No saved row means the user is opted in everywhere (1), which is the same
    // default get_notification_preferences.php reports.
    $saved = $current[$category] ?? ['in_app' => 1, 'sms' => 1, 'email' => 1];
    $flags = $saved;

    if (is_array($value)) {
        foreach (['in_app', 'sms', 'email'] as $channel) {
            if (array_key_exists($channel, $value)) $flags[$channel] = $value[$channel] ? 1 : 0;
        }
    } else {
        $flags['in_app'] = $value ? 1 : 0;
    }

    $stmt->bind_param("isiii", $auth['id'], $category, $flags['in_app'], $flags['sms'], $flags['email']);
    $stmt->execute();
    if ($stmt->affected_rows > 0) {
        $parts = [];
        foreach (['in_app' => 'in-app', 'sms' => 'SMS', 'email' => 'email'] as $key => $label) {
            if (!isset($current[$category]) || $saved[$key] !== $flags[$key]) {
                $parts[] = $label . ($flags[$key] ? ' on' : ' off');
            }
        }
        $changed[] = $category . ($parts ? ' (' . implode(', ', $parts) . ')' : '');
    }
}
$stmt->close();

// The global kill switches live on users, not in the table above: most
// notification types belong to no category, so the per-category rows cannot
// stop them. These are checked first by user_channel_allowed(), and they are
// what makes the opt-out defensible for a paid, regulated channel.
if ($has_globals) {
    $sms_off   = !empty($input['sms_opt_out']) ? 1 : 0;
    $email_off = !empty($input['email_opt_out']) ? 1 : 0;
    // Turning SMS back on is a fresh consent; record when it was given.
    $u = $conn->prepare("UPDATE users
                         SET sms_opt_out = ?, email_opt_out = ?,
                             sms_consent_at = CASE WHEN ? = 0 AND sms_opt_out = 1 THEN NOW() ELSE sms_consent_at END
                         WHERE id = ?");
    $u->bind_param("iiii", $sms_off, $email_off, $sms_off, $auth['id']);
    $u->execute();
    if ($u->affected_rows > 0) {
        $changed[] = 'all SMS ' . ($sms_off ? 'off' : 'on') . ', all email ' . ($email_off ? 'off' : 'on');
    }
    $u->close();
}

if ($changed) {
    log_activity($conn, $auth['id'], 'user', 'Updated Notification Preferences', implode(', ', $changed));
}

echo json_encode(["success" => true, "message" => "Notification preferences saved.", "changed" => count($changed)]);
$conn->close();
?>
