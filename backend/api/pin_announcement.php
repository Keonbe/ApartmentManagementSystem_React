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

// A sent announcement can be pinned to the top of the tenants' feed. A few pins
// keep the top meaningful: pinning everything pins nothing.
const MAX_PINNED_ANNOUNCEMENTS = 3;

$input = read_json_input();
$ann_id = (int)($input['id'] ?? 0);
$pin = filter_var($input['pinned'] ?? false, FILTER_VALIDATE_BOOLEAN);

$conn->begin_transaction();
$stmt = $conn->prepare("SELECT title, is_pinned FROM announcements WHERE id = ? AND status = 'sent' FOR UPDATE");
$stmt->bind_param("i", $ann_id);
$stmt->execute();
$ann = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$ann) {
    $conn->rollback();
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Only a sent announcement can be pinned."]);
    exit;
}

if ($pin && (int)$ann['is_pinned'] === 0) {
    $count = (int)$conn->query("SELECT COUNT(*) FROM announcements WHERE is_pinned = 1 AND status = 'sent' FOR UPDATE")->fetch_row()[0];
    if ($count >= MAX_PINNED_ANNOUNCEMENTS) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "You can pin up to " . MAX_PINNED_ANNOUNCEMENTS . " announcements. Unpin one first."]);
        exit;
    }
}

$flag = $pin ? 1 : 0;
$stmt = $conn->prepare("UPDATE announcements SET is_pinned = ? WHERE id = ?");
$stmt->bind_param("ii", $flag, $ann_id);
$stmt->execute();
$stmt->close();
$conn->commit();

log_activity($conn, $admin_id, 'communication', $pin ? 'Pinned Announcement' : 'Unpinned Announcement', "Announcement ID: $ann_id; Title: " . $ann['title']);
echo json_encode(["success" => true, "pinned" => $pin, "message" => $pin ? "Pinned to the top of the tenants' feed." : "Unpinned."]);
$conn->close();
