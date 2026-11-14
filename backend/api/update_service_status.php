<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";
require_once __DIR__ . '/services/send_notification.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

$input = read_json_input();
$id = (int)($input['rawId'] ?? $input['id'] ?? 0);
// No status (or the current one) edits the booking's details without moving it.
$status = $input['status'] ?? '';
// The note is shown to the tenant: it is the reason for a rejection or cancellation.
$admin_notes = array_key_exists('adminNotes', $input) ? trim((string)$input['adminNotes']) : null;
$assigned_to = array_key_exists('assignedTo', $input) ? trim((string)$input['assignedTo']) : null;
$has_schedule = array_key_exists('scheduledDate', $input) || array_key_exists('scheduledWindow', $input);
$has_final_quantity = array_key_exists('finalQuantity', $input) && $input['finalQuantity'] !== null && $input['finalQuantity'] !== '';
$decline_cancel = !empty($input['declineCancel']);

if (!$id || ($status !== '' && !array_key_exists($status, SERVICE_TRANSITIONS))) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Invalid parameters."]);
    exit;
}

try {
    $stmt = $conn->prepare("SELECT user_id, service_id, service_name, category, unit_price, pricing_unit, quantity, total_cost, status, is_invoiced, invoice_id,
                                   preferred_date, preferred_time_slot, scheduled_date, scheduled_window, assigned_to, admin_notes,
                                   booked_quantity, booked_total_cost, cancel_requested_at
                            FROM service_requests WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $old = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$old) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Service request not found."]);
        exit;
    }

    if ($status === '') $status = $old['status'];
    $transition = $status !== $old['status'];
    $has_detail = $admin_notes !== null || $assigned_to !== null || $has_schedule || $has_final_quantity || $decline_cancel;

    if (!$transition && !$has_detail) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This request is already marked $status."]);
        exit;
    }

    // A cancelled or rejected booking can never be completed, so it can never be billed.
    if ($transition && !in_array($status, SERVICE_TRANSITIONS[$old['status']] ?? [], true)) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "A {$old['status']} booking cannot be moved to $status."]);
        exit;
    }

    $is_completing = $transition && $status === 'Completed';
    $still_open = in_array($status, ['Pending', 'Approved', 'In Progress'], true);

    // Leaving Completed is only allowed as a cancellation, which must reverse
    // any charge. Claim the status and reverse the charge in one transaction
    // (audit L5): a lost race or a refused reversal leaves both untouched,
    // instead of a booking still Completed with its charge already removed.
    $reversing = $transition && $old['status'] === 'Completed' && (int)$old['is_invoiced'];
    // The tenant sees the reason, so every rejection or cancellation carries one
    // (a charge that was paid becomes a refund request).
    if ($transition && in_array($status, ['Rejected', 'Cancelled'], true) && ($admin_notes === null || $admin_notes === '')) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "A reason is required to " . ($status === 'Rejected' ? 'reject' : 'cancel') . " this booking.", "errors" => ["adminNotes" => "A reason is required."]]);
        exit;
    }
    if ($admin_notes !== null && mb_strlen($admin_notes) > 500) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "The note can be up to 500 characters.", "errors" => ["adminNotes" => "Up to 500 characters."]]);
        exit;
    }

    $sets = ["handled_by = ?"];
    $params = [$admin_id];
    $types = "i";

    if ($transition) {
        $sets[] = "status = ?";
        $params[] = $status;
        $types .= "s";
        $sets[] = "cancel_requested_at = NULL";
        if ($is_completing) $sets[] = "completed_at = NOW()";
    }
    if ($decline_cancel) {
        if ($old['cancel_requested_at'] === null) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "There is no cancel request on this booking."]);
            exit;
        }
        $sets[] = "cancel_requested_at = NULL";
    }
    if ($admin_notes !== null) {
        $sets[] = "admin_notes = ?";
        $params[] = $admin_notes === '' ? null : $admin_notes;
        $types .= "s";
    }
    if ($assigned_to !== null) {
        if (mb_strlen($assigned_to) > 100) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "The assignee can be up to 100 characters.", "errors" => ["assignedTo" => "Up to 100 characters."]]);
            exit;
        }
        $sets[] = "assigned_to = ?";
        $params[] = $assigned_to === '' ? null : $assigned_to;
        $types .= "s";
    }

    // A confirmed visit: date and window travel together, or both are cleared.
    // Approving with none given confirms what the tenant asked for.
    $visit_date = $old['scheduled_date'];
    $visit_window = $old['scheduled_window'];
    if ($has_schedule) {
        $visit_date = trim((string)($input['scheduledDate'] ?? ''));
        $visit_window = strtolower(trim((string)($input['scheduledWindow'] ?? '')));
        if ($visit_date === '' && $visit_window === '') {
            $visit_date = null;
            $visit_window = null;
        } else {
            $parsed_visit = DateTime::createFromFormat('Y-m-d', $visit_date);
            $today = (new DateTime('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
            $unchanged = $visit_date === (string)$old['scheduled_date'];
            if (!$parsed_visit || $parsed_visit->format('Y-m-d') !== $visit_date || (!$unchanged && $visit_date < $today)) {
                http_response_code(422);
                echo json_encode(["success" => false, "message" => "Visit date must be a valid date from today onward.", "errors" => ["scheduledDate" => "Pick a date from today onward."]]);
                exit;
            }
            if (!isset(SERVICE_SLOT_START_HOUR[$visit_window])) {
                http_response_code(422);
                echo json_encode(["success" => false, "message" => "Visit window must be morning or afternoon.", "errors" => ["scheduledWindow" => "Choose morning or afternoon."]]);
                exit;
            }
        }
    } elseif ($transition && $status === 'Approved' && $visit_date === null) {
        $visit_date = $old['preferred_date'];
        $visit_window = isset(SERVICE_SLOT_START_HOUR[$old['preferred_time_slot']]) ? $old['preferred_time_slot'] : 'morning';
        $has_schedule = true;
    }
    if ($has_schedule && !$still_open) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "A {$status} booking can no longer be scheduled."]);
        exit;
    }
    if ($has_schedule) {
        $sets[] = "scheduled_date = ?";
        $params[] = $visit_date;
        $types .= "s";
        $sets[] = "scheduled_window = ?";
        $params[] = $visit_window;
        $types .= "s";
    }

    // The real quantity (e.g. the laundry weight) is set once, when the work is done. The
    // total is recomputed from the price snapshotted at booking, never taken from the client.
    $adjusted = false;
    $new_quantity = (float)$old['quantity'];
    $new_total = (float)$old['total_cost'];
    if ($has_final_quantity) {
        if (!$is_completing) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "The final quantity is set when the booking is completed.", "errors" => ["finalQuantity" => "Set it when completing."]]);
            exit;
        }
        $raw_qty = $input['finalQuantity'];
        $unit = $old['pricing_unit'];
        $bounds = ['min' => 0.01, 'max' => null];
        if ($old['service_id']) {
            $b = $conn->prepare("SELECT min_quantity, max_quantity FROM service_catalog WHERE id = ?");
            $b->bind_param("i", $old['service_id']);
            $b->execute();
            $row = $b->get_result()->fetch_assoc();
            $b->close();
            if ($row) {
                $bounds['min'] = max(0.01, (float)$row['min_quantity']);
                $bounds['max'] = $row['max_quantity'] === null ? null : (float)$row['max_quantity'];
            }
        }
        $qty_error = null;
        if (!is_numeric($raw_qty) || (float)$raw_qty <= 0) $qty_error = "Enter a quantity above zero.";
        elseif ($unit === 'session' && (float)$raw_qty != 1.0) $qty_error = "A per-session service is always 1.";
        elseif ($unit === 'item' && (float)$raw_qty != floor((float)$raw_qty)) $qty_error = "Items are counted in whole numbers.";
        elseif ((float)$raw_qty < $bounds['min']) $qty_error = "The minimum is " . rtrim(rtrim(number_format($bounds['min'], 2, '.', ''), '0'), '.') . ".";
        elseif ($bounds['max'] !== null && (float)$raw_qty > $bounds['max']) $qty_error = "The maximum is " . rtrim(rtrim(number_format($bounds['max'], 2, '.', ''), '0'), '.') . ".";
        if ($qty_error) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => $qty_error, "errors" => ["finalQuantity" => $qty_error]]);
            exit;
        }
        $new_quantity = round((float)$raw_qty, 2);
        $new_total = round((float)$old['unit_price'] * $new_quantity, 2);
        if ($new_quantity !== (float)$old['quantity']) {
            $adjusted = true;
            $sets[] = "booked_quantity = COALESCE(booked_quantity, quantity)";
            $sets[] = "booked_total_cost = COALESCE(booked_total_cost, total_cost)";
            $sets[] = "quantity = ?";
            $params[] = $new_quantity;
            $types .= "d";
            $sets[] = "total_cost = ?";
            $params[] = $new_total;
            $types .= "d";
        }
    }

    $sql = "UPDATE service_requests SET " . implode(', ', $sets) . " WHERE id = ? AND status = ?";
    $params[] = $id;
    $params[] = $old['status'];
    $types .= "is";

    $conn->begin_transaction();

    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $claimed = $stmt->affected_rows;
    $stmt->close();

    if ($claimed === 0 && $transition) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This booking was changed by someone else. Refresh and try again."]);
        exit;
    }

    if ($reversing) {
        $reversal = reverse_invoice_charge($conn, 'service', $id, ['own_transaction' => false, 'refund_ctx' => ['reason' => (string)$admin_notes, 'actor_id' => $admin_id]]);
        if (!$reversal['ok']) {
            $conn->rollback();
            http_response_code(409);
            echo json_encode(["success" => false, "message" => $reversal['message']]);
            exit;
        }
    }
    $conn->commit();

    //BillOnDelivery.AFailureHereIsNotFatal:TheStatusChangeStands
    //AndTheQueueOffersARetryViaSync_service_to_invoice.php.
    $billed = false;
    $warning = null;
    $invoice_id = null;

    if ($is_completing) {
        $charge = post_invoice_charge($conn, 'service', $id);
        $billed = $charge['ok'];
        $invoice_id = $charge['invoice_id'];
        if (!$charge['ok']) $warning = $charge['message'];
    }

    // One notice per save: the status move plus whatever else the tenant should know
    // (when, who, a changed quantity and price, the reason).
    $service_name = $old['service_name'];
    $money = fn($v) => "\u{20B1}" . number_format((float)$v, 2);
    $quantity_label = fn($v) => rtrim(rtrim(number_format((float)$v, 2, '.', ''), '0'), '.');
    $parts = [];
    if ($transition) {
        if ($is_completing) {
            $notif_title = "Service Completed";
            $parts[] = "Your \"$service_name\" booking is complete.";
            if ($adjusted) {
                $booked_qty = $old['booked_quantity'] ?? $old['quantity'];
                $booked_total = $old['booked_total_cost'] ?? $old['total_cost'];
                $parts[] = "The final quantity was " . $quantity_label($new_quantity) . " (booked " . $quantity_label($booked_qty) . "), so the total is " . $money($new_total) . " instead of " . $money($booked_total) . ".";
            }
            if ($billed && $invoice_id) $parts[] = $money($new_total) . " has been added to your invoice $invoice_id.";
        } elseif ($status === 'In Progress') {
            $notif_title = "Service In Progress";
            $parts[] = "Your \"$service_name\" booking is now in progress.";
        } else {
            $notif_title = "Service Booking " . $status;
            $parts[] = "Your \"$service_name\" booking has been " . strtolower($status) . ".";
        }
        if (in_array($status, ['Rejected', 'Cancelled'], true) && $admin_notes) $parts[] = "Reason: $admin_notes";
        if ($reversing && isset($reversal['message'])) $parts[] = $reversal['message'];
    } else {
        $notif_title = "Service Booking Update";
    }
    $slot_changed = $has_schedule && $still_open && $visit_date !== null
        && ($visit_date !== (string)$old['scheduled_date'] || $visit_window !== $old['scheduled_window']);
    if ($slot_changed) {
        $parts[] = "Your visit is scheduled for " . date('D, M j, Y', strtotime($visit_date)) . " ($visit_window).";
    } elseif ($has_schedule && $still_open && $visit_date === null && $old['scheduled_date']) {
        $parts[] = "The visit for \"$service_name\" has been cleared. We will confirm a new time.";
    }
    if ($assigned_to !== null && $assigned_to !== '' && $assigned_to !== (string)$old['assigned_to'] && $still_open) {
        $parts[] = "$assigned_to will handle your booking.";
    }
    if ($admin_notes && !in_array($status, ['Rejected', 'Cancelled'], true) && $admin_notes !== (string)$old['admin_notes']) {
        $parts[] = "Note from management: $admin_notes";
    }
    if ($decline_cancel) {
        $parts[] = "We could not cancel \"$service_name\" because the visit is too close. Contact the office if you need to change it.";
        resolve_admin_queue($conn, 'service_request', $id);
    }

    $notification_dispatch = null;
    if ($parts) {
        create_notification($conn, $old['user_id'], 'service_status', $notif_title, implode(' ', $parts));

        if ($transition || $slot_changed) {
            $shown = $transition ? $status : 'Scheduled';
            $extra = implode(' ', array_slice($parts, $transition ? 1 : 0));
            $notification_dispatch = dispatch_admin_action_notification(
                $conn, $old['user_id'], 'service_status', $notif_title,
                // The invoice ID stays out of the SMS (sms_templates.php R7).
                sms_status_update_template('service', $service_name, $shown,
                    $billed && $invoice_id ? sms_amount($new_total) . ' has been added to your invoice.' : ($transition ? '' : $extra)),
                email_status_update_template(
                    notify_recipient_name($conn, $old['user_id']),
                    'service', $service_name, $shown, implode(' ', $parts)
                )
            );
        }
    }

    // Any status move answers the open queue rows for this booking: the new booking
    // and a tenant's cancel request (Cancel or Reject included).
    if ($transition) {
        resolve_admin_queue($conn, 'service_request', $id);
    }

    log_activity($conn, $admin_id, 'service', "Updated Service Request Status",
        $transition ? "Service Request ID: $id status {$old['status']} -> $status" : "Service Request ID: $id details updated");

    echo json_encode([
        "success" => true,
        "message" => $transition ? "Service request marked $status." : "Service request updated.",
        "billed" => $billed,
        "invoiceId" => $invoice_id,
        "warning" => $warning,
        "notification_dispatch" => $notification_dispatch
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Failed to update the service request."]);
}

$conn->close();
