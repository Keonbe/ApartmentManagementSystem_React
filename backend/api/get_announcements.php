<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$public = isset($_GET['public']) && $_GET['public'] == '1';

if ($public) {
    $stmt = $conn->prepare("SELECT id, tag, title, body, created_at FROM announcements WHERE status = 'sent' OR send_to = 'All Tenants' ORDER BY created_at DESC");
    $stmt->execute();
    $result = $stmt->get_result();
} else {
    $query = "SELECT * FROM announcements ORDER BY created_at DESC";
    $result = $conn->query($query);
}

$announcements = [];

if ($result) {
    while ($row = $result->fetch_assoc()) {
        if (!$public) {
            $row['channels'] = json_decode($row['channels'], true);
        }
        $announcements[] = $row;
    }
}

echo json_encode(["success" => true, "announcements" => $announcements]);

if ($public && isset($stmt)) {
    $stmt->close();
}
$conn->close();
?>
