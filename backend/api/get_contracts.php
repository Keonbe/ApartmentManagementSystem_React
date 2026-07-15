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

$query = "SELECT c.*, r.first_name, r.last_name, r.room_name, r.monthly_rent, rm.type 
          FROM lease_contracts c 
          LEFT JOIN rent_applications r ON c.rent_application_id = r.id
          LEFT JOIN rooms rm ON r.room_name = rm.id
          ORDER BY c.generated_at DESC";

$result = $conn->query($query);
$contracts = [];

if ($result) {
    while ($row = $result->fetch_assoc()) {
        $contracts[] = $row;
    }
}

echo json_encode(["success" => true, "contracts" => $contracts]);
$conn->close();
?>
