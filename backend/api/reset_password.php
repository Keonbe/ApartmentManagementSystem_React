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

if (strlen($new_password) < 6) {
    echo json_encode(["success" => false, "message" => "Password must be at least 6 characters long"]);
    exit;
}

// 1. Verify token
$token_hash = hash('sha256', $token);
$stmt = $conn->prepare("SELECT id FROM password_resets WHERE email = ? AND token_hash = ? AND expires_at > NOW()");
$stmt->bind_param("ss", $email, $token_hash);
$stmt->execute();
$res = $stmt->get_result();

if ($res->num_rows === 0) {
    echo json_encode(["success" => false, "message" => "Invalid or expired reset token"]);
    $stmt->close();
    $conn->close();
    exit;
}
$stmt->close();

// 2. Hash new password
$hashed_password = password_hash($new_password, PASSWORD_BCRYPT);

// 3. Update password in users table
$stmt = $conn->prepare("UPDATE users SET password = ? WHERE email_address = ?");
$stmt->bind_param("ss", $hashed_password, $email);
$update_success = $stmt->execute();
$affected_rows = $stmt->affected_rows;
$stmt->close();

if ($update_success && $affected_rows > 0) {
    // 4. Delete the used token
    $stmt = $conn->prepare("DELETE FROM password_resets WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $stmt->close();

    // 5. Get user ID for logging
    $stmt = $conn->prepare("SELECT id FROM users WHERE email_address = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $user_res = $stmt->get_result();
    if ($user_res->num_rows > 0) {
        $user_id = $user_res->fetch_assoc()['id'];
        log_activity($conn, $user_id, 'system', 'Reset Password', 'User successfully reset their password via token.');
    }
    $stmt->close();

    echo json_encode(["success" => true, "message" => "Password successfully reset"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to update password or user not found"]);
}

$conn->close();
?>
