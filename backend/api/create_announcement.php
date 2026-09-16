<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true) ?? [];

$tag = trim((string)($input['tag'] ?? 'General'));
$title = trim((string)($input['title'] ?? ''));
$body = trim((string)($input['body'] ?? ''));
$send_to = trim((string)($input['sendTo'] ?? 'All tenants'));
$unit = trim((string)($input['unit'] ?? ''));
$channels = json_encode(['in-app']); // Email and SMS are not built (checklist 6.6 / 6.7).

if ($title === '' || $body === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Title and body are required."]);
    exit;
}
if (!in_array($tag, ['General', 'Urgent', 'Reminder'], true)) {
    $tag = 'General';
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
    $stmt->close();

    // Announcements respect each tenant's "Building announcements" preference.
    $delivered = 0;
    foreach ($recipients as $uid) {
        if (create_notification($conn, $uid, $notif_type, $title, $body)) $delivered++;
    }

    $conn->commit();
    log_activity($conn, $admin_id, 'communication', "Created Announcement", "Title: $title; To: $send_to_label; Delivered in-app to $delivered of $recipient_count");
    echo json_encode(["success" => true, "message" => "Announcement sent to $delivered tenant(s).", "recipient_count" => $recipient_count, "delivered" => $delivered]);
} catch (Exception $e) {
    $conn->rollback();
    server_error_response($e, "Failed to create announcement.");
}

$conn->close();
?>
