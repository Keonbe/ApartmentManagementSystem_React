<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$user_id = $_GET['userId'] ?? $_SERVER['HTTP_X_USER_ID'] ?? null;

if (empty($user_id)) {
    echo json_encode(["success" => false, "message" => "User ID is required."]);
    exit;
}

$stmt = $conn->prepare("SELECT room_name, monthly_rent, months_of_rent, status, created_at, occupants FROM rent_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows > 0) {
    $room_data = $result->fetch_assoc();
    echo json_encode(["success" => true, "data" => $room_data]);
} else {
    echo json_encode(["success" => false, "message" => "No room application found for this user."]);
}

$stmt->close();
$conn->close();
?>