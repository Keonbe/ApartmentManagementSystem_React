<?php
require_once __DIR__ . '/../cors.php';
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
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
    $column = $conn->query("SHOW COLUMNS FROM messages LIKE 'attachment_path'");
    if ($column->num_rows === 0) {
        $conn->query("ALTER TABLE messages ADD attachment_path VARCHAR(255) NULL");
    }
}

$user_id = intval($_SERVER['HTTP_X_USER_ID'] ?? $_SERVER['HTTP_X_ADMIN_ID'] ?? 0);

if (!$user_id) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Unauthorized"]);
    exit;
}

$other_user_id = intval($_GET['other_user_id'] ?? 0);
$mark_as_read = intval($_GET['mark_as_read'] ?? 0) === 1;

if (!$other_user_id) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Missing other_user_id"]);
    exit;
}

try {
    ensure_messages_table($conn);

    $query = "SELECT id, sender_id, receiver_id, message, attachment_path, created_at, is_read
              FROM messages 
              WHERE (sender_id = ? AND receiver_id = ?) 
                 OR (sender_id = ? AND receiver_id = ?)
              ORDER BY created_at ASC, id ASC";

    $stmt = $conn->prepare($query);
    if (!$stmt) {
        throw new Exception('Prepare failed: ' . $conn->error);
    }
    $stmt->bind_param("iiii", $user_id, $other_user_id, $other_user_id, $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $messages = [];
    while ($row = $result->fetch_assoc()) {
        $messages[] = $row;
    }

    if ($mark_as_read) {
        $markRead = $conn->prepare(
            "UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0"
        );
        if (!$markRead) {
            throw new Exception('Prepare failed: ' . $conn->error);
        }
        $markRead->bind_param("ii", $other_user_id, $user_id);
        $markRead->execute();
        $markRead->close();

        // Reflect the updated read state in this response.
        foreach ($messages as &$row) {
            if ((int) $row['sender_id'] === $other_user_id) {
                $row['is_read'] = 1;
            }
        }
        unset($row);
    }

    echo json_encode(["success" => true, "messages" => $messages]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}
$stmt->close();
$conn->close();
?>