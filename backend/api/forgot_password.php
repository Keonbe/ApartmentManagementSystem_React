<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once "../config.php";
require_once __DIR__ . '/services/password_reset_schema.php';
require_once __DIR__ . '/services/frontend_origin.php';

// DDL is intentionally performed before token processing (and before any
// transaction). CREATE IF NOT EXISTS alone does not repair older installations.
try {
    ensure_password_resets_schema($conn);
} catch (Throwable $e) {
    error_log('[AMS] forgot_password.php schema setup: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Server error. Please try again."]);
    $conn->close();
    exit;
}

// Ensure the request is POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
    exit;
}

$data = read_json_input();
$email = trim($data['email'] ?? '');
$lang = strtolower(trim($data['lang'] ?? 'en')) === 'fil' ? 'fil' : 'en';

if (empty($email)) {
    echo json_encode(["success" => false, "message" => "Email is required"]);
    exit;
}

// 0. Throttle before looking the email up, so the limit behaves the same for
// registered and unregistered addresses.
$ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
$throttled = password_reset_throttle_message($conn, $ip, $email);
if ($throttled) {
    http_response_code(429);
    echo json_encode(["success" => false, "message" => $throttled]);
    $conn->close();
    exit;
}
record_password_reset_request($conn, $ip, $email);
$stmt = null;

// 1. Check if email exists
$stmt = $conn->prepare("SELECT id FROM users WHERE email_address = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$res = $stmt->get_result();
$user = $res->fetch_assoc();
$stmt->close();

if (!$user) {
    // Security: Do not reveal that the email does not exist.
    // Pretend we sent an email.
    echo json_encode([
        "success" => true,
        "message" => "If an account with that email exists, a password reset link has been sent."
    ]);
    $conn->close();
    exit;
}

// 2. Generate secure token
$token = bin2hex(random_bytes(32));
$token_hash = hash('sha256', $token);
// Expiry is computed by the database, the same clock reset_password.php checks it
// against. PHP's timezone (Europe/Berlin on a default XAMPP) differs from
// MySQL's, which made every link expire before it could be used.

// 3. Delete any existing tokens for this email to prevent spam/abuse
$stmt = $conn->prepare("UPDATE password_resets SET used=1 WHERE email = ? AND used=0");
$stmt->bind_param("s", $email);
$stmt->execute();
$stmt->close();

// 4. Store the new token hash
$stmt = $conn->prepare("INSERT INTO password_resets (email, token_hash, expires_at, used) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), 0)");
$stmt->bind_param("ss", $email, $token_hash);
if ($stmt->execute()) {
    
    require_once __DIR__ . '/services/send_email.php';
    $baseUrl = password_reset_frontend_origin($data['frontend_url'] ?? null, $_SERVER);
    $resetLink = rtrim($baseUrl, '/') . '/reset-password?token=' . rawurlencode($token);
    $subject = $lang === 'fil' ? 'I-reset ang iyong AMS password' : 'Reset your AMS password';
    $title = $lang === 'fil' ? 'I-reset ang Password' : 'Reset your password';
    $intro = $lang === 'fil' ? 'May natanggap kaming kahilingan na i-reset ang password ng iyong AMS account.' : 'We received a request to reset the password for your AMS account.';
    $button = $lang === 'fil' ? 'Gumawa ng Bagong Password' : 'Create a New Password';
    $expiry = $lang === 'fil' ? 'Mag-e-expire ang link na ito sa loob ng 30 minuto. Kung hindi ikaw ang humiling, maaari mong balewalain ang email na ito.' : 'This link expires in 30 minutes. If you did not request it, you can safely ignore this email.';
    $html = '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden"><div style="background:#3b4276;padding:26px;text-align:center;color:white;font-size:24px;font-weight:bold">AMS</div><div style="padding:32px"><h1 style="font-size:22px">'.htmlspecialchars($title,ENT_QUOTES,'UTF-8').'</h1><p>'.htmlspecialchars($intro,ENT_QUOTES,'UTF-8').'</p><p style="text-align:center;margin:28px"><a href="'.htmlspecialchars($resetLink,ENT_QUOTES,'UTF-8').'" style="background:#6366f1;color:white;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:bold">'.htmlspecialchars($button,ENT_QUOTES,'UTF-8').'</a></p><p style="font-size:13px;color:#64748b">'.htmlspecialchars($expiry,ENT_QUOTES,'UTF-8').'</p></div></div></body></html>';
    try {
        $mailSent = send_email($conn, $email, $subject, $html, 'password_reset', (int)$user['id']);
        if (!$mailSent) {
            error_log('[AMS] forgot_password.php: send_email returned false for recipient ' . $email . ' (check notification_log for SMTP/log-driver details).');
        }
    } catch (Throwable $e) {
        // Email delivery must never turn a persisted reset request into HTTP 500.
        error_log('[AMS] forgot_password.php mail delivery: ' . $e->getMessage());
    }
    echo json_encode(["success" => true, "message" => $lang === 'fil' ? "Kung may account na gumagamit ng email na ito, nagpadala kami ng link para i-reset ang password." : "If an account with that email exists, a password reset link has been sent."]);
} else {
    // Keep account-existence responses generic even if persistence or delivery
    // fails; the detailed failure remains in server-side notification logging.
    error_log('Password reset token persistence failed for a requested account.');
    echo json_encode(["success" => true, "message" => $lang === 'fil' ? "Kung may account na gumagamit ng email na ito, nagpadala kami ng link para i-reset ang password." : "If an account with that email exists, a password reset link has been sent."]);
}

$stmt?->close();
$conn->close();
?>
