<?php
require_once __DIR__ . '/../cors.php';
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../config.php';

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
    $query = "SELECT m.id, m.sender_id, m.receiver_id, m.message, m.attachment_path, m.created_at, m.is_read, m.reply_to_id,
                     r.message AS reply_message, r.attachment_path AS reply_attachment_path, r.sender_id AS reply_sender_id
              FROM messages m
              LEFT JOIN messages r ON r.id = m.reply_to_id
              WHERE (m.sender_id = ? AND m.receiver_id = ?)
                 OR (m.sender_id = ? AND m.receiver_id = ?)
              ORDER BY m.created_at ASC, m.id ASC";

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
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => public_error_message($e)]);
}
$conn->close();
?>