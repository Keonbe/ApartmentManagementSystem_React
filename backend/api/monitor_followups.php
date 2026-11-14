<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$admin_id = require_admin($conn);

// GET: tenants with overdue or lapsed payments, and applicants with documents
// outstanding. POST {kind, id}: send that tenant a reminder (once a day per item).
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Opening the monitor also brings the admin queue up to date.
    sync_followup_queue($conn);
    $payments = followup_overdue_tenants($conn);
    $documents = followup_missing_documents($conn);
    echo json_encode(["success" => true, "payments" => $payments, "documents" => $documents,
        "counts" => ["payments" => count($payments), "documents" => count($documents)]]);
    $conn->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

$input = read_json_input();
if (!is_array($input)) $input = [];

// POST {action: "remind_all"}: one reminder to everyone on both lists. The same
// once-a-day rule applies per item (send_followup_nudge), so people reminded in
// the last day, and lapsed payments (nothing to remind), are skipped and counted.
// A named lock keeps two admins pressing it at once from double-sending.
if (($input['action'] ?? '') === 'remind_all') {
    $lock = $conn->query("SELECT GET_LOCK('ams_followup_remind_all', 10) AS got")->fetch_assoc();
    if (!(int)($lock['got'] ?? 0)) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "Reminders are already being sent. Try again in a moment."]);
        exit;
    }
    $sent = 0;
    $skipped = 0;
    foreach (array_merge(followup_overdue_tenants($conn), followup_missing_documents($conn)) as $item) {
        if ($item['kind'] !== 'lapsed' && send_followup_nudge($conn, $item)) $sent++;
        else $skipped++;
    }
    $conn->query("SELECT RELEASE_LOCK('ams_followup_remind_all')");
    if ($sent > 0) log_activity($conn, $admin_id, 'billing', 'Sent Follow-Up Reminders', "Remind all: $sent sent, $skipped skipped");
    $message = $sent === 0
        ? "No reminders sent: everyone on the list was reminded in the last day, or has nothing to remind."
        : "Sent $sent reminder" . ($sent === 1 ? '' : 's') . ($skipped ? ". Skipped $skipped (reminded in the last day, or nothing to remind)." : '.');
    echo json_encode(["success" => true, "sent" => $sent, "skipped" => $skipped, "message" => $message]);
    $conn->close();
    exit;
}

$errors = array_filter([
    'kind' => v_enum($input['kind'] ?? '', 'Reminder type', ['payment', 'document']),
    'id' => v_id($input['id'] ?? null, 'Tenant or application'),
]);
if ($errors) validation_fail($errors);
$kind = (string)$input['kind'];
$id = (int)$input['id'];

$list = $kind === 'payment' ? followup_overdue_tenants($conn) : followup_missing_documents($conn);
$item = null;
foreach ($list as $it) {
    if ($it['kind'] === $kind && $it['id'] === $id) { $item = $it; break; }
}
if (!$item) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "This is no longer outstanding."]);
    exit;
}

if (!send_followup_nudge($conn, $item)) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "A reminder was already sent to this tenant in the last day."]);
    exit;
}
log_activity($conn, $admin_id, 'billing', 'Sent Follow-Up Reminder', "{$item['issue']} reminder to {$item['name']}");
echo json_encode(["success" => true, "message" => "Reminder sent to {$item['name']}."]);
$conn->close();
