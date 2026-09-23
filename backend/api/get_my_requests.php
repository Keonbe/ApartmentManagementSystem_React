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

// A tenant only ever sees their own requests; an admin may look up a specific tenant.
$auth = require_user($conn);
$user_id = $auth['id'];
if ($auth['role'] === 'admin' && !empty($_GET['userId'])) {
    $user_id = (int)$_GET['userId'];
}

$query = "(SELECT id, 'Maintenance' AS type, COALESCE(title, issue_category) AS title, status, created_at, resolved_at, attachment_path, description, NULL AS total_cost, rejection_reason FROM maintenance_requests WHERE user_id = ?)
          UNION ALL
          (SELECT id, 'CCTV', location_details, status, created_at, NULL, NULL, reason_request, NULL, NULL FROM cctv_requests WHERE user_id = ?)
          UNION ALL
          (SELECT id, 'Parking', vehicle_type, status, created_at, NULL, document_path, vehicle_model, NULL, NULL FROM parking_reservations WHERE user_id = ?)
          UNION ALL
          (SELECT id, 'Service', service_name, status, created_at, completed_at, attachment_path, notes, total_cost, NULL FROM service_requests WHERE user_id = ?)
          ORDER BY created_at DESC";

$stmt = $conn->prepare($query);
$stmt->bind_param("iiii", $user_id, $user_id, $user_id, $user_id);
$stmt->execute();
$res = $stmt->get_result();

$requests = [];
while ($row = $res->fetch_assoc()) {
    $requests[] = $row;
}
$stmt->close();

echo json_encode(["success" => true, "requests" => $requests]);
$conn->close();
