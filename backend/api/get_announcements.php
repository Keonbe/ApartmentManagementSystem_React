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
    require_user($conn);
    $stmt = $conn->prepare("SELECT id, tag, title, body, created_at FROM announcements WHERE status = 'sent' ORDER BY created_at DESC");
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
