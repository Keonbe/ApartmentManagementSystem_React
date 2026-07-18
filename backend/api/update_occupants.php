<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

// Read the JSON data
$input = json_decode(file_get_contents("php://input"), true);

$email = $input['email'] ?? '';
$occupants = $input['occupants'] ?? '';

// Basic validation
if (empty($email) || empty($occupants)) {
    echo json_encode(["success" => false, "message" => "Email and occupant count are required."]);
    exit;
}

// Strict backend validation to prevent exceeding 4
$occupant_count = (int)$occupants;
if ($occupant_count > 4 || $occupant_count < 1) {
    echo json_encode(["success" => false, "message" => "Occupants must be between 1 and 4."]);
    exit;
}

// Update the database for this user's most recent application and active room
$conn->begin_transaction();
try {
    $stmt = $conn->prepare("UPDATE rent_applications SET occupants = ? WHERE email = ? ORDER BY id DESC LIMIT 1");
    $stmt->bind_param("is", $occupant_count, $email);
    $stmt->execute();
    $stmt->close();

    $room_stmt = $conn->prepare("UPDATE rooms SET occupants = ? WHERE id = (SELECT room_name FROM rent_applications WHERE email = ? AND status = 'Approved' ORDER BY id DESC LIMIT 1)");
    $room_stmt->bind_param("is", $occupant_count, $email);
    $room_stmt->execute();
    $room_stmt->close();

    $conn->commit();
    echo json_encode(["success" => true, "message" => "Occupants updated successfully"]);
} catch (Exception $e) {
    $conn->rollback();
    echo json_encode(["success" => false, "message" => "Failed to update occupants", "error" => $e->getMessage()]);
}

$conn->close();
?>