<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id, X-Session-Token");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

$token = get_bearer_token();
if ($token) {
    $stmt = $conn->prepare("DELETE FROM sessions WHERE token = ?");
    $stmt->bind_param("s", $token);
    $stmt->execute();
    $stmt->close();
}

echo json_encode(["success" => true, "message" => "Logged out"]);
$conn->close();
?>
