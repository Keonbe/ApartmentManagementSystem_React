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

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$rawId = $input['rawId'] ?? $input['id'] ?? null;
$status = $input['status'] ?? null;

if (!$rawId || !in_array($status, ['Approved', 'Rejected', 'Pending'])) {
    echo json_encode(["success" => false, "message" => "Invalid parameters."]);
    exit;
}

try {
    $stmt = $conn->prepare("UPDATE cctv_requests SET status = ? WHERE id = ?");
    $stmt->bind_param("si", $status, $rawId);
    $stmt->execute();
    $stmt->close();

    // Get request details for notification & logging
    $infoStmt = $conn->prepare("SELECT user_id, location_details, incident_date FROM cctv_requests WHERE id = ?");
    $infoStmt->bind_param("i", $rawId);
    $infoStmt->execute();
    $cctv = $infoStmt->get_result()->fetch_assoc();
    $infoStmt->close();

    if ($cctv) {
        $userId = $cctv['user_id'];
        $notifTitle = "CCTV Request " . $status;
        $notifMsg = "Your CCTV footage request for " . $cctv['location_details'] . " on " . $cctv['incident_date'] . " has been " . strtolower($status) . ".";
        
        $notifStmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, 'cctv_request', ?, ?, 'Resolved', 0)");
        $notifStmt->bind_param("iss", $userId, $notifTitle, $notifMsg);
        $notifStmt->execute();
        $notifStmt->close();
    }

    log_activity($conn, $admin_id, 'service', "Updated CCTV Request", "CCTV Request ID: $rawId status set to $status");

    echo json_encode(["success" => true, "message" => "CCTV request status updated successfully."]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>