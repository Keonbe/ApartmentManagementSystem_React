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

$stmt = $conn->prepare("SELECT id, tag, title, body, created_at FROM announcements WHERE status = 'sent' OR send_to = 'All Tenants' ORDER BY created_at DESC");
$stmt->execute();
$result = $stmt->get_result();

$announcements = [];
while ($row = $result->fetch_assoc()) {
    $announcements[] = $row;
}

echo json_encode(["success" => true, "announcements" => $announcements]);

$stmt->close();
$conn->close();
?>
