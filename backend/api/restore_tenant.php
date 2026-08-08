<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['id'] ?? 0;

if ($id > 0) {
    // Get application details
    $stmt = $conn->prepare("SELECT user_id, room_name, first_name, last_name, monthly_rent, lease_start, lease_end, occupants FROM rent_applications WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $app = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$app) {
        echo json_encode(["success" => false, "message" => "Application record not found."]);
        exit;
    }

    $user_id = $app['user_id'] ? (int)$app['user_id'] : 0;
    $room_name = $app['room_name'];
    $full_name = $app['first_name'] . ' ' . $app['last_name'];
    $rent = $app['monthly_rent'];
    $lease_start = $app['lease_start'];
    $lease_end = $app['lease_end'];
    $occupants = $app['occupants'];

    $conn->begin_transaction();
    try {
        // 1. Restore rent application status to Approved
        $upd_stmt = $conn->prepare("UPDATE rent_applications SET status = 'Approved', archive_date = NULL, archive_reason = NULL, archive_notes = NULL WHERE id = ?");
        $upd_stmt->bind_param("i", $id);
        $upd_stmt->execute();
        $upd_stmt->close();

        // 2. Unarchive corresponding user
        if ($user_id > 0) {
            $user_stmt = $conn->prepare("UPDATE users SET is_archived = 0 WHERE id = ?");
            $user_stmt->bind_param("i", $user_id);
            $user_stmt->execute();
            $user_stmt->close();
        }

        // 3. Try to reoccupy the room if it is currently vacant
        $room_check = $conn->prepare("SELECT status FROM rooms WHERE id = ?");
        $room_check->bind_param("s", $room_name);
        $room_check->execute();
        $room_res = $room_check->get_result()->fetch_assoc();
        $room_check->close();

        $room_restored = false;
        if ($room_res && $room_res['status'] === 'vacant') {
            $room_stmt = $conn->prepare("UPDATE rooms SET status = 'occupied', tenant_name = ?, lease_start = ?, lease_end = ?, occupants = ? WHERE id = ?");
            $room_stmt->bind_param("sssis", $full_name, $lease_start, $lease_end, $occupants, $room_name);
            $room_stmt->execute();
            $room_stmt->close();
            $room_restored = true;
        }

        $conn->commit();
        log_activity($conn, $admin_id, 'Tenant Management', 'Restore Tenant', "Restored archived tenant $full_name (ID $id)");
        echo json_encode([
            "success" => true,
            "room_restored" => $room_restored,
            "message" => $room_restored ? "Tenant and unit restored successfully." : "Tenant restored successfully, but room $room_name is no longer vacant."
        ]);
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
} else {
    echo json_encode(["success" => false, "message" => "Invalid ID."]);
}
$conn->close();
?>
