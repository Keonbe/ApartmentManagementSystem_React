<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Combined payment of overdue bills (panel feedback 2026-09-30). A tenant with
// two or more unpaid bills, at least one overdue, pays them together
// (overdue plus current bills) or one at a time.
//
//   POST {action:'create'}        group the unpaid bills under one 'BND-…'
//                                 key, which the pay endpoints accept
//   POST {action:'release', key}  ungroup them (only while nothing has been
//                                 submitted) to pay one at a time again
$auth = require_user($conn);
if ($auth['role'] === 'admin') {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Combined payments are made by the tenant."]);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Invalid request method."]);
    exit;
}
$user_id = (int)$auth['id'];
$input = json_decode(file_get_contents("php://input"), true) ?: [];
$action = $input['action'] ?? '';

if ($action === 'create') {
    $key = bundle_overdue_invoices($conn, $user_id);
    if (!$key) {
        http_response_code(open_bundle_key($conn, $user_id) ? 409 : 422);
        echo json_encode(["success" => false, "message" => open_bundle_key($conn, $user_id)
            ? "Your combined payment is already awaiting confirmation."
            : "You need at least two unpaid bills, one of them overdue, to pay them together."]);
        exit;
    }
    $rows = payment_key_invoices($conn, $key, $user_id, BILLING_OPEN_STATUSES);
    $total = round(array_sum(array_map(fn($r) => (float)$r['total_amount'], $rows)), 2);
    log_activity($conn, $user_id, 'billing', 'Created Combined Payment',
        "$key: " . count($rows) . " bill(s) (" . implode(', ', array_column($rows, 'id')) . "), ₱" . number_format($total, 2));
    echo json_encode([
        "success" => true,
        "message" => count($rows) . " bills combined into one payment.",
        "key" => $key,
        "invoices" => array_map(fn($r) => [
            'id' => $r['id'],
            'billing_period' => $r['billing_period'],
            'amount' => (float)$r['total_amount'],
        ], $rows),
        "total" => $total,
    ]);
    exit;
}

if ($action === 'release') {
    $key = (string)($input['key'] ?? '');
    if (!is_bundle_key($key)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Invalid combined payment."]);
        exit;
    }
    $released = release_bundle($conn, $user_id, $key);
    if ($released === false) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "A payment for these bills is already awaiting confirmation or recorded."]);
        exit;
    }
    log_activity($conn, $user_id, 'billing', 'Released Combined Payment', "$key: $released bill(s) back to separate payment");
    echo json_encode(["success" => true, "message" => "You can now pay each bill separately.", "released" => $released]);
    exit;
}

http_response_code(422);
echo json_encode(["success" => false, "message" => "Unknown action."]);
