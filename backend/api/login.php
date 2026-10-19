<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once "../config.php";

// Moves a guest chat thread into `messages` for $userId. The guest's messages
// become the user's, the admin's replies stay the admin's, and reply links,
// timestamps, read flags and attachments carry over. All or nothing; a failure
// leaves the thread as a guest thread and never blocks the sign-in.
function adopt_guest_chat($conn, $userId, $token) {
    $conn->begin_transaction();
    try {
        $find = $conn->prepare("SELECT id FROM inquiries WHERE guest_token = ? AND thread_type = 'guest' LIMIT 1 FOR UPDATE");
        $find->bind_param('s', $token);
        $find->execute();
        $thread = $find->get_result()->fetch_assoc();
        $find->close();
        $rows = [];
        if ($thread) {
            $load = $conn->prepare('SELECT id, sender_role, sender_id, message, attachment_path, reply_to_id, is_read, created_at FROM guest_messages WHERE inquiry_id = ? ORDER BY id');
            $load->bind_param('i', $thread['id']);
            $load->execute();
            $rows = $load->get_result()->fetch_all(MYSQLI_ASSOC);
            $load->close();
        }
        $fallback = $conn->query("SELECT id FROM users WHERE role = 'admin' AND is_archived = 0 ORDER BY id LIMIT 1")->fetch_assoc();
        if (!$thread || !$rows || !$fallback) { $conn->rollback(); return; }

        // The admin who answered owns the thread; guest messages go to them.
        $threadAdmin = (int)$fallback['id'];
        foreach ($rows as $r) if ($r['sender_role'] === 'admin' && $r['sender_id']) { $threadAdmin = (int)$r['sender_id']; break; }

        $insert = $conn->prepare('INSERT INTO messages (sender_id, receiver_id, message, created_at, is_read, attachment_path, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $newIds = [];
        foreach ($rows as $r) {
            $fromGuest = $r['sender_role'] === 'guest';
            $sender = $fromGuest ? $userId : ((int)$r['sender_id'] ?: $threadAdmin);
            $receiver = $fromGuest ? $threadAdmin : $userId;
            $reply = $r['reply_to_id'] ? ($newIds[(int)$r['reply_to_id']] ?? null) : null;
            $read = (int)$r['is_read'];
            $insert->bind_param('iissisi', $sender, $receiver, $r['message'], $r['created_at'], $read, $r['attachment_path'], $reply);
            if (!$insert->execute()) throw new Exception('message copy failed: ' . $insert->error);
            $newIds[(int)$r['id']] = $insert->insert_id;
        }
        $insert->close();

        $done = $conn->prepare("UPDATE inquiries SET user_id = ?, thread_type = 'registered', guest_token = NULL WHERE id = ?");
        $done->bind_param('ii', $userId, $thread['id']);
        $done->execute();
        $done->close();
        $drop = $conn->prepare('DELETE FROM guest_messages WHERE inquiry_id = ?');
        $drop->bind_param('i', $thread['id']);
        $drop->execute();
        $drop->close();
        $conn->commit();
        log_activity($conn, $userId, 'inquiry', 'Guest Chat Linked To Account', 'Inquiry ID: ' . $thread['id'] . ', messages: ' . count($rows), $userId);
    } catch (Throwable $e) {
        $conn->rollback();
        error_log('adopt_guest_chat: ' . $e->getMessage());
    }
}

$input = json_decode(file_get_contents("php://input"), true);

if (!$input) {
    echo json_encode(["message" => "No data received", "valid" => false]);
    exit;
}

$email = trim($input["email_address"] ?? '');
$password = $input["password"] ?? '';

if (empty($email) || empty($password)) {
    echo json_encode(["message" => "Email and password are required.", "valid" => false]);
    exit;
}

// ── Rate limiting (A-5 / A-9): per IP and per account, see config.php ──
// login_attempts lives in SetupDB.sql; it used to be created here on every request.
$ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

$throttled = login_throttle_message($conn, $ip, $email);
if ($throttled) {
    http_response_code(429);
    echo json_encode(["message" => $throttled, "valid" => false]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT id, email_address, first_name, middle_name, last_name, suffix, contact_no, gender, password, role, is_archived FROM users WHERE email_address = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

// The password is checked before anything about the account is revealed. The
// "archived" message used to be returned first, which told anyone probing an
// email address that the account existed, without knowing its password.
if (!$user || !password_verify($password, $user["password"])) {
    record_login_failure($conn, $ip, $email);
    // login_attempts is cleared on success, so it is not an audit trail. The
    // address is masked; the password is never logged.
    $at = strpos($email, '@');
    $masked = $at !== false ? substr($email, 0, min(2, $at)) . '***' . substr($email, $at) : '***';
    log_activity($conn, null, 'auth', 'Failed Sign-in', "Failed sign-in for $masked from $ip", 0);
    echo json_encode(["message" => "Invalid email or password", "valid" => false]);
    $conn->close();
    exit;
}

if ((int)$user["is_archived"] === 1) {
    echo json_encode(["message" => "This account has been archived and cannot log in.", "valid" => false]);
    $conn->close();
    exit;
}

clear_login_failures($conn, $email);

$userData = [
    "id" => (int)$user["id"],
    "first_name" => $user["first_name"],
    "middle_name" => $user["middle_name"],
    "last_name" => $user["last_name"],
    "suffix" => $user["suffix"],
    "contact_no" => $user["contact_no"],
    "gender" => $user["gender"],
    "email_address" => $user["email_address"],
    "role" => $user["role"]
];

// The session token — not the X-User-Id / X-Admin-Id headers — is the only
// proof of identity every endpoint trusts (see get_authenticated_user()).
$sessionToken = create_session($conn, (int)$user["id"], $user["role"]);

// A visitor who chatted as a guest and then signed in keeps that conversation:
// it moves into the account's normal chat with the admin. Matching is by the
// guest token only: inquiry emails are unverified, so an email match could hand
// someone else's thread to the account.
$guestToken = trim((string)($input["guest_token"] ?? ''));
if ($user["role"] !== 'admin' && strlen($guestToken) === 64 && ctype_xdigit($guestToken)) {
    adopt_guest_chat($conn, (int)$user["id"], $guestToken);
}

// Every sign-in is recorded against the account that signed in — explicitly, since
// the request may still carry an older session token for someone else.
log_activity($conn, (int)$user["id"], 'auth',
    $user["role"] === 'admin' ? 'Admin Signed In' : 'Tenant Signed In',
    ($user["role"] === 'admin' ? 'Admin' : 'Tenant') . " {$user['email_address']} signed in from $ip",
    (int)$user["id"]);

echo json_encode([
    "message" => "Login successful",
    "email" => $user["email_address"],
    "user" => $userData,
    "valid" => true,
    "role" => $user["role"],
    "sessionToken" => $sessionToken
]);

$conn->close();
?>
