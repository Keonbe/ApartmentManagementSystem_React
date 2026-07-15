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

$user_id = $_GET['userId'] ?? $_SERVER['HTTP_X_USER_ID'] ?? null;

if (!$user_id) {
    echo json_encode(["success" => false, "message" => "User ID is required"]);
    exit;
}

$requests = [];

// 1. Maintenance Requests
$stmt1 = $conn->prepare("SELECT id, 'Maintenance' as type, issue_category as title, status, created_at FROM maintenance_requests WHERE user_id = ?");
$stmt1->bind_param("i", $user_id);
$stmt1->execute();
$res1 = $stmt1->get_result();
while ($row = $res1->fetch_assoc()) {
    $requests[] = $row;
}
$stmt1->close();

// 2. CCTV Requests
$stmt2 = $conn->prepare("SELECT id, 'CCTV' as type, location_details as title, status, created_at FROM cctv_requests WHERE user_id = ?");
$stmt2->bind_param("i", $user_id);
$stmt2->execute();
$res2 = $stmt2->get_result();
while ($row = $res2->fetch_assoc()) {
    $requests[] = $row;
}
$stmt2->close();

// 3. Parking Reservations
$stmt3 = $conn->prepare("SELECT id, 'Parking' as type, vehicle_type as title, status, created_at FROM parking_reservations WHERE user_id = ?");
$stmt3->bind_param("i", $user_id);
$stmt3->execute();
$res3 = $stmt3->get_result();
while ($row = $res3->fetch_assoc()) {
    $requests[] = $row;
}
$stmt3->close();

// Sort by created_at DESC
usort($requests, function($a, $b) {
    return strtotime($b['created_at']) - strtotime($a['created_at']);
});

echo json_encode(["success" => true, "requests" => $requests]);
$conn->close();
?>
