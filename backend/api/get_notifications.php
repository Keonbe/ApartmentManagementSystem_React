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

// Whose inbox this is comes from the session; ?userId= is ignored.
$auth = require_user($conn);

// Every signed-in page polls this endpoint, so it doubles as the trigger for the
// daily reminder / overdue / parking sweep. The sweep claims the day atomically,
// so only the first request of the day does any work.
try {
    run_notification_sweep($conn);
} catch (Throwable $e) {
    error_log('[AMS] notification sweep failed: ' . $e->getMessage());
}

// Visitor overstay alerts are checked here too, not only in the daily sweep
// above — the threshold is in hours, so a once-a-day check is too coarse.
try {
    alert_overstayed_visitors($conn);
} catch (Throwable $e) {
    error_log('[AMS] alert_overstayed_visitors: ' . $e->getMessage());
}

try {
    if ($auth['role'] === 'admin') {
        // ADMIN VIEW: the open action queue, plus anything addressed to this admin.
        $stmt = $conn->prepare("SELECT * FROM notifications
                                WHERE (status = 'Pending' AND type IN " . admin_queue_types_sql() . ")
                                   OR (user_id = ? AND type NOT IN " . admin_queue_types_sql() . ")
                                ORDER BY created_at DESC, id DESC
                                LIMIT 100");
        $stmt->bind_param("i", $auth['id']);
    } else {
        $stmt = $conn->prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50");
        $stmt->bind_param("i", $auth['id']);
    }

    $stmt->execute();
    $notifications = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $unread = 0;
    foreach ($notifications as $n) {
        if (!(int)$n['is_read']) $unread++;
    }

    echo json_encode(["success" => true, "notifications" => $notifications, "unread_count" => $unread]);
} catch (Exception $e) {
    server_error_response($e, "Failed to load notifications.");
}

$conn->close();
?>
