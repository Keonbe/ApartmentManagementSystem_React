<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

// Auto-create tables if not exists (same pattern as get_utility_readings.php)
$conn->query("CREATE TABLE IF NOT EXISTS `inquiries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `contact_no` varchar(30) NOT NULL,
  `room_name` varchar(50) DEFAULT NULL,
  `occupants` int(11) DEFAULT NULL,
  `preferred_move_in` date DEFAULT NULL,
  `message` text DEFAULT NULL,
  `source` varchar(20) NOT NULL DEFAULT 'web',
  `status` varchar(20) NOT NULL DEFAULT 'New',
  `viewing_date` datetime DEFAULT NULL,
  `admin_notes` text DEFAULT NULL,
  `closed_reason` varchar(255) DEFAULT NULL,
  `handled_by` int(11) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_inquiry_status` (`status`),
  KEY `idx_inquiry_room` (`room_name`),
  KEY `fk_inquiry_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true) ?? [];

// Honeypot: a real browser leaves this hidden field empty. Bots fill it in.
// Respond with success so the bot does not learn it was caught.
if (!empty(trim($input['website'] ?? ''))) {
    echo json_encode(["success" => true, "message" => "Inquiry received."]);
    exit;
}

$full_name  = trim($input['full_name'] ?? '');
$email      = trim($input['email'] ?? '');
$contact_no = trim($input['contact_no'] ?? '');
$room_name  = trim($input['room_name'] ?? '');
$message    = trim($input['message'] ?? '');
$source     = trim($input['source'] ?? 'web');
$occupants  = isset($input['occupants']) && $input['occupants'] !== '' ? (int)$input['occupants'] : null;
$move_in    = trim($input['preferred_move_in'] ?? '');

// Optional — an inquiry is linked to an account only when the submitter has a
// real session; guests stay anonymous. (This used to trust X-User-Id, so a guest
// could attach an inquiry to any account.)
$auth = get_authenticated_user($conn);
$user_id = $auth ? $auth['id'] : null;

// An admin logging a walk-in / phone inquiry may name the source; anyone else
// is 'web' regardless of what they post.
$is_admin = $auth && $auth['role'] === 'admin';
if (!$is_admin || !in_array($source, ['web', 'walk-in', 'phone'], true)) {
    $source = 'web';
}
// A walk-in logged by an admin is not the admin's own inquiry.
if ($is_admin) {
    $user_id = null;
}

// ── Validation ──
$errors = [];
if ($full_name === '')                                  $errors[] = "Full name is required.";
if (mb_strlen($full_name) > 150)                        $errors[] = "Full name is too long.";
if ($email === '')                                      $errors[] = "Email address is required.";
elseif (!filter_var($email, FILTER_VALIDATE_EMAIL))     $errors[] = "Please enter a valid email address.";
elseif (mb_strlen($email) > 150)                        $errors[] = "Email address is too long.";
if ($contact_no === '')                                 $errors[] = "Contact number is required.";
elseif (($contact_no = normalize_ph_mobile($contact_no) ?? '') === '') $errors[] = "Contact number must be a Philippine mobile number (+63 9XX XXX XXXX).";
if (mb_strlen($room_name) > 50)                         $errors[] = "Invalid unit selection.";
if ($occupants !== null && ($occupants < 1 || $occupants > 20)) $errors[] = "Occupants must be between 1 and 20.";
if ($move_in !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $move_in)) $errors[] = "Invalid preferred move-in date.";

if (!empty($errors)) {
    echo json_encode(["success" => false, "message" => implode(' ', $errors)]);
    exit;
}

$room_name = $room_name !== '' ? $room_name : null;
$move_in   = $move_in !== '' ? $move_in : null;
$ip        = $_SERVER['REMOTE_ADDR'] ?? null;

// ── Rate limit: max 3 inquiries per email or IP in 24 hours ──
// Mirrors the 24-hour anti-spam guard in extend_lease.php. Skipped for admins
// logging walk-ins on behalf of visitors.
if (!$is_admin) {
    $rl = $conn->prepare("SELECT COUNT(*) AS c FROM inquiries WHERE (email = ? OR (ip_address IS NOT NULL AND ip_address = ?)) AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)");
    $rl->bind_param("ss", $email, $ip);
    $rl->execute();
    $count = (int)($rl->get_result()->fetch_assoc()['c'] ?? 0);
    $rl->close();

    if ($count >= 3) {
        http_response_code(429);
        echo json_encode(["success" => false, "message" => "You have already sent several inquiries today. Our admin will get back to you shortly."]);
        exit;
    }
}

// ── Insert ──
$stmt = $conn->prepare("INSERT INTO inquiries (user_id, full_name, email, contact_no, room_name, occupants, preferred_move_in, message, source, ip_address, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New')");
$stmt->bind_param("issssissss", $user_id, $full_name, $email, $contact_no, $room_name, $occupants, $move_in, $message, $source, $ip);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to submit inquiry."]);
    $stmt->close();
    $conn->close();
    exit;
}
$inquiry_id = $stmt->insert_id;
$stmt->close();

// ── Notify the admin ──
// notifications.user_id is NOT NULL with an FK to users, so a guest inquiry has
// no id of its own to attach. The queue row is addressed to the admin account;
// update_inquiry_status.php clears it once the inquiry is handled.
notify_admins_queue($conn, 'inquiry', $inquiry_id, "New Unit Inquiry",
    $full_name . " sent an inquiry" . ($room_name ? " about Unit $room_name" : "") . " (" . $contact_no . " / " . $email . ").");

log_activity($conn, $user_id, 'inquiry', $is_admin ? "Logged Inquiry" : "Submitted Inquiry",
    "Inquiry ID: $inquiry_id" . ($room_name ? ", Unit: $room_name" : "") . ", Source: $source", $is_admin ? null : ($user_id ?? 0));

echo json_encode([
    "success" => true,
    "message" => "Inquiry submitted successfully. Our admin will contact you shortly.",
    "inquiry_id" => $inquiry_id
]);

$conn->close();
?>
