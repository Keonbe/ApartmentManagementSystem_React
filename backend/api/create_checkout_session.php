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

$auth = require_user($conn);
$user_id = $auth['id'];

$data = json_decode(file_get_contents("php://input"), true);
$invoice_id = $data['invoice_id'] ?? null;
$channel = $data['channel'] ?? null;

if (!$invoice_id || !$channel) {
    echo json_encode(["success" => false, "message" => "Missing required fields"]);
    exit;
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
    $release = $conn->prepare("UPDATE invoices SET status = ? WHERE id = ? AND user_id = ? AND status = 'processing' AND checkout_session_id IS NULL");
    foreach ($prev_statuses as $id => $prev_status) {
        $id = (string)$id;
        $release->bind_param("ssi", $prev_status, $id, $user_id);
        $release->execute();
    }
    $release->close();
}

$claim = $conn->prepare("UPDATE invoices SET status = 'processing' WHERE ? IN (id, payment_group) AND user_id = ? AND status IN $open_statuses AND status <> 'processing'");
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
    $row_total = (float)$invoice['total_amount'];
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
$settings_res = $conn->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key = 'paymongo_secret_key'");
$settings = [];
if ($settings_res) {
    while ($row = $settings_res->fetch_assoc()) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }
}
$secret_key = ams_env_setting('paymongo_secret_key') ?? ($settings['paymongo_secret_key'] ?? '');

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

// 4. cURL POST to PayMongo
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "https://api.paymongo.com/v1/checkout_sessions");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "Accept: application/json",
    "Authorization: Basic " . base64_encode($secret_key . ":")
]);

// This request carries the PayMongo secret key, so the gateway's certificate
// must actually be verified. Verification used to be switched off outright
// because XAMPP ships without curl.cainfo configured; instead, locate a CA
// bundle and point cURL at it.
$ca_bundle = ini_get('curl.cainfo') ?: ini_get('openssl.cafile') ?: '';
if (!$ca_bundle || !is_readable($ca_bundle)) {
    foreach (['C:/xampp/apache/bin/curl-ca-bundle.crt', 'C:/xampp/php/extras/ssl/cacert.pem', '/etc/ssl/certs/ca-certificates.crt'] as $candidate) {
        if (is_readable($candidate)) { $ca_bundle = $candidate; break; }
    }
}

if ($ca_bundle && is_readable($ca_bundle)) {
    curl_setopt($ch, CURLOPT_CAINFO, $ca_bundle);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
} elseif (APP_ENV !== 'production') {
    // No bundle anywhere on a dev box: keep the sandbox demo working, but say
    // so loudly rather than silently shipping an unverified TLS connection.
    error_log("PayMongo: no CA bundle found; TLS peer verification disabled (development only).");
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
} else {
    release_checkout_claim($conn, $prev_statuses, $user_id);
    echo json_encode(["success" => false, "message" => "Payment gateway TLS certificate store is not configured on this server."]);
    exit;
}

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_error = curl_error($ch);
curl_close($ch);

if ($http_code !== 200 || $response === false) {
    error_log("PayMongo Error: " . $response . " (cURL: $curl_error)");
    $err_msg = "Failed to connect to payment gateway.";
    if ($response) {
        $err_data = json_decode($response, true);
        if (isset($err_data['errors'][0]['detail'])) {
            $err_msg = "PayMongo: " . $err_data['errors'][0]['detail'];
        }
    }
    release_checkout_claim($conn, $prev_statuses, $user_id);
    echo json_encode(["success" => false, "message" => $err_msg]);
    exit;
}

$response_data = json_decode($response, true);
if (isset($response_data['errors'])) {
    release_checkout_claim($conn, $prev_statuses, $user_id);
    echo json_encode(["success" => false, "message" => "Payment gateway error: " . $response_data['errors'][0]['detail']]);
    exit;
}

$checkout_session_id = $response_data['data']['id'];
$checkout_url = $response_data['data']['attributes']['checkout_url'];

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
$update = $conn->prepare("UPDATE invoices SET checkout_session_id = ?, payment_gateway = 'paymongo_sandbox', payment_method = ? WHERE ? IN (id, payment_group) AND user_id = ? AND status = 'processing' AND checkout_session_id IS NULL");
$update->bind_param("sssi", $checkout_session_id, $payment_method, $invoice_id, $user_id);
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
