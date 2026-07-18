<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $result = $conn->query("SELECT * FROM rent_applications ORDER BY id DESC");
    $applications = [];
    
    while ($row = $result->fetch_assoc()) {
        $applications[] = [
            'id' => $row['id'],
            'first_name' => $row['first_name'],
            'middle_name' => $row['middle_name'] ?? '',
            'last_name' => $row['last_name'],
            'suffix' => $row['suffix'] ?? '',
            'name' => trim($row['first_name'] . ' ' . ($row['middle_name'] ?? '') . ' ' . $row['last_name'] . ' ' . ($row['suffix'] ?? '')),
            'email' => $row['email'],
            'phone' => $row['contact_no'],
            'gender' => $row['gender'] ?? 'Not Specified',
            'occupants' => $row['occupants'] ?? '1',
            'months_of_rent' => $row['months_of_rent'] ?? '1',
            'unit' => $row['room_name'],
            'rent' => '₱' . number_format($row['monthly_rent']),
            'status' => $row['status'] ?? 'Pending Review',
            'created_at' => $row['created_at'] ?? '',
            'valid_id_front_path' => $row['valid_id_front_path'] ?? null,
            'valid_id_back_path' => $row['valid_id_back_path'] ?? null,
            'nbi_clearance_path' => $row['nbi_clearance_path'] ?? null,
        ];
    }
    echo json_encode(["success" => true, "data" => $applications]);
    exit;
}
?>
