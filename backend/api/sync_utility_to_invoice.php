<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once __DIR__ . '/../config.php';

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Posts a utility reading's charge onto an invoice. Three modes:
//   merge    — add it to the tenant's still-adjustable invoice for the same month;
//              when there is none, create a utilities-only invoice (base_rent 0)
//   separate — always create a utilities-only pending invoice with a chosen due date
//   paid     — create a utilities-only invoice already settled in cash
//
// Rent is never billed from here. The previous merge looked for billing_period
// '2026-09' while invoices store "September 2026", never found the rent invoice,
// and auto-generated a second one with base rent — double-billing the month.
// The reading is also claimed first, inside a transaction, so a double-click
// can no longer create two invoices before one of them loses the claim.
$admin_id = require_admin($conn);

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

$input = read_json_input();
$id = (int)($input['id'] ?? 0);
$sync_mode = $input['sync_mode'] ?? 'merge';
$custom_due_date = trim((string)($input['due_date'] ?? ''));

if ($id <= 0) fail(422, "Reading ID is required.");
if (!in_array($sync_mode, ['merge', 'separate', 'paid'], true)) fail(422, "Invalid sync mode.");

$now = new DateTime('now', new DateTimeZone('Asia/Manila'));
$today = $now->format('Y-m-d');

if ($sync_mode === 'separate' && $custom_due_date !== '') {
    $d = DateTime::createFromFormat('!Y-m-d', $custom_due_date);
    $max_due = (clone $now)->modify('+10 days')->format('Y-m-d');
    if (!$d || $d->format('Y-m-d') !== $custom_due_date) fail(422, "Due date must be a valid date (YYYY-MM-DD).");
    if ($custom_due_date < $today || $custom_due_date > $max_due) fail(422, "Due date must be between today and 10 days from today.");
}

$conn->begin_transaction();

try {
    $claim = $conn->prepare("UPDATE utility_readings SET is_invoiced = 1 WHERE id = ? AND is_invoiced = 0");
    $claim->bind_param("i", $id);
    $claim->execute();
    $claimed = $claim->affected_rows;
    $claim->close();

    if ($claimed === 0) {
        $conn->rollback();
        $check = $conn->prepare("SELECT 1 FROM utility_readings WHERE id = ?");
        $check->bind_param("i", $id);
        $check->execute();
        $exists = (bool)$check->get_result()->fetch_assoc();
        $check->close();
        $exists ? fail(409, "This reading has already been synced to an invoice.") : fail(404, "Utility reading not found.");
    }

    $stmt = $conn->prepare("SELECT room_name, user_id, billing_period, water_amount, water_other_fees, water_consumption, electric_amount, electric_other_fees, electric_consumption, entry_mode, total_amount FROM utility_readings WHERE id = ? FOR UPDATE");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $reading = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    // The charge belongs to whoever occupied the unit when it was read. Fall back
    // to the unit's current tenant only when no tenant was on file at the time.
    $user_id = $reading['user_id'] ? (int)$reading['user_id'] : null;
    if (!$user_id) {
        $tenancy = get_room_tenancy($conn, $reading['room_name']);
        $user_id = $tenancy ? (int)$tenancy['user_id'] : null;
    }
    if (!$user_id) {
        $conn->rollback();
        fail(422, "Cannot sync: no billable tenant is assigned to Unit {$reading['room_name']}.");
    }

    $stmt = $conn->prepare("SELECT id FROM rent_applications WHERE user_id = ? AND room_name = ? ORDER BY id DESC LIMIT 1");
    $stmt->bind_param("is", $user_id, $reading['room_name']);
    $stmt->execute();
    $app = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $rent_app_id = $app ? (int)$app['id'] : null;

    $water_total = round((float)$reading['water_amount'] + (float)$reading['water_other_fees'], 2);
    $electric_total = round((float)$reading['electric_amount'] + (float)$reading['electric_other_fees'], 2);
    // Extra utility types (internet, gas, ...) ride on the invoice's `services` column, which accumulates.
    $stmt = $conn->prepare("SELECT COALESCE(SUM(amount + other_fees), 0) FROM utility_reading_items WHERE reading_id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $stmt->bind_result($extra_raw);
    $stmt->fetch();
    $stmt->close();
    $extra_total = round((float)$extra_raw, 2);
    if (($reading['entry_mode'] ?? 'metered') === 'total') {
        // A recorded total has no meter split: it rides on `services` like the extra utilities.
        $water_total = 0.0;
        $electric_total = 0.0;
        $extra_total = round((float)$reading['total_amount'], 2);
    }
    $charge = round($water_total + $electric_total + $extra_total, 2);

    $period = $reading['billing_period'];
    $label = utility_period_label($period);

    if ($charge <= 0) {
        // Nothing to bill: stays claimed so it is not offered for sync again.
        $stmt = $conn->prepare("UPDATE utility_readings SET user_id = ? WHERE id = ?");
        $stmt->bind_param("ii", $user_id, $id);
        $stmt->execute();
        $stmt->close();
        $conn->commit();
        log_activity($conn, $admin_id, 'utilities', 'Synced Utility Charges', "Utility reading #{$id} ({$label}) had no charge; marked as invoiced");
        echo json_encode(["success" => true, "message" => "This reading has no charge, so no invoice was needed.", "invoice_id" => null, "merged" => false]);
        exit;
    }

    $target_inv_id = null;
    $merged = false;

    if ($sync_mode === 'merge') {
        // Prefer the month's rent invoice over a services-only one; both labels are
        // matched so legacy 'YYYY-MM' periods still line up.
        $adjustable = "('" . implode("','", SERVICE_ADJUSTABLE_INVOICE_STATUSES) . "')";
        $stmt = $conn->prepare("SELECT id, water, electricity FROM invoices
                                WHERE user_id = ? AND billing_period IN (?, ?) AND status IN $adjustable AND payment_group IS NULL
                                ORDER BY base_rent DESC, created_at ASC LIMIT 1 FOR UPDATE");
        $stmt->bind_param("iss", $user_id, $label, $period);
        $stmt->execute();
        $invoice = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if ($invoice) {
            // Water/electricity entered by hand on create_invoice.php would be doubled
            // by adding, or silently replaced by overwriting — refuse both.
            if ((float)$invoice['water'] > 0 || (float)$invoice['electricity'] > 0) {
                $conn->rollback();
                fail(409, "Invoice {$invoice['id']} already carries water/electricity charges. Choose \"Issue Separate Invoice\" instead.");
            }

            // Additive on total_amount, so late fees, services and deposits already on the invoice survive.
            $stmt = $conn->prepare("UPDATE invoices SET water = ?, electricity = ?, services = services + ?, total_amount = total_amount + ? WHERE id = ?");
            $stmt->bind_param("dddds", $water_total, $electric_total, $extra_total, $charge, $invoice['id']);
            if (!$stmt->execute()) throw new Exception("Failed to update invoice.");
            $stmt->close();

            $target_inv_id = $invoice['id'];
            $merged = true;
        }
    }

    if (!$target_inv_id) {
        $target_inv_id = 'INV-' . $now->format('Ym') . '-' . strtoupper(bin2hex(random_bytes(4)));

        if ($sync_mode === 'separate' && $custom_due_date !== '') {
            $due_date = $custom_due_date;
        } else {
            $due_date = DateTime::createFromFormat('!Y-m', $period)->modify('first day of next month')->modify('+4 days')->format('Y-m-d');
            if ($due_date < $today) {
                $due_date = (clone $now)->modify('+10 days')->format('Y-m-d');
            }
        }

        $is_paid = $sync_mode === 'paid';
        $status = $is_paid ? 'paid' : 'pending';
        $payment_method = $is_paid ? 'Cash' : null;
        $payment_reference = $is_paid ? "UTIL-READING-{$id}" : null;
        $paid_at = $is_paid ? $now->format('Y-m-d H:i:s') : null;

        $stmt = $conn->prepare("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, water, electricity, services, total_amount, amount_paid, billing_period, status, due_date, payment_method, payment_reference, paid_at)
                                VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $paid_now = $is_paid ? $charge : 0.0;
        $stmt->bind_param("siidddddssssss", $target_inv_id, $user_id, $rent_app_id, $water_total, $electric_total, $extra_total, $charge, $paid_now, $label, $status, $due_date, $payment_method, $payment_reference, $paid_at);
        if (!$stmt->execute()) throw new Exception("Failed to create the utility invoice.");
        $stmt->close();
    }

    $stmt = $conn->prepare("UPDATE utility_readings SET invoice_id = ?, user_id = ? WHERE id = ?");
    $stmt->bind_param("sii", $target_inv_id, $user_id, $id);
    $stmt->execute();
    $stmt->close();

    $invoice_q = $conn->prepare("SELECT id, base_rent, water, electricity, parking, services, maintenance, late_fee, total_amount, billing_period, due_date FROM invoices WHERE id = ?");
    $invoice_q->bind_param('s', $target_inv_id);
    $invoice_q->execute();
    $utility_invoice = $invoice_q->get_result()->fetch_assoc();
    $invoice_q->close();

    $amount_text = "₱" . number_format($charge, 2);
    if ($sync_mode === 'paid') {
        $notif_title = "Utility Payment Recorded: {$label}";
        $notif_msg = "Your {$label} utility charge of {$amount_text} was paid in cash (invoice {$target_inv_id}).";
    } else {
        $notif_title = "Utility Charges Billed: {$label}";
        $notif_msg = "Utility charges for {$label} ({$amount_text}) " . ($merged ? "were added to invoice {$target_inv_id}." : "were billed on invoice {$target_inv_id}.");
    }
    create_notification($conn, $user_id, 'billing', $notif_title, $notif_msg);

    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    fail(500, "Failed to sync the utility reading: " . $e->getMessage());
}

if ($merged) {
    $message = "Utility charges added to invoice {$target_inv_id} ({$label}).";
} elseif ($sync_mode === 'merge') {
    $message = "No open invoice for {$label}, so a utilities-only invoice {$target_inv_id} was created.";
} elseif ($sync_mode === 'paid') {
    $message = "Utility payment recorded on invoice {$target_inv_id}.";
} else {
    $message = "Separate utility invoice {$target_inv_id} created.";
}

log_activity($conn, $admin_id, 'utilities', 'Synced Utility Charges', "Synced utility reading #{$id} ({$sync_mode}) to invoice {$target_inv_id} — {$amount_text}");
if ($sync_mode !== 'paid' && $utility_invoice) {
    try {
        require_once __DIR__ . '/services/send_notification.php';
        dispatch_admin_action_notification($conn, $user_id, 'billing', "Utility Charges Billed — {$label}", null,
            email_utility_invoice_template(notify_recipient_name($conn, $user_id), $utility_invoice, $reading));
    } catch (Throwable $notification_error) {
        error_log('Could not dispatch utility billing email: ' . $notification_error->getMessage());
    }
}
echo json_encode(["success" => true, "message" => $message, "invoice_id" => $target_inv_id, "merged" => $merged]);
$conn->close();
?>
