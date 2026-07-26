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

$query = "SELECT p.*, u.first_name, u.last_name, u.contact_no, r.id as room_name 
          FROM parking_reservations p 
          LEFT JOIN users u ON p.user_id = u.id 
          LEFT JOIN rent_applications ra ON u.id = ra.user_id AND ra.status = 'Approved'
          LEFT JOIN rooms r ON ra.room_name = r.id 
          ORDER BY p.created_at DESC";

$result = $conn->query($query);
$reservations = [];

if ($result) {
    while ($row = $result->fetch_assoc()) {
        $reservations[] = [
            'id' => 'PRK-' . str_pad($row['id'], 3, '0', STR_PAD_LEFT),
            'rawId' => $row['id'],
            'tenant' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
            'unit' => $row['room_name'] ?? 'N/A',
            'phone' => $row['contact_no'] ?? '',
            'vehicleType' => $row['vehicle_type'],
            'vehicleModel' => $row['vehicle_model'],
            'plateNumber' => $row['plate_number'],
            'transmission' => $row['transmission'] ?? 'Automatic',
            'durationMonths' => (int)$row['duration_months'],
            'totalCost' => (float)$row['total_cost'],
            'documentPath' => $row['document_path'],
            'status' => $row['status'] ?? 'Pending',
            'dateSubmitted' => date('Y-m-d', strtotime($row['created_at']))
        ];
    }
}

echo json_encode(["success" => true, "reservations" => $reservations]);
$conn->close();
?>
