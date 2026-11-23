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
// so only the first request of the day does any work. Both checks below run at
// most once a minute across all pollers (audit L7), not on every poll. They run
// after the response is sent, so the caller never waits for them.
function run_poll_checks($conn) {
    if (!throttle_claim($conn, 'poll_checks_last_run', 60)) return;
    try {
        run_notification_sweep($conn);
    } catch (Throwable $e) {
        error_log('[AMS] notification sweep failed: ' . $e->getMessage());
    }

    // Abandoned checkouts and unpaid move-in invoices past the payment window.
    try {
        void_lapsed_payments($conn);
    } catch (Throwable $e) {
        error_log('[AMS] payment window sweep failed: ' . $e->getMessage());
    }

    try {
        send_due_announcements($conn);
    } catch (Throwable $e) {
        error_log('[AMS] scheduled announcements failed: ' . $e->getMessage());
    }

    try {
        purge_expired_cctv_footage($conn);
    } catch (Throwable $e) {
        error_log('[AMS] CCTV footage purge failed: ' . $e->getMessage());
    }

    // Visitor overstay alerts are checked here too, not only in the daily sweep
    // above — the threshold is in hours, so a once-a-day check is too coarse.
    try {
        alert_overstayed_visitors($conn);
    } catch (Throwable $e) {
        error_log('[AMS] alert_overstayed_visitors: ' . $e->getMessage());
    }
}

ob_start();
try {
    // Whose feed: the admin's open action queue plus anything addressed to
    // this admin, or a tenant's own notifications.
    $feed_sql = $auth['role'] === 'admin'
        ? "((status = 'Pending' AND type IN " . admin_queue_types_sql() . ")
            OR (user_id = ? AND type NOT IN " . admin_queue_types_sql() . "))"
        : "user_id = ?";
    $feed_id = (int)$auth['id'];

    // ?page= (Admin Notifications): one page of the feed, optionally narrowed to
    // ?types=a,b and ?search=, with the filtered total and the pending count per
    // type for the tabs. Without it: the newest 100, as the bells and the tenant
    // page read it.
    $paging = $auth['role'] === 'admin' ? list_page_request(25, 100) : null;
    $where = $feed_sql;
    $types = "i";
    $params = [$feed_id];
    if ($paging) {
        $type_list = array_values(array_filter(
            array_map('trim', explode(',', (string)($_GET['types'] ?? ''))),
            fn($t) => preg_match('/^[a-z_]{1,50}$/', $t)
        ));
        if ($type_list) {
            $where .= " AND type IN (" . implode(',', array_fill(0, count($type_list), '?')) . ")";
            $types .= str_repeat('s', count($type_list));
            array_push($params, ...$type_list);
        }
        $search = trim((string)($_GET['search'] ?? ''));
        if ($search !== '') {
            $where .= " AND (title LIKE ? OR message LIKE ?)";
            $types .= "ss";
            array_push($params, like_contains($search), like_contains($search));
        }
    }

    $stmt = $conn->prepare("SELECT * FROM notifications WHERE $where ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?");
    $limit = $paging['limit'] ?? 100;
    $offset = $paging['offset'] ?? 0;
    $stmt->bind_param($types . "ii", ...array_merge($params, [$limit, $offset]));
    $stmt->execute();
    $notifications = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    // Pending rent-extension requests carry the tenant's overdue balance, so the
    // admin sees why an approval would be refused (extension_block_reason()).
    if ($auth['role'] === 'admin') {
        foreach ($notifications as &$n) {
            if ($n['type'] === 'lease_extension_request' && $n['status'] === 'Pending') {
                $n['tenant_overdue_total'] = tenant_overdue_summary($conn, (int)$n['user_id'])['total'];
            }
        }
        unset($n);
    }

    // Counted over the whole feed, not only the rows returned (it used to stop
    // at the 100 sent).
    $cs = $conn->prepare("SELECT COUNT(*) AS c FROM notifications WHERE $feed_sql AND is_read = 0 AND is_archived = 0");
    $cs->bind_param("i", $feed_id);
    $cs->execute();
    $unread = (int)($cs->get_result()->fetch_assoc()['c'] ?? 0);
    $cs->close();

    $out = ["success" => true, "notifications" => $notifications, "unread_count" => $unread];
    if ($paging) {
        $cs = $conn->prepare("SELECT COUNT(*) AS c FROM notifications WHERE $where");
        $cs->bind_param($types, ...$params);
        $cs->execute();
        $out += list_page_meta($paging, $cs->get_result()->fetch_assoc()['c'] ?? 0);
        $cs->close();
        $out['pending_by_type'] = [];
        $cs = $conn->prepare("SELECT type, COUNT(*) AS c FROM notifications WHERE $feed_sql AND status = 'Pending' GROUP BY type");
        $cs->bind_param("i", $feed_id);
        $cs->execute();
        $res = $cs->get_result();
        while ($row = $res->fetch_assoc()) $out['pending_by_type'][$row['type']] = (int)$row['c'];
        $cs->close();
    }

    echo json_encode($out);
} catch (Exception $e) {
    server_error_response($e, "Failed to load notifications.");
}

finish_response_early();
run_poll_checks($conn);
$conn->close();
?>
