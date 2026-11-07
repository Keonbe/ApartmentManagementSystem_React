<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

try {
    $result = $conn->query("SELECT id, first_name, last_name, suffix, email_address FROM users WHERE role = 'user' ORDER BY first_name, last_name");
    $users = [];
    while ($row = $result->fetch_assoc()) {
        $users[] = [
            'id' => (int) $row['id'],
            'name' => person_name($row),
            'email' => $row['email_address']
        ];
    }
    echo json_encode(["success" => true, "data" => $users]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => public_error_message($e)]);
}

$conn->close();
?>
