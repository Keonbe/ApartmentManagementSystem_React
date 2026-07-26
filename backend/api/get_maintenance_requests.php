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

$query = "SELECT m.*, u.first_name, u.last_name, u.contact_no, r.id as room_name 
          FROM maintenance_requests m 
          LEFT JOIN users u ON m.user_id = u.id 
          LEFT JOIN rent_applications ra ON u.id = ra.user_id AND ra.status = 'Approved'
          LEFT JOIN rooms r ON ra.room_name = r.id 
          ORDER BY m.created_at DESC";

$result = $conn->query($query);
$requests = [];

if ($result) {
    while ($row = $result->fetch_assoc()) {
        $requests[] = [
            'id' => $row['id'],
            'tenant' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
            'unit' => $row['room_name'] ?? 'N/A',
            'category' => $row['issue_category'],
            'urgency' => $row['urgency'],
            'preferredDate' => $row['preferred_date'],
            'preferredTime' => $row['preferred_time'],
            'description' => $row['description'],
            'permissionToEnter' => (bool)$row['permission_to_enter'],
            'status' => $row['status'],
            'assignedTo' => $row['assigned_to'] ?? '',
            'estimatedCost' => (float)($row['estimated_cost'] ?? 0),
            'workNotes' => $row['work_notes'] ?? '',
            'tenantResponsible' => (bool)($row['tenant_responsible'] ?? false),
            'dateSubmitted' => date('Y-m-d', strtotime($row['created_at']))
        ];
    }
}

echo json_encode(["success" => true, "requests" => $requests]);
$conn->close();
?>