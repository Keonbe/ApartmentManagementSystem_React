<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Perform a LEFT JOIN with the users table to pull the live avatar_url record column
    $query = "SELECT 
                ra.*, 
                u.avatar_url,
                EXISTS(SELECT 1 FROM invoices i WHERE i.rent_application_id = ra.id AND i.security_deposit > 0 AND i.status = 'paid') AS initial_payment_paid
              FROM rent_applications ra
              LEFT JOIN users u ON ra.user_id = u.id 
              ORDER BY ra.id DESC";
              
    $result = $conn->query($query);
    $applications = [];
    
    if ($result) {
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
                'preferred_move_in_date' => $row['preferred_move_in_date'] ?? null,
                'move_in_date' => $row['move_in_date'] ?? null,
                'move_in_notified_at' => $row['move_in_notified_at'] ?? null,
                'initial_payment_paid' => (bool)($row['initial_payment_paid'] ?? false),
                'unit' => $row['room_name'],
                'rent' => '₱' . number_format($row['monthly_rent']),
                'status' => $row['status'] ?? 'Pending Review',
                'created_at' => $row['created_at'] ?? '',
                'valid_id_front_path' => $row['valid_id_front_path'] ?? null,
                'valid_id_back_path' => $row['valid_id_back_path'] ?? null,
                'nbi_clearance_path' => $row['nbi_clearance_path'] ?? null,
                // Appending avatar_url out to the wire payload for your React app pipeline!
                'avatar_url' => $row['avatar_url'] ?? null, 
                'rejection_reason' => $row['rejection_reason'] ?? null,
                'rejection_attachment_path' => $row['rejection_attachment_path'] ?? null,
            ];
        }
        echo json_encode(["success" => true, "data" => $applications]);
    } else {
        echo json_encode(["success" => false, "message" => "Could not load applications. Please try again."]);
    }
    
    $conn->close();
    exit;
}
?>
