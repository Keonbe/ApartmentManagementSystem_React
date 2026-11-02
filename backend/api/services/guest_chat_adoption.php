<?php
// Moves a guest chat thread into `messages` for $userId. The guest's messages
// become the user's, the admin's replies stay the admin's, and reply links,
// timestamps, read flags and attachments carry over. All or nothing; a failure
// leaves the thread as a guest thread and never blocks the sign-in.
function adopt_guest_chat($conn, $userId, $token) {
    $conn->begin_transaction();
    try {
        $find = $conn->prepare("SELECT id FROM inquiries WHERE guest_token = ? AND thread_type = 'guest' LIMIT 1 FOR UPDATE");
        $find->bind_param('s', $token);
        $find->execute();
        $thread = $find->get_result()->fetch_assoc();
        $find->close();
        $rows = [];
        if ($thread) {
            $load = $conn->prepare('SELECT id, sender_role, sender_id, message, attachment_path, reply_to_id, is_read, created_at FROM guest_messages WHERE inquiry_id = ? ORDER BY id');
            $load->bind_param('i', $thread['id']);
            $load->execute();
            $rows = $load->get_result()->fetch_all(MYSQLI_ASSOC);
            $load->close();
        }
        $fallback = $conn->query("SELECT id FROM users WHERE role = 'admin' AND is_archived = 0 ORDER BY id LIMIT 1")->fetch_assoc();
        if (!$thread || !$rows || !$fallback) { $conn->rollback(); return; }

        // The admin who answered owns the thread; guest messages go to them.
        $threadAdmin = (int)$fallback['id'];
        foreach ($rows as $r) if ($r['sender_role'] === 'admin' && $r['sender_id']) { $threadAdmin = (int)$r['sender_id']; break; }

        $insert = $conn->prepare('INSERT INTO messages (sender_id, receiver_id, message, created_at, is_read, attachment_path, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $newIds = [];
        foreach ($rows as $r) {
            $fromGuest = $r['sender_role'] === 'guest';
            $sender = $fromGuest ? $userId : ((int)$r['sender_id'] ?: $threadAdmin);
            $receiver = $fromGuest ? $threadAdmin : $userId;
            $reply = $r['reply_to_id'] ? ($newIds[(int)$r['reply_to_id']] ?? null) : null;
            $read = (int)$r['is_read'];
            $insert->bind_param('iissisi', $sender, $receiver, $r['message'], $r['created_at'], $read, $r['attachment_path'], $reply);
            if (!$insert->execute()) throw new Exception('message copy failed: ' . $insert->error);
            $newIds[(int)$r['id']] = $insert->insert_id;
        }
        $insert->close();

        $done = $conn->prepare("UPDATE inquiries SET user_id = ?, thread_type = 'registered', guest_token = NULL WHERE id = ?");
        $done->bind_param('ii', $userId, $thread['id']);
        $done->execute();
        $done->close();
        $drop = $conn->prepare('DELETE FROM guest_messages WHERE inquiry_id = ?');
        $drop->bind_param('i', $thread['id']);
        $drop->execute();
        $drop->close();
        $conn->commit();
        log_activity($conn, $userId, 'inquiry', 'Guest Chat Linked To Account', 'Inquiry ID: ' . $thread['id'] . ', messages: ' . count($rows), $userId);
    } catch (Throwable $e) {
        $conn->rollback();
        error_log('adopt_guest_chat: ' . $e->getMessage());
    }
}
