<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";
require_once __DIR__ . '/services/send_notification.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

$input = $_POST;
if (empty($input)) {
    $input = json_decode(file_get_contents("php://input"), true) ?? [];
}


$tag = trim((string)($input['tag'] ?? 'General'));
$title = trim((string)($input['title'] ?? ''));
$body = trim((string)($input['body'] ?? ''));
$send_to = trim((string)($input['sendTo'] ?? 'All tenants'));
$unit = trim((string)($input['unit'] ?? ''));
// With an attachment the page posts a form, where every value is a string:
// "false" must not count as a draft, and channels arrives JSON-encoded.
$is_draft = filter_var($input['draft'] ?? false, FILTER_VALIDATE_BOOLEAN);
if (is_string($input['channels'] ?? null)) {
    $input['channels'] = json_decode($input['channels'], true);
}
// In-app always goes out. SMS and email go out only when the admin picked them:
// with Semaphore live, every SMS costs credits, so an unticked box must mean
// "not sent" rather than "sent anyway".
$requested = is_array($input['channels'] ?? null) ? array_map('strtolower', $input['channels']) : [];
$want_sms   = in_array('sms', $requested, true);
$want_email = in_array('email', $requested, true);
// Recorded as in-app, then rewritten after the broadcast with the channels that
// actually reached someone — a tenant may be opted out of SMS, or the channel
// may be switched off building-wide, and the stored record should say so. A
// draft keeps the channels it was composed with.
$channels = json_encode($is_draft
    ? array_values(array_merge(['in-app'], $want_sms ? ['sms'] : [], $want_email ? ['email'] : []))
    : ['in-app']);


$attachment_path = null;
$attachment_tmp = null;
$attachment_ext = null;
if (isset($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK) {
    // Same checks and folder as schedule_move_in.php. This used to save under
    // backend/api/uploads/ while storing a backend/uploads/ path, so the file
    // could never be opened.
    $file = $_FILES['attachment'];
    if ($file['size'] > 10 * 1024 * 1024) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Attachment must be 10MB or less."]);
        exit;
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $exts = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'application/pdf' => 'pdf'];
    if (!isset($exts[$mime])) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Attach a JPG, PNG, or PDF."]);
        exit;
    }
    // Checked here; the file is stored only once the request has passed every
    // check (below), so a refused request leaves nothing behind.
    $attachment_tmp = $file['tmp_name'];
    $attachment_ext = $exts[$mime];
} elseif (isset($_FILES['attachment']) && $_FILES['attachment']['error'] !== UPLOAD_ERR_NO_FILE) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "The attachment could not be uploaded. It may be too large."]);
    exit;
}

// Reopened draft (AdminAnnouncements "Open draft"): saving updates it, sending
// turns it into the sent announcement. Its stored file is kept unless a new
// one is attached or removeAttachment is set.
$draft_id = (int)($input['draftId'] ?? 0);
$remove_attachment = filter_var($input['removeAttachment'] ?? false, FILTER_VALIDATE_BOOLEAN);
$draft = null;
if ($draft_id) {
    $stmt = $conn->prepare("SELECT id, attachment_path FROM announcements WHERE id = ? AND status = 'draft'");
    $stmt->bind_param("i", $draft_id);
    $stmt->execute();
    $draft = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$draft) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "This draft no longer exists or was already sent."]);
        exit;
    }
}
$kept_attachment = ($draft && !$remove_attachment && $attachment_tmp === null) ? $draft['attachment_path'] : null;

// Stores the uploaded file (if any) and returns its path, or null.
function store_announcement_attachment($tmp, $ext) {
    if ($tmp === null) return null;
    $upload_dir = __DIR__ . '/../uploads/notifications/';
    if (!is_dir($upload_dir)) mkdir($upload_dir, 0755, true);
    $filename = bin2hex(random_bytes(16)) . '.' . $ext;
    if (!move_uploaded_file($tmp, $upload_dir . $filename)) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Could not save the attachment."]);
        exit;
    }
    return 'uploads/notifications/' . $filename;
}

// The draft's previous file, once a save or send has replaced or removed it.
function discard_draft_attachment($draft, $attachment_path) {
    if ($draft && $draft['attachment_path'] && $draft['attachment_path'] !== $attachment_path) {
        @unlink(__DIR__ . '/../' . $draft['attachment_path']);
    }
}

if ($title === '' || $body === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Title and body are required."]);
    exit;
}
if (!in_array($tag, ['General', 'Urgent', 'Reminder'], true)) {
    $tag = 'General';
}

if ($want_sms && !$is_draft) {
    $prefix = ($tag === '' || strcasecmp($tag, 'General') === 0) ? 'AMS: ' : "AMS $tag: ";
    $sms_full = $prefix . $title . ' - ' . $body;
    $sms_len = mb_strlen($sms_full);
    if ($sms_len > 160) {
        http_response_code(422);
        echo json_encode([
            "success" => false,
            "message" => "Announcement exceeds the 160-character limit for SMS delivery ($sms_len characters). Please shorten the text or uncheck SMS.",
            "fieldErrors" => [
                "body" => "Announcement exceeds the 160-character limit for SMS delivery ($sms_len characters). Please shorten the text or uncheck SMS."
            ]
        ]);
        exit;
    }
}

// Recipients. The audience used to be ignored: every non-admin account got the
// announcement — including applicants still under review, rejected applicants
// and moved-out tenants — even when "Specific unit" was chosen.
$tenancy = "SELECT DISTINCT ra.user_id FROM rent_applications ra
            JOIN users u ON u.id = ra.user_id
            WHERE ra.status IN ('Approved', 'active', 'pending-move-out') AND u.role = 'user' AND u.is_archived = 0";

if (strcasecmp($send_to, 'Specific unit') === 0) {
    if ($unit === '') {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Choose the unit to send this announcement to."]);
        exit;
    }
    $stmt = $conn->prepare("$tenancy AND ra.room_name = ?");
    $stmt->bind_param("s", $unit);
    $send_to_label = "Unit $unit";
} else {
    $stmt = $conn->prepare($tenancy);
    $send_to_label = 'All Tenants';
}
$stmt->execute();
$recipients = array_map('intval', array_column($stmt->get_result()->fetch_all(MYSQLI_ASSOC), 'user_id'));
$stmt->close();

// A draft notifies nobody: store it and stop.
// A draft keeps its attachment (it used to be dropped).
if ($is_draft) {
    $recipient_count = count($recipients);
    $new_upload = store_announcement_attachment($attachment_tmp, $attachment_ext);
    $attachment_path = $new_upload ?? $kept_attachment;
    $previous_attachment = $draft['attachment_path'] ?? null;
    $conn->begin_transaction();
    try {
        if ($draft) {
            // Lock the row and re-check it is still a draft: another admin may
            // have sent or removed it since it was opened. Its file is read
            // here, under the lock, so only a file this draft still owns is
            // ever replaced or deleted.
            $lock = $conn->prepare("SELECT attachment_path FROM announcements WHERE id = ? AND status = 'draft' FOR UPDATE");
            $lock->bind_param("i", $draft_id);
            $lock->execute();
            $current = $lock->get_result()->fetch_assoc();
            $lock->close();
            if (!$current) {
                $conn->rollback();
                if ($new_upload) @unlink(__DIR__ . '/../' . $new_upload);
                http_response_code(422);
                echo json_encode(["success" => false, "message" => "This draft no longer exists or was already sent."]);
                exit;
            }
            $previous_attachment = $current['attachment_path'];
            $attachment_path = $new_upload ?? ($remove_attachment ? null : $previous_attachment);
            $stmt = $conn->prepare("UPDATE announcements SET tag = ?, title = ?, body = ?, send_to = ?, channels = ?, recipient_count = ?, attachment_path = ? WHERE id = ?");
            $stmt->bind_param("sssssisi", $tag, $title, $body, $send_to_label, $channels, $recipient_count, $attachment_path, $draft_id);
        } else {
            $stmt = $conn->prepare("INSERT INTO announcements (tag, title, body, send_to, channels, status, recipient_count, attachment_path) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)");
            $stmt->bind_param("sssssis", $tag, $title, $body, $send_to_label, $channels, $recipient_count, $attachment_path);
        }
        $stmt->execute();
        $stmt->close();
        $conn->commit();
    } catch (Exception $e) {
        $conn->rollback();
        if ($new_upload) @unlink(__DIR__ . '/../' . $new_upload);
        server_error_response($e, "Failed to save the draft.");
        exit;
    }
    discard_draft_attachment(['attachment_path' => $previous_attachment], $attachment_path);
    log_activity($conn, $admin_id, 'communication', $draft ? "Updated Announcement Draft" : "Saved Announcement Draft", "Title: $title; To: $send_to_label" . ($attachment_path ? "; with attachment" : ''));
    echo json_encode(["success" => true, "message" => "Draft saved. Nobody was notified.", "draft" => true]);
    exit;
}

if (!$recipients) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => $send_to_label === 'All Tenants'
        ? "There are no current tenants to send this to."
        : "Unit $unit has no current tenant."]);
    exit;
}

$notif_type = ['Urgent' => 'warning', 'Reminder' => 'action'][$tag] ?? 'info';

$new_upload = store_announcement_attachment($attachment_tmp, $attachment_ext);
$attachment_path = $new_upload ?? $kept_attachment;
$conn->begin_transaction();
try {
    $recipient_count = count($recipients);
    if ($draft) {
        // Sending a reopened draft turns that row into the announcement. Lock
        // it and read its file here, so an edit or send from another tab
        // cannot leave this one pointing at a file that was replaced.
        $lock = $conn->prepare("SELECT attachment_path FROM announcements WHERE id = ? AND status = 'draft' FOR UPDATE");
        $lock->bind_param("i", $draft_id);
        $lock->execute();
        $current = $lock->get_result()->fetch_assoc();
        $lock->close();
        if (!$current) throw new Exception("Draft $draft_id was already sent.");
        $draft['attachment_path'] = $current['attachment_path'];
        $attachment_path = $new_upload ?? ($remove_attachment ? null : $current['attachment_path']);
        $stmt = $conn->prepare("UPDATE announcements SET tag = ?, title = ?, body = ?, send_to = ?, channels = ?, recipient_count = ?, attachment_path = ?, status = 'sent', created_at = NOW() WHERE id = ? AND status = 'draft'");
        $stmt->bind_param("sssssisi", $tag, $title, $body, $send_to_label, $channels, $recipient_count, $attachment_path, $draft_id);
        $stmt->execute();
        if ($stmt->affected_rows !== 1) throw new Exception("Draft $draft_id was already sent.");
        $announcement_id = $draft_id;
    } else {
        $stmt = $conn->prepare("INSERT INTO announcements (tag, title, body, send_to, channels, recipient_count) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("sssssi", $tag, $title, $body, $send_to_label, $channels, $recipient_count);
        if (!$stmt->execute()) {
            error_log("[AMS] Announcement insert failed: " . $stmt->error);
            throw new Exception("Announcement insert failed.");
        }
        $announcement_id = $stmt->insert_id;
    }
    $stmt->close();

    // Announcements respect each tenant's "Building announcements" preference.
    $delivered = 0;
    $notif_ids = [];
    foreach ($recipients as $uid) {
        $nid = create_notification($conn, $uid, $notif_type, $title, $body);
        if ($nid) {
            $delivered++;
            $notif_ids[] = $nid;
        }
    }
    
    if ($attachment_path) {
        if (!empty($notif_ids)) {
            $upd = $conn->prepare("UPDATE notifications SET attachment_path = ? WHERE id = ?");
            foreach ($notif_ids as $nid) {
                $upd->bind_param("si", $attachment_path, $nid);
                $upd->execute();
            }
            $upd->close();
        }
        // The admin's history shows that a file went out, and opens it.
        $ann_upd = $conn->prepare("UPDATE announcements SET attachment_path = ? WHERE id = ?");
        $ann_upd->bind_param("si", $attachment_path, $announcement_id);
        $ann_upd->execute();
        $ann_upd->close();
    }


    $conn->commit();
    $committed = true;
    discard_draft_attachment($draft, $attachment_path);

    // Broadcast outside the transaction: an SMS or email problem must not roll
    // back an announcement that tenants can already see in-app.
    $notification_dispatch = dispatch_admin_action_broadcast(
        $conn, $recipients, $notif_type, $title,
        // null skips that channel in dispatch_external_notification().
        $want_sms ? sms_announcement_template($title, $body, $tag) : null,
        $want_email ? email_announcement_template($title, $body, $tag) : null
    );

    $used = ['in-app'];
    if ($notification_dispatch['sms'] > 0) $used[] = 'sms';
    if ($notification_dispatch['email'] > 0) $used[] = 'email';
    $used_json = json_encode($used);
    $stmt = $conn->prepare("UPDATE announcements SET channels = ? WHERE id = ?");
    $stmt->bind_param("si", $used_json, $announcement_id);
    $stmt->execute();
    $stmt->close();

    log_activity($conn, $admin_id, 'communication', "Created Announcement", "Title: $title; To: $send_to_label; Delivered in-app to $delivered of $recipient_count; channels: " . implode(', ', $used));
    echo json_encode([
        "success" => true,
        "message" => "Announcement sent to $delivered tenant(s).",
        "recipient_count" => $recipient_count,
        "delivered" => $delivered,
        "notification_dispatch" => $notification_dispatch
    ]);
} catch (Exception $e) {
    if (empty($committed)) {
        $conn->rollback();
        // The announcement was not created, so a file uploaded for it is not
        // wanted. A reopened draft's own file stays with the draft.
        if ($new_upload) @unlink(__DIR__ . '/../' . $new_upload);
        server_error_response($e, "Failed to create announcement.");
    } else {
        // Already committed and visible to tenants: only the SMS/email
        // broadcast or the bookkeeping after it failed. Reporting a failure
        // here made admins resend and duplicate the announcement.
        error_log('[AMS] ' . ($_SERVER['SCRIPT_NAME'] ?? 'cli') . ' after commit: ' . $e->getMessage());
        echo json_encode([
            "success" => true,
            "message" => "Announcement sent to " . ($delivered ?? 0) . " tenant(s) in-app, but SMS/email delivery hit an error. Check the logs before resending.",
            "recipient_count" => $recipient_count ?? 0,
            "delivered" => $delivered ?? 0,
        ]);
    }
}

$conn->close();
?>
