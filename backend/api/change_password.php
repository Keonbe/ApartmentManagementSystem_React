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

// The account whose password changes is the caller's own session. This endpoint
// used to take an email_address from the request body with no session at all,
// so anyone could guess any account's current password here — outside
// login.php's rate limiter — and then replace it.
$auth = require_user($conn);

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!is_array($input)) fail(400, "No data received");

$currentPassword = (string)($input["current_password"] ?? '');
$newPassword = (string)($input["new_password"] ?? '');
$confirmPassword = (string)($input["confirm_password"] ?? '');

if ($currentPassword === '') fail(422, "Current password is required.");
if (strlen($newPassword) < PASSWORD_MIN_LENGTH) fail(422, "New password must be at least " . PASSWORD_MIN_LENGTH . " characters.");
if ($newPassword !== $confirmPassword) fail(422, "Confirmed password does not match.");
if ($newPassword === $currentPassword) fail(422, "New password must be different from the current password.");

$stmt = $conn->prepare("SELECT email_address, password FROM users WHERE id = ?");
$stmt->bind_param("i", $auth['id']);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$user) fail(404, "User account not found.");

$ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
$throttled = login_throttle_message($conn, $ip, $user['email_address']);
if ($throttled) fail(429, $throttled);

if (!password_verify($currentPassword, $user["password"])) {
    record_login_failure($conn, $ip, $user['email_address']);
    fail(422, "Incorrect current password.");
}

$hashed_password = password_hash($newPassword, PASSWORD_DEFAULT);
$stmt = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
$stmt->bind_param("si", $hashed_password, $auth['id']);
if (!$stmt->execute()) fail(500, "Failed to update password.");
$stmt->close();

clear_login_failures($conn, $user['email_address']);

// Anyone else signed in with the old password is signed out; this device stays signed in.
$ended = revoke_user_sessions($conn, $auth['id'], get_bearer_token());
log_activity($conn, $auth['id'], 'auth', 'Changed Password', "{$user['email_address']} changed their password; $ended other session(s) signed out");

echo json_encode(["success" => true, "message" => "Password updated successfully", "sessions_ended" => $ended]);
$conn->close();
?>
