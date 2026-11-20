<?php
// Follow-ups that ride on a chat (SPRINT 226): inquiries and problem reports
// (complaints) both end through the conversation.
//   • The office asks "Is it resolved?" in the chat (messages.kind =
//     'resolution_check'; a guest chat has its own in guest_messages). The
//     tenant / prospect answers: Resolved finishes the inquiry (status Resolved)
//     or the report (Resolved); Not yet puts it back in the admin queue.
//   • The office can resolve either directly; a tenant can mark their own
//     report fixed.
//   • A sweep finishes the quiet ones (settings inquiry_auto_close_days,
//     complaint_auto_resolve_days; 0 = never).
// Requires config.php and inquiries.php.
require_once __DIR__ . '/inquiries.php';

const RESOLUTION_QUESTION_INQUIRY = 'Did this answer your question?';
const RESOLUTION_QUESTION_COMPLAINT = 'Is the problem fixed?';

// A report the tenant or the office says is fixed. $by_admin: the admin id, or
// null when the tenant said so. Returns true when it moved the report.
function resolve_complaint($conn, $complaint_id, $by_admin = null, $note = null) {
    $id = (int)$complaint_id;
    $stmt = $conn->prepare("SELECT id, user_id, category, status FROM complaints WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row || !in_array($row['status'], COMPLAINT_OPEN_STATUSES, true)) return false;

    $admin = $by_admin !== null ? (int)$by_admin : null;
    $upd = $conn->prepare("UPDATE complaints SET status = 'Resolved', resolved_at = NOW(), resolved_by = ? WHERE id = ? AND status IN ('Open', 'In Review')");
    $upd->bind_param('ii', $admin, $id);
    $upd->execute();
    $moved = $upd->affected_rows > 0;
    $upd->close();
    if (!$moved) return false;

    resolve_admin_queue($conn, 'complaint', $id);
    resolve_admin_queue($conn, 'complaint', 'still-' . $id);
    if ($admin !== null) {
        create_notification($conn, (int)$row['user_id'], 'complaint_update', 'Problem Report Update',
            "Your report #$id ({$row['category']}) is marked resolved." . ($note ? " $note" : '') . ' Message us if it still needs attention.',
            'Resolved', "complaint:$id");
    }
    log_activity($conn, $admin, 'tenant', $admin !== null ? 'Resolved Problem Report' : 'Tenant Confirmed Report Fixed', "Complaint #$id ({$row['category']})", $admin ?? 0);
    return true;
}

// Reports the office answered last and the tenant left for complaint_auto_resolve_days.
function resolve_stale_complaints($conn) {
    $days = max(0, min(365, (int)get_setting($conn, 'complaint_auto_resolve_days', 14)));
    if ($days === 0) return 0;
    $stmt = $conn->prepare("SELECT c.id FROM complaints c
        WHERE c.status IN ('Open', 'In Review')
          AND (SELECT u.role FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.complaint_id = c.id ORDER BY m.id DESC LIMIT 1) = 'admin'
          AND (SELECT MAX(m.created_at) FROM messages m WHERE m.complaint_id = c.id) < NOW() - INTERVAL ? DAY
        LIMIT 200");
    $stmt->bind_param('i', $days);
    $stmt->execute();
    $ids = array_column($stmt->get_result()->fetch_all(MYSQLI_ASSOC), 'id');
    $stmt->close();
    $done = 0;
    foreach ($ids as $id) {
        if (resolve_complaint($conn, (int)$id, null)) {
            $done++;
            $row = $conn->query("SELECT user_id, category FROM complaints WHERE id = " . (int)$id)->fetch_assoc();
            create_notification($conn, (int)$row['user_id'], 'complaint_update', 'Problem Report Update',
                "Your report #$id ({$row['category']}) was marked resolved after $days days without a reply. Message us if it still needs attention.",
                'Resolved', "complaint:$id");
        }
    }
    return $done;
}

// Both sweeps; get_inquiries.php, get_conversations.php (admin) and the cron queue run it.
// Cheap when nothing is due: one query each.
function run_followup_sweep($conn) {
    try {
        close_stale_inquiries($conn);
        resolve_stale_complaints($conn);
    } catch (Throwable $e) {
        // A sweep must never break the page that triggered it.
        error_log('followup sweep: ' . $e->getMessage());
    }
}

// The office asks in an account chat whether an inquiry / a report is resolved.
// Returns [http_code, body]. Refused when the office has not answered yet, when a
// question is still waiting, or when it is already finished.
function ask_resolution($conn, $admin_id, $topic, $topic_id) {
    $admin = (int)$admin_id;
    $id = (int)$topic_id;
    if ($topic === 'inquiry') {
        $stmt = $conn->prepare("SELECT id, user_id, status, created_at FROM inquiries WHERE id = ? FOR UPDATE");
    } else {
        $stmt = $conn->prepare("SELECT id, user_id, status, created_at FROM complaints WHERE id = ? FOR UPDATE");
    }
    $conn->begin_transaction();
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) { $conn->rollback(); return [404, ['success' => false, 'message' => $topic === 'inquiry' ? 'That inquiry no longer exists.' : 'That report no longer exists.']]; }
    if (empty($row['user_id'])) { $conn->rollback(); return [422, ['success' => false, 'message' => 'This inquiry has no account chat. Ask in its guest chat.']]; }
    $finished = $topic === 'inquiry' ? in_array($row['status'], INQUIRY_DONE_STATUSES, true) : !in_array($row['status'], COMPLAINT_OPEN_STATUSES, true);
    if ($finished) { $conn->rollback(); return [409, ['success' => false, 'message' => "It is already {$row['status']}."]]; }
    $uid = (int)$row['user_id'];
    $col = $topic === 'inquiry' ? 'inquiry_id' : 'complaint_id';

    // The office must have answered first (any office message to them since it started).
    $since = $row['created_at'];
    $q = $conn->prepare("SELECT COUNT(*) AS c FROM messages m JOIN users u ON u.id = m.sender_id AND u.role = 'admin' WHERE m.receiver_id = ? AND m.kind = 'text' AND m.created_at >= ?");
    $q->bind_param('is', $uid, $since);
    $q->execute();
    $replies = (int)$q->get_result()->fetch_assoc()['c'];
    $q->close();
    if ($replies === 0) { $conn->rollback(); return [422, ['success' => false, 'message' => 'Answer them first, then ask if it is resolved.']]; }

    $q = $conn->prepare("SELECT COUNT(*) AS c FROM messages WHERE $col = ? AND kind = 'resolution_check' AND resolution_answer IS NULL");
    $q->bind_param('i', $id);
    $q->execute();
    $waiting = (int)$q->get_result()->fetch_assoc()['c'];
    $q->close();
    if ($waiting > 0) { $conn->rollback(); return [409, ['success' => false, 'message' => 'They have not answered the last question yet.']]; }

    $text = $topic === 'inquiry' ? RESOLUTION_QUESTION_INQUIRY : RESOLUTION_QUESTION_COMPLAINT;
    $ins = $conn->prepare("INSERT INTO messages (sender_id, receiver_id, message, kind, $col) VALUES (?, ?, ?, 'resolution_check', ?)");
    $ins->bind_param('iisi', $admin, $uid, $text, $id);
    $ins->execute();
    $mid = (int)$conn->insert_id;
    $ins->close();
    $conn->commit();
    log_activity($conn, $admin, $topic === 'inquiry' ? 'inquiry' : 'tenant', 'Asked If Resolved', ucfirst($topic) . " #$id");
    return [200, ['success' => true, 'message' => [
        'id' => $mid, 'sender_id' => $admin, 'receiver_id' => $uid, 'message' => $text, 'kind' => 'resolution_check',
        'resolution_answer' => null, $col => $id, 'created_at' => date('Y-m-d H:i:s'), 'is_read' => 0,
    ]]];
}

// The tenant / prospect answers the office's question. Returns [http_code, body].
function answer_resolution($conn, $user_id, $message_id, $answer) {
    $uid = (int)$user_id;
    $mid = (int)$message_id;
    if ($mid <= 0 || !in_array($answer, ['resolved', 'not_yet'], true)) {
        return [422, ['success' => false, 'message' => 'Choose Resolved or Not yet.']];
    }
    // Claim-first: only an unanswered question sent to this user.
    $upd = $conn->prepare("UPDATE messages SET resolution_answer = ?, resolution_answered_at = NOW(), is_read = 1
                           WHERE id = ? AND receiver_id = ? AND kind = 'resolution_check' AND resolution_answer IS NULL");
    $upd->bind_param('sii', $answer, $mid, $uid);
    $upd->execute();
    $claimed = $upd->affected_rows > 0;
    $upd->close();
    $q = $conn->prepare("SELECT inquiry_id, complaint_id, resolution_answer FROM messages WHERE id = ? AND receiver_id = ? AND kind = 'resolution_check'");
    $q->bind_param('ii', $mid, $uid);
    $q->execute();
    $row = $q->get_result()->fetch_assoc();
    $q->close();
    if (!$row) return [404, ['success' => false, 'message' => 'Question not found.']];
    if (!$claimed) return [409, ['success' => false, 'message' => 'You already answered this.']];

    $who = person_name($conn->query("SELECT first_name, last_name, suffix FROM users WHERE id = $uid")->fetch_assoc() ?: []) ?: 'A tenant';
    if ($answer === 'resolved') {
        if ($row['inquiry_id']) resolve_inquiry_by_prospect($conn, (int)$row['inquiry_id']);
        if ($row['complaint_id']) resolve_complaint($conn, (int)$row['complaint_id'], null);
    } else {
        if ($row['inquiry_id']) notify_admins_queue($conn, 'inquiry', (int)$row['inquiry_id'], 'Prospect Still Needs Help', "$who answered \"Not yet\" about their inquiry.");
        if ($row['complaint_id']) notify_admins_queue($conn, 'complaint', 'still-' . (int)$row['complaint_id'], 'Problem Not Fixed Yet', "$who said their report #{$row['complaint_id']} is not fixed yet.");
    }
    log_activity($conn, $uid, 'tenant', 'Answered Resolution Check', "Message #$mid: $answer");
    return [200, ['success' => true, 'answer' => $answer]];
}
