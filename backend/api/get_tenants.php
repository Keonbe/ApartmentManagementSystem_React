<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $result = $conn->query("SELECT * FROM rent_applications ORDER BY id DESC");
    $tenants = [];
    
    while ($row = $result->fetch_assoc()) {
        $tenants[] = [
            'id' => $row['id'],
            'name' => $row['first_name'] . ' ' . $row['last_name'],
            'email' => $row['email'],
            'phone' => $row['contact_no'],
            'unit' => $row['room_name'],
            'rent' => '₱' . number_format($row['monthly_rent']),
            'moveIn' => $row['created_at'], 
            'leaseEnd' => date('Y-m-d', strtotime($row['created_at'] . ' + ' . $row['months_of_rent'] . ' months')),
            'status' => $row['status'] ?? 'active',
            'paymentStatus' => 'paid',
            'documents' => [] 
        ];
    }
    echo json_encode(["success" => true, "data" => $tenants]);
    exit;
}
?>