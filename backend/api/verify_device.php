<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header('Access-Control-Allow-Methods: POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/services/login_otp_policy.php';
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$email = trim((string)($input['email_address'] ?? ''));
$otp = trim((string)($input['otp'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^\d{6}$/', $otp)) { http_response_code(400); echo json_encode(['valid'=>false,'message'=>'Enter a valid email and six-digit code.']); exit; }
$stmt = $conn->prepare('SELECT id, first_name, middle_name, last_name, suffix, contact_no, gender, email_address, role, login_otp, login_otp_expires_at, login_otp_attempts, is_archived, email_verified_at FROM users WHERE email_address = ?');
$stmt->bind_param('s', $email); $stmt->execute(); $user = $stmt->get_result()->fetch_assoc(); $stmt->close();
if (!$user || $user['is_archived'] || (!$user['email_verified_at'] && email_verification_enabled($conn)) || empty($user['login_otp']) || strtotime($user['login_otp_expires_at']) < time() || (int)$user['login_otp_attempts'] >= 3) { echo json_encode(['valid'=>false,'message'=>'Code expired or unavailable. Sign in again to request a new code.']); exit; }
if (!hash_equals((string)$user['login_otp'], $otp)) {
    $bad = $conn->prepare('UPDATE users SET login_otp_attempts = login_otp_attempts + 1 WHERE id = ? AND login_otp_attempts < 3');
    $bad->bind_param('i', $user['id']); $bad->execute(); $bad->close();
    echo json_encode(['valid'=>false,'message'=>'Incorrect code. You have ' . max(0, 2 - (int)$user['login_otp_attempts']) . ' attempt(s) remaining.']); exit;
}
$conn->begin_transaction();
try {
    $clear = $conn->prepare('UPDATE users SET login_otp = NULL, login_otp_expires_at = NULL, login_otp_attempts = 0 WHERE id = ?');
    $clear->bind_param('i', $user['id']); $clear->execute(); $clear->close();
    $rawToken = bin2hex(random_bytes(32)); $tokenHash = hash('sha256', $rawToken);
    $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 512); $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $save = $conn->prepare('INSERT INTO trusted_devices (user_id, device_token, user_agent, ip_address) VALUES (?, ?, ?, ?)');
    $save->bind_param('isss', $user['id'], $tokenHash, $ua, $ip); $save->execute(); $save->close();
    $sessionToken = create_session($conn, (int)$user['id'], $user['role']);
    $conn->commit();
} catch (Throwable $e) { $conn->rollback(); error_log('Device verification failed: ' . $e->getMessage()); http_response_code(500); echo json_encode(['valid'=>false,'message'=>'Could not complete verification.']); exit; }
$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
setcookie('ams_trusted_device', $rawToken, ['expires'=>time()+31536000,'path'=>'/','secure'=>$secure,'httponly'=>true,'samesite'=>'Lax']);
$userData = ['id'=>(int)$user['id'],'first_name'=>$user['first_name'],'middle_name'=>$user['middle_name'],'last_name'=>$user['last_name'],'suffix'=>$user['suffix'],'contact_no'=>$user['contact_no'],'gender'=>$user['gender'],'email_address'=>$user['email_address'],'role'=>$user['role'],'first_login'=>record_sign_in($conn, (int)$user['id'])];
echo json_encode(['valid'=>true,'message'=>'Login successful','role'=>$user['role'],'user'=>$userData,'sessionToken'=>$sessionToken]);
$conn->close();