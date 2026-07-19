<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
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

    $allowedFields = ['status', 'tenant_name', 'lease_start', 'lease_end', 'last_tenant', 'maintenance_flag', 'monthly_rent', 'occupants'];
    
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

    $user_id = $data['user_id'] ?? $data['userId'] ?? null;
    $status = $data['status'] ?? null;
    if ($status === 'occupied' && !empty($user_id)) {
        // Fetch user info
        $u_stmt = $conn->prepare("SELECT first_name, last_name, email_address, contact_no, gender FROM users WHERE id = ?");
        $u_stmt->bind_param("i", $user_id);
        $u_stmt->execute();
        $u_res = $u_stmt->get_result();
        if ($u_res->num_rows > 0) {
            $user_info = $u_res->fetch_assoc();
            $first_name = $user_info['first_name'];
            $last_name = $user_info['last_name'];
            $email = $user_info['email_address'];
            $contact_no = $user_info['contact_no'] ?? '';
            $gender = $user_info['gender'] ?? 'Not Specified';

            $lease_start = $data['lease_start'] ?? $data['leaseStart'] ?? date('Y-m-d');
            $lease_end = $data['lease_end'] ?? $data['leaseEnd'] ?? date('Y-m-d', strtotime('+6 months'));
            $monthly_rent = (double)($data['monthly_rent'] ?? $data['monthlyRent'] ?? $currentRoom['monthly_rent'] ?? 4000);
            
            // Calculate months of rent
            $ts1 = strtotime($lease_start);
            $ts2 = strtotime($lease_end);
            $year1 = date('Y', $ts1);
            $year2 = date('Y', $ts2);
            $month1 = date('m', $ts1);
            $month2 = date('m', $ts2);
            $months = (($year2 - $year1) * 12) + ($month2 - $month1);
            if ($months <= 0) $months = 6;

            // Check if there is already an approved application for this room and user
            $app_check = $conn->prepare("SELECT id FROM rent_applications WHERE user_id = ? AND room_name = ? AND status = 'Approved' LIMIT 1");
            $app_check->bind_param("is", $user_id, $id);
            $app_check->execute();
            $check_res = $app_check->get_result();
            if ($check_res->num_rows === 0) {
                // Insert a dummy approved application so the user can access the room
                $ins_app = $conn->prepare("INSERT INTO rent_applications (user_id, first_name, last_name, contact_no, email, gender, occupants, months_of_rent, room_name, monthly_rent, valid_id_front_path, valid_id_back_path, nbi_clearance_path, status) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'placeholder', 'placeholder', 'placeholder', 'Approved')");
                $ins_app->bind_param("isssssisd", $user_id, $first_name, $last_name, $contact_no, $email, $gender, $months, $id, $monthly_rent);
                $ins_app->execute();
                $ins_app->close();
            }
            $app_check->close();
        }
        $u_stmt->close();
    }

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
