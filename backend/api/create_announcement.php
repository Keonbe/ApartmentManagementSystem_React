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
$is_draft = !empty($input['draft']);
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
if (isset($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK) {
    $file = $_FILES['attachment'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (in_array($ext, ['jpg', 'jpeg', 'png', 'pdf'])) {
        $upload_dir = __DIR__ . '/uploads/notifications/';
        if (!is_dir($upload_dir)) mkdir($upload_dir, 0777, true);
        $filename = uniqid('ann_') . '.' . $ext;
        if (move_uploaded_file($file['tmp_name'], $upload_dir . $filename)) {
            $attachment_path = 'uploads/notifications/' . $filename;
        }
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
if ($is_draft) {
    $recipient_count = count($recipients);
    $stmt = $conn->prepare("INSERT INTO announcements (tag, title, body, send_to, channels, status, recipient_count) VALUES (?, ?, ?, ?, ?, 'draft', ?)");
    $stmt->bind_param("sssssi", $tag, $title, $body, $send_to_label, $channels, $recipient_count);
    if (!$stmt->execute()) server_error_response(new Exception($stmt->error), "Failed to save the draft.");
    $stmt->close();
    log_activity($conn, $admin_id, 'communication', "Saved Announcement Draft", "Title: $title; To: $send_to_label");
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

$conn->begin_transaction();
try {
    $recipient_count = count($recipients);
    $stmt = $conn->prepare("INSERT INTO announcements (tag, title, body, send_to, channels, recipient_count) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("sssssi", $tag, $title, $body, $send_to_label, $channels, $recipient_count);
    if (!$stmt->execute()) {
        throw new Exception("Announcement insert failed: " . $stmt->error);
    }
    $announcement_id = $stmt->insert_id;
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
    
    if ($attachment_path && !empty($notif_ids)) {
        $upd = $conn->prepare("UPDATE notifications SET attachment_path = ? WHERE id = ?");
        foreach ($notif_ids as $nid) {
            $upd->bind_param("si", $attachment_path, $nid);
            $upd->execute();
        }
        $upd->close();
    }


    $conn->commit();

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
    $conn->rollback();
    server_error_response($e, "Failed to create announcement.");
}

$conn->close();
?>
