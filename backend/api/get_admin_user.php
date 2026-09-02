<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../config.php';

$user_id = intval($_SERVER['HTTP_X_USER_ID'] ?? $_SERVER['HTTP_X_ADMIN_ID'] ?? 0);

if (!$user_id) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Unauthorized"]);
    exit;
}

try {
    $stmt = $conn->prepare("SELECT id, first_name, last_name, avatar_url, role FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    if (!$stmt) {
        throw new Exception('Prepare failed: ' . $conn->error);
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $admin = $result->fetch_assoc();

    if (!$admin) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Admin account not found"]);
        exit;
    }

    echo json_encode([
        "success" => true,
        "user" => [
            'id' => (int) $admin['id'],
            'first_name' => $admin['first_name'],
            'last_name' => $admin['last_name'],
            'avatar_url' => $admin['avatar_url'],
            'role' => $admin['role'],
        ]
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$stmt->close();
$conn->close();
?>