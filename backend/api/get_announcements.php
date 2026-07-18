<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$query = "SELECT * FROM announcements ORDER BY created_at DESC";
$result = $conn->query($query);
$announcements = [];

if ($result) {
    while ($row = $result->fetch_assoc()) {
        $row['channels'] = json_decode($row['channels'], true);
        $announcements[] = $row;
    }
}

echo json_encode(["success" => true, "announcements" => $announcements]);
$conn->close();
?>
