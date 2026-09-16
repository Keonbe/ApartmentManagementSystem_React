<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once "../config.php";

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

$stmt = $conn->prepare("SELECT id, email_address, first_name, middle_name, last_name, suffix, password, role, is_archived FROM users WHERE email_address = ?");
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
    "email_address" => $user["email_address"],
    "role" => $user["role"]
];

// The session token — not the X-User-Id / X-Admin-Id headers — is the only
// proof of identity every endpoint trusts (see get_authenticated_user()).
$sessionToken = create_session($conn, (int)$user["id"], $user["role"]);

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
