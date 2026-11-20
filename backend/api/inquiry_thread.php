<?php
// The Inquiries chat window: one inquiry with its conversation, for the admin.
//   GET ?id=N  → { inquiry, channel, canReply, noReplyReason, messages[] }
// Opening it marks the inquiry seen (backend/inquiries.php): it stops counting
// as New in the list, the sidebar and the bell. It also marks the prospect's
// messages read, like opening the chat in Messages does.
//
// Replies go through the chat's own endpoint, which then marks a New inquiry
// Contacted: guest_chat.php (thread_id = the inquiry) for a guest chat,
// send_message.php with inquiry_id for an account holder.
//
// messages[]: { id, from: 'prospect'|'admin', kind: 'inquiry'|'text'|'resolution_check',
//               text, attachment, createdAt, resolutionAnswer }
// The first entry is the inquiry itself (what the form said), unless the guest
// chat already starts with it.
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";
require_once __DIR__ . '/../inquiries.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
// Who is asking first (an anonymous or tenant caller learns nothing, whatever the method).
$admin_id = (int)require_admin($conn);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed"]);
    exit();
}
$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Choose an inquiry.", "errors" => ["id" => "Choose an inquiry."]]);
    exit();
}

try {
    $stmt = $conn->prepare("SELECT id, user_id, full_name, email, contact_no, room_name, occupants, preferred_move_in, message, source, status,
                                   viewing_date, admin_notes, closed_reason, created_at, thread_type, guest_chat_ended_at, matched_thread_id, admin_seen_at
                            FROM inquiries WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $inq = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$inq) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "That inquiry no longer exists."]);
        exit();
    }

    $channel = inquiry_channel($inq);
    $messages = [];
    // What the inquiry form said, as the first bubble.
    $opening = [
        'id' => 'inquiry-' . $inq['id'], 'from' => 'prospect', 'kind' => 'inquiry',
        'text' => (string)($inq['message'] ?? ''), 'attachment' => null,
        'createdAt' => $inq['created_at'], 'resolutionAnswer' => null,
    ];

    if ($channel === 'guest') {
        $q = $conn->prepare("SELECT id, sender_role, kind, message, attachment_path, created_at, resolution_answer
                             FROM guest_messages WHERE inquiry_id = ? ORDER BY id ASC");
        $q->bind_param('i', $inq['id']);
        $q->execute();
        foreach ($q->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
            $messages[] = [
                'id' => 'g' . $row['id'], 'from' => $row['sender_role'] === 'admin' ? 'admin' : 'prospect',
                'kind' => $row['kind'] ?: 'text', 'text' => (string)$row['message'], 'attachment' => $row['attachment_path'],
                'createdAt' => $row['created_at'], 'resolutionAnswer' => $row['resolution_answer'],
            ];
        }
        $q->close();
        // submit_inquiry.php stores the opening message as the first guest message;
        // guest_chat.php overwrites inquiries.message with the latest one, so only
        // an old thread without messages falls back to it.
        if (!$messages) $messages[] = $opening;
        else $messages[0]['kind'] = $messages[0]['from'] === 'prospect' ? 'inquiry' : $messages[0]['kind'];

        $read = $conn->prepare("UPDATE guest_messages SET is_read = 1 WHERE inquiry_id = ? AND sender_role = 'guest' AND is_read = 0");
        $read->bind_param('i', $inq['id']);
        $read->execute();
        $read->close();
        resolve_admin_queue($conn, 'inquiry', 'chat-' . $inq['id']);
    } else {
        $messages[] = $opening;
        if ($channel === 'account') {
            $uid = (int)$inq['user_id'];
            // The account conversation between this prospect and the signed-in
            // admin (as in Messages), from the day of the inquiry on.
            $q = $conn->prepare("SELECT id, sender_id, message, attachment_path, created_at FROM messages
                                 WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
                                   AND created_at >= ?
                                 ORDER BY created_at ASC, id ASC LIMIT 300");
            $since = $inq['created_at'];
            $q->bind_param('iiiis', $uid, $admin_id, $admin_id, $uid, $since);
            $q->execute();
            foreach ($q->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
                $messages[] = [
                    'id' => 'm' . $row['id'], 'from' => (int)$row['sender_id'] === $uid ? 'prospect' : 'admin',
                    'kind' => 'text', 'text' => (string)$row['message'], 'attachment' => $row['attachment_path'],
                    'createdAt' => $row['created_at'], 'resolutionAnswer' => null,
                ];
            }
            $q->close();
            $read = $conn->prepare("UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0");
            $read->bind_param('ii', $uid, $admin_id);
            $read->execute();
            $read->close();
        }
    }

    $firstView = mark_inquiry_seen($conn, $inq['id']);
    if ($firstView) $inq['admin_seen_at'] = date('Y-m-d H:i:s');

    $canReply = $channel !== 'none' && !($channel === 'guest' && !empty($inq['guest_chat_ended_at']));
    $noReplyReason = null;
    if ($channel === 'guest' && !$canReply) {
        $noReplyReason = 'The guest ended this chat. Reply by phone or email.';
    } elseif ($channel === 'none') {
        $noReplyReason = !empty($inq['matched_thread_id'])
            ? 'Sent without signing in, with the email or phone of an existing chat. The sender is not verified, so it has no chat: reply by phone or email.'
            : (in_array($inq['source'], ['walk-in', 'phone'], true)
                ? 'Logged by the office. Reply by phone or email, then mark it contacted.'
                : 'This inquiry has no chat. Reply by phone or email, then mark it contacted.');
    }

    echo json_encode([
        "success" => true,
        "inquiry" => [
            'id' => (int)$inq['id'],
            'userId' => $inq['user_id'] !== null ? (int)$inq['user_id'] : null,
            'status' => $inq['status'],
            'adminSeenAt' => $inq['admin_seen_at'],
            'chatEnded' => !empty($inq['guest_chat_ended_at']),
        ],
        "channel" => $channel,
        "canReply" => $canReply,
        "noReplyReason" => $noReplyReason,
        "messages" => $messages,
    ]);
} catch (Throwable $e) {
    server_error_response($e, 'Could not load this inquiry. Please try again.');
}
