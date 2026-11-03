<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";
require_once __DIR__ . '/../paymongo_gateway.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$auth = require_user($conn);
$user_id = $auth['id'];

$data = json_decode(file_get_contents("php://input"), true);
$invoice_id = $data['invoice_id'] ?? null;
$channel = $data['channel'] ?? null;

if (!$invoice_id || !$channel) {
    echo json_encode(["success" => false, "message" => "Missing required fields"]);
    exit;
}

if (($auth['role'] ?? '') !== 'admin') {
    if (get_setting($conn, 'service_pay_bills_active', 'true') === 'false') {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Payment service is currently disabled by management."]);
        exit;
    }
    $raw_mode = get_setting($conn, 'payment_mode', 'manual');
    $mode = in_array($raw_mode, ['sandbox', 'both', 'manual'], true) ? $raw_mode : 'manual';
    if ($mode === 'manual') {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Online sandbox payment is currently disabled."]);
        exit;
    }
    $sandbox_master = get_setting($conn, 'payment_sandbox_enabled', '1');
    $sandbox_enabled = ($sandbox_master === '1' || $sandbox_master === 'true' || $mode === 'sandbox' || $mode === 'both');
    if (!$sandbox_enabled) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Online payment sandbox is currently disabled."]);
        exit;
    }
    $channel_key_map = [
        'gcash_sandbox' => 'payment_ch_gcash_sandbox',
        'gcash' => 'payment_ch_gcash_sandbox',
        'bank_sandbox' => 'payment_ch_bank_sandbox',
        'bank' => 'payment_ch_bank_sandbox',
        'paymaya' => 'payment_ch_maya',
        'maya' => 'payment_ch_maya',
        'card' => 'payment_ch_bank_sandbox'
    ];
    $ch_key = $channel_key_map[$channel] ?? null;
    if ($ch_key) {
        $ch_val = get_setting($conn, $ch_key, 'true');
        if ($ch_val === 'false' || $ch_val === '0') {
            http_response_code(403);
            echo json_encode(["success" => false, "message" => "The selected payment option is currently disabled by management."]);
            exit;
        }
    }
}

// Map frontend channels to PayMongo types
$paymongo_types = [
    'gcash_sandbox' => ['gcash'],
    'gcash' => ['gcash'],
    'paymaya' => ['paymaya'],
    'maya' => ['paymaya'],
    'bank_sandbox' => ['dob', 'card'],
    'bank' => ['dob', 'card'],
    'card' => ['card']
];

$method_types = $paymongo_types[$channel] ?? ['gcash', 'card', 'paymaya'];

// 1. The invoices this checkout pays: one invoice, or every month of an
// advance payment when $invoice_id is its group id (config.php, "Advance
// payments"). Cancelled months are not part of it.
$invoices = array_values(array_filter(
    payment_key_invoices($conn, $invoice_id, $user_id),
    fn($row) => $row['status'] !== 'cancelled'
));

if (!$invoices) {
    echo json_encode(["success" => false, "message" => "Invoice not found or access denied"]);
    exit;
}

// Only a genuinely open invoice may be paid. 'paid' alone was checked before,
// which let a cancelled invoice be charged and allowed a second concurrent
// checkout session to be opened against one already in 'processing'. For an
// advance payment every month must still be open.
foreach ($invoices as $invoice) {
    if (!in_array($invoice['status'], BILLING_OPEN_STATUSES, true) || $invoice['status'] === 'processing') {
        $msg = $invoice['status'] === 'paid'
            ? "Invoice is already paid"
            : ($invoice['status'] === 'processing'
                ? "A payment for this invoice is already in progress. Please finish or cancel it first."
                : "This invoice is not open for payment.");
        echo json_encode(["success" => false, "message" => $msg]);
        exit;
    }
}

// Claim the invoice before calling the gateway (audit C2). The check above is
// a plain SELECT, and the gateway call below takes roughly a second — without
// claiming first, two concurrent requests can both pass the check, both open
// a checkout session, and whichever session's UPDATE lands last silently
// steals checkout_session_id from the other, so a real payment on the
// abandoned session gets discarded by the webhook as "superseded".
$open_statuses = billing_open_status_sql();
// The statuses these invoices actually held before the claim below, so a
// failure past this point can hand each back exactly instead of guessing.
$prev_statuses = array_column($invoices, 'status', 'id');

// Any failure below must give the claim back, or the invoices are stuck in
// 'processing' with no checkout session ever created for them.
function release_checkout_claim($conn, $prev_statuses, $user_id) {
    $release = $conn->prepare("UPDATE invoices SET status = ?, processing_since = NULL WHERE id = ? AND user_id = ? AND status = 'processing' AND checkout_session_id IS NULL");
    foreach ($prev_statuses as $id => $prev_status) {
        $id = (string)$id;
        $release->bind_param("ssi", $prev_status, $id, $user_id);
        $release->execute();
    }
    $release->close();
}

$claim = $conn->prepare("UPDATE invoices SET status = 'processing', processing_since = NOW() WHERE ? IN (id, payment_group) AND user_id = ? AND status IN $open_statuses AND status <> 'processing'");
$claim->bind_param("si", $invoice_id, $user_id);
$claim->execute();
$claimed = $claim->affected_rows;
$claim->close();

// All or nothing: an advance payment is only paid online as a whole.
if ($claimed !== count($invoices)) {
    if ($claimed > 0) release_checkout_claim($conn, $prev_statuses, $user_id);
    echo json_encode(["success" => false, "message" => "A payment for this invoice is already in progress. Please finish or cancel it first."]);
    exit;
}

// Calculate total amount in centavos (PHP), one line item per invoice
$line_items = [];
$total_amount = 0.0;
foreach ($invoices as $invoice) {
    // The balance: parts already received (installments) are not charged again.
    $row_total = invoice_balance_cents($invoice) / 100;
    $total_amount += $row_total;
    $line_items[] = [
        'currency' => 'PHP',
        'amount' => (int)round($row_total * 100),
        'name' => count($invoices) > 1
            ? 'Rent ' . $invoice['billing_period'] . ' (Invoice #' . $invoice['id'] . ')'
            : 'Invoice #' . $invoice['id'],
        'quantity' => 1
    ];
}
$amount_cents = (int)round($total_amount * 100);
if ($amount_cents <= 0) {
    release_checkout_claim($conn, $prev_statuses, $user_id);
    echo json_encode(["success" => false, "message" => "This invoice has nothing to pay."]);
    exit;
}

// 2. Fetch PayMongo Secret Key
$secret_key = paymongo_secret_key($conn);

if (empty($secret_key)) {
    release_checkout_claim($conn, $prev_statuses, $user_id);
    echo json_encode(["success" => false, "message" => "PayMongo is not configured. Please contact administrator."]);
    exit;
}

// 3. Build PayMongo Checkout Session request
// Return links. The SPA sends its own (it knows its path); once APP_URL is set
// they are accepted only if they point into this deployment's frontend, so a
// checkout can never hand the tenant back to another deployment.
// The app uses BrowserRouter: the route is a real path and the result rides in
// the query string (PayBills.jsx and TrackApplication.jsx read it).
$return_base = APP_URL !== ''
    ? APP_URL . '/'
    : (!empty($_SERVER['HTTP_ORIGIN']) ? rtrim($_SERVER['HTTP_ORIGIN'], '/') . '/' : 'http://localhost:5173/');
$own_return_url = function ($url) {
    if (!is_string($url) || $url === '') return false;
    if (APP_URL === '') return APP_ENV !== 'production';
    return $url === APP_URL || str_starts_with($url, APP_URL . '/') || str_starts_with($url, APP_URL . '#');
};
$success_url = $own_return_url($data['success_url'] ?? null)
    ? $data['success_url']
    : $return_base . "pay-bills?status=success&invoice_id=" . urlencode($invoice_id);
// The invoice id must ride along on the cancel URL too, so the app can release
// the 'processing' hold this endpoint is about to place on it.
$cancel_url = $own_return_url($data['cancel_url'] ?? null)
    ? $data['cancel_url']
    : $return_base . "pay-bills?status=cancelled&invoice_id=" . urlencode($invoice_id);

$payload = [
    'data' => [
        'attributes' => [
            'send_email_receipt' => false,
            'show_description' => true,
            'show_line_items' => true,
            'line_items' => $line_items,
            'payment_method_types' => $method_types,
            'success_url' => $success_url,
            'cancel_url' => $cancel_url,
            'description' => 'Apartment Payment for ' . ucfirst(payment_key_label($invoice_id)),
            'metadata' => [
                // An invoice id or an advance payment's group id; the webhook
                // settles every invoice it covers.
                'invoice_id' => (string)$invoice_id,
                'user_id' => (string)$user_id
            ]
        ]
    ]
];

// 4. POST to PayMongo (paymongo_gateway.php verifies the gateway's certificate)
$gateway = paymongo_request('POST', '/v1/checkout_sessions', $secret_key, $payload);
if (!$gateway['ok']) {
    release_checkout_claim($conn, $prev_statuses, $user_id);
    echo json_encode(["success" => false, "message" => $gateway['message']]);
    exit;
}
$response_data = $gateway['data'];

$checkout_session_id = $response_data['data']['id'];
$checkout_url = $response_data['data']['attributes']['checkout_url'];
// payment.failed webhooks name this payment intent, not the session (audit N-10a).
$payment_intent_id = $response_data['data']['attributes']['payment_intent']['id'] ?? null;

// Map channel to human-readable payment method
$channel_method_map = [
    'gcash_sandbox' => 'GCash (Sandbox)',
    'gcash' => 'GCash (Sandbox)',
    'paymaya' => 'Maya (Sandbox)',
    'maya' => 'Maya (Sandbox)',
    'bank_sandbox' => 'Bank / Card (Sandbox)',
    'bank' => 'Bank / Card (Sandbox)',
    'card' => 'Card (Sandbox)'
];
$payment_method = $channel_method_map[$channel] ?? 'Online (Sandbox)';

// 5. Store checkout_session_id and payment_method in invoices table. Guarded on
// still being the 'processing' row this request claimed with no session id yet,
// so a second request can't overwrite the session id this one just got from the
// gateway (the other half of the C2 race — see the claim above).
$update = $conn->prepare("UPDATE invoices SET checkout_session_id = ?, checkout_payment_intent_id = ?, payment_gateway = 'paymongo_sandbox', payment_method = ? WHERE ? IN (id, payment_group) AND user_id = ? AND status = 'processing' AND checkout_session_id IS NULL");
$update->bind_param("ssssi", $checkout_session_id, $payment_intent_id, $payment_method, $invoice_id, $user_id);
$update->execute();

if ($update->affected_rows > 0) {
    log_activity($conn, null, 'billing', 'Started Online Payment', ucfirst(payment_key_label($invoice_id)) . " sent to checkout via $payment_method");
    echo json_encode(["success" => true, "checkout_url" => $checkout_url]);
} else {
    // The claim was ours, but the row no longer matches (e.g. the webhook for
    // a since-cancelled session already moved it on). The checkout session at
    // PayMongo still exists and can't be un-created, so this just refuses to
    // hand back a checkout_url for a slot that's no longer ours to fill.
    echo json_encode(["success" => false, "message" => "This invoice's payment status changed; please try again."]);
}

$conn->close();
?>
