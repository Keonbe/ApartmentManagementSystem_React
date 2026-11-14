<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$auth = require_user($conn);
$user_id = $auth['id'];

$data = read_json_input();
if (!is_array($data)) $data = [];
$invoice_id = $data['invoice_id'] ?? null;
$scheduled_date = $data['scheduled_date'] ?? null;
$scheduled_time_slot = $data['scheduled_time_slot'] ?? null;

// A schedule is a promise to show up and pay, so it has to be a real future
// date — the endpoint previously accepted any string, including past dates.
$errors = array_filter([
    'invoice_id' => v_str($invoice_id, 'Invoice', 1, 50),
    'scheduled_date' => v_date($scheduled_date, 'Schedule date'),
    'scheduled_time_slot' => v_enum($scheduled_time_slot, 'Time slot', ['morning', 'afternoon', 'evening']),
]);
if (empty($errors['scheduled_date'])) {
    $today = new DateTime(date('Y-m-d'));
    $parsed_date = DateTime::createFromFormat('!Y-m-d', $scheduled_date);
    if ($parsed_date < $today) {
        $errors['scheduled_date'] = "Scheduled date cannot be in the past.";
    } elseif ((int)$today->diff($parsed_date)->format('%a') > 60) {
        $errors['scheduled_date'] = "Scheduled date cannot be more than 60 days ahead.";
    }
}
if ($errors) validation_fail($errors);

// Claim the invoice and scope by owner in the same statement, rather than
// checking ownership in a separate SELECT and then updating by id alone.
$update = $conn->prepare("
    UPDATE invoices
    SET status = 'scheduled', scheduled_date = ?, scheduled_time_slot = ?, payment_gateway = 'in_person'
    WHERE ? IN (id, payment_group) AND user_id = ? AND status IN " . billing_open_status_sql() . "
");
$update->bind_param("sssi", $scheduled_date, $scheduled_time_slot, $invoice_id, $user_id);

if ($update->execute()) {
    if ($update->affected_rows === 0) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This invoice is not open for scheduling — it may already be settled or cancelled."]);
        $update->close();
        $conn->close();
        exit;
    }
    log_activity($conn, $user_id, 'payment', "In-person payment scheduled", "Invoice ID: $invoice_id, Date: $scheduled_date ($scheduled_time_slot)");

    // Both sides hear about the booking: the admin queue row is the same one a
    // cash declaration uses, which settle_invoice() resolves once it is paid.
    // A reschedule replaces the earlier row instead of adding a second one.
    resolve_admin_queue($conn, 'cash_payment_declared', $invoice_id);
    notify_admins_queue($conn, 'cash_payment_declared', $invoice_id, 'In-Person Payment Scheduled',
        "A tenant scheduled an in-person payment for " . payment_key_label($invoice_id) . " on $scheduled_date ($scheduled_time_slot).");
    create_notification($conn, $user_id, 'payment', 'Payment Scheduled',
        "Your in-person payment for " . payment_key_label($invoice_id) . " is scheduled on $scheduled_date ($scheduled_time_slot). You will be notified once management records it.",
        'Resolved', "invoice:$invoice_id");
    echo json_encode(["success" => true, "message" => "Payment scheduled successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to schedule payment"]);
}
$update->close();
$conn->close();
?>
