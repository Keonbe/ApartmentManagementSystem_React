<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

$input = json_decode(file_get_contents("php://input"), true);

if (!$input) {
    echo json_encode(["success" => false, "message" => "No data received"]);
    exit;
}

$email = $input["email_address"];
$currentPassword = $input["current_password"];
$newPassword = $input["new_password"];
$confirmPassword = $input["confirm_password"];

if (strlen($newPassword) < 8) {
    echo json_encode(["success" => false, "message" => "New password length must be atleast 8 characters"]);
    $conn->close();
    exit;
}

if ($newPassword != $confirmPassword) {
    echo json_encode(["success" => false, "message" => "Confirmed password does not match"]);
    $conn->close();
    exit;
}

$stmt = $conn->prepare("SELECT password FROM users WHERE email_address = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode(["success" => false, "message" => "User account not found"]);
    $stmt->close();
    $conn->close();
    exit;
}

$user = $result->fetch_assoc();
$stmt->close();

if (!password_verify($currentPassword, $user["password"])) {
    echo json_encode(["success" => false, "message" => "Incorrect current password"]);
    $conn->close();
    exit;
}

$hashed_password = password_hash($newPassword, PASSWORD_DEFAULT);

$updateStmt = $conn->prepare("UPDATE users SET password = ? WHERE email_address = ?");
$updateStmt->bind_param("ss", $hashed_password, $email);

if ($updateStmt->execute()) {
    echo json_encode(["success" => true, "message" => "Password updated successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to update password record"]);
}

$updateStmt->close();
$conn->close();
?>