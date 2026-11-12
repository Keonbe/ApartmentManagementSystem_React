<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// Admin list of tenant deposit reviews (open first), each with the settlement
// it is about. One query for the reviews and one for all their deductions.
require_admin($conn);

$res = $conn->query("SELECT d.id, d.rent_application_id, d.user_id, d.message, d.status, d.outcome, d.adjusted_amount, d.admin_response, d.created_at, d.resolved_at,
        TRIM(CONCAT_WS(' ', u.first_name, u.last_name, NULLIF(TRIM(u.suffix), ''))) AS tenant_name, ra.room_name,
        lc.deposit_amount, lc.deposit_status, lc.refund_amount, lc.deposit_refundable
    FROM deposit_reviews d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN rent_applications ra ON ra.id = d.rent_application_id
    LEFT JOIN lease_contracts lc ON lc.rent_application_id = d.rent_application_id
    ORDER BY (d.status = 'Open') DESC, d.id DESC LIMIT 200");
$rows = $res->fetch_all(MYSQLI_ASSOC);
$items = deposit_deductions_for($conn, array_map(fn($r) => (int)$r['rent_application_id'], $rows));

$out = [];
foreach ($rows as $r) {
    $deposit = round((float)$r['deposit_amount'], 2);
    $refund = round((float)$r['refund_amount'], 2);
    $out[] = [
        'id' => (int)$r['id'], 'applicationId' => (int)$r['rent_application_id'], 'tenantName' => $r['tenant_name'], 'roomName' => $r['room_name'],
        'message' => $r['message'], 'status' => $r['status'], 'outcome' => $r['outcome'],
        'adjustedAmount' => $r['adjusted_amount'] !== null ? (float)$r['adjusted_amount'] : null,
        'adminResponse' => $r['admin_response'], 'createdAt' => $r['created_at'], 'resolvedAt' => $r['resolved_at'],
        'deposit' => $deposit, 'depositStatus' => $r['deposit_status'], 'refundAmount' => $refund,
        'refundable' => (int)$r['deposit_refundable'] === 1,
        // The most an adjustment can return: what was not paid back.
        'maxAdjustment' => max(0.0, round($deposit - $refund, 2)),
        'deductions' => $items[(int)$r['rent_application_id']] ?? [],
    ];
}
echo json_encode(["success" => true, "data" => $out]);
$conn->close();
