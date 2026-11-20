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
    // SPRINT 206: the caller's messages are read once, through idx_messages_sender_receiver_created
    // and idx_messages_receiver_sender_created (one half each, so no OR), and ranked per
    // partner with a window function. Before, about nine correlated subqueries ran for
    // every row of users, each filtering messages with an OR and sorting by time.
    $thread_messages = "SELECT receiver_id AS partner, id, sender_id, message, attachment_path, created_at, is_read
                          FROM messages WHERE sender_id = ? AND receiver_id <> ?
                        UNION ALL
                        SELECT sender_id AS partner, id, sender_id, message, attachment_path, created_at, is_read
                          FROM messages WHERE receiver_id = ? AND sender_id <> ?";

    $query = "SELECT
                u.id AS other_user_id,
                TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) AS other_user_name,
                u.avatar_url AS other_user_avatar,
                u.email_address AS other_user_email,
                l.message AS last_message,
                l.attachment_path AS last_message_attachment_path,
                l.sender_id AS last_message_sender_id,
                l.created_at AS last_message_time,
                l.unread_count,
                u.role AS other_user_role,
                EXISTS (
                    SELECT 1 FROM rent_applications ra
                    WHERE ra.user_id = u.id AND LOWER(ra.status) IN ('active', 'pending-move-out', 'approved')
                ) AS is_active_tenant,
                (TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) LIKE ? OR u.email_address LIKE ?) AS name_hit
              FROM (
                SELECT partner, message, attachment_path, sender_id, created_at,
                       ROW_NUMBER() OVER (PARTITION BY partner ORDER BY created_at DESC, id DESC) AS rn,
                       SUM(CASE WHEN sender_id = partner AND is_read = 0 THEN 1 ELSE 0 END) OVER (PARTITION BY partner) AS unread_count
                FROM ($thread_messages) tm
              ) l
              JOIN users u ON u.id = l.partner
              WHERE l.rn = 1
              ORDER BY l.created_at DESC, u.first_name ASC, u.last_name ASC";

    $like_search = '%' . addcslashes($search, '%_\\') . '%';
    $stmt = $conn->prepare($query);
    // The two LIKE markers are in the select list, so they come before the four in the subquery.
    $stmt->bind_param("ssiiii", $like_search, $like_search, $user_id, $user_id, $user_id, $user_id);
    $stmt->execute();
    $result = $stmt->get_result();

    // With a search: the newest message of each thread that contains the text.
    $matches = [];
    if ($search !== '') {
        $mq = $conn->prepare("SELECT partner, id, message FROM (
                                SELECT partner, id, message,
                                       ROW_NUMBER() OVER (PARTITION BY partner ORDER BY created_at DESC, id DESC) AS rn
                                FROM ($thread_messages) tm
                                WHERE message LIKE ?
                              ) h WHERE rn = 1");
        $mq->bind_param("iiiis", $user_id, $user_id, $user_id, $user_id, $like_search);
        $mq->execute();
        foreach ($mq->get_result()->fetch_all(MYSQLI_ASSOC) as $m) {
            $matches[(int) $m['partner']] = $m;
        }
        $mq->close();
    }

    $conversations = [];
    while ($row = $result->fetch_assoc()) {
        $partner = (int) $row['other_user_id'];
        // A search keeps the threads whose person (name, email) or any message matches.
        if ($search !== '' && !(int) $row['name_hit'] && !isset($matches[$partner])) continue;
        $conversations[] = [
            'other_user_id' => $partner,
            'other_user_name' => $row['other_user_name'],
            'other_user_avatar' => $row['other_user_avatar'],
            'other_user_email' => $row['other_user_email'],
            'matched_message' => $matches[$partner]['message'] ?? null,
            'matched_message_id' => isset($matches[$partner]) ? (int) $matches[$partner]['id'] : null,
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
    $stmt->close();

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
