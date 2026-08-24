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
$user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
$isAdmin = verify_admin($conn, $admin_id);

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    echo json_encode(["success" => false, "message" => "Invalid JSON payload."]);
    exit;
}

$id = (int)($input['id'] ?? $input['rawId'] ?? 0);
$action = trim($input['action'] ?? $input['status'] ?? '');
$checkout_notes = trim($input['checkoutNotes'] ?? $input['checkout_notes'] ?? '');
$admin_notes = trim($input['adminNotes'] ?? $input['admin_notes'] ?? '');

if (!$id || empty($action)) {
    echo json_encode(["success" => false, "message" => "Visitor ID and action are required."]);
    exit;
}

try {
    // 1. Fetch current visitor log
    $q = $conn->prepare("SELECT * FROM visitor_logs WHERE id = ?");
    $q->bind_param("i", $id);
    $q->execute();
    $visitor = $q->get_result()->fetch_assoc();
    $q->close();

    if (!$visitor) {
        throw new Exception("Visitor record not found.");
    }

    // Permission check: if tenant, must be their visitor
    if (!$isAdmin && (int)$visitor['user_id'] !== (int)$user_id) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Forbidden: You cannot modify this visitor record."]);
        exit;
    }

    $target_user_id = $visitor['user_id'];
    $visitor_name = $visitor['visitor_name'];
    $unit = $visitor['room_name'];

    // 2. Perform state transition
    if ($action === 'checked_in' || $action === 'approve') {
        if (!$isAdmin) {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "Forbidden: Only admins can approve visitors."]);
            exit;
        }

        $stmt = $conn->prepare("UPDATE visitor_logs SET status = 'checked_in', admin_notes = ?, check_in_at = NOW() WHERE id = ?");
        $stmt->bind_param("si", $admin_notes, $id);
        $stmt->execute();
        $stmt->close();

        if ($target_user_id) {
            $n_title = "Visitor Approved: $visitor_name";
            $n_msg = "Management has approved the entry of your visitor $visitor_name for Unit $unit.";
            $n_stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, 'visitor_log', ?, ?, 'Approved', 0)");
            $n_stmt->bind_param("iss", $target_user_id, $n_title, $n_msg);
            $n_stmt->execute();
            $n_stmt->close();
        }

        log_activity($conn, $admin_id, 'service', "Approved Visitor Entry", "Visitor $visitor_name entry approved for Unit $unit");

    } else if ($action === 'denied' || $action === 'reject') {
        if (!$isAdmin) {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "Forbidden: Only admins can deny visitor entries."]);
            exit;
        }

        $stmt = $conn->prepare("UPDATE visitor_logs SET status = 'denied', admin_notes = ? WHERE id = ?");
        $stmt->bind_param("si", $admin_notes, $id);
        $stmt->execute();
        $stmt->close();

        if ($target_user_id) {
            $n_title = "Visitor Entry Declined";
            $n_msg = "Visitor registration for $visitor_name (Unit $unit) was declined by management. Note: " . ($admin_notes ?: 'No additional notes provided.');
            $n_stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, 'visitor_log', ?, ?, 'Resolved', 0)");
            $n_stmt->bind_param("iss", $target_user_id, $n_title, $n_msg);
            $n_stmt->execute();
            $n_stmt->close();
        }

        log_activity($conn, $admin_id, 'service', "Denied Visitor Entry", "Visitor $visitor_name entry denied for Unit $unit");

    } else if ($action === 'checked_out' || $action === 'checkout') {
        $stmt = $conn->prepare("UPDATE visitor_logs SET status = 'checked_out', check_out_at = NOW(), checkout_notes = ? WHERE id = ?");
        $stmt->bind_param("si", $checkout_notes, $id);
        $stmt->execute();
        $stmt->close();

        $actor_id = $isAdmin ? $admin_id : $user_id;
        $actor_role = $isAdmin ? 'service' : 'tenant';
        log_activity($conn, $actor_id, $actor_role, "Visitor Checked Out", "Visitor $visitor_name checked out from Unit $unit");
    } else {
        throw new Exception("Unknown action: " . htmlspecialchars($action));
    }

    echo json_encode(["success" => true, "message" => "Visitor record updated successfully."]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>