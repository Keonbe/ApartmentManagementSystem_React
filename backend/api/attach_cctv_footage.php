<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";
require_once __DIR__ . '/services/send_notification.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

function footage_fail($code, $message, $field = 'footage') {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message, "field" => $field]);
    exit;
}

// A body over post_max_size arrives empty; say so instead of "invalid request".
if (empty($_POST) && empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    footage_fail(413, "That file is too large to upload. Footage files must be 25MB or smaller; paste a link for longer footage.");
}

$id = (int)($_POST['id'] ?? 0);
if ($id <= 0) footage_fail(422, "Invalid parameters.", 'id');

$has_file = isset($_FILES['file']) && $_FILES['file']['error'] !== UPLOAD_ERR_NO_FILE;
$link_raw = trim((string)($_POST['url'] ?? ''));
if ($has_file === ($link_raw !== '')) {
    footage_fail(422, "Attach either a footage file or a link, not both and not neither.");
}

$stmt = $conn->prepare("SELECT user_id, status, location_details, incident_date, footage_path FROM cctv_requests WHERE id = ?");
$stmt->bind_param("i", $id);
$stmt->execute();
$req = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$req) footage_fail(404, "CCTV request not found.", 'id');
if ($req['status'] !== 'Approved') footage_fail(409, "Footage can only be attached to an approved request.", 'id');

$new_path = null;
$new_url = null;
if ($has_file) {
    [$new_path, $err] = store_cctv_footage($_FILES['file']);
    if ($err) footage_fail(422, $err);
} else {
    [$new_url, $err] = cctv_footage_link($link_raw);
    if ($err) footage_fail(422, $err);
}

$days = cctv_settings($conn)['footageDays'];

// Order of effects: the new file is already saved; the row is updated next; the
// replaced file is deleted only once the row points at the new one.
$stmt = $conn->prepare("UPDATE cctv_requests
                        SET footage_path = ?, footage_url = ?, footage_attached_at = NOW(), footage_expires_at = DATE_ADD(NOW(), INTERVAL ? DAY)
                        WHERE id = ? AND status = 'Approved'");
$stmt->bind_param("ssii", $new_path, $new_url, $days, $id);
$ok = $stmt->execute();
$stmt->close();
if (!$ok) {
    delete_cctv_footage_file($new_path);
    footage_fail(500, "Failed to attach the footage.");
}
if ($req['footage_path'] !== null && $req['footage_path'] !== $new_path) delete_cctv_footage_file($req['footage_path']);

$stmt = $conn->prepare("SELECT DATE_FORMAT(footage_expires_at, '%b %e, %Y') AS until, footage_expires_at FROM cctv_requests WHERE id = ?");
$stmt->bind_param("i", $id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

$kind = $new_path !== null ? 'file' : 'link';
$msg = "Your CCTV footage for " . $req['location_details'] . " on " . $req['incident_date'] . " is ready. Open it from My Requests before " . $row['until'] . ".";
create_notification($conn, $req['user_id'], 'cctv_request', "CCTV Footage Ready", $msg);
$notification_dispatch = dispatch_admin_action_notification(
    $conn, $req['user_id'], 'cctv_request', "CCTV Footage Ready",
    sms_status_update_template('CCTV footage', $req['location_details'], 'ready', "Open My Requests before " . $row['until'] . "."),
    email_status_update_template(
        notify_recipient_name($conn, $req['user_id']),
        'CCTV footage', $req['location_details'], 'Footage ready',
        "Open My Requests in the tenant portal to view it. It is available until " . $row['until'] . ". It shows other residents, so please do not share it."
    )
);

log_activity($conn, $admin_id, 'service', "Attached CCTV Footage", "CCTV Request ID: $id footage attached ($kind), available until " . $row['footage_expires_at']);

echo json_encode([
    "success" => true,
    "message" => "Footage attached. The tenant can open it until " . $row['until'] . ".",
    "footageKind" => $kind,
    "footageExpiresAt" => $row['footage_expires_at'],
    "notification_dispatch" => $notification_dispatch
]);
$conn->close();
