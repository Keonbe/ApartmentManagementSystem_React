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
$id = (int)($input['rawId'] ?? $input['id'] ?? 0);
$status = $input['status'] ?? '';
$admin_notes = array_key_exists('adminNotes', $input) ? trim((string)$input['adminNotes']) : null;
$assigned_to = array_key_exists('assignedTo', $input) ? trim((string)$input['assignedTo']) : null;

if (!$id || !array_key_exists($status, SERVICE_TRANSITIONS)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Invalid parameters."]);
    exit;
}

try {
    $stmt = $conn->prepare("SELECT user_id, service_name, category, total_cost, status, is_invoiced, invoice_id FROM service_requests WHERE id = ?");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $old = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$old) {
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Service request not found."]);
        exit;
    }

    if ($old['status'] === $status) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This request is already marked $status."]);
        exit;
    }

    // A cancelled or rejected booking can never be completed, so it can never be billed.
    if (!in_array($status, SERVICE_TRANSITIONS[$old['status']] ?? [], true)) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "A {$old['status']} booking cannot be moved to $status."]);
        exit;
    }

    $is_completing = ($status === 'Completed');

    // Leaving Completed is only allowed as a cancellation, which must reverse
    // any charge. Claim the status and reverse the charge in one transaction
    // (audit L5): a lost race or a refused reversal leaves both untouched,
    // instead of a booking still Completed with its charge already removed.
    $reversing = $old['status'] === 'Completed' && (int)$old['is_invoiced'];
    $conn->begin_transaction();

    $stmt = $conn->prepare("UPDATE service_requests
                            SET status = ?,
                                admin_notes = COALESCE(?, admin_notes),
                                assigned_to = COALESCE(?, assigned_to),
                                handled_by = ?,
                                completed_at = IF(? = 'Completed', NOW(), completed_at)
                            WHERE id = ? AND status = ?");
    $stmt->bind_param("sssisis", $status, $admin_notes, $assigned_to, $admin_id, $status, $id, $old['status']);
    $stmt->execute();
    $claimed = $stmt->affected_rows;
    $stmt->close();

    if ($claimed === 0) {
        $conn->rollback();
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This booking was changed by someone else. Refresh and try again."]);
        exit;
    }

    if ($reversing) {
        $reversal = reverse_service_charge($conn, $id, false);
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
        $charge = post_service_charge($conn, $id);
        $billed = $charge['ok'];
        $invoice_id = $charge['invoice_id'];
        if (!$charge['ok']) $warning = $charge['message'];
    }

    //NotifyTheTenant
    $service_name = $old['service_name'];
    if ($is_completing) {
        $notif_title = "Service Completed";
        $notif_msg = $billed && $invoice_id
            ? "Your \"$service_name\" booking is complete. \u{20B1}" . number_format((float)$old['total_cost'], 2) . " has been added to your invoice $invoice_id."
            : "Your \"$service_name\" booking is complete.";
    } else if ($status === 'In Progress') {
        $notif_title = "Service In Progress";
        $notif_msg = "Your \"$service_name\" booking is now in progress.";
    } else {
        $notif_title = "Service Booking " . $status;
        $notif_msg = "Your \"$service_name\" booking has been " . strtolower($status) . ".";
    }

    create_notification($conn, $old['user_id'], 'service_status', $notif_title, $notif_msg);

    $notification_dispatch = dispatch_admin_action_notification(
        $conn, $old['user_id'], 'service_status', $notif_title,
        // The invoice ID stays out of the SMS (sms_templates.php R7).
        sms_status_update_template('service', $service_name, $status,
            $billed && $invoice_id ? sms_amount($old['total_cost']) . ' has been added to your invoice.' : ''),
        email_status_update_template(
            notify_recipient_name($conn, $old['user_id']),
            'service', $service_name, $status, $notif_msg
        )
    );

    //ClearTheOriginalIntakeRowFromTheAdminBellOnceTheRequestIsSettled
    // (Once the booking leaves Pending the admin has acted on it.)
    if ($status !== 'Pending') {
        resolve_admin_queue($conn, 'service_request', $id);
    }

    log_activity($conn, $admin_id, 'service', "Updated Service Request Status", "Service Request ID: $id status {$old['status']} -> $status");

    echo json_encode([
        "success" => true,
        "message" => "Service request marked $status.",
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
