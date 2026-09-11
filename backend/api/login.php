<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
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

// ── Rate Limiting (A-5) ──
$ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

// Auto-create login_attempts table if not exists
$conn->query("CREATE TABLE IF NOT EXISTS login_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    email VARCHAR(255) NOT NULL,
    attempt_time DATETIME NOT NULL,
    INDEX (ip_address, attempt_time)
)");

// Check attempts in the last 15 minutes
$rate_stmt = $conn->prepare("SELECT COUNT(*) as attempts FROM login_attempts WHERE ip_address = ? AND attempt_time > DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
$rate_stmt->bind_param("s", $ip);
$rate_stmt->execute();
$attempts = $rate_stmt->get_result()->fetch_assoc()['attempts'] ?? 0;
$rate_stmt->close();

if ($attempts >= 10) {
    http_response_code(429);
    echo json_encode(["message" => "Too many failed login attempts. Please wait 15 minutes before trying again.", "valid" => false]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT id, email_address, first_name, middle_name, last_name, suffix, password, role, is_archived FROM users WHERE email_address = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    // Record failed attempt
    $fail_stmt = $conn->prepare("INSERT INTO login_attempts (ip_address, email, attempt_time) VALUES (?, ?, NOW())");
    $fail_stmt->bind_param("ss", $ip, $email);
    $fail_stmt->execute();
    $fail_stmt->close();

    echo json_encode(["message" => "Invalid email or password", "valid" => false]);
    $stmt->close();
    $conn->close();
    exit;
}

$user = $result->fetch_assoc();
$stmt->close();

if ((int)$user["is_archived"] === 1) {
    echo json_encode(["message" => "This account has been archived and cannot log in.", "valid" => false]);
    $conn->close();
    exit;
}

if (password_verify($password, $user["password"])) {
    // Clear failed attempts for this IP upon successful login
    $clear_stmt = $conn->prepare("DELETE FROM login_attempts WHERE ip_address = ?");
    $clear_stmt->bind_param("s", $ip);
    $clear_stmt->execute();
    $clear_stmt->close();

    // Clean user payload without dead $_SESSION assignment (A-6)
    $userData = [
        "id" => (int)$user["id"],
        "first_name" => $user["first_name"],
        "middle_name" => $user["middle_name"],
        "last_name" => $user["last_name"],
        "suffix" => $user["suffix"],
        "email_address" => $user["email_address"],
        "role" => $user["role"]
    ];

    // Issue a real server-side session token. This — not the X-User-Id /
    // X-Admin-Id headers the client also sends — is what every endpoint
    // should trust as proof of identity (see get_authenticated_user() /
    // require_admin() / require_user() in config.php).
    $sessionToken = create_session($conn, (int)$user["id"], $user["role"]);

    echo json_encode([
        "message" => "Login successful",
        "email" => $user["email_address"],
        "user" => $userData,
        "valid" => true,
        "role" => $user["role"],
        "sessionToken" => $sessionToken
    ]);
} else {
    // Record failed attempt
    $fail_stmt = $conn->prepare("INSERT INTO login_attempts (ip_address, email, attempt_time) VALUES (?, ?, NOW())");
    $fail_stmt->bind_param("ss", $ip, $email);
    $fail_stmt->execute();
    $fail_stmt->close();

    echo json_encode(["message" => "Invalid email or password", "valid" => false]);
}

$conn->close();
?>