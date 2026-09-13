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
$id = (int)($input['id'] ?? 0);

if (!$id) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Request ID is required."]);
    exit;
}

$stmt = $conn->prepare("SELECT user_id, status, issue_category, title FROM maintenance_requests WHERE id = ?");
$stmt->bind_param("i", $id);
$stmt->execute();
$current = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$current) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Maintenance request not found."]);
    exit;
}

$sets = [];
$params = [];
$types = '';

// Only fields present in the payload are written, so one edit never wipes another field.
if (array_key_exists('assignedTo', $input)) {
    $assignee = trim((string)$input['assignedTo']);
    $sets[] = "assigned_to = ?";
    $params[] = $assignee === '' ? null : $assignee;
    $types .= 's';
}

foreach (['estimatedCost' => 'estimated_cost', 'actualCost' => 'actual_cost'] as $key => $column) {
    if (!array_key_exists($key, $input)) continue;
    $raw = $input[$key];
    if ($raw !== null && $raw !== '' && (!is_numeric($raw) || (float)$raw < 0)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Costs must be zero or a positive number."]);
        exit;
    }
    $sets[] = "$column = ?";
    $params[] = ($raw === null || $raw === '') ? null : (float)$raw;
    $types .= 'd';
}

if (array_key_exists('workNotes', $input)) {
    $sets[] = "work_notes = ?";
    $params[] = $input['workNotes'] === null ? null : (string)$input['workNotes'];
    $types .= 's';
}

if (array_key_exists('tenantResponsible', $input)) {
    $sets[] = "tenant_responsible = ?";
    $params[] = !empty($input['tenantResponsible']) ? 1 : 0;
    $types .= 'i';
}

// Priority triage is an admin-only decision — normalize_maintenance_urgency()
// only accepts the four real levels, so the "Needs Triage" sentinel a ticket
// starts with can never be re-selected once an admin has assigned a priority.
if (array_key_exists('urgency', $input)) {
    $urgency = normalize_maintenance_urgency($input['urgency'] ?? '');
    if (!$urgency) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Invalid priority level."]);
        exit;
    }
    $sets[] = "urgency = ?";
    $params[] = $urgency;
    $types .= 's';
}

$new_status = $input['status'] ?? null;
$status_changed = $new_status !== null && $new_status !== $current['status'];
$rejection_reason = null;

if ($status_changed) {
    $allowed = MAINTENANCE_TRANSITIONS[$current['status']] ?? [];
    if (!in_array($new_status, $allowed, true)) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "A {$current['status']} request cannot be moved to $new_status."]);
        exit;
    }

    if ($new_status === 'Rejected') {
        $rejection_reason = trim((string)($input['rejectionReason'] ?? ''));
        if ($rejection_reason === '') {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "A reason is required to reject a request."]);
            exit;
        }
        $sets[] = "rejection_reason = ?";
        $params[] = $rejection_reason;
        $types .= 's';
    }

    $sets[] = "status = ?";
    $params[] = $new_status;
    $types .= 's';

    if ($current['status'] === 'Pending') $sets[] = "acknowledged_at = COALESCE(acknowledged_at, NOW())";
    if ($new_status === 'In Progress') $sets[] = "started_at = COALESCE(started_at, NOW())";
    if ($new_status === 'Completed') $sets[] = "resolved_at = NOW()";
    if ($current['status'] === 'Completed') $sets[] = "resolved_at = NULL";
}

if (!$sets) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Nothing to update."]);
    exit;
}

$sql = "UPDATE maintenance_requests SET " . implode(', ', $sets) . " WHERE id = ?";
$params[] = $id;
$types .= 'i';

// Guard status changes on the status we read, so a concurrent change is not overwritten.
if ($status_changed) {
    $sql .= " AND status = ?";
    $params[] = $current['status'];
    $types .= 's';
}

$stmt = $conn->prepare($sql);
$stmt->bind_param($types, ...$params);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

if ($status_changed && $affected === 0) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This request was changed by someone else. Refresh and try again."]);
    exit;
}

$changed_fields = array_map(fn($set) => explode(' =', $set)[0], $sets);
$details = $status_changed
    ? "Status: {$current['status']} -> $new_status"
    : "Updated: " . implode(', ', $changed_fields);
log_activity($conn, $admin_id, 'maintenance', "Updated Maintenance Ticket #$id", $details);

if ($status_changed && $current['user_id']) {
    $label = $current['title'] ?: $current['issue_category'];
    $message = "Your maintenance request \"$label\" is now $new_status.";
    if ($rejection_reason !== null) $message .= " Reason: $rejection_reason";

    $notif = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, 'maintenance_update', 'Maintenance Update', ?, 'Resolved', 0)");
    $notif->bind_param("is", $current['user_id'], $message);
    $notif->execute();
    $notif->close();
}

echo json_encode(["success" => true, "message" => "Maintenance request updated."]);
$conn->close();
