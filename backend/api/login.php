<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once "../config.php";

$input = json_decode(file_get_contents("php://input"), true);

if (!$input) {
    echo json_encode(["message" => "No data received"]);
    exit;
}

$email = $input["email_address"];
$password = $input["password"];

$stmt = $conn->prepare("SELECT email_address, first_name, last_name, password, role FROM users WHERE email_address = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode(["message" => "User not found", "valid" => false]);
    exit;
}

$user = $result->fetch_assoc();

if (password_verify($password, $user["password"])) {
    $_SESSION['user'] = [
        "first_name" => $user["first_name"],
        "last_name" => $user["last_name"],
        "email_address" => $user["email_address"],
        "role" => $user["role"]
    ];
    echo json_encode([
        "message" => "Login successful",
        "email" => $user["email_address"],
        "user" => $_SESSION['user'],
        "valid" => true,
        "role" => $user["role"]
    ]);
} else {
    echo json_encode(["message" => "Invalid password", "valid" => false]);
}

$stmt->close();
$conn->close();
?>