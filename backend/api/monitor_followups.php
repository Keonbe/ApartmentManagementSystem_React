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

$input = json_decode(file_get_contents("php://input"), true);
if (!is_array($input)) $input = [];
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
