<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
if (!$user_id) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

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

// 1. Fetch invoice
$stmt = $conn->prepare("SELECT i.*, u.first_name, u.last_name, u.email_address as email FROM invoices i JOIN users u ON i.user_id = u.id WHERE i.id = ? AND i.user_id = ?");
$stmt->bind_param("si", $invoice_id, $user_id);
$stmt->execute();
$res = $stmt->get_result();

if (!$res || $res->num_rows === 0) {
    echo json_encode(["success" => false, "message" => "Invoice not found or access denied"]);
    exit;
}

$invoice = $res->fetch_assoc();

if (in_array($invoice['status'], ['paid'])) {
    echo json_encode(["success" => false, "message" => "Invoice is already paid"]);
    exit;
}

// Calculate total amount in centavos (PHP)
$total_amount = (float)($invoice['total_amount'] ?? 0);
if ($total_amount <= 0) {
    $total_amount = (float)($invoice['base_rent'] ?? 0) + (float)($invoice['security_deposit'] ?? 0) + (float)($invoice['water'] ?? 0) + (float)($invoice['electricity'] ?? 0) + (float)($invoice['parking'] ?? 0) + (float)($invoice['late_fee'] ?? 0);
}
$amount_cents = (int)round($total_amount * 100);

// 2. Fetch PayMongo Secret Key
$settings_res = $conn->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key = 'paymongo_secret_key'");
$settings = [];
if ($settings_res) {
    while ($row = $settings_res->fetch_assoc()) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }
}
$secret_key = $settings['paymongo_secret_key'] ?? '';

if (empty($secret_key)) {
    echo json_encode(["success" => false, "message" => "PayMongo is not configured. Please contact administrator."]);
    exit;
}

// 3. Build PayMongo Checkout Session request
$success_url = $data['success_url'] ?? ("http://localhost:8080/ApartmentManagementSystem_React/ams-react/dist/index.html#/pay-bills?status=success&invoice_id=" . urlencode($invoice_id));
$cancel_url = $data['cancel_url'] ?? "http://localhost:8080/ApartmentManagementSystem_React/ams-react/dist/index.html#/pay-bills?status=cancelled";

$payload = [
    'data' => [
        'attributes' => [
            'send_email_receipt' => false,
            'show_description' => true,
            'show_line_items' => true,
            'line_items' => [
                [
                    'currency' => 'PHP',
                    'amount' => $amount_cents,
                    'name' => 'Invoice #' . $invoice_id,
                    'quantity' => 1
                ]
            ],
            'payment_method_types' => $method_types,
            'success_url' => $success_url,
            'cancel_url' => $cancel_url,
            'description' => 'Apartment Payment for Invoice ' . $invoice_id,
            'metadata' => [
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

// Handle SSL for Windows local XAMPP environments
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); 

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
    echo json_encode(["success" => false, "message" => $err_msg]);
    exit;
}

$response_data = json_decode($response, true);
if (isset($response_data['errors'])) {
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

// 5. Store checkout_session_id and payment_method in invoices table
$update = $conn->prepare("UPDATE invoices SET status = 'processing', checkout_session_id = ?, payment_gateway = 'paymongo_sandbox', payment_method = ? WHERE id = ?");
$update->bind_param("sss", $checkout_session_id, $payment_method, $invoice_id);

if ($update->execute()) {
    echo json_encode(["success" => true, "checkout_url" => $checkout_url]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to update invoice status"]);
}

$conn->close();
?>
