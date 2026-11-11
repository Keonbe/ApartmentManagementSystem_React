<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$auth = require_user($conn);
$is_admin = $auth['role'] === 'admin';
$uid = (int)$auth['id'];

$sql = "SELECT r.*,
        COALESCE(r.paymongo_payment_id,
                 (SELECT inv.paymongo_payment_id FROM invoices inv WHERE inv.id = r.invoice_id),
                 (SELECT ai.paymongo_payment_id FROM advance_credits c JOIN invoices ai ON ai.id = c.advance_invoice_id WHERE c.refund_request_id = r.id LIMIT 1)) AS source_payment_id,
        TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) AS tenant_name, u.email_address AS tenant_email, ra.room_name
        FROM refund_requests r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN rent_applications ra ON ra.id = r.rent_application_id";
$params = [];
$types = "";
$where = [];
if (!$is_admin) {
    $where[] = "r.user_id = ?";
    $params[] = $uid;
    $types .= "i";
} else {
    if (!empty($_GET['status'])) {
        $where[] = "r.status = ?";
        $params[] = $_GET['status'];
        $types .= "s";
    }
    if (!empty($_GET['user_id'])) {
        $where[] = "r.user_id = ?";
        $params[] = (int)$_GET['user_id'];
        $types .= "i";
    }
}
if ($where) $sql .= " WHERE " . implode(" AND ", $where);
$sql .= " ORDER BY r.created_at DESC, r.id DESC LIMIT 300";

$stmt = $conn->prepare($sql);
if ($params) $stmt->bind_param($types, ...$params);
$stmt->execute();
$res = $stmt->get_result();
$requests = [];
$ids = [];
while ($r = $res->fetch_assoc()) {
    $ids[] = (int)$r['id'];
    $requests[(int)$r['id']] = [
        'id' => (int)$r['id'],
        'userId' => (int)$r['user_id'],
        'tenantName' => $r['tenant_name'],
        'tenantEmail' => $r['tenant_email'],
        'roomName' => $r['room_name'],
        'type' => $r['type'],
        'origin' => $r['type'] === 'rejected_application' ? ($r['raised_by_role'] === 'user' ? 'cancelled_by_tenant' : 'rejected_by_admin') : null,
        'invoiceId' => $r['invoice_id'],
        'amount' => (float)$r['amount'],
        'reason' => $r['reason'],
        'paidAmount' => $r['paid_amount'] !== null ? (float)$r['paid_amount'] : null,
        'depositAmount' => $r['deposit_amount'] !== null ? (float)$r['deposit_amount'] : null,
        'payoutDestination' => $r['payout_destination'],
        'status' => $r['status'],
        'decisionReason' => $r['decision_reason'],
        'payoutMethod' => $r['payout_method'],
        'payoutReference' => $r['payout_reference'],
        'canRefundOnline' => !empty($r['source_payment_id']),
        'gatewayRefundId' => $r['gateway_refund_id'],
        'gatewayStatus' => $r['gateway_status'],
        'raisedByRole' => $r['raised_by_role'],
        'decidedAt' => $r['decided_at'],
        'refundedAt' => $r['refunded_at'],
        'createdAt' => $r['created_at'],
        'updatedAt' => $r['updated_at'],
        'events' => [],
    ];
}
$stmt->close();

if ($ids) {
    $in = implode(',', $ids); // ints only
    $ev = $conn->query("SELECT e.refund_request_id, e.actor_role, e.action, e.message, e.created_at, TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) AS actor_name
        FROM refund_request_events e LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.refund_request_id IN ($in) ORDER BY e.id");
    while ($e = $ev->fetch_assoc()) {
        $requests[(int)$e['refund_request_id']]['events'][] = [
            'actorRole' => $e['actor_role'],
            'actorName' => $e['actor_name'],
            'action' => $e['action'],
            'message' => $e['message'],
            'createdAt' => $e['created_at'],
        ];
    }
}

$out = ['success' => true, 'requests' => array_values($requests)];
if (!$is_admin) {
    $out['eligible'] = refund_eligible($conn, $uid);
} elseif (!empty($_GET['user_id'])) {
    $out['eligible'] = refund_eligible($conn, (int)$_GET['user_id']);
}
echo json_encode($out);
$conn->close();
