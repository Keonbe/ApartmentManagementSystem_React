<?php
require_once __DIR__ . '/../cors.php';
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
require_once __DIR__ . '/../config.php';
$admin = require_admin($conn);
if (!$admin) exit;
try {
    $result = $conn->query("SELECT i.id AS thread_id, i.id AS guest_thread_id, NULL AS user_id, i.guest_name AS other_user_name, i.guest_email AS other_user_email, i.guest_phone AS other_user_phone, i.unit_of_interest, i.guest_verified_at, i.guest_chat_ended_at AS ended_at, 'guest' AS thread_type, (SELECT c.id FROM guest_messages c WHERE c.inquiry_id = i.id AND c.kind = 'resolution_check' ORDER BY c.id DESC LIMIT 1) AS last_check_id, (SELECT c.resolution_answer FROM guest_messages c WHERE c.inquiry_id = i.id AND c.kind = 'resolution_check' ORDER BY c.id DESC LIMIT 1) AS last_check_answer, (SELECT MAX(g.id) FROM guest_messages g WHERE g.inquiry_id = i.id AND g.sender_role = 'guest') AS last_guest_message_id, COALESCE(m.message, i.message) AS last_message, m.attachment_path AS last_message_attachment_path, COALESCE(m.created_at, i.created_at) AS last_message_time, (SELECT COUNT(*) FROM guest_messages u WHERE u.inquiry_id = i.id AND u.sender_role = 'guest' AND u.is_read = 0) AS unread_count FROM inquiries i LEFT JOIN guest_messages m ON m.id = (SELECT MAX(gm.id) FROM guest_messages gm WHERE gm.inquiry_id = i.id) WHERE i.thread_type = 'guest' AND NOT EXISTS (SELECT 1 FROM inquiries prior WHERE prior.thread_type = 'guest' AND prior.id < i.id AND ((i.guest_email IS NOT NULL AND i.guest_email <> '' AND LOWER(prior.guest_email) = LOWER(i.guest_email)) OR (i.guest_phone IS NOT NULL AND i.guest_phone <> '' AND prior.guest_phone = i.guest_phone))) ORDER BY COALESCE(m.created_at, i.created_at) DESC");
    // Archived (Messages → Archived): the guest ended the chat, or said
    // "Problem resolved" and has not written since, or nothing was said for 6 months.
    $rows = $result->fetch_all(MYSQLI_ASSOC);
    $stale = strtotime('-6 months');
    foreach ($rows as &$row) {
        $resolved = $row['last_check_answer'] === 'resolved';
        $row['resolved'] = $resolved;
        $row['archive_reason'] = !empty($row['ended_at']) ? 'ended'
            : ($resolved && (int)$row['last_guest_message_id'] < (int)$row['last_check_id'] ? 'resolved'
            : (strtotime((string)$row['last_message_time']) < $stale ? 'inactive' : null));
        $row['archived'] = $row['archive_reason'] !== null;
        unset($row['last_check_id'], $row['last_guest_message_id']);
    }
    unset($row);
    echo json_encode(['success'=>true,'conversations'=>$rows]);
} catch (Throwable $e) { http_response_code(500); echo json_encode(['success'=>false,'message'=>public_error_message($e)]); }