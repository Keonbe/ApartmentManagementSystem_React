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

$checkStmt = $conn->prepare("SELECT 1 FROM users WHERE email_address = ?");
$checkStmt->bind_param("s", $email_address);
$checkStmt->execute();
$exists = (bool)$checkStmt->get_result()->fetch_assoc();
$checkStmt->close();
if ($exists) fail("Email address is already registered");

$hashed_password = password_hash($password, PASSWORD_DEFAULT);

// No role column is written: every self-registered account is a tenant ('user' default).
$stmt = $conn->prepare("INSERT INTO users (first_name, middle_name, last_name, suffix, email_address, password) VALUES (?, ?, ?, ?, ?, ?)");
$stmt->bind_param("ssssss", $first_name, $middle_name, $last_name, $suffix, $email_address, $hashed_password);

if ($stmt->execute()) {
    $new_user_id = (int)$stmt->insert_id;
    log_activity($conn, $new_user_id, 'user', 'Account Registered', "New tenant account #$new_user_id ($email_address)", $new_user_id);
    echo json_encode(["message" => "Account created successfully", "success" => true]);
} else {
    echo json_encode(["message" => "Failed to create account", "success" => false]);
}

$stmt->close();
$conn->close();
?>
