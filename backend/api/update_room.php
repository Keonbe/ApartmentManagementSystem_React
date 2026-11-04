<?php
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config.php';

// Verify admin for state-changing operations. Uses the real verified
// session id (not a client-supplied header) both for the gate and for
// activity-log attribution below.
$adminId = require_admin($conn);

try {
    $data = json_decode(file_get_contents("php://input"), true);

    if (!isset($data['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Room ID is required.']);
        exit();
    }

    $id = $data['id'];
    
    // Get existing room to track changes
    $archiveColumn = $conn->query("SHOW COLUMNS FROM rooms LIKE 'archived_at'");
    $activeRoomFilter = ($archiveColumn && $archiveColumn->num_rows > 0) ? ' AND archived_at IS NULL' : '';
    $stmt = $conn->prepare("SELECT * FROM rooms WHERE id = ?" . $activeRoomFilter);
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

    // Manual tenant assignment (payments audit 2026-09-30): a unit only becomes
    // 'occupied' when a move-in is confirmed, after the move-in invoice
    // (advance rent + deposit) is paid. Assigning a tenant here holds the unit
    // as 'reserved' and bills the move-in below, exactly like an approved
    // application; a bare 'occupied' with no tenant is refused.
    $assign_user_id = $data['user_id'] ?? $data['userId'] ?? null;
    $assigning = ($data['status'] ?? null) === 'occupied';

    // Room status is not free-form (audit M6): vacant/reserved/occupied follow
    // approval, move-in, move-out and holds, and repairs use maintenance_flag.
    // The only status this endpoint accepts is 'occupied' from the assign flow.
    if (array_key_exists('status', $data) && !$assigning) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Room status changes through approval, move-in, move-out or a hold, not here.']);
        exit();
    }
    // Tenant fields belong to the tenancy, so they're only set while assigning.
    if (!$assigning) {
        foreach (['tenant_name', 'tenantName', 'last_tenant', 'lastTenant', 'occupants'] as $tenantField) {
            unset($data[$tenantField]);
        }
        // Rent dates belong to the contract. Changing them here only moved the
        // room's copy, so added months were never billed; Units -> Extend Rent
        // now goes through admin_extend_rent.php (extend_tenancy()).
        foreach (['lease_start', 'leaseStart', 'lease_end', 'leaseEnd'] as $dateField) {
            if (array_key_exists($dateField, $data)) {
                http_response_code(422);
                echo json_encode(['success' => false, 'message' => "Use Extend Rent to change a tenant's rent end."]);
                exit();
            }
        }
    }

    if ($assigning) {
        if (empty($assign_user_id)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Choose the tenant to assign. A unit becomes occupied only when a tenant\'s move-in is confirmed.']);
            exit();
        }
        if (!in_array($currentRoom['status'], ['vacant', 'reserved'], true)) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => "Room $id is {$currentRoom['status']} and cannot be assigned."]);
            exit();
        }
        // One tenancy per user: refuse if they already rent, or have an open
        // application for, a different room.
        $claiming = "'" . implode("','", ROOM_CLAIMING_APPLICATION_STATUSES) . "'";
        $other = $conn->prepare("SELECT room_name FROM rent_applications WHERE user_id = ? AND room_name <> ? AND status IN ($claiming) LIMIT 1");
        $other->bind_param("is", $assign_user_id, $id);
        $other->execute();
        $other_row = $other->get_result()->fetch_assoc();
        $other->close();
        if ($other_row) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => "This tenant already has an open rent or application for Unit {$other_row['room_name']}."]);
            exit();
        }
        $data['status'] = 'reserved';
    }

    // Build update query dynamically based on provided fields
    $updateFields = [];
    $params = [];

    $allowedFields = ['status', 'tenant_name', 'lease_start', 'lease_end', 'last_tenant', 'maintenance_flag', 'available_date', 'monthly_rent', 'occupants', 'room_condition', 'furnishing_status', 'last_inspection_date'];
    
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

    // A rent set by hand (outside the assign flow) is remembered as a custom
    // rent, so "apply floor rent" leaves it alone. Matching the floor price
    // clears the flag.
    if (!$assigning && (array_key_exists('monthly_rent', $data) || array_key_exists('monthlyRent', $data))) {
        $new_rent = $data['monthly_rent'] ?? $data['monthlyRent'];
        if (!is_numeric($new_rent) || (float)$new_rent <= 0) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Monthly rent must be greater than 0.']);
            exit();
        }
        $floor_rate = floor_rate_for($conn, $currentRoom['floor']);
        $updateFields[] = "rent_is_custom = ?";
        $params[] = ($floor_rate === null || abs($floor_rate - (float)$new_rent) > 0.001) ? 1 : 0;
    }

    if (empty($updateFields)) {
         http_response_code(400);
         echo json_encode(['success' => false, 'message' => 'No fields provided to update.']);
         exit();
    }

    $params[] = $id;
    $sql = "UPDATE rooms SET " . implode(", ", $updateFields) . " WHERE id = ?";

    // Both the room update and the possible synthetic-application insert
    // below must succeed together — a failure partway through used to be
    // able to leave the room marked "occupied" with no application backing
    // it (or vice versa).
    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare($sql);

        // Bind parameters dynamically for mysqli
        $types = str_repeat('s', count($params)); // Assuming all are strings/castable to string for simplicity, id is string
        $stmt->bind_param($types, ...$params);
        if (!$stmt->execute()) {
            error_log("[AMS] Failed to update room: " . $stmt->error);
            throw new Exception("Failed to update room.");
        }
        $stmt->close();

        $user_id = $assign_user_id;
        if ($assigning) {
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

                // Manual admin assignment (no self-service application on file) still
                // has to satisfy checklist 1.7's acceptance criteria — since there are no
                // uploaded documents in this flow, the admin must explicitly attest the
                // documents were checked in person before this synthetic record is
                // created as already 'Approved'.
                $identity_verified = filter_var($data['identity_verified'] ?? $data['identityVerified'] ?? false, FILTER_VALIDATE_BOOLEAN);
                if (!$identity_verified) {
                    throw new Exception("Cannot assign tenant: identity verification must be confirmed first.");
                }

                // Check if there is already an approved/active application for this room and user
                $app_check = $conn->prepare("SELECT id FROM rent_applications WHERE user_id = ? AND room_name = ? AND status IN ('Approved', 'active', 'pending-move-out') LIMIT 1");
                $app_check->bind_param("is", $user_id, $id);
                $app_check->execute();
                $existing_app = $app_check->get_result()->fetch_assoc();
                $assigned_app_id = $existing_app ? (int)$existing_app['id'] : null;
                if (!$existing_app) {
                    // Insert an admin-attested approved application so the user can access
                    // the room. No files are uploaded through this in-person flow, so it
                    // has no application_documents; documents_verified_at and
                    // terms_agreed_at record the admin's attestation above instead.
                    $ins_app = $conn->prepare("INSERT INTO rent_applications (user_id, first_name, last_name, contact_no, email, gender, occupants, months_of_rent, room_name, monthly_rent, status, terms_agreed_at, documents_verified_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'Approved', NOW(), NOW())");
                    $ins_app->bind_param("isssssisd", $user_id, $first_name, $last_name, $contact_no, $email, $gender, $months, $id, $monthly_rent);
                    if (!$ins_app->execute()) {
                        error_log("[AMS] Failed to create application record for the assigned tenant: " . $ins_app->error);
                        throw new Exception("Failed to create application record for the assigned tenant.");
                    }
                    $assigned_app_id = (int)$conn->insert_id;
                    $ins_app->close();
                }
                $app_check->close();

                // The same move-in invoice and draft contract an approved
                // application gets — no tenancy starts without them.
                issue_move_in_billing($conn, $assigned_app_id, (int)$user_id, $monthly_rent, $lease_start, $lease_end);
            } else {
                throw new Exception("Cannot assign tenant: user $user_id was not found.");
            }
            $u_stmt->close();
        }

        $conn->commit();
    } catch (Exception $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => public_error_message($e)]);
        exit();
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

    if ($assigning) {
        $actionDesc .= " Reserved for user $user_id; move-in invoice (advance rent + deposit) issued.";
        create_notification($conn, (int)$user_id, 'billing', 'Unit Reserved — Move-In Payment Due',
            "Unit $id has been reserved for you. Pay the move-in invoice (1 month advance rent + 1 month security deposit) on the Pay Bills page; your move-in date is set once it is paid.");
    }

    log_activity($conn, $adminId, 'unit', 'Updated Unit', $actionDesc);

    echo json_encode(['success' => true, 'message' => $assigning
        ? "Room $id reserved. The move-in invoice (advance rent + deposit) was issued; the unit becomes occupied when the move-in is confirmed after payment."
        : 'Room updated successfully']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => public_error_message($e)]);
}
?>
