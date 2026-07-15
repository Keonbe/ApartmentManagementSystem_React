<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Admin-Id, X-User-Id, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config.php';

// Verify admin for state-changing operations
$adminId = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $adminId)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Unauthorized. Admin access required.']);
    exit();
}

try {
    $data = json_decode(file_get_contents("php://input"), true);

    if (!isset($data['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Room ID is required.']);
        exit();
    }

    $id = $data['id'];
    
    // Get existing room to track changes
    $stmt = $conn->prepare("SELECT * FROM rooms WHERE id = ?");
    $stmt->bind_param("s", $id);
    $stmt->execute();
    $result = $stmt->get_result();
    $currentRoom = $result->fetch_assoc();
    $stmt->close();

    if (!$currentRoom) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Room not found.']);
        exit();
    }

    // Build update query dynamically based on provided fields
    $updateFields = [];
    $params = [];

    $allowedFields = ['status', 'tenant_name', 'lease_start', 'lease_end', 'last_tenant', 'maintenance_flag', 'monthly_rent'];
    
    foreach ($allowedFields as $field) {
        // Map frontend camelCase to db snake_case if necessary, or assume payload uses snake_case
        // Let's support both for robustness. We expect the payload to use snake_case for db fields but let's map camel case just in case.
        $camelCaseField = str_replace('_', '', lcfirst(ucwords($field, '_')));
        
        if (array_key_exists($field, $data)) {
             $updateFields[] = "$field = ?";
             $params[] = $data[$field];
        } else if (array_key_exists($camelCaseField, $data)) {
             $updateFields[] = "$field = ?";
             $params[] = $data[$camelCaseField];
        }
    }

    if (empty($updateFields)) {
         http_response_code(400);
         echo json_encode(['success' => false, 'message' => 'No fields provided to update.']);
         exit();
    }

    $params[] = $id;
    $sql = "UPDATE rooms SET " . implode(", ", $updateFields) . " WHERE id = ?";
    $stmt = $conn->prepare($sql);
    
    // Bind parameters dynamically for mysqli
    $types = str_repeat('s', count($params)); // Assuming all are strings/castable to string for simplicity, id is string
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $stmt->close();

    // Log the activity
    $actionDesc = "Updated details for Room $id.";
    if (isset($data['status']) && $data['status'] !== $currentRoom['status']) {
        $actionDesc .= " Status changed to " . $data['status'] . ".";
    }
    if (isset($data['maintenance_flag']) || isset($data['maintenanceFlag'])) {
        $flag = isset($data['maintenance_flag']) ? $data['maintenance_flag'] : $data['maintenanceFlag'];
        $flagVal = $flag ? 'True' : 'False';
        if ($flagVal !== ($currentRoom['maintenance_flag'] ? 'True' : 'False')) {
            $actionDesc .= " Maintenance flag set to $flagVal.";
        }
    }

    log_activity($conn, $adminId, 'system', 'Update Room', $actionDesc);

    echo json_encode(['success' => true, 'message' => 'Room updated successfully']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
