<?php
require_once __DIR__ . '/../cors.php';
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../config.php';

const MESSAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const MESSAGE_VIDEO_MAX_BYTES = 25 * 1024 * 1024;

$sender_id = intval($_SERVER['HTTP_X_USER_ID'] ?? $_SERVER['HTTP_X_ADMIN_ID'] ?? 0);
$body = $_POST ?: (read_json_input());
$receiver_id = intval($body['receiver_id'] ?? 0);
$message = trim($body['message'] ?? '');
$reply_to_id = intval($body['reply_to_id'] ?? 0) ?: null;
$attachment = $_FILES['attachment'] ?? null;

if ($attachment && ($attachment['error'] === UPLOAD_ERR_INI_SIZE || $attachment['error'] === UPLOAD_ERR_FORM_SIZE)) {
    http_response_code(413);
    echo json_encode(["success" => false, "message" => "Attachment exceeds the allowed size limit (images 10 MB, videos 25 MB)"]);
    exit;
}
if ($attachment && $attachment['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Attachment upload failed"]);
    exit;
}
if (!$sender_id || !$receiver_id || ($message === '' && !$attachment)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Missing required fields"]);
    exit;
}

if ($sender_id === $receiver_id) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Cannot send a message to yourself"]);
    exit;
}

// Keep equal to MAX_MESSAGE_LENGTH in websocket-server/server.js.
if (mb_strlen($message) > 2000) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Messages can be up to 2000 characters."]);
    exit;
}

try {
    // Check both people and the reply target before anything is written to disk,
    // so a refused message never leaves an orphaned attachment behind.
    $userCheck = $conn->prepare("SELECT id, role FROM users WHERE id IN (?, ?)");
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

    // A message between a tenant and the office belongs to the tenant's open
    // complaint, if they have one (the client never says so).
    $roles = [];
    while ($u = $userResult->fetch_assoc()) $roles[(int)$u['id']] = $u['role'];
    $tenant_party = ($roles[$sender_id] ?? '') === 'user' ? $sender_id : (($roles[$receiver_id] ?? '') === 'user' ? $receiver_id : null);
    $complaint_id = ($tenant_party !== null && ($roles[$sender_id] ?? '') !== ($roles[$receiver_id] ?? ''))
        ? open_complaint_id($conn, $tenant_party) : null;

    if ($reply_to_id) {
        $replyCheck = $conn->prepare("SELECT id FROM messages WHERE id = ? AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))");
        $replyCheck->bind_param('iiiii', $reply_to_id, $sender_id, $receiver_id, $receiver_id, $sender_id);
        $replyCheck->execute();
        if ($replyCheck->get_result()->num_rows === 0) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Reply target not found in this conversation"]);
            exit;
        }
        $replyCheck->close();
    }

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
        $isVideo = str_starts_with($mime, 'video/');
        $maxBytes = $isVideo ? MESSAGE_VIDEO_MAX_BYTES : MESSAGE_IMAGE_MAX_BYTES;
        if ($attachment['size'] > $maxBytes || $attachment['size'] <= 0) {
            http_response_code(413);
            echo json_encode(["success" => false, "message" => ($isVideo ? 'Video' : 'Image') . ' must be no larger than ' . ($isVideo ? '25 MB' : '10 MB')]);
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

    $stmt = $conn->prepare("INSERT INTO messages (sender_id, receiver_id, message, attachment_path, reply_to_id, complaint_id) VALUES (?, ?, ?, ?, ?, ?)");
    if (!$stmt) {
        throw new Exception('Prepare failed: ' . $conn->error);
    }
    $stmt->bind_param('iissii', $sender_id, $receiver_id, $message, $attachmentPath, $reply_to_id, $complaint_id);
    $stmt->execute();

    $newMessage = [
        'id' => $conn->insert_id,
        'sender_id' => $sender_id,
        'receiver_id' => $receiver_id,
        'message' => $message,
        'attachment_path' => $attachmentPath,
        'reply_to_id' => $reply_to_id,
        'complaint_id' => $complaint_id,
        'reply_message' => null,
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
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => public_error_message($e)]);
}

$stmt?->close();
$userCheck?->close();
$conn->close();
?>