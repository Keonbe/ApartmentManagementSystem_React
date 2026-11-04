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

// A tenant only ever sees their own requests; an admin may look up a specific tenant.
$auth = require_user($conn);
$user_id = $auth['id'];
if ($auth['role'] === 'admin' && !empty($_GET['userId'])) {
    $user_id = (int)$_GET['userId'];
}

$query = "(SELECT id, 'Maintenance' AS type, COALESCE(title, issue_category) AS title, status, created_at, resolved_at, attachment_path, description, NULL AS total_cost, rejection_reason, NULL AS footage_kind, NULL AS footage_path, NULL AS footage_expires_at, NULL AS footage_expired,
                  assigned_to, scheduled_date, scheduled_window,
                  CASE WHEN tenant_responsible = 1 THEN COALESCE(actual_cost, estimated_cost) END AS charge_amount,
                  tenant_responsible, cancel_requested_at, reopen_reason,
                  (status = 'Completed' AND is_invoiced = 0 AND (resolved_at IS NULL OR resolved_at >= NOW() - INTERVAL " . MAINTENANCE_REOPEN_DAYS . " DAY)) AS can_reopen,
                  NULL AS quantity, NULL AS pricing_unit, NULL AS booked_total_cost, NULL AS admin_note, NULL AS service_id,
                  NULL AS rating, NULL AS rating_comment
           FROM maintenance_requests WHERE user_id = ?)
          UNION ALL
          (SELECT id, 'CCTV', location_details, status, created_at, NULL, NULL, reason_request, NULL, decision_note,
                  CASE WHEN footage_path IS NOT NULL THEN 'file' WHEN footage_url IS NOT NULL THEN 'link' ELSE NULL END, footage_path, footage_expires_at,
                  (footage_expires_at IS NOT NULL AND footage_expires_at <= NOW()), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL FROM cctv_requests WHERE user_id = ?)
          UNION ALL
          (SELECT id, 'Parking', vehicle_type, status, created_at, NULL, document_path, vehicle_model, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL FROM parking_reservations WHERE user_id = ?)
          UNION ALL
          (SELECT id, 'Service', service_name, status, created_at, completed_at, attachment_path, notes, total_cost,
                  CASE WHEN status IN ('Rejected', 'Cancelled') THEN admin_notes END, NULL, NULL, NULL, NULL,
                  assigned_to, scheduled_date, scheduled_window, NULL, NULL, cancel_requested_at, NULL, NULL,
                  quantity, pricing_unit, booked_total_cost, CASE WHEN status NOT IN ('Rejected', 'Cancelled') THEN admin_notes END, service_id,
                  rating, rating_comment
           FROM service_requests WHERE user_id = ?)
          ORDER BY created_at DESC";

$stmt = $conn->prepare($query);
$stmt->bind_param("iiii", $user_id, $user_id, $user_id, $user_id);
$stmt->execute();
$res = $stmt->get_result();

$requests = [];
while ($row = $res->fetch_assoc()) {
    if ($row['type'] === 'Service') {
        $row['can_cancel_free'] = (int)service_cancel_is_free($row['status'], $row['scheduled_date'], $row['scheduled_window']);
        $row['can_rate'] = (int)($row['status'] === 'Completed' && $row['rating'] === null
            && (!$row['resolved_at'] || strtotime($row['resolved_at']) >= strtotime('-' . SERVICE_RATING_DAYS . ' days')));
    }
    $requests[] = $row;
}
$stmt->close();

echo json_encode(["success" => true, "requests" => $requests]);
$conn->close();
