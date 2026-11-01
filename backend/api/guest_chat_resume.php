<?php
// Guest inquiry chat: one-time "continue your conversation" links.
//   {action: 'request', email} — emails a link when a guest conversation uses
//     that email. The answer is the same whether or not one exists, so the form
//     cannot be used to find out who has been talking to the apartment.
//   {action: 'redeem', code} — a code from such an email, usable once and for
//     GUEST_CHAT_LINK_DAYS days, is exchanged for the conversation's token.
// The long-lived token itself is never put in a URL or an email.
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!is_array($input)) $input = [];
$action = (string)($input['action'] ?? '');
if ($error = v_enum($action, 'Action', ['request', 'redeem'])) validation_fail(['action' => $error]);

if ($action === 'request') {
    $email = trim((string)($input['email'] ?? ''));
    if ($email === '' || mb_strlen($email) > 150 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        validation_fail(['email' => 'Enter the email address you used for your inquiry.']);
    }
    // Limits a flood of link emails to one inbox, and guessing from one address.
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $email_key = strtolower($email);
    if (rate_limit_exceeded($conn, 'guest_chat_link_email', $email_key, 3, 60)
        || rate_limit_exceeded($conn, 'guest_chat_link_ip', $ip, 10, 60)) {
        http_response_code(429);
        echo json_encode(["success" => false, "message" => "Too many requests. Please try again in an hour."]);
        exit;
    }
    rate_limit_record($conn, 'guest_chat_link_email', $email_key);
    rate_limit_record($conn, 'guest_chat_link_ip', $ip);

    $find = $conn->prepare("SELECT id FROM inquiries WHERE thread_type = 'guest' AND LOWER(guest_email) = LOWER(?) ORDER BY id ASC LIMIT 1");
    $find->bind_param("s", $email);
    $find->execute();
    $thread = $find->get_result()->fetch_assoc();
    $find->close();

    // The answer goes out before any email is sent, so a slow SMTP send
    // cannot reveal through timing that the email has a conversation.
    $body = json_encode(["success" => true, "message" => "If we have a conversation for this email, we sent you a link to continue it. Check your inbox."]);
    ignore_user_abort(true);
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Length: ' . strlen($body));
    header('Connection: close');
    echo $body;
    flush();
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();

    if ($thread) guest_chat_email_link($conn, (int)$thread['id'], 'resume');
    exit;
}

// redeem
$code = trim((string)($input['code'] ?? ''));
if (strlen($code) !== 64 || !ctype_xdigit($code)) {
    validation_fail(['code' => 'This link is not valid. Ask for a new one.']);
}
$hash = hash('sha256', $code);

$conn->begin_transaction();
try {
    // Locked so two tabs opening the same link cannot both use it.
    $q = $conn->prepare("SELECT l.id, l.inquiry_id, i.guest_token
                         FROM guest_chat_links l JOIN inquiries i ON i.id = l.inquiry_id AND i.thread_type = 'guest'
                         WHERE l.token_hash = ? AND l.used_at IS NULL AND l.expires_at > NOW() FOR UPDATE");
    $q->bind_param("s", $hash);
    $q->execute();
    $link = $q->get_result()->fetch_assoc();
    $q->close();
    if (!$link || !$link['guest_token']) {
        $conn->rollback();
        http_response_code(410);
        echo json_encode(["success" => false, "message" => "This link has expired or was already used. Ask for a new one."]);
        exit;
    }
    $use = $conn->prepare("UPDATE guest_chat_links SET used_at = NOW() WHERE id = ?");
    $use->bind_param("i", $link['id']);
    $use->execute();
    $use->close();
    // Opening the emailed link proves the guest can read the thread's inbox.
    $verify = $conn->prepare("UPDATE inquiries SET guest_verified_at = COALESCE(guest_verified_at, NOW()) WHERE id = ?");
    $verify->bind_param("i", $link['inquiry_id']);
    $verify->execute();
    $verify->close();
    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    server_error_response($e, 'Could not open the conversation.');
    exit;
}

log_activity($conn, null, 'inquiry', 'Guest Chat Link Used', "Inquiry ID: {$link['inquiry_id']}", 0);
echo json_encode(["success" => true, "guest_token" => $link['guest_token'], "thread_id" => (int)$link['inquiry_id']]);
$conn->close();
?>
