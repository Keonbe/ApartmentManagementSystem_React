<?php
require_once __DIR__ . '/../cors.php';
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
require_once __DIR__ . '/../config.php';

$auth = get_authenticated_user($conn);
$body = json_decode(file_get_contents('php://input'), true) ?: [];
$body = $_POST ?: $body;
$token = trim((string)($body['guest_token'] ?? $_SERVER['HTTP_X_GUEST_TOKEN'] ?? ''));
$threadId = (int)($body['thread_id'] ?? $_GET['thread_id'] ?? 0);
$isAdmin = $auth && $auth['role'] === 'admin';

try {
    if ($isAdmin) {
        if (!$threadId) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Missing thread_id']); exit; }
        $find = $conn->prepare("SELECT id, guest_name, guest_email, guest_phone, unit_of_interest, guest_verified_at FROM inquiries WHERE id = ? AND thread_type = 'guest'");
        $find->bind_param('i', $threadId);
    } else {
        if (strlen($token) !== 64 || !ctype_xdigit($token)) { http_response_code(401); echo json_encode(['success'=>false,'message'=>'Invalid guest token']); exit; }
        $find = $conn->prepare("SELECT id, guest_name, guest_email, guest_phone, unit_of_interest FROM inquiries WHERE guest_token = ? AND thread_type = 'guest'");
        $find->bind_param('s', $token);
    }
    $find->execute(); $thread = $find->get_result()->fetch_assoc(); $find->close();
    if (!$thread) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Conversation not found']); exit; }

    // "Did this answer your question?" (2026_11_guest_chat_resolution.sql).
    // The admin asks with action=resolution_check once they have replied; the
    // guest answers it with action=resolution_answer (resolved / not_yet). The
    // widget offers "End chat on this device" only after a resolved answer.
    $action = (string)($body['action'] ?? '');
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action !== '') {
        if ($action === 'resolution_check') {
            if (!$isAdmin) { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Only the admin can ask this.']); exit; }
            $conn->begin_transaction();
            // Locks the thread so two clicks (or two admins) cannot ask twice.
            $lock = $conn->prepare('SELECT id FROM inquiries WHERE id = ? FOR UPDATE');
            $lock->bind_param('i', $thread['id']); $lock->execute(); $lock->get_result(); $lock->close();
            $state = $conn->prepare("SELECT SUM(sender_role = 'admin' AND kind = 'text') AS replies, SUM(kind = 'resolution_check' AND resolution_answer IS NULL) AS open_checks FROM guest_messages WHERE inquiry_id = ?");
            $state->bind_param('i', $thread['id']); $state->execute(); $st = $state->get_result()->fetch_assoc(); $state->close();
            if ((int)$st['replies'] === 0) { $conn->rollback(); http_response_code(422); echo json_encode(['success'=>false,'message'=>'Answer the guest first, then ask if their question is resolved.']); exit; }
            if ((int)$st['open_checks'] > 0) { $conn->rollback(); http_response_code(409); echo json_encode(['success'=>false,'message'=>'The guest has not answered the last question yet.']); exit; }
            $text = 'Did this answer your question?';
            $adminId = (int)$auth['id'];
            $ins = $conn->prepare("INSERT INTO guest_messages (inquiry_id, sender_role, sender_id, kind, message, is_read) VALUES (?, 'admin', ?, 'resolution_check', ?, 0)");
            $ins->bind_param('iis', $thread['id'], $adminId, $text); $ins->execute(); $checkId = $ins->insert_id; $ins->close();
            $conn->commit();
            resolve_admin_queue($conn, 'inquiry', 'chat-' . $thread['id']);
            log_activity($conn, $adminId, 'inquiry', 'Asked Guest If Resolved', "Inquiry ID: {$thread['id']}");
            // Emailed like a reply: the guest is usually not on the site.
            $claim = $conn->prepare('UPDATE inquiries SET guest_reply_emailed_at = NOW() WHERE id = ? AND guest_reply_emailed_at IS NULL');
            $claim->bind_param('i', $thread['id']); $claim->execute();
            $claimed = $claim->affected_rows > 0; $claim->close();
            if ($claimed) guest_chat_email_link($conn, (int)$thread['id'], 'reply');
            echo json_encode(['success'=>true,'message'=>['id'=>$checkId,'inquiry_id'=>(int)$thread['id'],'sender_role'=>'admin','sender_id'=>$adminId,'kind'=>'resolution_check','message'=>$text,'resolution_answer'=>null,'created_at'=>date('Y-m-d H:i:s'),'is_read'=>0]]); exit;
        }
        if ($action === 'resolution_answer') {
            if ($isAdmin) { http_response_code(403); echo json_encode(['success'=>false,'message'=>'Only the guest can answer this.']); exit; }
            $checkId = (int)($body['message_id'] ?? 0);
            $answer = (string)($body['answer'] ?? '');
            if ($checkId <= 0 || !in_array($answer, ['resolved', 'not_yet'], true)) { http_response_code(422); echo json_encode(['success'=>false,'message'=>'Choose Problem resolved or Not yet.']); exit; }
            // Claim-first: only an unanswered question in this thread is updated.
            $upd = $conn->prepare("UPDATE guest_messages SET resolution_answer = ?, resolution_answered_at = NOW() WHERE id = ? AND inquiry_id = ? AND kind = 'resolution_check' AND resolution_answer IS NULL");
            $upd->bind_param('sii', $answer, $checkId, $thread['id']); $upd->execute(); $done = $upd->affected_rows > 0; $upd->close();
            if (!$done) {
                $exists = $conn->prepare("SELECT resolution_answer FROM guest_messages WHERE id = ? AND inquiry_id = ? AND kind = 'resolution_check'");
                $exists->bind_param('ii', $checkId, $thread['id']); $exists->execute(); $row = $exists->get_result()->fetch_assoc(); $exists->close();
                http_response_code($row ? 409 : 404);
                echo json_encode(['success'=>false,'message'=>$row ? 'You already answered this.' : 'Question not found.']); exit;
            }
            $who = $thread['guest_name'] ?: 'A guest';
            if ($answer === 'not_yet') {
                $queueKey = 'inquiry:chat-' . $thread['id'];
                $pending = $conn->prepare("SELECT id FROM notifications WHERE type = 'inquiry' AND metadata_value = ? AND status = 'Pending' LIMIT 1");
                $pending->bind_param('s', $queueKey); $pending->execute();
                $hasPending = (bool)$pending->get_result()->fetch_assoc(); $pending->close();
                if (!$hasPending) notify_admins_queue($conn, 'inquiry', 'chat-' . $thread['id'], 'Guest Still Needs Help', "$who answered \"Not yet\" in their inquiry chat.");
            }
            log_activity($conn, null, 'inquiry', 'Guest Answered Resolution Check', "Inquiry ID: {$thread['id']}; answer: $answer", 0);
            echo json_encode(['success'=>true,'answer'=>$answer]); exit;
        }
        http_response_code(422); echo json_encode(['success'=>false,'message'=>'Unknown action.']); exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!$isAdmin) {
            $limit = $conn->prepare("SELECT COUNT(*) c FROM guest_messages WHERE inquiry_id = ? AND sender_role = 'guest' AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)");
            $limit->bind_param('i', $thread['id']); $limit->execute(); $count = (int)$limit->get_result()->fetch_assoc()['c']; $limit->close();
            if ($count >= 20) { http_response_code(429); echo json_encode(['success'=>false,'message'=>'Message limit reached. Try again later.']); exit; }
        }
        $message = trim((string)($body['message'] ?? ''));
        $replyToId = (int)($body['reply_to_id'] ?? $body['reply_to_message_id'] ?? 0);
        if ($replyToId > 0) {
            $replyCheck = $conn->prepare('SELECT id FROM guest_messages WHERE id = ? AND inquiry_id = ?');
            $replyCheck->bind_param('ii', $replyToId, $thread['id']);
            $replyCheck->execute();
            $validReply = $replyCheck->get_result()->fetch_assoc();
            $replyCheck->close();
            if (!$validReply) { http_response_code(422); echo json_encode(['success'=>false,'message'=>'Reply target not found']); exit; }
        } else { $replyToId = null; }
        $attachment = $_FILES['attachment'] ?? null;
        if ($attachment && ($attachment['error'] === UPLOAD_ERR_INI_SIZE || $attachment['error'] === UPLOAD_ERR_FORM_SIZE)) { http_response_code(413); echo json_encode(['success'=>false,'message'=>'Attachment exceeds its size limit.']); exit; }
        if ($attachment && $attachment['error'] !== UPLOAD_ERR_OK) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Attachment upload failed.']); exit; }
        if (($message === '' && !$attachment) || mb_strlen($message) > 4000) { http_response_code(422); echo json_encode(['success'=>false,'message'=>'Message must contain up to 4000 characters, or include an attachment.']); exit; }
        $attachmentPath = null;
        if ($attachment) {
            $finfo = new finfo(FILEINFO_MIME_TYPE); $mime = $finfo->file($attachment['tmp_name']);
            $allowed = ['image/jpeg'=>'jpg','image/png'=>'png','image/gif'=>'gif','image/webp'=>'webp','video/mp4'=>'mp4','video/webm'=>'webm','video/quicktime'=>'mov'];
            if (!isset($allowed[$mime])) { http_response_code(415); echo json_encode(['success'=>false,'message'=>'Only supported image and video files are allowed.']); exit; }
            $isVideo = str_starts_with($mime, 'video/'); $maxBytes = ($isVideo ? 25 : 10) * 1024 * 1024;
            if ($attachment['size'] <= 0 || $attachment['size'] > $maxBytes) { http_response_code(413); echo json_encode(['success'=>false,'message'=>'Attachment exceeds its size limit.']); exit; }
            $uploadDir = UPLOADS_DIR . '/messages';
            if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) throw new Exception('Unable to create message upload directory');
            $filename = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
            if (!move_uploaded_file($attachment['tmp_name'], $uploadDir . '/' . $filename)) throw new Exception('Unable to save message attachment');
            $attachmentPath = 'uploads/messages/' . $filename;
        }
        $role = $isAdmin ? 'admin' : 'guest'; $senderId = $isAdmin ? (int)$auth['id'] : null;
        $insert = $conn->prepare('INSERT INTO guest_messages (inquiry_id, sender_role, sender_id, message, attachment_path, reply_to_id, is_read) VALUES (?, ?, ?, ?, ?, ?, 0)');
        if (!$insert) throw new Exception('Unable to prepare guest message insert: ' . $conn->error);
        $insert->bind_param('isissi', $thread['id'], $role, $senderId, $message, $attachmentPath, $replyToId);
        $insert->execute();
        $newMessageId = $insert->insert_id;
        $insert->close();
        if ($isAdmin) {
            resolve_admin_queue($conn, 'inquiry', 'chat-' . $thread['id']);
            log_activity($conn, (int)$auth['id'], 'inquiry', 'Replied To Guest Chat', "Inquiry ID: {$thread['id']}");
        } else {
            // One pending bell entry per thread, not one per message; it clears when an admin opens the thread.
            $queueKey = 'inquiry:chat-' . $thread['id'];
            $pending = $conn->prepare("SELECT id FROM notifications WHERE type = 'inquiry' AND metadata_value = ? AND status = 'Pending' LIMIT 1");
            $pending->bind_param('s', $queueKey); $pending->execute();
            $hasPending = (bool)$pending->get_result()->fetch_assoc(); $pending->close();
            if (!$hasPending) {
                $who = $thread['guest_name'] ?: 'A guest';
                notify_admins_queue($conn, 'inquiry', 'chat-' . $thread['id'], 'New Guest Message', "$who sent a message in their inquiry chat.");
            }
            log_activity($conn, null, 'inquiry', 'Guest Chat Message Sent', "Inquiry ID: {$thread['id']}", 0);
        }
        if ($message !== '') {
            $updateInquiry = $conn->prepare('UPDATE inquiries SET message = ? WHERE id = ?');
            if (!$updateInquiry) throw new Exception('Unable to prepare inquiry preview update: ' . $conn->error);
            $updateInquiry->bind_param('si', $message, $thread['id']);
            $updateInquiry->execute();
            $updateInquiry->close();
        }
        if ($isAdmin) {
            // The guest is usually not on the site: email them a link, once per
            // batch of replies they have not seen (reset when they open the chat).
            $claim = $conn->prepare('UPDATE inquiries SET guest_reply_emailed_at = NOW() WHERE id = ? AND guest_reply_emailed_at IS NULL');
            $claim->bind_param('i', $thread['id']); $claim->execute();
            $claimed = $claim->affected_rows > 0; $claim->close();
            if ($claimed) guest_chat_email_link($conn, (int)$thread['id'], 'reply');
        }
        echo json_encode(['success'=>true,'message'=>['id'=>$newMessageId,'inquiry_id'=>(int)$thread['id'],'sender_role'=>$role,'sender_id'=>$senderId,'message'=>$message,'attachment_path'=>$attachmentPath,'reply_to_id'=>$replyToId,'created_at'=>date('Y-m-d H:i:s'),'is_read'=>0]]); exit;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); echo json_encode(['success'=>false,'message'=>'Method not allowed']); exit; }
    // Opening a thread acknowledges only messages sent by the other party.
    // Guest polling is deliberately gated by the widget's open state in ChatWidget.
    $receivedRole = $isAdmin ? 'guest' : 'admin';
    $markRead = $conn->prepare('UPDATE guest_messages SET is_read = 1 WHERE inquiry_id = ? AND sender_role = ? AND is_read = 0');
    if (!$markRead) throw new Exception('Unable to prepare guest read receipt update: ' . $conn->error);
    $markRead->bind_param('is', $thread['id'], $receivedRole);
    $markRead->execute();
    $markRead->close();
    if ($isAdmin) resolve_admin_queue($conn, 'inquiry', 'chat-' . $thread['id']);
    else {
        // The guest has seen the replies: the next admin reply emails them again.
        $seen = $conn->prepare('UPDATE inquiries SET guest_reply_emailed_at = NULL WHERE id = ?');
        $seen->bind_param('i', $thread['id']); $seen->execute(); $seen->close();
    }

    $q = $conn->prepare("SELECT m.id, m.inquiry_id, m.sender_role, m.sender_id, m.kind, m.resolution_answer, m.resolution_answered_at, m.message, m.attachment_path, m.attachment_path AS file_path, m.attachment_path AS attachment_url, m.attachment_path AS media_url, m.created_at, m.is_read, m.reply_to_id, r.message AS reply_message, r.attachment_path AS reply_attachment_path, r.attachment_path AS reply_file_path, r.attachment_path AS reply_attachment_url, r.sender_id AS reply_sender_id, r.sender_role AS reply_sender_role, r.sender_id AS reply_sender_name FROM guest_messages m LEFT JOIN guest_messages r ON r.id = m.reply_to_id AND r.inquiry_id = m.inquiry_id WHERE m.inquiry_id = ? ORDER BY m.id ASC");
    if (!$q) throw new Exception('Unable to prepare guest history query: ' . $conn->error);
    $q->bind_param('i', $thread['id']); $q->execute(); $messages = $q->get_result()->fetch_all(MYSQLI_ASSOC); $q->close();
    if (!$messages) {
        $legacy = $conn->prepare("SELECT message, created_at FROM inquiries WHERE id = ? AND message <> ''");
        if (!$legacy) throw new Exception('Unable to prepare inquiry fallback query: ' . $conn->error);
        $legacy->bind_param('i', $thread['id']); $legacy->execute();
        if ($row = $legacy->get_result()->fetch_assoc()) $messages[] = ['id'=>'inquiry-'.$thread['id'],'inquiry_id'=>(int)$thread['id'],'sender_role'=>'guest','sender_id'=>null,'message'=>$row['message'],'attachment_path'=>null,'file_path'=>null,'attachment_url'=>null,'media_url'=>null,'reply_to_id'=>null,'created_at'=>$row['created_at'],'is_read'=>1];
        $legacy->close();
    }
    // The latest "Did this answer your question?" decides: resolved = the guest
    // said so (they may then end the chat on their device); awaiting = not answered yet.
    $thread['resolved'] = false;
    $thread['awaiting_answer'] = false;
    for ($i = count($messages) - 1; $i >= 0; $i--) {
        if (($messages[$i]['kind'] ?? 'text') !== 'resolution_check') continue;
        $thread['resolved'] = ($messages[$i]['resolution_answer'] ?? null) === 'resolved';
        $thread['awaiting_answer'] = ($messages[$i]['resolution_answer'] ?? null) === null;
        break;
    }
    echo json_encode(['success'=>true,'thread'=>$thread,'messages'=>$messages]);
} catch (Throwable $e) { http_response_code(500); echo json_encode(['success'=>false,'message'=>public_error_message($e)]); }