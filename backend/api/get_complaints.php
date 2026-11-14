<?php
// Complaints (SPRINT 189).
//   Tenant: their own complaints, newest first.
//   Admin:  every complaint with the tenant's name; ?open=1 keeps only Open and In Review.
// -> { success, complaints: [{id, category, status, createdAt, resolvedAt, userId, tenantName}] }
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

$auth = require_user($conn);
$is_admin = $auth['role'] === 'admin';

$where = $is_admin ? "1 = 1" : "c.user_id = " . (int)$auth['id'];
if ($is_admin && !empty($_GET['open'])) $where .= " AND c.status IN ('Open', 'In Review')";

$res = $conn->query("SELECT c.id, c.user_id, c.category, c.status, c.created_at, c.resolved_at,
                            u.first_name, u.last_name, u.suffix
                       FROM complaints c JOIN users u ON u.id = c.user_id
                      WHERE $where ORDER BY c.id DESC LIMIT 200");
$complaints = [];
while ($res && ($r = $res->fetch_assoc())) {
    $complaints[] = [
        'id' => (int)$r['id'],
        'category' => $r['category'],
        'status' => $r['status'],
        'createdAt' => $r['created_at'],
        'resolvedAt' => $r['resolved_at'],
        'userId' => (int)$r['user_id'],
        'tenantName' => $is_admin ? person_name($r) : null,
    ];
}

echo json_encode(["success" => true, "complaints" => $complaints]);
$conn->close();
