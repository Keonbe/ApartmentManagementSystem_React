<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_admin($conn);

// Unit comes from the snapshot taken at ticket creation; the tenancy lookup only covers older rows.
$query = "SELECT m.*, u.first_name, u.last_name,
                 COALESCE(m.room_name, (SELECT ra.room_name FROM rent_applications ra
                                        WHERE ra.user_id = m.user_id
                                          AND ra.status IN ('Approved', 'active', 'pending-move-out')
                                        ORDER BY ra.id DESC LIMIT 1)) AS unit_name
          FROM maintenance_requests m
          LEFT JOIN users u ON m.user_id = u.id
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
        'tenant' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
        'unit' => $row['unit_name'],
        'category' => $row['issue_category'],
        'urgency' => $row['urgency'],
        'preferredDate' => $row['preferred_date'],
        'preferredTime' => $row['preferred_time'],
        'description' => $row['description'],
        'permissionToEnter' => (bool)$row['permission_to_enter'],
        'attachmentPath' => $row['attachment_path'],
        'status' => $row['status'],
        'assignedTo' => $row['assigned_to'],
        'estimatedCost' => $money($row['estimated_cost']),
        'actualCost' => $money($row['actual_cost']),
        'workNotes' => $row['work_notes'],
        'tenantResponsible' => (bool)$row['tenant_responsible'],
        'rejectionReason' => $row['rejection_reason'],
        'createdAt' => $row['created_at'],
        'acknowledgedAt' => $row['acknowledged_at'],
        'startedAt' => $row['started_at'],
        'resolvedAt' => $row['resolved_at'],
        'resolutionHours' => $resolution_hours,
    ];
}

echo json_encode(["success" => true, "requests" => $requests]);
$conn->close();
