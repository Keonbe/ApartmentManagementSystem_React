<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$public = isset($_GET['public']) && $_GET['public'] == '1';

if ($public) {
    // The tenant feed: signed-in users only, and only announcements actually sent.
    // It used to be open to anyone and also matched any row addressed to
    // 'All Tenants', which included unsent drafts.
    $viewer = require_user($conn);
    $viewer_id = (int)$viewer['id'];
    // The attachment is returned only to someone who can open it: a recipient
    // (the same file sits on their notification) or an admin. A link to anyone
    // else would just be a 403.
    $stmt = $conn->prepare("SELECT a.id, a.tag, a.title, a.body, a.created_at,
                                   CASE WHEN a.attachment_path IS NOT NULL AND (
                                            ? = 1 OR EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = ? AND n.attachment_path = a.attachment_path)
                                        ) THEN a.attachment_path END AS attachment_path
                            FROM announcements a WHERE a.status = 'sent' ORDER BY a.created_at DESC");
    $viewer_is_admin = $viewer['role'] === 'admin' ? 1 : 0;
    $stmt->bind_param("ii", $viewer_is_admin, $viewer_id);
    $stmt->execute();
    $result = $stmt->get_result();
} else {
    // The full list, drafts and delivery channels included, is the admin's
    // workspace. It had no authentication at all.
    require_admin($conn);
    $result = $conn->query("SELECT * FROM announcements ORDER BY created_at DESC");
}

$announcements = [];
while ($row = $result->fetch_assoc()) {
    if (!$public) {
        $row['channels'] = json_decode($row['channels'], true);
    }
    $announcements[] = $row;
}

echo json_encode(["success" => true, "announcements" => $announcements]);
$conn->close();
?>
