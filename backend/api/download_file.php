<?php
require_once __DIR__ . '/../cors.php';
require_once __DIR__ . '/../config.php';

// <img>/<a> tags can't attach an Authorization header, so this is the one
// endpoint that also accepts the session token as a query parameter and
// treats it exactly like the header every other endpoint requires.
if (empty($_SERVER['HTTP_AUTHORIZATION']) && !empty($_GET['token'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['token'];
}

function download_fail($code, $message) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

function find_owner($conn, $sql, $params) {
    $stmt = $conn->prepare($sql);
    $stmt->bind_param(str_repeat('s', count($params)), ...$params);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? (int)$row['owner_id'] : null;
}

function table_has_column($conn, $table, $column) {
    // Table/column names below are hard-coded by this endpoint, not user input.
    $result = $conn->query("SHOW COLUMNS FROM `{$table}` LIKE '" . $conn->real_escape_string($column) . "'");
    return $result && $result->num_rows > 0;
}

$path = $_GET['path'] ?? '';
if (!is_string($path) || $path === '') download_fail(400, "Missing file path.");

// Stored paths are sometimes "uploads/..." and sometimes "../uploads/...";
// normalize to the former before anything else.
$normalized = ltrim(preg_replace('#^(\.\./|/)+#', '', $path), '/');

// This alone blocks path traversal, before any filesystem or DB access:
// only "uploads/<subfolder>/<filename>" with a safe charset is accepted.
if (!preg_match('#^uploads/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$#', $normalized)) {
    download_fail(400, "Invalid file path.");
}

$base_dir = realpath(__DIR__ . '/../uploads');
$real_path = realpath(__DIR__ . '/../' . $normalized);
if ($base_dir === false || $real_path === false || strncmp($real_path, $base_dir, strlen($base_dir)) !== 0) {
    download_fail(404, "File not found.");
}

// A download must map to a row that still references this exact path — that
// both rules out fishing for arbitrary uploads/ files and gives us the
// owner to check the caller's session against (H2/B-8).
$candidates = [$normalized, '../' . $normalized];
$two = [$candidates[0], $candidates[1]];
$six = [$candidates[0], $candidates[1], $candidates[0], $candidates[1], $candidates[0], $candidates[1]];

$owner = null;
$access = 'owner';
$chat_participants = null;
$guest_thread_id = null;
$notification_recipients = null;

if ($owner === null) {
    $owner = find_owner($conn, "SELECT user_id AS owner_id FROM rent_applications WHERE valid_id_front_path IN (?,?) OR valid_id_back_path IN (?,?) OR nbi_clearance_path IN (?,?) OR rejection_attachment_path IN (?,?) LIMIT 1", array_merge($six, $two));
}
if ($owner === null) {
    $owner = find_owner($conn, "SELECT user_id AS owner_id FROM invoices WHERE proof_of_payment_path IN (?,?) LIMIT 1", $two);
}
if ($owner === null) {
    $owner = find_owner($conn, "SELECT ra.user_id AS owner_id FROM lease_contracts lc JOIN rent_applications ra ON ra.id = lc.rent_application_id WHERE lc.signed_lease_path IN (?,?) OR lc.notarized_lease_path IN (?,?) OR lc.tenant_signature_path IN (?,?) OR lc.owner_signature_path IN (?,?) LIMIT 1", array_merge($six, $two));
}
if ($owner === null && table_has_column($conn, 'utility_readings', 'bill_file_path')) {
    $owner = find_owner($conn, "SELECT user_id AS owner_id FROM utility_readings WHERE bill_file_path IN (?,?) AND user_id IS NOT NULL LIMIT 1", $two);
}
if ($owner === null) {
    $owner = find_owner($conn, "SELECT id AS owner_id FROM users WHERE avatar_url IN (?,?) LIMIT 1", $two);
}
if ($owner === null) {
    $owner = find_owner($conn, "SELECT user_id AS owner_id FROM service_requests WHERE attachment_path IN (?,?) LIMIT 1", $two);
}
if ($owner === null) {
    $owner = find_owner($conn, "SELECT user_id AS owner_id FROM maintenance_requests WHERE attachment_path IN (?,?) LIMIT 1", $two);
}
if ($owner === null) {
    $owner = find_owner($conn, "SELECT user_id AS owner_id FROM parking_reservations WHERE document_path IN (?,?) LIMIT 1", $two);
}
if ($owner === null && table_has_column($conn, 'notifications', 'attachment_path') && table_has_column($conn, 'notifications', 'user_id')) {
    // One announcement file is attached to every recipient's notification, so
    // any of them may open it — not only whichever row happens to come first.
    $stmt = $conn->prepare("SELECT DISTINCT user_id FROM notifications WHERE attachment_path IN (?,?) AND user_id IS NOT NULL");
    $stmt->bind_param('ss', $candidates[0], $candidates[1]);
    $stmt->execute();
    $recipient_ids = array_map(fn($r) => (int)$r['user_id'], $stmt->get_result()->fetch_all(MYSQLI_ASSOC));
    $stmt->close();
    if ($recipient_ids) $notification_recipients = $recipient_ids;
}
if ($owner === null) {
    // Chat media is visible only to participants in the conversation or an admin.
    // Resolve participant ids first; do not treat either participant as the sole owner.
    $stmt = $conn->prepare("SELECT sender_id, receiver_id FROM messages WHERE attachment_path IN (?,?) LIMIT 1");
    $stmt->bind_param('ss', $candidates[0], $candidates[1]);
    $stmt->execute();
    $chat_participants = $stmt->get_result()->fetch_assoc();
    $stmt->close();
}
if ($owner === null && $chat_participants === null) {
    $stmt = $conn->prepare('SELECT inquiry_id FROM guest_messages WHERE attachment_path IN (?,?) LIMIT 1');
    $stmt->bind_param('ss', $candidates[0], $candidates[1]);
    $stmt->execute();
    $guestMedia = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($guestMedia) {
        $stmt = $conn->prepare('SELECT inquiry_id FROM guest_messages WHERE inquiry_id = ? AND attachment_path IN (?,?) LIMIT 1');
        $stmt->bind_param('iss', $guestMedia['inquiry_id'], $candidates[0], $candidates[1]);
        $stmt->execute();
        $guestThreadMedia = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($guestThreadMedia) $guest_thread_id = (int)$guestThreadMedia['inquiry_id'];
    }
}
if ($owner === null) {
    // Visitor ID photos belong to a third party, not the hosting tenant —
    // only an admin may view them, regardless of whose unit they visited.
    $owner = find_owner($conn, "SELECT user_id AS owner_id FROM visitor_logs WHERE id_photo_path IN (?,?) LIMIT 1", $two);
    if ($owner !== null) $access = 'admin_only';
}

if ($owner === null && $chat_participants === null && $guest_thread_id === null && $notification_recipients === null) download_fail(404, "File not found.");

if ($notification_recipients !== null) {
    $auth = get_authenticated_user($conn);
    if (!$auth || ($auth['role'] !== 'admin' && !in_array((int)$auth['id'], $notification_recipients, true))) {
        download_fail($auth ? 403 : 401, $auth ? "Forbidden." : "Unauthorized.");
    }
} elseif ($chat_participants !== null) {
    $auth = get_authenticated_user($conn);
    if (!$auth || ($auth['role'] !== 'admin' && (int)$auth['id'] !== (int)$chat_participants['sender_id'] && (int)$auth['id'] !== (int)$chat_participants['receiver_id'])) {
        download_fail($auth ? 403 : 401, $auth ? "Forbidden." : "Unauthorized.");
    }
} elseif ($guest_thread_id !== null) {
    $auth = get_authenticated_user($conn);
    $guestToken = trim((string)($_SERVER['HTTP_X_GUEST_TOKEN'] ?? ''));
    $authorizedGuest = false;
    if (!$auth && strlen($guestToken) === 64 && ctype_xdigit($guestToken)) {
        $stmt = $conn->prepare("SELECT id FROM inquiries WHERE id = ? AND guest_token = ? AND thread_type = 'guest'");
        $stmt->bind_param('is', $guest_thread_id, $guestToken);
        $stmt->execute();
        $authorizedGuest = (bool)$stmt->get_result()->fetch_assoc();
        $stmt->close();
    }
    if (!$authorizedGuest && (!$auth || $auth['role'] !== 'admin')) download_fail($auth ? 403 : 401, $auth ? "Forbidden." : "Unauthorized.");
} elseif ($access === 'admin_only') {
    require_admin($conn);
} else {
    require_owner_or_admin($conn, $owner);
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $real_path) ?: 'application/octet-stream';
finfo_close($finfo);

header_remove('Content-Type');
header('Content-Type: ' . $mime);
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: inline; filename="' . basename($real_path) . '"');
header('Content-Length: ' . filesize($real_path));
header('Cache-Control: private, max-age=0, no-cache');
readfile($real_path);
$conn->close();
exit;
