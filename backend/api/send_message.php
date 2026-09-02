<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-Id, X-Admin-Id');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config.php';

function ensure_messages_table($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS messages (
        id INT(11) NOT NULL AUTO_INCREMENT,
        sender_id INT(11) NOT NULL,
        receiver_id INT(11) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        KEY fk_sender (sender_id),
        KEY async_receiver (receiver_id),
        CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci";

    if (!$conn->query($sql)) {
        throw new Exception('Unable to ensure messages table: ' . $conn->error);
    }
}

$sender_id = intval($_SERVER['HTTP_X_USER_ID'] ?? $_SERVER['HTTP_X_ADMIN_ID'] ?? 0);
$body = json_decode(file_get_contents('php://input'), true) ?: [];
$receiver_id = intval($body['receiver_id'] ?? 0);
$message = trim($body['message'] ?? '');

if (!$sender_id || !$receiver_id || $message === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Missing required fields"]);
    exit;
}

if ($sender_id === $receiver_id) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Cannot send a message to نفسك"]);
    exit;
}

try {
    ensure_messages_table($conn);

    $userCheck = $conn->prepare("SELECT id FROM users WHERE id IN (?, ?)");
    if (!$userCheck) {
        throw new Exception('Prepare failed: ' . $conn->error);
    }
    $userCheck->bind_param('ii', $sender_id, $receiver_id);
    $userCheck->execute();
    $userResult = $userCheck->get_result();

    if ($userResult->num_rows < 2) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "User not found"]);
        exit;
    }

    $stmt = $conn->prepare("INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)");
    if (!$stmt) {
        throw new Exception('Prepare failed: ' . $conn->error);
    }
    $stmt->bind_param('iis', $sender_id, $receiver_id, $message);
    $stmt->execute();

    $newMessage = [
        'id' => $conn->insert_id,
        'sender_id' => $sender_id,
        'receiver_id' => $receiver_id,
        'message' => $message,
        'created_at' => date('Y-m-d H:i:s'),
        'is_read' => 0,
    ];

    if (function_exists('log_activity')) {
        log_activity($conn, $sender_id, 'chat', 'send_message', "Messaged user {$receiver_id}");
    }

    echo json_encode([
        "success" => true,
        "message" => $newMessage
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$stmt?->close();
$userCheck?->close();
$conn->close();
?>