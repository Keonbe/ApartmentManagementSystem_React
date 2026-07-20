<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$notification_id = $input['notificationId'] ?? 0;
$action = $input['action'] ?? ''; // 'approve' or 'reject'

if (!$notification_id || !in_array($action, ['approve', 'reject'])) {
    echo json_encode(["success" => false, "message" => "Invalid parameters"]);
    exit;
}

try {
    // 1. Fetch notification details
    $stmt = $conn->prepare("SELECT * FROM notifications WHERE id = ?");
    $stmt->bind_param("i", $notification_id);
    $stmt->execute();
    $notif = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$notif) {
        throw new Exception("Notification request not found.");
    }

    $target_user_id = $notif['user_id'];
    $type = $notif['type'];

    if ($action === 'approve') {
        if ($type === 'occupancy_request') {
            // Extract proposed occupants from details/message or stored value
            $new_occupants = (int) $notif['metadata_value']; 
            
            $updateStmt = $conn->prepare("UPDATE rent_applications SET occupants = ? WHERE user_id = ? AND status = 'Approved'");
            $updateStmt->bind_param("ii", $new_occupants, $target_user_id);
            $updateStmt->execute();
            $updateStmt->close();

            log_activity($conn, $admin_id, 'tenant', "Approved Occupancy Change", "User ID: $target_user_id updated to $new_occupants occupants");

        } else if ($type === 'lease_extension_request') {
            $add_months = (int) $notif['metadata_value'];

            $updateStmt = $conn->prepare("UPDATE rent_applications SET months_of_rent = months_of_rent + ? WHERE user_id = ? AND status = 'Approved'");
            $updateStmt->bind_param("ii", $add_months, $target_user_id);
            $updateStmt->execute();
            $updateStmt->close();

            log_activity($conn, $admin_id, 'contract', "Approved Lease Extension", "User ID: $target_user_id extended by $add_months months");
        }
    }

    // 2. Mark notification as read / resolved
    $markStmt = $conn->prepare("UPDATE notifications SET is_read = 1, status = ? WHERE id = ?");
    $statusText = ($action === 'approve') ? 'Approved' : 'Rejected';
    $markStmt->bind_param("si", $statusText, $notification_id);
    $markStmt->execute();
    $markStmt->close();

    // 3. Notify Tenant of decision
    $title = ($action === 'approve') ? "Request Approved" : "Request Declined";
    $msg = "Your " . str_replace('_', ' ', $type) . " has been " . strtolower($statusText) . " by management.";
    
    $userNotif = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, is_read) VALUES (?, ?, ?, ?, 0)");
    $userNotif->bind_param("isss", $target_user_id, $type, $title, $msg);
    $userNotif->execute();
    $userNotif->close();

    echo json_encode(["success" => true, "message" => "Request $statusText successfully."]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Server error: " . $e->getMessage()]);
}

$conn->close();
?>