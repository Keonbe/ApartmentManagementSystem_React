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
$query = "(SELECT id, 'Maintenance' as type, issue_category as title, status, created_at, resolved_at, attachment_path, description FROM maintenance_requests WHERE user_id = ?)
          UNION ALL
          (SELECT id, 'CCTV' as type, location_details as title, status, created_at, NULL as resolved_at, NULL as attachment_path, reason as description FROM cctv_requests WHERE user_id = ?)
          UNION ALL
          (SELECT id, 'Parking' as type, vehicle_type as title, status, created_at, NULL as resolved_at, or_cr_attachment_path as attachment_path, vehicle_model as description FROM parking_reservations WHERE user_id = ?)
          ORDER BY created_at DESC";

$stmt = $conn->prepare($query);
$stmt->bind_param("iii", $user_id, $user_id, $user_id);
$stmt->execute();
$res = $stmt->get_result();

while ($row = $res->fetch_assoc()) {
    $requests[] = $row;
}
$stmt->close();

echo json_encode(["success" => true, "requests" => $requests]);
$conn->close();
?>
