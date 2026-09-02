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

// Ensure the request is POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$email = trim($data['email'] ?? '');

if (empty($email)) {
    echo json_encode(["success" => false, "message" => "Email is required"]);
    exit;
}

// 1. Check if email exists
$stmt = $conn->prepare("SELECT id FROM users WHERE email_address = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$res = $stmt->get_result();

if ($res->num_rows === 0) {
    // Security: Do not reveal that the email does not exist.
    // Pretend we sent an email.
    echo json_encode([
        "success" => true,
        "message" => "If an account with that email exists, a password reset link has been sent."
    ]);
    $stmt->close();
    $conn->close();
    exit;
}
$stmt->close();

// 2. Generate secure token
$token = bin2hex(random_bytes(32));
$token_hash = hash('sha256', $token);
$expires_at = date('Y-m-d H:i:s', strtotime('+30 minutes'));

// 3. Delete any existing tokens for this email to prevent spam/abuse
$stmt = $conn->prepare("DELETE FROM password_resets WHERE email = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$stmt->close();

// 4. Store the new token hash
$stmt = $conn->prepare("INSERT INTO password_resets (email, token_hash, expires_at) VALUES (?, ?, ?)");
$stmt->bind_param("sss", $email, $token_hash, $expires_at);
if ($stmt->execute()) {
    
    // In a real application, you would send an email here using PHPMailer or similar.
    // Example: send_reset_email($email, $token);
    
    $response = [
        "success" => true,
        "message" => "If an account with that email exists, a password reset link has been sent."
    ];
    
    // Developer convenience: If in development mode, return the token so we can test the UI
    // without needing an actual email server configured in XAMPP.
    if (APP_ENV === 'development') {
        $response['dev_token'] = $token;
    }
    
    echo json_encode($response);
} else {
    echo json_encode(["success" => false, "message" => "Failed to process password reset request"]);
}

$stmt->close();
$conn->close();
?>
