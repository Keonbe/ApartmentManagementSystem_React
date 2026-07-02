<?php
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
    header("Access-Control-Allow-Headers: Content-Type, Authorization");

    require_once "../config.php";
    
    $input = json_decode(file_get_contents("php://input"), true);

    if (!$input) {
    echo json_encode(["message" => "No data received"]);
    exit;
}
    
    $first_name = $input["first_name"];
    $last_name = $input["last_name"];
    $email_address = $input["email_address"];
    $password = $input["password"];

    $hashed_password = password_hash($password, PASSWORD_DEFAULT);

   $stmt = $conn->prepare("INSERT INTO users (first_name, last_name, email_address, password) VALUES (?, ?, ?, ?)");
   $stmt->bind_param("ssss", $first_name, $last_name, $email_address, $hashed_password);


if ($stmt->execute()) {
    echo json_encode(["message" => "Data saved successfully"]);
} else {
    echo json_encode(["message" => "Failed to save data", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>