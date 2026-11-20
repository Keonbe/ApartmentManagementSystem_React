<?php
require_once __DIR__ . '/../cors.php';
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

require_once __DIR__ . "/../config.php";
require_once __DIR__ . "/../followups.php";

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
                TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) AS other_user_name,
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
                AND (? = '' OR TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) LIKE ? OR u.email_address LIKE ? OR EXISTS (
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
            'is_admin' => $row['other_user_role'] === 'admin',
            // Messages → Archived: someone not renting now (an applicant, a past
            // tenant) with no message for 6 months. Active tenants and admins never are.
            'archived' => !$row['is_active_tenant'] && $row['other_user_role'] !== 'admin'
                && $row['last_message_time'] !== null && strtotime($row['last_message_time']) < strtotime('-6 months'),
        ];
    }

    // What each conversation is about (SPRINT 226), one query per kind for the whole
    // list: the other person's own, or, in a tenant's chat with the office, the
    // tenant's. complaint = the latest problem report that is open or was resolved
    // in the last 7 days; inquiry = the latest inquiry that is open or finished in
    // the last 7 days. The chat shows them as a banner with the status.
    $ids = array_values(array_unique(array_merge([(int)$user_id], array_column($conversations, 'other_user_id'))));
    $complaints = [];
    $inquiries = [];
    if ($ids) {
        $in = implode(',', array_map('intval', $ids));
        $res = $conn->query("SELECT c.id, c.user_id, c.category, c.status, c.resolved_at,
                                    (SELECT m.resolution_answer IS NULL FROM messages m WHERE m.complaint_id = c.id AND m.kind = 'resolution_check' ORDER BY m.id DESC LIMIT 1) AS asking
                               FROM complaints c
                              WHERE c.user_id IN ($in) AND (c.status IN ('Open', 'In Review') OR c.resolved_at >= NOW() - INTERVAL 7 DAY)
                              ORDER BY c.id ASC");
        while ($res && ($c = $res->fetch_assoc())) {
            $complaints[(int)$c['user_id']] = ['id' => (int)$c['id'], 'category' => $c['category'], 'status' => $c['status'],
                'resolvedAt' => $c['resolved_at'], 'awaitingAnswer' => (bool)$c['asking'] && $c['status'] !== 'Resolved'];
        }
        $res = $conn->query("SELECT i.id, i.user_id, i.room_name, i.status, i.closed_reason,
                                    (SELECT m.resolution_answer IS NULL FROM messages m WHERE m.inquiry_id = i.id AND m.kind = 'resolution_check' ORDER BY m.id DESC LIMIT 1) AS asking
                               FROM inquiries i
                              WHERE i.user_id IN ($in) AND (i.status NOT IN ('Converted', 'Resolved', 'Closed') OR i.updated_at >= NOW() - INTERVAL 7 DAY)
                              ORDER BY i.id ASC");
        while ($res && ($r = $res->fetch_assoc())) {
            $inquiries[(int)$r['user_id']] = ['id' => (int)$r['id'], 'unit' => $r['room_name'], 'status' => $r['status'],
                'closedReason' => $r['closed_reason'], 'awaitingAnswer' => (bool)$r['asking'] && !in_array($r['status'], INQUIRY_DONE_STATUSES, true)];
        }
    }
    foreach ($conversations as $i => $conv) {
        // Always the non-office side: the tenant's own in a tenant's chat with the
        // office, the other person's in the admin's list.
        $who = ($conv['is_admin'] ?? false) ? (int)$user_id : (int)$conv['other_user_id'];
        $conversations[$i]['complaint'] = $complaints[$who] ?? null;
        $conversations[$i]['inquiry'] = $inquiries[$who] ?? null;
    }

    echo json_encode(["success" => true, "conversations" => $conversations]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => public_error_message($e)]);
}
$conn->close();
?>
