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

$input = json_decode(file_get_contents("php://input"), true) ?? [];

$user_id = (int)($input['userId'] ?? $_SERVER['HTTP_X_USER_ID'] ?? 0);
$id      = (int)($input['id'] ?? $input['rawId'] ?? 0);
$type    = $input['type'] ?? '';

if (!$user_id || !$id || !$type) {
    echo json_encode(["success" => false, "message" => "User ID, request ID and type are required."]);
    exit;
}

//MapsRequestTypeToItsOwningTable
switch ($type) {
    case 'Maintenance':
        $table = 'maintenance_requests';
        break;
    case 'CCTV':
        $table = 'cctv_requests';
        break;
    case 'Parking':
        $table = 'parking_reservations';
        break;
    case 'Service':
        //Only Pending rows are cancellable, so a billed booking can never reach here
        $table = 'service_requests';
        break;
    default:
        echo json_encode(["success" => false, "message" => "Unknown request type: $type"]);
        exit;
}

//OnlyPendingRowsMayBeCancelled,AndOnlyByTheirOwner
$stmt = $conn->prepare("UPDATE `$table` SET status = 'Cancelled' WHERE id = ? AND user_id = ? AND status = 'Pending'");
$stmt->bind_param("ii", $id, $user_id);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

if ($affected === 0) {
    echo json_encode(["success" => false, "message" => "Only pending requests can be cancelled."]);
    $conn->close();
    exit;
}

log_activity($conn, $user_id, 'service', "Cancelled Request", "$type Request ID: $id cancelled by tenant");

echo json_encode(["success" => true, "message" => "Request cancelled successfully."]);
$conn->close();
?>
