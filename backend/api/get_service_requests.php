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

$status = $_GET['status'] ?? '';
$category = $_GET['category'] ?? '';

$conditions = [];
$params = [];
$types = "";

if ($status !== '' && strtolower($status) !== 'all') {
    $conditions[] = "sr.status = ?";
    $params[] = $status;
    $types .= "s";
}
if ($category !== '' && strtolower($category) !== 'all') {
    $conditions[] = "sr.category = ?";
    $params[] = $category;
    $types .= "s";
}
$where = $conditions ? "WHERE " . implode(" AND ", $conditions) : "";

$sql = "SELECT sr.id, sr.id AS rawId, sr.user_id AS userId,
               TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS tenant,
               COALESCE(NULLIF(sr.room_name, ''), ra.room_name, '—') AS unit,
               sr.service_id AS serviceId, sr.service_name AS serviceName, sr.category,
               sr.unit_price AS unitPrice, sr.pricing_unit AS pricingUnit,
               sr.quantity, sr.total_cost AS totalCost,
               sr.preferred_date AS preferredDate, sr.preferred_time_slot AS preferredTimeSlot,
               sr.notes, sr.attachment_path AS attachmentPath, sr.status,
               sr.admin_notes AS adminNotes, sr.assigned_to AS assignedTo,
               sr.is_invoiced AS isInvoiced, sr.invoice_id AS invoiceId,
               sr.billing_period AS billingPeriod,
               sr.completed_at AS completedAt, sr.created_at AS createdAt
        FROM service_requests sr
        LEFT JOIN users u ON sr.user_id = u.id
        LEFT JOIN rent_applications ra
               ON ra.user_id = sr.user_id
              AND ra.status IN ('Approved', 'active', 'pending-move-out')
        $where
        GROUP BY sr.id
        ORDER BY FIELD(sr.status, 'Pending', 'Approved', 'In Progress', 'Completed', 'Rejected', 'Cancelled'),
                 sr.preferred_date ASC, sr.created_at DESC";

$stmt = $conn->prepare($sql);
if (!$stmt) {
    echo json_encode(["success" => false, "message" => "Failed to load service requests.", "requests" => []]);
    $conn->close();
    exit;
}
if ($params) {
    $stmt->bind_param($types, ...$params);
}
$stmt->execute();
$res = $stmt->get_result();

$requests = [];
while ($row = $res->fetch_assoc()) {
    $row['unitPrice'] = (float)$row['unitPrice'];
    $row['quantity'] = (float)$row['quantity'];
    $row['totalCost'] = (float)$row['totalCost'];
    $row['isInvoiced'] = (int)$row['isInvoiced'];
    $requests[] = $row;
}
$stmt->close();

echo json_encode(["success" => true, "requests" => $requests]);
$conn->close();
?>
