<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["success" => false, "message" => "Invalid request"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$email = $input['email'] ?? '';
$additional_months = (int)($input['additionalMonths'] ?? 0);

if (empty($email) || $additional_months <= 0) {
    echo json_encode(["success" => false, "message" => "Invalid input"]);
    exit;
}

$stmt = $conn->prepare("SELECT months_of_rent FROM rent_applications WHERE email = ? ORDER BY created_at DESC LIMIT 1");
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if ($row = $result->fetch_assoc()) {
    $new_total_months = $row['months_of_rent'] + $additional_months;
    
    $update = $conn->prepare("UPDATE rent_applications SET months_of_rent = ? WHERE email = ? ORDER BY created_at DESC LIMIT 1");
    $update->bind_param("is", $new_total_months, $email);
    
    if ($update->execute()) {
        echo json_encode(["success" => true, "message" => "Lease extended successfully"]);
    } else {
        echo json_encode(["success" => false, "message" => "Update failed"]);
    }
} else {
    echo json_encode(["success" => false, "message" => "Application not found"]);
}

$stmt->close();
$conn->close();
?>