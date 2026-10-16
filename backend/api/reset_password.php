<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once "../config.php";
require_once __DIR__ . '/services/password_reset_schema.php';

try {
    // Repair legacy schema before token lookup, outside any active transaction.
    ensure_password_resets_schema($conn);
} catch (Throwable $e) {
    error_log('[AMS] reset_password.php schema setup: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Server error. Please try again."]);
    $conn->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$token = trim($data['token'] ?? '');
$new_password = $data['new_password'] ?? '';
$confirm_password = $data['confirm_password'] ?? '';

if (empty($token) || empty($new_password) || $confirm_password === '') {
    echo json_encode(["success" => false, "message" => "Token, new password, and confirmation are required"]);
    exit;
}
if (!hash_equals((string)$new_password, (string)$confirm_password)) {
    http_response_code(422); echo json_encode(["success"=>false,"message"=>"Passwords do not match."]); exit;
}

if ($pw_error = password_policy_error($new_password)) {
    echo json_encode(["success" => false, "message" => $pw_error]);
    exit;
}

// 1. Verify token
$token_hash = hash('sha256', $token);
$stmt = $conn->prepare("SELECT id, email FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1");
$stmt->bind_param("s", $token_hash);
$stmt->execute();
$reset = $stmt->get_result()->fetch_assoc();
$valid = (bool)$reset;
$stmt->close();

if (!$valid) {
    echo json_encode(["success" => false, "message" => "Invalid or expired reset token"]);
    $conn->close();
    exit;
}

$email = $reset['email'];
$stmt = $conn->prepare("SELECT id, password FROM users WHERE email_address = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$user) {
    echo json_encode(["success" => false, "message" => "Failed to update password or user not found"]);
    $conn->close();
    exit;
}
$user_id = (int)$user['id'];

// Password policy: the new password must differ from the current one. The
// token stays valid, so the user can simply choose another password.
if (password_verify($new_password, $user['password'])) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "New password must be different from the current password."]);
    $conn->close();
    exit;
}

// 2. Update the password, then burn every reset token for this address
$hashed_password = password_hash($new_password, PASSWORD_DEFAULT);
$stmt = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
$stmt->bind_param("si", $hashed_password, $user_id);
$stmt->execute();
$stmt->close();

$stmt = $conn->prepare("UPDATE password_resets SET used=1 WHERE email = ? AND used=0");
$stmt->bind_param("s", $email);
$stmt->execute();
$stmt->close();

// 3. A reset is usually a response to a lost or stolen password, so every
// existing session — including one an attacker may hold — ends now.
$ended = revoke_user_sessions($conn, $user_id);
clear_login_failures($conn, $email);
log_activity($conn, $user_id, 'auth', 'Reset Password', "Password reset via emailed token; $ended session(s) signed out");

echo json_encode(["success" => true, "message" => "Password successfully reset"]);
$conn->close();
?>
