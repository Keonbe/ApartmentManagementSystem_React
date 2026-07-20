<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

require_once "../config.php";

// Fetch notifications for the admin
// Note: We are selecting everything from the notifications table 
// to ensure occupancy and lease requests show up.
$query = "SELECT * FROM notifications ORDER BY created_at DESC";
$result = $conn->query($query);

$notifications = [];
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $notifications[] = $row;
    }
}

echo json_encode(["success" => true, "notifications" => $notifications]);
$conn->close();
?>
