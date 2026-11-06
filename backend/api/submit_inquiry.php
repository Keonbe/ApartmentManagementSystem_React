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
$contact_no = trim($input['contact_no'] ?? $input['contact_number'] ?? '');
$room_name  = trim($input['room_name'] ?? $input['unit_of_interest'] ?? '');
$message    = trim($input['message'] ?? '');
$source     = trim($input['source'] ?? 'web');
// Kept as posted: (int) turned "abc" into 0 and "1e3" into 1000 before the check.
$occupants_raw = $input['occupants'] ?? null;
$move_in    = trim((string)($input['preferred_move_in'] ?? $input['move_in_date'] ?? ''));

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
// Keyed by the form's field names, so InquiryForm marks each field
// (validation_fail: 422 with errors{field: message}).
$errors = [];
if ($full_name === '')                                  $errors['full_name'] = "Full name is required.";
elseif (mb_strlen($full_name) > 150)                    $errors['full_name'] = "Full name is too long.";
if ($email === '')                                      $errors['email'] = "Email address is required.";
elseif (!filter_var($email, FILTER_VALIDATE_EMAIL))     $errors['email'] = "Please enter a valid email address.";
elseif (mb_strlen($email) > 150)                        $errors['email'] = "Email address is too long.";
if ($contact_no === '')                                 $errors['contact_no'] = "Contact number is required.";
elseif (($contact_no = normalize_ph_mobile($contact_no) ?? '') === '') $errors['contact_no'] = "Contact number must be a Philippine mobile number (+63 9XX XXX XXXX).";
if (mb_strlen($room_name) > 50)                         $errors['room_name'] = "Invalid unit selection.";

// Occupants: optional; a whole number from 1 to Settings → Rental → Maximum
// Occupants per Unit (the same cap as applications).
$occupants = null;
if ($occupants_raw !== null && $occupants_raw !== '') {
    $max_occ = max_occupants_per_unit($conn);
    if (!is_scalar($occupants_raw) || is_bool($occupants_raw) || !ctype_digit((string)$occupants_raw) || (int)$occupants_raw < 1 || (int)$occupants_raw > $max_occ) {
        $errors['occupants'] = "Number of occupants must be a whole number from 1 to $max_occ.";
    } else {
        $occupants = (int)$occupants_raw;
    }
}

// Preferred move-in: optional; from today to inquiry_move_in_latest()
// (Settings → Rental, default 6 months). A typed 2030 used to be saved.
if ($move_in !== '') {
    $latest = inquiry_move_in_latest($conn);
    if (real_date($move_in) === null) {
        $errors['preferred_move_in'] = "Enter the move-in date as a valid date.";
    } elseif ($move_in < date('Y-m-d')) {
        $errors['preferred_move_in'] = "The move-in date cannot be in the past.";
    } elseif ($move_in > $latest['date']) {
        $errors['preferred_move_in'] = "The move-in date can be at most {$latest['months']} months from today: the latest is " . date('F j, Y', strtotime($latest['date'])) . ".";
    }
}

if (!empty($errors)) validation_fail($errors);

$room_name = $room_name !== '' ? $room_name : null;
$message = $message !== '' ? $message : 'Inquired about ' . ($room_name ?? 'available apartment units');
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

// A signed-out inquirer gets a guest chat thread with its own random bearer
// token; registered inquiries keep the account-linked behaviour.
//
// The email and phone typed here are unverified. When they match an existing
// guest thread, the sender may not be its owner, so this inquiry does NOT get
// that thread's token and is not added to its conversation (that used to hand
// anyone the conversation of whoever's email or phone they typed). It is kept
// as a separate inquiry pointing at the thread (matched_thread_id), and a
// one-time link is emailed to the address stored on the thread.
$is_guest = $user_id === null && !$is_admin;
$guest_token = null;
$matched_thread_id = null;
$conn->begin_transaction();
try {
    if ($is_guest) {
        $findGuest = $conn->prepare("SELECT id FROM inquiries WHERE thread_type = 'guest' AND ((guest_email = ? AND guest_email <> '') OR (guest_phone = ? AND guest_phone <> '')) ORDER BY id ASC LIMIT 1");
        $findGuest->bind_param('ss', $email, $contact_no);
        $findGuest->execute();
        $existingGuest = $findGuest->get_result()->fetch_assoc();
        $findGuest->close();
        if ($existingGuest) $matched_thread_id = (int)$existingGuest['id'];
        else $guest_token = bin2hex(random_bytes(32));
    }
    $stmt = $conn->prepare("INSERT INTO inquiries (user_id, full_name, email, contact_no, room_name, occupants, preferred_move_in, message, source, ip_address, status, thread_type, guest_token, guest_name, guest_email, guest_phone, unit_of_interest, matched_thread_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, ?, ?, ?, ?, ?, ?)");
    $thread_type = $guest_token !== null ? 'guest' : 'registered';
    $guest_name = $guest_token !== null ? $full_name : null;
    $guest_email = $guest_token !== null ? $email : null;
    $guest_phone = $guest_token !== null ? $contact_no : null;
    $unit_of_interest = $guest_token !== null ? $room_name : null;
    $stmt->bind_param("issssissssssssssi", $user_id, $full_name, $email, $contact_no, $room_name, $occupants, $move_in, $message, $source, $ip, $thread_type, $guest_token, $guest_name, $guest_email, $guest_phone, $unit_of_interest, $matched_thread_id);
    $stmt->execute();
    $inquiry_id = $stmt->insert_id;
    $stmt->close();

    if ($guest_token !== null) {
        $initial = $conn->prepare("INSERT INTO guest_messages (inquiry_id, sender_role, message) VALUES (?, 'guest', ?)");
        $initial->bind_param('is', $inquiry_id, $message);
        $initial->execute();
        $initial->close();
    }
    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to submit inquiry."]);
    exit;
}

// ── Notify the admin ──
// notifications.user_id is NOT NULL with an FK to users, so a guest inquiry has
// no id of its own to attach. The queue row is addressed to the admin account;
// update_inquiry_status.php clears it once the inquiry is handled.
notify_admins_queue($conn, 'inquiry', $inquiry_id, "New Unit Inquiry",
    $full_name . " sent an inquiry" . ($room_name ? " about Unit $room_name" : "") . " (" . $contact_no . " / " . $email . ")."
    . ($matched_thread_id ? " Same email or phone as conversation #$matched_thread_id; sender not verified." : ""));

// The owner of the matched conversation gets a link to it (at the address
// stored on the thread). Sent after the commit; a mail problem is only logged.
if ($matched_thread_id) {
    guest_chat_email_link($conn, $matched_thread_id, 'resume');
}

log_activity($conn, $user_id, 'inquiry', $is_admin ? "Logged Inquiry" : "Submitted Inquiry",
    "Inquiry ID: $inquiry_id" . ($room_name ? ", Unit: $room_name" : "") . ", Source: $source", $is_admin ? null : ($user_id ?? 0));

echo json_encode([
    "success" => true,
    "message" => $matched_thread_id
        ? "You already have a conversation with us. We emailed a link to continue it to the address you used before."
        : "Inquiry submitted successfully. Our admin will contact you shortly.",
    "inquiry_id" => $inquiry_id,
    "thread_id" => $guest_token !== null ? $inquiry_id : null,
    "guest_token" => $guest_token,
    "existing_thread" => $matched_thread_id !== null,
]);

$conn->close();
?>
