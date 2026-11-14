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
    $input = read_json_input(['channels', 'tenantIds']);
}


$tag = trim((string)($input['tag'] ?? 'General'));
$title = trim((string)($input['title'] ?? ''));
$body = trim((string)($input['body'] ?? ''));
$send_to = trim((string)($input['sendTo'] ?? 'All tenants'));
$unit = trim((string)($input['unit'] ?? ''));
// With an attachment the page posts a form, where every value is a string:
// "false" must not count as a draft, and channels arrives JSON-encoded.
$is_draft = filter_var($input['draft'] ?? false, FILTER_VALIDATE_BOOLEAN);
// "Schedule for later": stored like a draft, sent by send_due_announcements()
// once scheduledAt (app timezone, 'Y-m-d H:i') has passed.
$scheduled_raw = trim((string)($input['scheduledAt'] ?? ''));
$is_scheduled = !$is_draft && $scheduled_raw !== '';
$action = (string)($input['action'] ?? '');

// History buttons on a scheduled announcement.
if ($action === 'unschedule' || $action === 'sendNow') {
    $ann_id = (int)($input['id'] ?? 0);
    if ($action === 'unschedule') {
        $stmt = $conn->prepare("UPDATE announcements SET status = 'draft', scheduled_date = NULL WHERE id = ? AND status = 'scheduled'");
        $stmt->bind_param("i", $ann_id);
        $stmt->execute();
        $changed = $stmt->affected_rows === 1;
        $stmt->close();
        if (!$changed) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "This announcement is no longer scheduled. It may already have been sent."]);
            exit;
        }
        log_activity($conn, $admin_id, 'communication', 'Unscheduled Announcement', "Announcement ID: $ann_id returned to draft");
        echo json_encode(["success" => true, "message" => "Back to a draft. Nobody was notified."]);
        exit;
    }
    $out = send_scheduled_announcement($conn, $ann_id, $admin_id, false);
    if ($out === null) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This announcement is no longer scheduled. It may already have been sent."]);
        exit;
    }
    if ($out['status'] === 'no_recipients') {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "There are no current tenants to send this to. It was saved back as a draft."]);
        exit;
    }
    echo json_encode(["success" => true, "message" => "Announcement sent to {$out['delivered']} tenant(s).", "recipient_count" => $out['recipient_count'], "delivered" => $out['delivered']]);
    exit;
}
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
$channels = json_encode(($is_draft || $is_scheduled)
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
    $stmt = $conn->prepare("SELECT id, attachment_path FROM announcements WHERE id = ? AND status IN ('draft', 'scheduled')");
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
    $send_to_label = "Unit $unit";
} elseif (strcasecmp($send_to, 'Selected tenants') === 0) {
    // tenantIds: user ids, as a list (JSON body) or JSON text (form post with an attachment).
    $raw_ids = $input['tenantIds'] ?? [];
    if (is_string($raw_ids)) $raw_ids = json_decode($raw_ids, true);
    if (!is_array($raw_ids) || !$raw_ids || array_keys($raw_ids) !== range(0, count($raw_ids) - 1)) {
        validation_fail(['tenantIds' => 'Choose at least one tenant to send this announcement to.']);
    }
    $chosen = [];
    foreach ($raw_ids as $raw_id) {
        if (!is_int($raw_id) && !(is_string($raw_id) && ctype_digit($raw_id))) {
            validation_fail(['tenantIds' => 'The chosen tenants are not valid.']);
        }
        $chosen[(int)$raw_id] = true;
    }
    $chosen = array_keys($chosen);
    sort($chosen);
    if (count($chosen) > ANNOUNCEMENT_MAX_CHOSEN_TENANTS) {
        validation_fail(['tenantIds' => 'Choose at most ' . ANNOUNCEMENT_MAX_CHOSEN_TENANTS . ' tenants, or send to everyone.']);
    }
    $send_to_label = 'Tenants: ' . implode(',', $chosen);
    // Every chosen person must be a current tenant: a stale list after a move-out is refused.
    $current = announcement_recipients($conn, $send_to_label);
    if (count($current) !== count($chosen)) {
        validation_fail(['tenantIds' => 'Some of the chosen people are no longer current tenants. Reload the list and choose again.']);
    }
} else {
    $send_to_label = 'All Tenants';
}
$recipients = announcement_recipients($conn, $send_to_label);

// A time to send at: a valid future time, at most a year away.
$scheduled_at = null;
if ($is_scheduled) {
    $when = DateTime::createFromFormat('Y-m-d H:i', str_replace('T', ' ', $scheduled_raw));
    $now = new DateTime();
    if (!$when || $when->format('Y-m-d H:i') !== str_replace('T', ' ', $scheduled_raw)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Choose a valid date and time to send at.", "fieldErrors" => ["scheduledAt" => "Choose a valid date and time to send at."]]);
        exit;
    }
    if ($when < (clone $now)->modify('+1 minute')) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Choose a time at least a minute from now.", "fieldErrors" => ["scheduledAt" => "Choose a time at least a minute from now."]]);
        exit;
    }
    if ($when > (clone $now)->modify('+' . ANNOUNCEMENT_MAX_SCHEDULE_DAYS . ' days')) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Schedule at most a year ahead.", "fieldErrors" => ["scheduledAt" => "Schedule at most a year ahead."]]);
        exit;
    }
    $scheduled_at = $when->format('Y-m-d H:i:00');
} elseif ($scheduled_raw !== '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "A draft cannot be scheduled. Choose Schedule or Save draft.", "fieldErrors" => ["scheduledAt" => "A draft cannot be scheduled."]]);
    exit;
}

// A draft or a scheduled announcement notifies nobody yet: store it and stop.
// Both keep their attachment.
if ($is_draft || $is_scheduled) {
    $store_status = $is_draft ? 'draft' : 'scheduled';
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
            $lock = $conn->prepare("SELECT attachment_path FROM announcements WHERE id = ? AND status IN ('draft', 'scheduled') FOR UPDATE");
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
            $stmt = $conn->prepare("UPDATE announcements SET tag = ?, title = ?, body = ?, send_to = ?, channels = ?, recipient_count = ?, attachment_path = ?, status = ?, scheduled_date = ? WHERE id = ?");
            $stmt->bind_param("sssssisssi", $tag, $title, $body, $send_to_label, $channels, $recipient_count, $attachment_path, $store_status, $scheduled_at, $draft_id);
        } else {
            $stmt = $conn->prepare("INSERT INTO announcements (tag, title, body, send_to, channels, status, scheduled_date, recipient_count, attachment_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("sssssssis", $tag, $title, $body, $send_to_label, $channels, $store_status, $scheduled_at, $recipient_count, $attachment_path);
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
    if ($is_scheduled) {
        log_activity($conn, $admin_id, 'communication', "Scheduled Announcement", "Title: $title; To: $send_to_label; for $scheduled_at" . ($attachment_path ? "; with attachment" : ''));
        echo json_encode(["success" => true, "message" => "Announcement scheduled for " . date('M j, Y g:i A', strtotime($scheduled_at)) . ". Nobody was notified yet.", "scheduled" => true, "scheduledAt" => $scheduled_at]);
        exit;
    }
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

$new_upload = store_announcement_attachment($attachment_tmp, $attachment_ext);
$attachment_path = $new_upload ?? $kept_attachment;
$conn->begin_transaction();
try {
    $recipient_count = count($recipients);
    if ($draft) {
        // Sending a reopened draft turns that row into the announcement. Lock
        // it and read its file here, so an edit or send from another tab
        // cannot leave this one pointing at a file that was replaced.
        $lock = $conn->prepare("SELECT attachment_path FROM announcements WHERE id = ? AND status IN ('draft', 'scheduled') FOR UPDATE");
        $lock->bind_param("i", $draft_id);
        $lock->execute();
        $current = $lock->get_result()->fetch_assoc();
        $lock->close();
        if (!$current) throw new Exception("Draft $draft_id was already sent.");
        $draft['attachment_path'] = $current['attachment_path'];
        $attachment_path = $new_upload ?? ($remove_attachment ? null : $current['attachment_path']);
        $stmt = $conn->prepare("UPDATE announcements SET tag = ?, title = ?, body = ?, send_to = ?, channels = ?, recipient_count = ?, attachment_path = ?, status = 'sent', scheduled_date = NULL, created_at = NOW() WHERE id = ? AND status IN ('draft', 'scheduled')");
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

    $delivered = announcement_notify($conn, $announcement_id, $tag, $title, $body, $recipients, $attachment_path);

    $conn->commit();
    $committed = true;
    discard_draft_attachment($draft, $attachment_path);

    // Broadcast outside the transaction: an SMS or email problem must not roll
    // back an announcement that tenants can already see in-app.
    $notification_dispatch = announcement_broadcast($conn, $announcement_id, $tag, $title, $body, $recipients, $requested);
    $used = $notification_dispatch['channels'];

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
