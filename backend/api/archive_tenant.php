<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['id'] ?? 0;
$archiveReason = $input['archiveReason'] ?? 'End of Lease';
$archiveNotes = $input['archiveNotes'] ?? '';
$archiveDate = date('Y-m-d');

if ($id > 0) {
    // Get room name and tenant name before archiving
    $get_room = $conn->prepare("SELECT room_name, first_name, last_name FROM rent_applications WHERE id = ?");
    $get_room->bind_param("i", $id);
    $get_room->execute();
    $room_res = $get_room->get_result()->fetch_assoc();
    $get_room->close();

    $conn->begin_transaction();
    try {
        $stmt = $conn->prepare("UPDATE rent_applications SET status = 'archived', archive_date = ?, archive_reason = ?, archive_notes = ? WHERE id = ?");
        $stmt->bind_param("sssi", $archiveDate, $archiveReason, $archiveNotes, $id);
        $stmt->execute();
        $stmt->close();

        if ($room_res) {
            $room_name = $room_res['room_name'];
            $full_name = $room_res['first_name'] . ' ' . $room_res['last_name'];
            
            $room_stmt = $conn->prepare("UPDATE rooms SET status = 'vacant', last_tenant = ?, tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0 WHERE id = ?");
            $room_stmt->bind_param("ss", $full_name, $room_name);
            $room_stmt->execute();
            $room_stmt->close();
        }

        $conn->commit();
        echo json_encode(["success" => true]);
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
} else {
    echo json_encode(["success" => false, "message" => "Invalid ID"]);
}
$conn->close();
?>
