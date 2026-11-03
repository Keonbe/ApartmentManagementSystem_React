<?php
require_once __DIR__ . '/../cors.php';
require_once __DIR__ . '/../config.php';

// A link in the page cannot send an Authorization header, so (like
// download_file.php) the session token may come as a query parameter.
if (empty($_SERVER['HTTP_AUTHORIZATION']) && !empty($_GET['token'])) {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['token'];
}

function open_fail($code, $message) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) open_fail(400, "Missing request id.");

$stmt = $conn->prepare("SELECT user_id, footage_url, footage_expires_at, (footage_expires_at IS NOT NULL AND footage_expires_at <= NOW()) AS expired
                        FROM cctv_requests WHERE id = ?");
$stmt->bind_param("i", $id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$row) open_fail(404, "CCTV request not found.");

// Not the owner or an admin: 403, before saying anything about the footage.
$viewer = require_owner_or_admin($conn, $row['user_id']);

if ($row['footage_url'] === null) {
    $gone = $row['footage_expires_at'] !== null;
    open_fail($gone ? 410 : 404, $gone ? "This footage is no longer available." : "No footage link on this request.");
}
if ((int)$row['expired'] === 1) open_fail(410, "This footage is no longer available.");

log_cctv_footage_view($conn, $viewer, $id, 'link');
$conn->close();
header('Cache-Control: private, no-store');
header('Referrer-Policy: no-referrer');
header('Location: ' . $row['footage_url'], true, 302);
exit;
