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

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
    exit;
}
$admin_id = (int)$admin_id;

$input = json_decode(file_get_contents("php://input"), true) ?? [];
$id = (int)($input['rawId'] ?? $input['id'] ?? 0);
$status = $input['status'] ?? '';
$admin_notes = array_key_exists('adminNotes', $input) ? trim((string)$input['adminNotes']) : null;
$assigned_to = array_key_exists('assignedTo', $input) ? trim((string)$input['assignedTo']) : null;

$ALLOWED = ['Pending', 'Approved', 'In Progress', 'Completed', 'Rejected', 'Cancelled'];

if (!$id || !in_array($status, $ALLOWED, true)) {
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
        echo json_encode(["success" => false, "message" => "Service request not found."]);
        exit;
    }

    if ($old['status'] === $status) {
        echo json_encode(["success" => false, "message" => "This request is already marked $status."]);
        exit;
    }

    //AOnceCompletedRequestHasBilledMoney;TheOnlyWayOutIsAReversal.
    if ($old['status'] === 'Completed') {
        if ($status !== 'Cancelled') {
            echo json_encode(["success" => false, "message" => "A completed request can only be reversed by cancelling it."]);
            exit;
        }
        if ((int)$old['is_invoiced']) {
            $reversal = reverse_service_charge($conn, $id);
            if (!$reversal['ok']) {
                //RefuseTheWholeTransition-StatusAndMoneyMustNotDrift
                echo json_encode(["success" => false, "message" => $reversal['message']]);
                exit;
            }
        }
    }

    $is_completing = ($status === 'Completed');

    $stmt = $conn->prepare("UPDATE service_requests
                            SET status = ?,
                                admin_notes = COALESCE(?, admin_notes),
                                assigned_to = COALESCE(?, assigned_to),
                                handled_by = ?,
                                completed_at = IF(? = 'Completed', NOW(), completed_at)
                            WHERE id = ?");
    $stmt->bind_param("sssisi", $status, $admin_notes, $assigned_to, $admin_id, $status, $id);
    $stmt->execute();
    $stmt->close();

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

    $notif_stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, 'service_status', ?, ?, 'Resolved', 0)");
    $notif_stmt->bind_param("iss", $old['user_id'], $notif_title, $notif_msg);
    $notif_stmt->execute();
    $notif_stmt->close();

    //ClearTheOriginalIntakeRowFromTheAdminBellOnceTheRequestIsSettled
    if (in_array($status, ['Completed', 'Rejected', 'Cancelled'], true)) {
        $metadata = "service_request:$id";
        $resolve = $conn->prepare("UPDATE notifications SET status = 'Resolved' WHERE type = 'service_request' AND metadata_value = ?");
        $resolve->bind_param("s", $metadata);
        $resolve->execute();
        $resolve->close();
    }

    log_activity($conn, $admin_id, 'service', "Updated Service Request Status", "Service Request ID: $id status set to $status");

    echo json_encode([
        "success" => true,
        "message" => "Service request marked $status.",
        "billed" => $billed,
        "invoiceId" => $invoice_id,
        "warning" => $warning
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}

$conn->close();
?>
