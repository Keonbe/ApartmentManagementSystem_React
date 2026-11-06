<?php
require_once __DIR__ . '/../cors.php';
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

require_once __DIR__ . "/../config.php";

$user_id = intval($_SERVER["HTTP_X_USER_ID"] ?? $_SERVER["HTTP_X_ADMIN_ID"] ?? 0);
$search = trim((string) ($_GET['search'] ?? ''));

if (!$user_id) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Unauthorized"]);
    exit;
}

try {
    $query = "SELECT
                u.id AS other_user_id,
                CONCAT(u.first_name, ' ', u.last_name) AS other_user_name,
                u.avatar_url AS other_user_avatar,
                u.email_address AS other_user_email,
                (
                    SELECT m.message
                    FROM messages m
                    WHERE ((m.sender_id = ? AND m.receiver_id = u.id)
                       OR (m.sender_id = u.id AND m.receiver_id = ?))
                      AND m.message LIKE ?
                    ORDER BY m.created_at DESC, m.id DESC
                    LIMIT 1
                ) AS matched_message,
                (
                    SELECT m.id
                    FROM messages m
                    WHERE ((m.sender_id = ? AND m.receiver_id = u.id)
                       OR (m.sender_id = u.id AND m.receiver_id = ?))
                      AND m.message LIKE ?
                    ORDER BY m.created_at DESC, m.id DESC
                    LIMIT 1
                ) AS matched_message_id,
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
                ) AS unread_count,
                u.role AS other_user_role,
                EXISTS (
                    SELECT 1 FROM rent_applications ra
                    WHERE ra.user_id = u.id AND LOWER(ra.status) IN ('active', 'pending-move-out', 'approved')
                ) AS is_active_tenant
              FROM users u
              WHERE u.id != ?
                AND (? = '' OR CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR u.email_address LIKE ? OR EXISTS (
                    SELECT 1 FROM messages sm
                    WHERE ((sm.sender_id = ? AND sm.receiver_id = u.id)
                       OR (sm.sender_id = u.id AND sm.receiver_id = ?))
                      AND sm.message LIKE ?
                ))
                AND EXISTS (
                    SELECT 1
                    FROM messages
                    WHERE (sender_id = ? AND receiver_id = u.id)
                       OR (sender_id = u.id AND receiver_id = ?)
                )
              ORDER BY last_message_time DESC, u.first_name ASC, u.last_name ASC";

    $like_search = $search === '' ? '__AMS_EMPTY_SEARCH_NO_MATCH__' : '%' . addcslashes($search, '%_\\') . '%';
    $stmt = $conn->prepare($query);
    if (!$stmt) {
        throw new Exception('Prepare failed: ' . $conn->error);
    }
    $types = "iisiis" . "iiiiiiiiii" . "sssiisii";
    $stmt->bind_param($types, $user_id, $user_id, $like_search, $user_id, $user_id, $like_search, $user_id, $user_id, $user_id, $user_id, $user_id, $user_id, $user_id, $user_id, $user_id, $user_id, $search, $like_search, $like_search, $user_id, $user_id, $like_search, $user_id, $user_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $conversations = [];
    while ($row = $result->fetch_assoc()) {
        $conversations[] = [
            'other_user_id' => (int) $row['other_user_id'],
            'other_user_name' => $row['other_user_name'],
            'other_user_avatar' => $row['other_user_avatar'],
            'other_user_email' => $row['other_user_email'],
            'matched_message' => $row['matched_message'],
            'matched_message_id' => $row['matched_message_id'] ? (int) $row['matched_message_id'] : null,
            'last_message' => $row['last_message'],
            'last_message_attachment_path' => $row['last_message_attachment_path'],
            'last_message_sender_id' => isset($row['last_message_sender_id']) ? (int) $row['last_message_sender_id'] : null,
            'last_message_time' => $row['last_message_time'],
            'unread_count' => (int) ($row['unread_count'] ?? 0),
            'is_active_tenant' => (bool) $row['is_active_tenant'],
            // Messages → Archived: someone not renting now (an applicant, a past
            // tenant) with no message for 6 months. Active tenants and admins never are.
            'archived' => !$row['is_active_tenant'] && $row['other_user_role'] !== 'admin'
                && $row['last_message_time'] !== null && strtotime($row['last_message_time']) < strtotime('-6 months'),
        ];
    }

    echo json_encode(["success" => true, "conversations" => $conversations]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => public_error_message($e)]);
}
$conn->close();
?>
