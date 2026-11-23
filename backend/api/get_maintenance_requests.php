<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_admin($conn);

// ?closedDays=N (the maintenance board): every open ticket, but closed ones
// (Completed / Rejected / Cancelled) only when they closed in the last N days;
// `olderClosed` says how many were left out. Without it (or 0) the whole
// history is returned, as before (the tenant profile reads it that way).
$closed_days = max(0, min(3650, (int)($_GET['closedDays'] ?? 0)));
$closed_list = "('Completed', 'Rejected', 'Cancelled')";
$closed_at = "COALESCE(m.resolved_at, m.started_at, m.acknowledged_at, m.created_at)";
$window_sql = $closed_days > 0 ? " WHERE (m.status NOT IN $closed_list OR $closed_at >= DATE_SUB(NOW(), INTERVAL $closed_days DAY))" : "";

// Unit comes from the snapshot taken at ticket creation; the tenancy lookup only covers older rows.
$query = "SELECT m.*, u.first_name, u.last_name, u.suffix,
                 COALESCE(m.room_name, (SELECT ra.room_name FROM rent_applications ra
                                        WHERE ra.user_id = m.user_id
                                          AND ra.status IN ('Approved', 'active', 'pending-move-out')
                                        ORDER BY ra.id DESC LIMIT 1)) AS unit_name
          FROM maintenance_requests m
          LEFT JOIN users u ON m.user_id = u.id
          $window_sql
          ORDER BY FIELD(m.status, 'Pending', 'In Progress', 'Completed', 'Rejected', 'Cancelled'),
                   FIELD(m.urgency, 'Urgent', 'High', 'Medium', 'Low'),
                   m.created_at ASC";

$result = $conn->query($query);

if (!$result) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to load maintenance requests."]);
    exit;
}

$money = fn($v) => $v === null ? null : (float)$v;

$requests = [];
while ($row = $result->fetch_assoc()) {
    $resolution_hours = $row['resolved_at']
        ? round((strtotime($row['resolved_at']) - strtotime($row['created_at'])) / 3600, 1)
        : null;

    $requests[] = [
        'id' => (int)$row['id'],
        'title' => $row['title'],
        'tenant' => person_name($row),
        'unit' => $row['unit_name'],
        'category' => $row['issue_category'],
        'urgency' => $row['urgency'],
        'preferredDate' => $row['preferred_date'],
        'preferredTime' => $row['preferred_time'],
        'description' => $row['description'],
        'attachmentPath' => $row['attachment_path'],
        'status' => $row['status'],
        'assignedTo' => $row['assigned_to'],
        'estimatedCost' => $money($row['estimated_cost']),
        'actualCost' => $money($row['actual_cost']),
        'workNotes' => $row['work_notes'],
        'tenantResponsible' => (bool)$row['tenant_responsible'],
        'rejectionReason' => $row['rejection_reason'],
        'scheduledDate' => $row['scheduled_date'],
        'scheduledWindow' => $row['scheduled_window'],
        'cancelRequestedAt' => $row['cancel_requested_at'],
        'reopenReason' => $row['reopen_reason'],
        'createdAt' => $row['created_at'],
        'acknowledgedAt' => $row['acknowledged_at'],
        'startedAt' => $row['started_at'],
        'resolvedAt' => $row['resolved_at'],
        'resolutionHours' => $resolution_hours,
    ];
}

$out = ["success" => true, "requests" => $requests];
if ($closed_days > 0) {
    $older = $conn->query("SELECT COUNT(*) AS c FROM maintenance_requests m
                           WHERE m.status IN $closed_list AND $closed_at < DATE_SUB(NOW(), INTERVAL $closed_days DAY)");
    $out['closedDays'] = $closed_days;
    $out['olderClosed'] = (int)($older->fetch_assoc()['c'] ?? 0);
}
echo json_encode($out);
$conn->close();
