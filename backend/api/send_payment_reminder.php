<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . "/../config.php";
require_once __DIR__ . '/services/send_notification.php';

// Manual reminders from AdminPayments.jsx. Every reminder goes through
// claim_invoice_reminder(), so an invoice is reminded at most once per day
// whether by this button, "Send to all", or the daily sweep. The batch used to
// re-notify every open invoice on each click, and an ALTER TABLE ran on every
// request.
$admin_id = require_admin($conn);

// Open invoices that are worth a nudge: excludes 'processing' (checkout at the
// gateway) and 'pending-verification' (payment already submitted).
$remindable = array_values(array_diff(BILLING_OPEN_STATUSES, ['processing', 'pending-verification']));
$remindable_sql = "('" . implode("','", $remindable) . "')";

try {
    $input = json_decode(file_get_contents("php://input"), true) ?? [];
    $invoice_id = trim($input['invoice_id'] ?? '');
    $is_batch = !empty($input['all']);
    $custom_message = trim($input['custom_message'] ?? '');
    $today = new DateTime(date('Y-m-d'));

    if ($is_batch) {
        $rows = $conn->query("
            SELECT i.id, i.user_id, i.total_amount, i.due_date, i.billing_period, i.status, ra.room_name
            FROM invoices i
            LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
            WHERE i.status IN $remindable_sql AND i.due_date IS NOT NULL
        ")->fetch_all(MYSQLI_ASSOC);

        $count = 0;
        $skipped = 0;
        // Each invoice carries its own amount, so this dispatches per tenant and
        // aggregates. One rendered sample goes back, not one per invoice — a
        // hundred rendered emails in a console group is unreadable.
        $dispatch_totals = ['sms' => 0, 'email' => 0, 'recipients' => 0];
        $dispatch_sample = null;
        foreach ($rows as $inv) {
            if (!claim_invoice_reminder($conn, $inv['id'])) {
                $skipped++;
                continue;
            }
            $overdue = new DateTime($inv['due_date']) < $today;
            [$title, $message] = reminder_text($inv, $today, $overdue, $custom_message);
            $event = $overdue ? 'overdue' : 'rent_due';
            create_notification($conn, $inv['user_id'], $event, $title, $message);

            try {
                $d = dispatch_admin_action_notification(
                    $conn, $inv['user_id'], $event, $title,
                    sms_payment_template($inv['total_amount'], $inv['room_name'], $inv['due_date'], $event, $custom_message, $today),
                    email_payment_reminder_template(notify_recipient_name($conn, $inv['user_id']), $inv, $overdue)
                );
            } catch (Throwable $notification_error) {
                error_log('Could not dispatch manual payment reminder: ' . $notification_error->getMessage());
                $d = ['sms' => 'failed', 'email' => 'failed', 'dry_run' => false, 'rendered' => null];
            }
            if ($d['sms'] === 'sent' || $d['sms'] === 'queued') $dispatch_totals['sms']++;
            if ($d['email'] === 'sent' || $d['email'] === 'queued') $dispatch_totals['email']++;
            $dispatch_totals['recipients']++;
            if ($dispatch_sample === null) $dispatch_sample = $d;
            $count++;
        }

        $notification_dispatch = $dispatch_sample === null ? null : $dispatch_totals + [
            'dry_run'  => $dispatch_sample['dry_run'],
            'rendered' => $dispatch_sample['rendered'],
        ];

        if ($count > 0) {
            log_activity($conn, $admin_id, 'billing', 'Sent Payment Reminders', "Sent payment reminders for {$count} invoice(s); {$skipped} already reminded today.");
        }

        echo json_encode([
            "success" => true,
            "message" => "Sent reminders for {$count} invoice(s)." . ($skipped ? " {$skipped} were already reminded today." : ""),
            "count" => $count,
            "skipped" => $skipped,
            "notification_dispatch" => $notification_dispatch
        ]);
        exit;
    }

    if ($invoice_id === '') {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Invoice ID is required."]);
        exit;
    }

    $stmt = $conn->prepare("
        SELECT i.id, i.user_id, i.total_amount, i.due_date, i.billing_period, i.status, i.reminder_count,
               u.first_name, u.last_name, ra.room_name
        FROM invoices i
        LEFT JOIN users u ON i.user_id = u.id
        LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
        WHERE i.id = ?
    ");
    $stmt->bind_param("s", $invoice_id);
    $stmt->execute();
    $inv = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$inv) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Invoice not found."]);
        exit;
    }
    if (!in_array($inv['status'], $remindable, true) || !$inv['due_date']) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "No reminder needed: invoice is {$inv['status']}."]);
        exit;
    }
    if (!claim_invoice_reminder($conn, $invoice_id)) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This tenant was already reminded about this invoice today."]);
        exit;
    }

    $overdue = new DateTime($inv['due_date']) < $today;
    [$title, $message] = reminder_text($inv, $today, $overdue, $custom_message);
    $event = $overdue ? 'overdue' : 'rent_due';
    create_notification($conn, $inv['user_id'], $event, $title, $message);

    $tenantName = trim(($inv['first_name'] ?? '') . ' ' . ($inv['last_name'] ?? '')) ?: 'Tenant';
    $unit = $inv['room_name'] ?: 'no unit';

    try {
        $notification_dispatch = dispatch_admin_action_notification(
            $conn, $inv['user_id'], $event, $title,
            sms_payment_template($inv['total_amount'], $unit, $inv['due_date'], $event, $custom_message, $today),
            email_payment_reminder_template($inv['first_name'] ?: 'Tenant', $inv, $overdue)
        );
    } catch (Throwable $notification_error) {
        error_log('Could not dispatch manual payment reminder: ' . $notification_error->getMessage());
        $notification_dispatch = ['sms' => 'failed', 'email' => 'failed', 'dry_run' => false, 'rendered' => null];
    }

    log_activity($conn, $admin_id, 'billing', 'Sent Payment Reminder', "Sent payment reminder to {$tenantName} (Unit {$unit}) for invoice {$invoice_id}.");

    echo json_encode([
        "success" => true,
        "message" => "Reminder sent to {$tenantName} successfully.",
        "invoice_id" => $invoice_id,
        "last_reminder_date" => date('Y-m-d'),
        "reminder_count" => (int)$inv['reminder_count'] + 1,
        "notification_dispatch" => $notification_dispatch
    ]);
} catch (Exception $e) {
    server_error_response($e, "Failed to send the reminder.");
}

$conn->close();
?>
