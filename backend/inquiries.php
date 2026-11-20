<?php
// Inquiry follow-up rules shared by the Inquiries chat window (inquiry_thread.php),
// the guest chat (guest_chat.php) and account messages (send_message.php).
// Requires config.php (resolve_admin_queue, log_activity).
//
//   Seen:      an admin opening the inquiry (or its guest chat) sets admin_seen_at.
//              "New" in the list, the sidebar count and the bell entry only cover
//              inquiries nobody has opened yet. The status itself stays New.
//   Contacted: an admin reply in the inquiry's own chat moves a New inquiry to
//              Contacted. Later statuses (Scheduled, Reserved, Closed …) are never
//              touched, and a reply to an account holder only counts when it was
//              sent for that inquiry (send_message.php with inquiry_id).

// The chat an inquiry can be answered in:
//   guest    a signed-out visitor's chat thread (guest_messages)
//   account  the prospect's account conversation (messages)
//   none     no chat: logged by the office (walk-in / phone), or sent signed-out
//            with the email or phone of an existing chat (unverified, so it was
//            not joined to that chat). Reply by phone or email.
function inquiry_channel(array $inq) {
    if (($inq['thread_type'] ?? '') === 'guest') return 'guest';
    if (!empty($inq['user_id'])) return 'account';
    return 'none';
}

// Marks the inquiry seen by the office once; returns true the first time.
function mark_inquiry_seen($conn, $inquiry_id) {
    $id = (int)$inquiry_id;
    $stmt = $conn->prepare("UPDATE inquiries SET admin_seen_at = NOW() WHERE id = ? AND admin_seen_at IS NULL");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $first = $stmt->affected_rows > 0;
    $stmt->close();
    // The "New Unit Inquiry" bell entry is answered by looking at it.
    resolve_admin_queue($conn, 'inquiry', $id);
    return $first;
}

// An admin replied in the inquiry's chat: New becomes Contacted (once).
function mark_inquiry_contacted($conn, $inquiry_id, $admin_id) {
    $id = (int)$inquiry_id;
    $admin = (int)$admin_id;
    $stmt = $conn->prepare("UPDATE inquiries SET status = 'Contacted', handled_by = ?, admin_seen_at = COALESCE(admin_seen_at, NOW()) WHERE id = ? AND status = 'New'");
    $stmt->bind_param('ii', $admin, $id);
    $stmt->execute();
    $moved = $stmt->affected_rows > 0;
    $stmt->close();
    if ($moved) {
        resolve_admin_queue($conn, 'inquiry', $id);
        log_activity($conn, $admin, 'inquiry', 'Inquiry Contacted By Reply', "Inquiry ID: $id");
    }
    return $moved;
}

// ── Finishing an inquiry (SPRINT 226) ──
// Resolved = their question was answered (a good end); Closed = they dropped out.
// Converted, Resolved and Closed are finished: nothing below moves them again.
const INQUIRY_DONE_STATUSES = ['Converted', 'Resolved', 'Closed'];

// A finished inquiry no longer waits for a unit (same as update_inquiry_status.php).
function inquiry_release_waitlist($conn, $inquiry_id) {
    $id = (int)$inquiry_id;
    $wl = $conn->prepare("SELECT id FROM unit_waitlist WHERE inquiry_id = ? AND status IN ('Waiting', 'Notified')");
    $wl->bind_param('i', $id);
    $wl->execute();
    $ids = array_column($wl->get_result()->fetch_all(MYSQLI_ASSOC), 'id');
    $wl->close();
    if (!$ids) return;
    $upd = $conn->prepare("UPDATE unit_waitlist SET status = 'Removed' WHERE inquiry_id = ? AND status IN ('Waiting', 'Notified')");
    $upd->bind_param('i', $id);
    $upd->execute();
    $upd->close();
    foreach ($ids as $wl_id) resolve_admin_queue($conn, 'unit_waitlist', (int)$wl_id);
}

// The prospect said their question is answered ("Problem resolved" in their chat).
// Returns true when it moved the inquiry to Resolved.
function resolve_inquiry_by_prospect($conn, $inquiry_id) {
    $id = (int)$inquiry_id;
    $reason = 'The prospect said their question is answered';
    $stmt = $conn->prepare("UPDATE inquiries SET status = 'Resolved', closed_reason = ?, admin_seen_at = COALESCE(admin_seen_at, NOW())
                            WHERE id = ? AND status NOT IN ('Converted', 'Resolved', 'Closed')");
    $stmt->bind_param('si', $reason, $id);
    $stmt->execute();
    $moved = $stmt->affected_rows > 0;
    $stmt->close();
    if ($moved) {
        inquiry_release_waitlist($conn, $id);
        resolve_admin_queue($conn, 'inquiry', $id);
        resolve_admin_queue($conn, 'inquiry', 'chat-' . $id);
        log_activity($conn, null, 'inquiry', 'Inquiry Resolved By Prospect', "Inquiry ID: $id", 0);
    }
    return $moved;
}

// Inquiries nobody has touched for `inquiry_auto_close_days` (0 = never) close
// themselves. Only ones the office has opened and that wait on the prospect (New
// but seen, or Contacted): a never-opened one stays in the list, and Scheduled /
// Reserved have their own dates. Activity = any chat message either way, or any
// change to the inquiry (opening it, notes, status). Returns how many closed.
function close_stale_inquiries($conn) {
    $days = max(0, min(365, (int)get_setting($conn, 'inquiry_auto_close_days', 30)));
    if ($days === 0) return 0;
    $stmt = $conn->prepare("SELECT i.id, i.user_id, i.room_name FROM inquiries i
        WHERE i.status IN ('New', 'Contacted') AND i.admin_seen_at IS NOT NULL
          AND GREATEST(i.updated_at,
                COALESCE((SELECT MAX(g.created_at) FROM guest_messages g WHERE g.inquiry_id = i.id), i.created_at),
                COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE i.user_id IS NOT NULL AND (m.sender_id = i.user_id OR m.receiver_id = i.user_id) AND m.created_at >= i.created_at), i.created_at)
              ) < NOW() - INTERVAL ? DAY
        LIMIT 200");
    $stmt->bind_param('i', $days);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    $closed = 0;
    $reason = "No activity for $days days (closed automatically)";
    foreach ($rows as $row) {
        $id = (int)$row['id'];
        $upd = $conn->prepare("UPDATE inquiries SET status = 'Closed', closed_reason = ? WHERE id = ? AND status IN ('New', 'Contacted')");
        $upd->bind_param('si', $reason, $id);
        $upd->execute();
        $did = $upd->affected_rows > 0;
        $upd->close();
        if (!$did) continue;
        $closed++;
        inquiry_release_waitlist($conn, $id);
        resolve_admin_queue($conn, 'inquiry', $id);
        resolve_admin_queue($conn, 'inquiry', 'chat-' . $id);
        if (!empty($row['user_id'])) {
            $unit = $row['room_name'] ? " for Unit {$row['room_name']}" : '';
            create_notification($conn, (int)$row['user_id'], 'inquiry_update', 'Inquiry Update',
                "Your inquiry$unit was closed after $days days without activity. Send us a message or a new inquiry any time.");
        }
        log_activity($conn, null, 'inquiry', 'Inquiry Closed Automatically', "Inquiry ID: $id, after $days days without activity", 0);
    }
    return $closed;
}
