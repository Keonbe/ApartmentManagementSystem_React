<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once "../config.php";

function fail($message) {
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!is_array($input)) fail("No data received");

$first_name = trim((string)($input["first_name"] ?? ''));
$middle_name = trim((string)($input["middle_name"] ?? '')) ?: null;
$last_name = trim((string)($input["last_name"] ?? ''));
$suffix = trim((string)($input["suffix"] ?? '')) ?: null;
$email_address = trim((string)($input["email_address"] ?? ''));
$password = (string)($input["password"] ?? '');
$confirmPass = (string)($input["conPassword"] ?? '');

if ($first_name === '' || $last_name === '' || $email_address === '') fail("First name, last name and email address are required.");
if (!filter_var($email_address, FILTER_VALIDATE_EMAIL)) fail("Please enter a valid email address.");
if (mb_strlen($first_name) > 100 || mb_strlen($last_name) > 100) fail("Names must be 100 characters or fewer.");
if ($pw_error = password_policy_error($password)) fail($pw_error);
if ($password !== $confirmPass) fail("Confirmed password does not match");

// Audit M13: at most REGISTRATION_MAX_PER_IP attempts per IP per window. Every
// attempt that reaches the email check counts, so the form can't be used to
// test many addresses for an existing account either.
$ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
if (rate_limit_exceeded($conn, 'registration', $ip, REGISTRATION_MAX_PER_IP, REGISTRATION_WINDOW_MINUTES)) {
    http_response_code(429);
    fail("Too many sign-up attempts from this network. Please try again in an hour.");
}
rate_limit_record($conn, 'registration', $ip);

$checkStmt = $conn->prepare("SELECT 1 FROM users WHERE email_address = ?");
$checkStmt->bind_param("s", $email_address);
$checkStmt->execute();
$exists = (bool)$checkStmt->get_result()->fetch_assoc();
$checkStmt->close();
if ($exists) fail("Email address is already registered");

$hashed_password = password_hash($password, PASSWORD_DEFAULT);
$verification_token = bin2hex(random_bytes(32));

// No role column is written: every self-registered account is a tenant ('user' default).
$stmt = $conn->prepare("INSERT INTO users (first_name, middle_name, last_name, suffix, email_address, password, verification_token) VALUES (?, ?, ?, ?, ?, ?, ?)");
$stmt->bind_param("sssssss", $first_name, $middle_name, $last_name, $suffix, $email_address, $hashed_password, $verification_token);

if ($stmt->execute()) {
    $new_user_id = (int)$stmt->insert_id;
    log_activity($conn, $new_user_id, 'user', 'Account Registered', "New tenant account #$new_user_id ($email_address)", $new_user_id);
    require_once __DIR__ . '/auth_email.php';
    $frontendBaseUrl = APP_ENV === 'development'
        ? 'http://localhost:5174'
        : 'https://www.angcanan-ams.com';
    $verifyLink = $frontendBaseUrl . '/verify-email?token=' . rawurlencode($verification_token);
    $escapedVerifyLink = htmlspecialchars($verifyLink, ENT_QUOTES, 'UTF-8');
    $html = '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#1e293b;padding:1px">'
        . '<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden">'
        . '<div style="background:#3b4276;padding:26px;text-align:center;color:#fff;font-size:24px;font-weight:bold">AMS</div>'
        . '<div style="padding:32px"><h1 style="font-size:22px;margin:0 0 18px">Verify your email address</h1>'
        . '<p style="line-height:1.6;margin:0 0 20px">Welcome to AMS. Verify your email address to activate your account.</p>'
        . '<p style="text-align:center;margin:28px 0"><a href="' . $escapedVerifyLink . '" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:bold">Verify Email</a></p>'
        . '<p style="font-size:13px;color:#64748b;line-height:1.6;margin:0">This verification link is for one-time use. If you did not create this account, you can ignore this email.</p>'
        . '</div></div></body></html>';
    $mailError = null;
    $sent = send_auth_email($conn, $email_address, 'Verify your AMS email address', $html, $mailError);
    $response = ["message" => $sent ? "Account created. Check your email to verify your address." : "Account created, but the verification email could not be sent. Please contact support.", "success" => true, "email_delivery_failed" => !$sent];
    if (!$sent) $response['debug_error'] = $mailError ?: 'Unknown email delivery error';
    echo json_encode($response);
} else {
    echo json_encode(["message" => "Failed to create account", "success" => false]);
}

$stmt->close();
$conn->close();
?>
