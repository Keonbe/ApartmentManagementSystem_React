<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// The caller's own delivery history: the texts and emails sent to them
// (notification_log rows for channel sms / email), newest first. In-app notices
// are the notifications list itself and are not repeated here. Only what the
// tenant needs to see is returned: no recipient address or number, no provider
// error or ids (those stay in the admin's delivery log).
//   ?limit=1..50 (default 10) &offset=0.. &channel=sms|email &status=sent|failed|skipped
$auth = require_user($conn);

$limit = isset($_GET['limit']) ? filter_var($_GET['limit'], FILTER_VALIDATE_INT) : 10;
$offset = isset($_GET['offset']) ? filter_var($_GET['offset'], FILTER_VALIDATE_INT) : 0;
if ($limit === false || $limit < 1 || $limit > 50 || $offset === false || $offset < 0) {
    validation_fail(['limit' => 'Send a limit from 1 to 50 and a non-negative offset.'], 400);
}
$channel = $_GET['channel'] ?? '';
$status = $_GET['status'] ?? '';
if (!is_string($channel) || !in_array($channel, ['', 'sms', 'email'], true)) {
    validation_fail(['channel' => 'Channel must be sms or email.'], 400);
}
if (!is_string($status) || !in_array($status, ['', 'sent', 'failed', 'skipped'], true)) {
    validation_fail(['status' => 'Status must be sent, failed or skipped.'], 400);
}

$where = "user_id = ? AND channel IN ('sms', 'email')";
$types = "i";
$params = [$auth['id']];
if ($channel !== '') { $where .= " AND channel = ?"; $types .= "s"; $params[] = $channel; }
if ($status !== '') { $where .= " AND status = ?"; $types .= "s"; $params[] = $status; }

$count = $conn->prepare("SELECT COUNT(*) FROM notification_log WHERE $where");
$count->bind_param($types, ...$params);
$count->execute();
$total = (int)$count->get_result()->fetch_row()[0];
$count->close();

$list_types = $types . "ii";
$list_params = array_merge($params, [$limit, $offset]);
$stmt = $conn->prepare("SELECT id, channel, event_type, subject, status, sent_at
                        FROM notification_log WHERE $where ORDER BY sent_at DESC, id DESC LIMIT ? OFFSET ?");
$stmt->bind_param($list_types, ...$list_params);
$stmt->execute();
$entries = [];
foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
    $entries[] = [
        'id' => (int)$row['id'],
        'channel' => $row['channel'],
        'event_type' => $row['event_type'],
        'subject' => $row['subject'],
        'status' => $row['status'],
        'sent_at' => $row['sent_at'],
    ];
}
$stmt->close();

echo json_encode(["success" => true, "entries" => $entries, "total" => $total, "limit" => $limit, "offset" => $offset]);
$conn->close();
?>
