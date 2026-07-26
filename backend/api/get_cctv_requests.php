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

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

$query = "SELECT c.*, u.first_name, u.last_name, u.contact_no, r.id as room_name 
          FROM cctv_requests c 
          LEFT JOIN users u ON c.user_id = u.id 
          LEFT JOIN rent_applications ra ON u.id = ra.user_id AND ra.status = 'Approved'
          LEFT JOIN rooms r ON ra.room_name = r.id 
          ORDER BY c.created_at DESC";

$result = $conn->query($query);
$requests = [];

if ($result) {
    while ($row = $result->fetch_assoc()) {
        $requests[] = [
            'id' => 'CCTV-' . str_pad($row['id'], 3, '0', STR_PAD_LEFT),
            'rawId' => $row['id'],
            'tenant' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
            'unit' => $row['room_name'] ?? 'N/A',
            'phone' => $row['contact_no'] ?? '',
            'incidentDate' => $row['incident_date'],
            'incidentTime' => $row['incident_time'],
            'location' => $row['location_details'],
            'reason' => $row['reason_request'],
            'status' => $row['status'] ?? 'Pending',
            'dateSubmitted' => date('Y-m-d', strtotime($row['created_at']))
        ];
    }
}

echo json_encode(["success" => true, "requests" => $requests]);
$conn->close();
?>
