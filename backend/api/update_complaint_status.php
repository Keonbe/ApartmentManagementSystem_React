<?php
// The admin moves a complaint through Open -> In Review -> Resolved (SPRINT 189).
//   POST { complaintId, status } -> { success, complaint: {id, status, resolvedAt} }
// COMPLAINT_TRANSITIONS decides which moves are allowed. The update is guarded on
// the status that was read, so two admins (or two tabs) acting on the same
// complaint get a 409 instead of overwriting each other.
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

$admin_id = (int)require_admin($conn); // the admin's id from the session

$input = read_json_input();
$complaint_id = $input['complaintId'] ?? null;
$status = trim((string)($input['status'] ?? ''));
$errors = array_filter([
    'complaintId' => v_id($complaint_id, 'Complaint'),
    'status' => v_enum($status, 'Status', array_keys(COMPLAINT_TRANSITIONS)),
]);
if ($errors) validation_fail($errors);
$complaint_id = (int)$complaint_id;

$conn->begin_transaction();
try {
    $stmt = $conn->prepare("SELECT id, user_id, category, status FROM complaints WHERE id = ? FOR UPDATE");
    $stmt->bind_param("i", $complaint_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        $conn->rollback();
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Complaint not found."]);
        exit;
    }
    $from = $row['status'];
    if ($from === $status) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This complaint is already $status."]);
        exit;
    }
    if (!in_array($status, COMPLAINT_TRANSITIONS[$from] ?? [], true)) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "A complaint that is $from cannot be moved to $status."]);
        exit;
    }

    $resolved = $status === 'Resolved';
    $upd = $conn->prepare("UPDATE complaints
                              SET status = ?, resolved_at = " . ($resolved ? "NOW()" : "NULL") . ", resolved_by = " . ($resolved ? "?" : "NULL") . "
                            WHERE id = ? AND status = ?");
    if ($resolved) $upd->bind_param("siis", $status, $admin_id, $complaint_id, $from);
    else $upd->bind_param("sis", $status, $complaint_id, $from);
    $upd->execute();
    $changed = $upd->affected_rows > 0;
    $upd->close();
    if (!$changed) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This complaint was changed by someone else. Refresh and try again."]);
        exit;
    }

    if ($resolved) resolve_admin_queue($conn, 'complaint', $complaint_id);

    create_notification($conn, (int)$row['user_id'], 'complaint_update', 'Complaint Update',
        "Your complaint #$complaint_id ({$row['category']}) is now: $status.", 'Resolved', "complaint:$complaint_id");
    log_activity($conn, $admin_id, 'tenant', 'Updated Complaint Status', "Complaint #$complaint_id: $from -> $status");

    $conn->commit();
} catch (Exception $e) {
    $conn->rollback();
    server_error_response($e, "Could not update the complaint. Please try again.");
}

echo json_encode(["success" => true, "complaint" => [
    "id" => $complaint_id, "status" => $status, "resolvedAt" => $status === 'Resolved' ? date('Y-m-d H:i:s') : null,
]]);
$conn->close();
