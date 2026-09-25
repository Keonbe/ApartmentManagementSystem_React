<?php
require_once __DIR__ . '/../cors.php';
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../config.php';

const MESSAGE_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

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

$sender_id = intval($_SERVER['HTTP_X_USER_ID'] ?? $_SERVER['HTTP_X_ADMIN_ID'] ?? 0);
$body = $_POST ?: (json_decode(file_get_contents('php://input'), true) ?: []);
$receiver_id = intval($body['receiver_id'] ?? 0);
$message = trim($body['message'] ?? '');
$attachment = $_FILES['attachment'] ?? null;

if ($attachment && $attachment['error'] === UPLOAD_ERR_INI_SIZE || $attachment && $attachment['error'] === UPLOAD_ERR_FORM_SIZE) {
    http_response_code(413);
    echo json_encode(["success" => false, "message" => "Attachment exceeds the 8 MB limit"]);
    exit;
}
if ($attachment && $attachment['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Attachment upload failed"]);
    exit;
}
if ($attachment && ($attachment['size'] > MESSAGE_ATTACHMENT_MAX_BYTES || $attachment['size'] <= 0)) {
    http_response_code(413);
    echo json_encode(["success" => false, "message" => "Attachment must be no larger than 8 MB"]);
    exit;
}

if (!$sender_id || !$receiver_id || ($message === '' && !$attachment)) {
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

    $attachmentPath = null;
    if ($attachment) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($attachment['tmp_name']);
        $allowed = [
            'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif',
            'image/webp' => 'webp', 'video/mp4' => 'mp4', 'video/webm' => 'webm',
            'video/quicktime' => 'mov',
        ];
        if (!isset($allowed[$mime])) {
            http_response_code(415);
            echo json_encode(["success" => false, "message" => "Only JPEG, PNG, GIF, WebP, MP4, WebM, or MOV files are allowed"]);
            exit;
        }
        $uploadDir = UPLOADS_DIR . '/messages';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
            throw new Exception('Unable to create message upload directory');
        }
        $filename = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
        if (!move_uploaded_file($attachment['tmp_name'], $uploadDir . '/' . $filename)) {
            throw new Exception('Unable to save attachment');
        }
        $attachmentPath = 'uploads/messages/' . $filename;
    }

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

    $stmt = $conn->prepare("INSERT INTO messages (sender_id, receiver_id, message, attachment_path) VALUES (?, ?, ?, ?)");
    if (!$stmt) {
        throw new Exception('Prepare failed: ' . $conn->error);
    }
    $stmt->bind_param('iiss', $sender_id, $receiver_id, $message, $attachmentPath);
    $stmt->execute();

    $newMessage = [
        'id' => $conn->insert_id,
        'sender_id' => $sender_id,
        'receiver_id' => $receiver_id,
        'message' => $message,
        'attachment_path' => $attachmentPath,
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