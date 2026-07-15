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

$user_id = $_GET['userId'] ?? null;

// Build query
$query = "SELECT i.*, r.room_name, u.first_name, u.last_name 
          FROM invoices i 
          LEFT JOIN users u ON i.user_id = u.id 
          LEFT JOIN rent_applications r ON i.rent_application_id = r.id";

if ($user_id) {
    $query .= " WHERE i.user_id = ?";
    $stmt = $conn->prepare($query . " ORDER BY i.created_at DESC");
    $stmt->bind_param("i", $user_id);
} else {
    $stmt = $conn->prepare($query . " ORDER BY i.created_at DESC");
}

$stmt->execute();
$result = $stmt->get_result();
$invoices = [];

while ($row = $result->fetch_assoc()) {
    $invoices[] = $row;
}

echo json_encode(["success" => true, "invoices" => $invoices]);

$stmt->close();
$conn->close();
?>
