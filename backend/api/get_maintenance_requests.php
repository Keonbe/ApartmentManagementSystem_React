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



// Check if connection exists
if (!$conn) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Database connection failed"]);
    exit;
}

// Get admin ID from header
$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;

// Use the function from config.php
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

try {
    // Check if the table exists first
    $table_check = $conn->query("SHOW TABLES LIKE 'maintenance_requests'");
    if ($table_check->num_rows === 0) {
        throw new Exception("Table 'maintenance_requests' does not exist");
    }
    $query = "
        SELECT 
            m.id,
            m.user_id,
            m.issue_category,
            m.urgency,
            m.preferred_date,
            m.preferred_time,
            m.description,
            m.permission_to_enter,
            m.attachment_path,
            m.created_at,
            m.status,
            CONCAT(u.first_name, ' ', u.last_name) AS tenant_name,
            ra.room_name
        FROM maintenance_requests m
        LEFT JOIN users u ON m.user_id = u.id
        LEFT JOIN rent_applications ra ON ra.user_id = m.user_id AND ra.status = 'Approved'
        ORDER BY m.created_at DESC
    ";

$stmt = $conn->prepare("
    SELECT 
        m.*,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Unknown Tenant') AS tenant_name,
        COALESCE(ra.room_name, '—') AS room_name
    FROM maintenance_requests m
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN rent_applications ra ON m.user_id = ra.user_id
    ORDER BY m.created_at DESC
");
    
    if (!$stmt) {
        throw new Exception("Failed to prepare query: " . $conn->error);
    }
    
    $stmt->execute();
    $result = $stmt->get_result();
    $requests = [];
    
    while ($row = $result->fetch_assoc()) {
        // Ensure room_name has a fallback value
        if (empty($row['room_name'])) {
            $row['room_name'] = 'N/A';
        }
        $requests[] = $row;
    }
    $stmt->close();

    echo json_encode(['success' => true, 'requests' => $requests]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false, 
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}

$conn->close();
?>