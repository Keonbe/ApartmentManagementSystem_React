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
