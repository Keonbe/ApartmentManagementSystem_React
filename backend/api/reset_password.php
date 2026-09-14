<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$email = trim($data['email'] ?? '');
$token = trim($data['token'] ?? '');
$new_password = $data['new_password'] ?? '';

if (empty($email) || empty($token) || empty($new_password)) {
    echo json_encode(["success" => false, "message" => "Email, token, and new password are required"]);
    exit;
}

if (strlen($new_password) < PASSWORD_MIN_LENGTH) {
    echo json_encode(["success" => false, "message" => "Password must be at least " . PASSWORD_MIN_LENGTH . " characters long"]);
    exit;
}

// 1. Verify token
$token_hash = hash('sha256', $token);
$stmt = $conn->prepare("SELECT id FROM password_resets WHERE email = ? AND token_hash = ? AND expires_at > NOW()");
$stmt->bind_param("ss", $email, $token_hash);
$stmt->execute();
$valid = $stmt->get_result()->num_rows > 0;
$stmt->close();

if (!$valid) {
    echo json_encode(["success" => false, "message" => "Invalid or expired reset token"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT id FROM users WHERE email_address = ?");
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

// 2. Update the password, then burn every reset token for this address
$hashed_password = password_hash($new_password, PASSWORD_BCRYPT);
$stmt = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
$stmt->bind_param("si", $hashed_password, $user_id);
$stmt->execute();
$stmt->close();

$stmt = $conn->prepare("DELETE FROM password_resets WHERE email = ?");
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
