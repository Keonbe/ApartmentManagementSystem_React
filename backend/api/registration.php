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

$first_name = $input["first_name"];
$middle_name = $input["middle_name"] ?? null;
$last_name = $input["last_name"];
$suffix = $input["suffix"] ?? null;
$email_address = $input["email_address"];
$password = $input["password"];
$confirmPass = $input["conPassword"];
$isAdmin = false;

if(strlen($password) < 8){
    echo json_encode([
    "success" => false,
    "message" => "Password length must be atleast 8 characters" 
]);
    $conn->close();
    exit;
}
if($password != $confirmPass){
    echo json_encode([
        "success" => false,
        "message" => "Confirmed password not match"
    ]);
    $conn->close();
    exit;
}

$checkStmt = $conn->prepare("SELECT email_address FROM users WHERE email_address = ?");
$checkStmt->bind_param("s", $email_address);
$checkStmt->execute();
$result = $checkStmt->get_result();

if ($result->num_rows > 0) {
    echo json_encode([
        "success" => false,
        "message" => "Email address is already registered"
    ]);

    $checkStmt->close();
    $conn->close();
    exit;
}
$checkStmt->close();

$hashed_password = password_hash($password, PASSWORD_DEFAULT);

$stmt = $conn->prepare("INSERT INTO users (first_name, middle_name, last_name, suffix, email_address, password) VALUES (?, ?, ?, ?, ?, ?)");
$stmt->bind_param("ssssss", $first_name, $middle_name, $last_name, $suffix, $email_address, $hashed_password);


if ($stmt->execute()) {
    echo json_encode(["message" => "Account created successfully", "success" => true]);
    
} else {
    echo json_encode(["message" => "Failed to create account", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
