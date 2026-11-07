<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once "../config.php";
require_once __DIR__ . '/services/login_otp_policy.php';

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

// A JSON array or object here would be a TypeError (HTTP 500) in trim() / password_verify().
if (!is_string($input["email_address"] ?? '') || !is_string($input["password"] ?? '')) {
    http_response_code(422);
    echo json_encode(["message" => "Email and password must be text.", "valid" => false]);
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

$stmt = $conn->prepare("SELECT id, email_address, first_name, middle_name, last_name, suffix, contact_no, gender, password, role, is_archived, email_verified_at FROM users WHERE email_address = ?");
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

// Skipped while email verification is off (Other Settings → Sign-in Codes).
if (empty($user['email_verified_at']) && email_verification_enabled($conn)) {
    echo json_encode(["message" => "Please verify your email address before signing in.", "valid" => false, "email_verification_required" => true]);
    $conn->close(); exit;
}

// A valid trusted-device cookie skips OTP; only its SHA-256 digest is persisted.
$deviceToken = (string)($_COOKIE['ams_trusted_device'] ?? '');
$isAdmin = ($user['role'] === 'admin');
$trusted = $isAdmin || ams_skips_device_otp($user['email_address']) || !login_needs_device_code($conn, (int)$user['id']); // Admins, non-production demo accounts and accounts with codes switched off skip device OTP.
if (!$isAdmin && preg_match('/^[a-f0-9]{64}$/i', $deviceToken)) {
    $hash = hash('sha256', $deviceToken);
    $device = $conn->prepare('SELECT id FROM trusted_devices WHERE user_id = ? AND device_token = ? LIMIT 1');
    $uid = (int)$user['id']; $device->bind_param('is', $uid, $hash); $device->execute();
    $trustedRow = $device->get_result()->fetch_assoc(); $device->close();
    if ($trustedRow) {
        $touch = $conn->prepare('UPDATE trusted_devices SET last_used_at = NOW(), ip_address = ?, user_agent = ? WHERE id = ?');
        $agent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 512); $did = (int)$trustedRow['id'];
        $touch->bind_param('ssi', $ip, $agent, $did); $touch->execute(); $touch->close(); $trusted = true;
    }
}
if (!$trusted) {
    $otpStmt = $conn->prepare("UPDATE users SET login_otp = LPAD(FLOOR(RAND() * 1000000), 6, '0'), login_otp_expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE), login_otp_attempts = 0 WHERE id = ?");
    $uid = (int)$user['id']; $otpStmt->bind_param('i', $uid); $otpStmt->execute(); $otpStmt->close();
    $loadOtp = $conn->prepare('SELECT login_otp FROM users WHERE id = ?'); $loadOtp->bind_param('i', $uid); $loadOtp->execute();
    $otp = (string)$loadOtp->get_result()->fetch_assoc()['login_otp']; $loadOtp->close();
    require_once __DIR__ . '/auth_email.php';
    $safeOtp = htmlspecialchars($otp, ENT_QUOTES, 'UTF-8');
    $otpHtml = '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b;padding:1px">'
        . '<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden">'
        . '<div style="background:#3b4276;padding:26px;text-align:center;color:#fff;font-size:24px;font-weight:bold">AMS</div>'
        . '<div style="padding:32px"><h1 style="font-size:22px;margin:0 0 18px">Login Verification Code</h1>'
        . '<p style="line-height:1.6;margin:0 0 20px">Use this code to verify your sign-in from a new device:</p>'
        . '<div style="background:#f1f5f9;border-radius:12px;padding:22px 16px;text-align:center;font-size:32px;line-height:1.2;font-weight:bold;letter-spacing:8px;color:#1e293b">' . $safeOtp . '</div>'
        . '<p style="font-size:13px;color:#64748b;line-height:1.6;margin:22px 0 0">This code expires in 15 minutes. If you did not try to sign in, please secure your account.</p>'
        . '</div></div></body></html>';
    $sent = send_auth_email($conn, $user['email_address'], 'Your AMS login verification code', $otpHtml);
    echo json_encode(['status' => 'device_verification_required', 'valid' => false, 'message' => $sent ? 'Enter the verification code sent to your email.' : 'Unable to send a verification code. Please try again later.']);
    $conn->close(); exit;
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
    "role" => $user["role"],
    // The account's first sign-in: Home says "Welcome" instead of "Welcome back".
    "first_login" => record_sign_in($conn, (int)$user["id"])
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
