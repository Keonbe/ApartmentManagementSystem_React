<?php
require_once __DIR__ . '/../cors.php';
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

require_once __DIR__ . "/../config.php";

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

$user_id = intval($_SERVER["HTTP_X_USER_ID"] ?? $_SERVER["HTTP_X_ADMIN_ID"] ?? 0);

if (!$user_id) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Unauthorized"]);
    exit;
}

try {
    ensure_messages_table($conn);

    $query = "SELECT
                u.id AS other_user_id,
                CONCAT(u.first_name, ' ', u.last_name) AS other_user_name,
                u.avatar_url AS other_user_avatar,
                (
                    SELECT message
                    FROM messages
                    WHERE (sender_id = ? AND receiver_id = u.id)
                       OR (sender_id = u.id AND receiver_id = ?)
                    ORDER BY created_at DESC, id DESC
                    LIMIT 1
                ) AS last_message,
                (
                    SELECT attachment_path
                    FROM messages
                    WHERE (sender_id = ? AND receiver_id = u.id)
                       OR (sender_id = u.id AND receiver_id = ?)
                    ORDER BY created_at DESC, id DESC
                    LIMIT 1
                ) AS last_message_attachment_path,
                (
                    SELECT sender_id
                    FROM messages
                    WHERE (sender_id = ? AND receiver_id = u.id)
                       OR (sender_id = u.id AND receiver_id = ?)
                    ORDER BY created_at DESC, id DESC
                    LIMIT 1
                ) AS last_message_sender_id,
                (
                    SELECT created_at
                    FROM messages
                    WHERE (sender_id = ? AND receiver_id = u.id)
                       OR (sender_id = u.id AND receiver_id = ?)
                    ORDER BY created_at DESC, id DESC
                    LIMIT 1
                ) AS last_message_time,
                (
                    SELECT COUNT(*)
                    FROM messages
                    WHERE sender_id = u.id
                      AND receiver_id = ?
                      AND is_read = 0
                ) AS unread_count
              FROM users u
              WHERE u.id != ?
                AND EXISTS (
                    SELECT 1
                    FROM messages
                    WHERE (sender_id = ? AND receiver_id = u.id)
                       OR (sender_id = u.id AND receiver_id = ?)
                )
              ORDER BY last_message_time DESC, u.first_name ASC, u.last_name ASC";

    $stmt = $conn->prepare($query);
    if (!$stmt) {
        throw new Exception('Prepare failed: ' . $conn->error);
    }
     $stmt->bind_param("iiiiiiiiiiii", $user_id, $user_id, $user_id, $user_id, $user_id, $user_id, $user_id, $user_id, $user_id, $user_id, $user_id, $user_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $conversations = [];
    while ($row = $result->fetch_assoc()) {
        $conversations[] = [
            'other_user_id' => (int) $row['other_user_id'],
            'other_user_name' => $row['other_user_name'],
            'other_user_avatar' => $row['other_user_avatar'],
            'last_message' => $row['last_message'],
            'last_message_attachment_path' => $row['last_message_attachment_path'],
            'last_message_sender_id' => isset($row['last_message_sender_id']) ? (int) $row['last_message_sender_id'] : null,
            'last_message_time' => $row['last_message_time'],
            'unread_count' => (int) ($row['unread_count'] ?? 0),
        ];
    }

    echo json_encode(["success" => true, "conversations" => $conversations]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}
$stmt->close();
$conn->close();
?>
