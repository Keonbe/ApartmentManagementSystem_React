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

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$id = (int)($input['id'] ?? 0);

if (!$id) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Request ID is required."]);
    exit;
}

$stmt = $conn->prepare("SELECT user_id, status, issue_category, title, tenant_responsible, actual_cost, estimated_cost, is_invoiced, assigned_to, scheduled_date, scheduled_window FROM maintenance_requests WHERE id = ?");
$stmt->bind_param("i", $id);
$stmt->execute();
$current = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$current) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Maintenance request not found."]);
    exit;
}

$sets = [];
$params = [];
$types = '';

// Only fields present in the payload are written, so one edit never wipes another field.
if (array_key_exists('assignedTo', $input)) {
    $assignee = trim((string)$input['assignedTo']);
    $sets[] = "assigned_to = ?";
    $params[] = $assignee === '' ? null : $assignee;
    $types .= 's';
}

foreach (['estimatedCost' => 'estimated_cost', 'actualCost' => 'actual_cost'] as $key => $column) {
    if (!array_key_exists($key, $input)) continue;
    $raw = $input[$key];
    if ($raw !== null && $raw !== '' && (!is_numeric($raw) || (float)$raw < 0)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Costs must be zero or a positive number."]);
        exit;
    }
    $sets[] = "$column = ?";
    $params[] = ($raw === null || $raw === '') ? null : (float)$raw;
    $types .= 'd';
}

if (array_key_exists('workNotes', $input)) {
    $sets[] = "work_notes = ?";
    $params[] = $input['workNotes'] === null ? null : (string)$input['workNotes'];
    $types .= 's';
}

if (array_key_exists('tenantResponsible', $input)) {
    $sets[] = "tenant_responsible = ?";
    $params[] = !empty($input['tenantResponsible']) ? 1 : 0;
    $types .= 'i';
}

// A confirmed visit: date and window travel together, or both are cleared.
if (array_key_exists('scheduledDate', $input) || array_key_exists('scheduledWindow', $input)) {
    $visit_date = trim((string)($input['scheduledDate'] ?? ''));
    $visit_window = strtolower(trim((string)($input['scheduledWindow'] ?? '')));
    if ($visit_date === '' && $visit_window === '') {
        $visit_date = null;
        $visit_window = null;
    } else {
        $parsed_visit = DateTime::createFromFormat('Y-m-d', $visit_date);
        $today = (new DateTime('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
        $unchanged = $visit_date === (string)$current['scheduled_date'];
        if (!$parsed_visit || $parsed_visit->format('Y-m-d') !== $visit_date || (!$unchanged && $visit_date < $today)) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Visit date must be a valid date from today onward."]);
            exit;
        }
        if (!in_array($visit_window, ['morning', 'afternoon'], true)) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Visit window must be morning or afternoon."]);
            exit;
        }
    }
    $sets[] = "scheduled_date = ?";
    $params[] = $visit_date;
    $types .= 's';
    $sets[] = "scheduled_window = ?";
    $params[] = $visit_window;
    $types .= 's';
}

// Management can turn down a tenant's request to cancel work already under way.
if (!empty($input['declineCancel'])) {
    $sets[] = "cancel_requested_at = NULL";
}

// Priority triage is an admin-only decision — normalize_maintenance_urgency()
// only accepts the four real levels, so the "Needs Triage" sentinel a ticket
// starts with can never be re-selected once an admin has assigned a priority.
if (array_key_exists('urgency', $input)) {
    $urgency = normalize_maintenance_urgency($input['urgency'] ?? '');
    if (!$urgency) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Invalid priority level."]);
        exit;
    }
    $sets[] = "urgency = ?";
    $params[] = $urgency;
    $types .= 's';
}

$new_status = $input['status'] ?? null;
$status_changed = $new_status !== null && $new_status !== $current['status'];
$rejection_reason = null;

if ($status_changed) {
    $allowed = MAINTENANCE_TRANSITIONS[$current['status']] ?? [];
    if (!in_array($new_status, $allowed, true)) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "A {$current['status']} request cannot be moved to $new_status."]);
        exit;
    }

    if ($new_status === 'Rejected') {
        $rejection_reason = trim((string)($input['rejectionReason'] ?? ''));
        if ($rejection_reason === '') {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "A reason is required to reject a request."]);
            exit;
        }
        $sets[] = "rejection_reason = ?";
        $params[] = $rejection_reason;
        $types .= 's';
    }

    // Billing a tenant for a repair needs the real cost on the ticket.
    $will_bill_tenant = array_key_exists('tenantResponsible', $input) ? !empty($input['tenantResponsible']) : (int)$current['tenant_responsible'] === 1;
    $cost_after = array_key_exists('actualCost', $input) ? $input['actualCost'] : $current['actual_cost'];
    if ($new_status === 'Completed' && $will_bill_tenant && ($cost_after === null || $cost_after === '')) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Enter the actual cost before completing a repair billed to the tenant."]);
        exit;
    }

    $sets[] = "status = ?";
    $params[] = $new_status;
    $types .= 's';
    $sets[] = "cancel_requested_at = NULL";

    if ($current['status'] === 'Pending') $sets[] = "acknowledged_at = COALESCE(acknowledged_at, NOW())";
    if ($new_status === 'In Progress') $sets[] = "started_at = COALESCE(started_at, NOW())";
    if ($new_status === 'Completed') $sets[] = "resolved_at = NOW()";
    if ($current['status'] === 'Completed') $sets[] = "resolved_at = NULL";
}

if (!$sets) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Nothing to update."]);
    exit;
}

$sql = "UPDATE maintenance_requests SET " . implode(', ', $sets) . " WHERE id = ?";
$params[] = $id;
$types .= 'i';

// Guard status changes on the status we read, so a concurrent change is not overwritten.
if ($status_changed) {
    $sql .= " AND status = ?";
    $params[] = $current['status'];
    $types .= 's';
}

// Audit H10: a ticket flagged tenant-responsible is billed onto the tenant's
// invoice once Completed. The charge is reversed if the flag is cleared or the
// ticket is reopened out of Completed. The reversal shares a transaction with
// the status change, so a refused reversal (the invoice was paid or is being
// paid) leaves the ticket as it was instead of Completed-less with the charge
// still on the bill.
$final_status = $status_changed ? $new_status : $current['status'];
$final_tenant_responsible = array_key_exists('tenantResponsible', $input)
    ? (!empty($input['tenantResponsible']) ? 1 : 0)
    : (int)$current['tenant_responsible'];
$reversing = (int)$current['is_invoiced'] && (
    $final_tenant_responsible === 0
    || ($status_changed && $current['status'] === 'Completed' && $new_status !== 'Completed')
);

$conn->begin_transaction();
$stmt = $conn->prepare($sql);
$stmt->bind_param($types, ...$params);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

if ($status_changed && $affected === 0) {
    $conn->rollback();
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This request was changed by someone else. Refresh and try again."]);
    exit;
}

$reversal = null;
if ($reversing) {
    $reversal = reverse_invoice_charge($conn, 'maintenance', $id, [
        'own_transaction' => false,
        'refund_ctx' => ['reason' => trim((string)($input['rejectionReason'] ?? '')) ?: 'Ticket status changed to ' . $final_status, 'actor_id' => $admin_id],
    ]);
    if (!$reversal['ok']) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => $reversal['message']]);
        exit;
    }
}
$conn->commit();

$changed_fields = array_map(fn($set) => explode(' =', $set)[0], $sets);
$details = $status_changed
    ? "Status: {$current['status']} -> $new_status"
    : "Updated: " . implode(', ', $changed_fields);
log_activity($conn, $admin_id, 'maintenance', "Updated Maintenance Ticket #$id", $details);

// One notice per save: the status move plus whatever else the tenant should know
// (who is coming, when, and whether the repair is billed to them).
$label = $current['title'] ?: $current['issue_category'];
$still_open = in_array($final_status, ['Pending', 'In Progress'], true);
$reopen_note = " If it is not fixed, report it in My Requests within " . MAINTENANCE_REOPEN_DAYS . " days.";
$parts = [];
if ($status_changed) {
    $parts[] = "Your maintenance request \"$label\" is now $new_status.";
    if ($rejection_reason !== null) $parts[] = "Reason: $rejection_reason";
    if ($new_status === 'Completed' && $final_tenant_responsible === 1) {
        $final_cost = array_key_exists('actualCost', $input) ? (float)$input['actualCost'] : (float)$current['actual_cost'];
        $parts[] = "Because this repair is your responsibility, ₱" . number_format($final_cost, 2) . " will be added to your invoice." . $reopen_note;
    } elseif ($new_status === 'Completed') {
        $parts[] = trim($reopen_note);
    }
}
$schedule_changed = isset($visit_date) && $still_open && $visit_date !== null && $visit_date !== (string)$current['scheduled_date'];
if (isset($visit_date) && $still_open && $visit_date === null && $current['scheduled_date']) {
    $parts[] = "The visit for \"$label\" has been cleared. We will confirm a new time.";
}
if ($schedule_changed) {
    $parts[] = "A visit is scheduled for " . date('M j, Y', strtotime($visit_date)) . " ($visit_window).";
}
if (isset($assignee) && $assignee !== '' && $assignee !== (string)$current['assigned_to'] && $still_open) {
    $parts[] = "$assignee has been assigned to your request.";
}
if (array_key_exists('tenantResponsible', $input) && $final_tenant_responsible !== (int)$current['tenant_responsible'] && $still_open) {
    $est = $current['estimated_cost'] !== null ? (float)$current['estimated_cost'] : null;
    if (array_key_exists('estimatedCost', $input) && $input['estimatedCost'] !== '' && $input['estimatedCost'] !== null) $est = (float)$input['estimatedCost'];
    $parts[] = $final_tenant_responsible === 1
        ? "Management marked this repair as your responsibility" . ($est ? " (estimated ₱" . number_format($est, 2) . ")" : "") . ". The final cost is added to your invoice once it is completed. Contact the office if you disagree."
        : "This repair is no longer billed to you.";
}
if (!empty($input['declineCancel'])) {
    $parts[] = "We could not cancel \"$label\" because work is already under way.";
    resolve_admin_queue($conn, 'maintenance_request', $id);
}

$notification_dispatch = null;
if ($parts && $current['user_id']) {
    create_notification($conn, $current['user_id'], 'maintenance_update', 'Maintenance Update', implode(' ', $parts));

    if ($status_changed || $schedule_changed) {
        $extra = implode(' ', array_slice($parts, $status_changed ? 1 : 0));
        $shown_status = $status_changed ? $new_status : 'Scheduled';
        try {
            $notification_dispatch = dispatch_admin_action_notification(
                $conn, $current['user_id'], 'maintenance_update',
                "Maintenance Update - $label",
                sms_status_update_template('maintenance', $label, $shown_status, $extra),
                email_status_update_template(notify_recipient_name($conn, $current['user_id']), 'maintenance', $label, $shown_status, $extra)
            );
        } catch (Throwable $notification_error) {
            error_log('Could not dispatch maintenance status notification: ' . $notification_error->getMessage());
            $notification_dispatch = ['email' => 'failed', 'sms' => 'failed'];
        }
    }
}

// Any status move answers the open queue rows for this ticket: the new request,
// a tenant's cancel request or a "not fixed" report (Back to Pending included).
if ($status_changed) {
    resolve_admin_queue($conn, 'maintenance_request', $id);
}

// Post the charge the moment a Completed ticket is (or becomes)
// tenant-responsible; a failure here is not fatal, the status change stands and
// sync_maintenance_to_invoice.php retries it.
$billing_message = null;

if ($final_status === 'Completed' && $final_tenant_responsible === 1 && !(int)$current['is_invoiced']) {
    $charge = post_invoice_charge($conn, 'maintenance', $id);
    if ($charge['ok'] && $charge['invoice_id']) {
        log_activity($conn, $admin_id, 'billing', "Posted Maintenance Charge", "Maintenance Ticket #$id billed to invoice " . $charge['invoice_id']);
    }
    $billing_message = $charge['message'];
} elseif ($reversal) {
    log_activity($conn, $admin_id, 'billing', "Reversed Maintenance Charge", "Maintenance Ticket #$id: " . $reversal['message']);
    $billing_message = $reversal['message'];
}

echo json_encode([
    "success" => true,
    "message" => "Maintenance request updated.",
    "billing" => $billing_message,
    "notification_dispatch" => $notification_dispatch
]);
$conn->close();
