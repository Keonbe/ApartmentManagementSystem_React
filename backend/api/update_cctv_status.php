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

$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$id = (int)($input['rawId'] ?? $input['id'] ?? 0);
$status = $input['status'] ?? null;

if (!$id || !in_array($status, ['Approved', 'Rejected'], true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Invalid parameters."]);
    exit;
}

try {
    // A request is decided once: only a Pending request can be approved or rejected.
    $stmt = $conn->prepare("UPDATE cctv_requests SET status = ? WHERE id = ? AND status = 'Pending'");
    $stmt->bind_param("si", $status, $id);
    $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();

    if ($affected === 0) {
        $check = $conn->prepare("SELECT status FROM cctv_requests WHERE id = ?");
        $check->bind_param("i", $id);
        $check->execute();
        $existing = $check->get_result()->fetch_assoc();
        $check->close();

        http_response_code($existing ? 409 : 404);
        echo json_encode([
            "success" => false,
            "message" => $existing ? "This request has already been " . strtolower($existing['status']) . "." : "CCTV request not found."
        ]);
        exit;
    }

    $infoStmt = $conn->prepare("SELECT user_id, location_details, incident_date FROM cctv_requests WHERE id = ?");
    $infoStmt->bind_param("i", $id);
    $infoStmt->execute();
    $cctv = $infoStmt->get_result()->fetch_assoc();
    $infoStmt->close();

    if ($cctv) {
        $notifTitle = "CCTV Request " . $status;
        $notifMsg = "Your CCTV footage request for " . $cctv['location_details'] . " on " . $cctv['incident_date'] . " has been " . strtolower($status) . ".";
        $notifStmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, 'cctv_request', ?, ?, 'Resolved', 0)");
        $notifStmt->bind_param("iss", $cctv['user_id'], $notifTitle, $notifMsg);
        $notifStmt->execute();
        $notifStmt->close();
    }

    log_activity($conn, $admin_id, 'service', "Updated CCTV Request", "CCTV Request ID: $id status set to $status");

    echo json_encode(["success" => true, "message" => "CCTV request status updated successfully."]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to update the CCTV request."]);
}

$conn->close();
