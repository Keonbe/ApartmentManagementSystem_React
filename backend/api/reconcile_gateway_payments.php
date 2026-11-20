<?php
// Check online checkouts against PayMongo (SPRINT 183, panel audit F-08). A bill is
// 'processing' while the tenant is at the PayMongo checkout; if the "paid" webhook is
// lost the money is at PayMongo and AMS has nothing. This asks PayMongo about the
// checkout session of one bill (the "Check with PayMongo" button, any age) or of every
// bill that has been processing for a while, and settles a paid one through the same
// rules as the webhook. A session PayMongo says expired is released; one still unpaid
// is left alone.
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../paymongo_gateway.php';

$admin_id = require_admin($conn);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

$input = read_json_input();
$key = null;
if (array_key_exists('invoice_id', $input) && $input['invoice_id'] !== null && $input['invoice_id'] !== '') {
    $key = is_string($input['invoice_id']) ? trim($input['invoice_id']) : '';
    if ($key === '' || mb_strlen($key) > 50) validation_fail(['invoice_id' => 'Choose a valid invoice.']);
}

try {
    $result = reconcile_gateway_payments($conn, $key !== null ? ['key' => $key] : []);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => public_error_message($e)]);
    exit;
}

log_activity($conn, $admin_id, 'billing', 'Checked Payments With PayMongo',
    ($key !== null ? "Invoice $key" : 'All processing checkouts') . ": checked {$result['checked']}, settled {$result['settled']}, expired {$result['expired']}, still unpaid {$result['unpaid']}, needs review {$result['needs_review']}, errors {$result['errors']}");

if ($key !== null && $result['checked'] === 0) {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "Invoice $key is not waiting on an online checkout."]);
    exit;
}

$parts = [];
if ($result['settled']) $parts[] = $result['settled'] . ' payment(s) found paid and recorded';
if ($result['expired']) $parts[] = $result['expired'] . ' expired checkout(s) released';
if ($result['unpaid']) $parts[] = $result['unpaid'] . ' not paid yet';
if ($result['needs_review']) $parts[] = $result['needs_review'] . ' need a manual look';
if ($result['errors']) $parts[] = $result['errors'] . ' could not be checked';
echo json_encode([
    "success" => true,
    "message" => $result['checked'] === 0 ? "No online checkout is waiting on PayMongo." : ucfirst(implode(', ', $parts)) . '.',
    "result" => $result,
]);
$conn->close();
