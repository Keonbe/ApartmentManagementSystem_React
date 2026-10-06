<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// A lease extension is always requested as the caller's own verified identity.
$auth = require_user($conn);
$user_id = $auth['id'];

try {
    $input = json_decode(file_get_contents("php://input"), true);
    $additionalMonths = (int)($input['additionalMonths'] ?? 0);

    // Capped at the 12-month extension maximum so a long minimum term never
    // makes extensions impossible.
    $minLeaseDuration = min(12, max(1, (int)get_setting($conn, 'min_lease_duration', 3)));

    if ($additionalMonths < $minLeaseDuration || $additionalMonths > 12) {
        throw new Exception("Invalid request: Extension must be between $minLeaseDuration and 12 months.");
    }

    $userQuery = $conn->prepare("SELECT u.id, u.first_name, u.last_name, ra.room_name FROM users u LEFT JOIN rent_applications ra ON ra.user_id = u.id AND ra.status IN ('Approved', 'active', 'pending-move-out') WHERE u.id = ? ORDER BY ra.id DESC LIMIT 1");
    $userQuery->bind_param("i", $user_id);
    $userQuery->execute();
    $user = $userQuery->get_result()->fetch_assoc();
    $userQuery->close();

    if ($user) {
        $userId = $user['id'];
        $tenantName = $user['first_name'] . ' ' . $user['last_name'];
        $roomName = $user['room_name'] ?? 'Unassigned';

        // Any still-open request blocks a new one, regardless of age — a
        // request pending for more than 24 hours used to stop blocking,
        // letting a tenant stack multiple independently-approvable requests.
        $checkStmt = $conn->prepare("SELECT id FROM notifications WHERE user_id = ? AND type = 'lease_extension_request' AND status = 'Pending'");
        $checkStmt->bind_param("i", $userId);
        $checkStmt->execute();
        $hasRecent = $checkStmt->get_result()->num_rows > 0;
        $checkStmt->close();

        if ($hasRecent) {
            echo json_encode(["success" => false, "message" => "You already have a pending rent extension request. Please wait for admin decision."]);
            exit;
        }

        $title = "Rent Extension Request";
        $msg = "$tenantName (Unit $roomName) requested a $additionalMonths month(s) rent extension.";

        $stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, metadata_value, status, is_read) VALUES (?, 'lease_extension_request', ?, ?, ?, 'Pending', 0)");
        if (!$stmt) {
            throw new Exception("Database prepare failed: " . $conn->error);
        }

        $stmt->bind_param("isss", $userId, $title, $msg, $additionalMonths);

        if ($stmt->execute()) {
            log_activity($conn, $userId, 'tenant', "Requested Rent Extension", "Unit $roomName: $additionalMonths month(s)");
            echo json_encode(["success" => true, "message" => "Rent extension request submitted for admin verification."]);
        } else {
            throw new Exception("Failed to save extension request.");
        }
        $stmt->close();
    } else {
        throw new Exception("User not found.");
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>