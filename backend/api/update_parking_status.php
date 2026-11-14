<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
require_once "../config.php";
require_once __DIR__ . '/services/send_notification.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Admin decision on a parking reservation (checklist 10.2 / 10.4):
//   Pending  -> Assigned (with a slot: slotNumber = parking_slots.id) | Rejected (with a reason)
//   Assigned -> Released (with a reason)
// The slot must be active, not removed, free, and take the vehicle's type. After
// an assignment, requests that no free slot can take any more are closed and
// their tenants told the parking is full (parking_close_unservable_requests).
//
// This used to accept any status from any status (a rejected or cancelled row
// could be assigned, an assigned row put back to Pending), reported success for
// ids that did not exist, and had no way to free a slot at all.
$admin_id = require_admin($conn);

function parking_status_fail($code, $message) {
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
}

$input = read_json_input();
$id = (int)($input['rawId'] ?? $input['id'] ?? 0);
$status = trim((string)($input['status'] ?? ''));
$slot_raw = $input['slotId'] ?? $input['slotNumber'] ?? null;
$slot_number = is_int($slot_raw) || (is_string($slot_raw) && ctype_digit($slot_raw)) ? (int)$slot_raw : null;
$reason = trim((string)($input['reason'] ?? ''));

if ($status === 'Approved') $status = 'Assigned'; // legacy spelling

if (!$id || !in_array($status, ['Assigned', 'Rejected', 'Released'], true)) {
    parking_status_fail(422, "Invalid parameters.");
}
if (in_array($status, ['Rejected', 'Released'], true) && ($reason === '' || mb_strlen($reason) > 255)) {
    parking_status_fail(422, $status === 'Rejected' ? "Give a reason for rejecting this request." : "Give a reason for releasing this slot.");
}

$conn->begin_transaction();
try {
    $stmt = $conn->prepare("SELECT id, user_id, status, vehicle_type, vehicle_model, plate_number, duration_months, monthly_fee FROM parking_reservations WHERE id = ? FOR UPDATE");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $current = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$current) {
        $conn->rollback();
        parking_status_fail(404, "Parking reservation not found.");
    }
    if (!in_array($status, PARKING_TRANSITIONS[$current['status']] ?? [], true)) {
        $conn->rollback();
        parking_status_fail(422, "A {$current['status']} reservation cannot be changed to $status.");
    }

    $vehicle = $current['vehicle_model'] . ($current['plate_number'] ? " ({$current['plate_number']})" : '');
    if ($status === 'Assigned') {
        // Lock the slot so a concurrent edit (maintenance, removal) cannot slip in.
        $slot = null;
        if ($slot_number !== null && $slot_number > 0) {
            $s = $conn->prepare("SELECT id, label, icon, vehicle_types, requires_registration, status, archived_at FROM parking_slots WHERE id = ? FOR UPDATE");
            $s->bind_param("i", $slot_number);
            $s->execute();
            $row = $s->get_result()->fetch_assoc();
            $s->close();
            $slot = $row && $row['archived_at'] === null ? parking_slot_row($row) : null;
        }
        if (!$slot) {
            $conn->rollback();
            parking_status_fail(422, "Choose one of the parking slots.");
        }
        if ($slot['status'] !== 'active') {
            $conn->rollback();
            parking_status_fail(409, "Slot {$slot['label']} is under maintenance.");
        }
        if (!in_array(strtolower($current['vehicle_type']), $slot['vehicle_types'], true)) {
            $conn->rollback();
            parking_status_fail(422, "Slot {$slot['label']} does not take a " . strtolower($current['vehicle_type']) . ".");
        }
        // Lock the assigned rows so two admins cannot hand out the same slot.
        $taken = $conn->query("SELECT slot_number FROM parking_reservations WHERE status = 'Assigned' FOR UPDATE")->fetch_all(MYSQLI_ASSOC);
        if (in_array($slot_number, array_map('intval', array_column($taken, 'slot_number')), true)) {
            $conn->rollback();
            parking_status_fail(409, "Slot {$slot['label']} is already assigned to another tenant.");
        }
        if (!get_active_tenancy($conn, (int)$current['user_id'])) {
            $conn->rollback();
            parking_status_fail(409, "This tenant no longer has an active rental.");
        }

        $upd = $conn->prepare("UPDATE parking_reservations SET status = 'Assigned', slot_number = ?, assigned_at = NOW() WHERE id = ? AND status = 'Pending'");
        $upd->bind_param("ii", $slot_number, $id);
        $title = "Parking Slot Assigned";
        $message = "Your parking request for $vehicle has been approved. You have been assigned slot {$slot['label']} for {$current['duration_months']} month(s).";
        $sms_details = "Slot {$slot['label']} for {$current['duration_months']} month(s).";
        $log = "Reservation ID: $id assigned slot {$slot['label']}";
    } elseif ($status === 'Rejected') {
        $upd = $conn->prepare("UPDATE parking_reservations SET status = 'Rejected', rejection_reason = ? WHERE id = ? AND status = 'Pending'");
        $upd->bind_param("si", $reason, $id);
        $title = "Parking Request Rejected";
        $message = "Your parking request for $vehicle was not approved. Reason: $reason";
        $sms_details = "Reason: $reason";
        $log = "Reservation ID: $id rejected. Reason: $reason";
    } else {
        $upd = $conn->prepare("UPDATE parking_reservations SET status = 'Released', released_at = NOW(), release_reason = ? WHERE id = ? AND status = 'Assigned'");
        $upd->bind_param("si", $reason, $id);
        $title = "Parking Slot Released";
        $message = "Your parking slot for $vehicle has been released. Reason: $reason";
        $sms_details = "Reason: $reason";
        $log = "Reservation ID: $id released. Reason: $reason";
    }

    try {
        $upd->execute();
    } catch (mysqli_sql_exception $e) {
        $duplicate = $e->getCode() === 1062;
        $upd->close();
        $conn->rollback();
        if ($duplicate) {
            parking_status_fail(409, "That slot was just assigned to someone else. Refresh and pick another.");
        }
        throw $e;
    }
    $changed = $upd->affected_rows;
    $upd->close();
    if ($changed === 0) {
        $conn->rollback();
        parking_status_fail(409, "This reservation was changed by someone else. Refresh and try again.");
    }

    $conn->commit();
} catch (Exception $e) {
    $conn->rollback();
    server_error_response($e, "Failed to update the parking reservation.");
    $conn->close();
    exit;
}

resolve_admin_queue($conn, 'parking_reservation', $id);
create_notification($conn, (int)$current['user_id'], 'parking_reservation', $title, $message);
log_activity($conn, $admin_id, 'service', "Updated Parking Reservation", $log);

$notification_dispatch = dispatch_admin_action_notification(
    $conn, (int)$current['user_id'], 'parking_reservation', $title,
    sms_status_update_template('parking', $vehicle, $status, $sms_details),
    email_status_update_template(
        notify_recipient_name($conn, (int)$current['user_id']),
        'parking',
        $vehicle,
        $status, $message
    )
);

// The lot may now be full for some vehicle types: close the requests left without a slot.
$closed_full = $status === 'Assigned' ? parking_close_unservable_requests($conn) : [];
if ($closed_full) {
    log_activity($conn, $admin_id, 'service', "Closed Parking Requests", "Parking full: request(s) #" . implode(', #', $closed_full) . " closed");
}

// In automatic billing mode the first month is posted as soon as the slot is
// assigned (a free permit is never billed).
$billing = null;
if ($status === 'Assigned' && get_setting($conn, 'parking_billing_mode', 'manual') === 'auto' && parking_reservation_fee($conn, $current) > 0) {
    $billing = post_invoice_charge($conn, 'parking', $id, new DateTime('now', new DateTimeZone('Asia/Manila')));
    if ($billing['ok']) {
        log_activity($conn, $admin_id, 'billing', "Billed Parking Fee", "Reservation ID: $id — " . $billing['message']);
    }
}

echo json_encode([
    "success" => true,
    "message" => "Parking reservation " . strtolower($status) . "."
        . ($closed_full ? " The parking is now full for " . (count($closed_full) === 1 ? "1 other request" : count($closed_full) . " other requests") . ": closed, and the tenants were told." : ""),
    "closed_full" => $closed_full,
    "billing" => $billing,
    "notification_dispatch" => $notification_dispatch,
]);
$conn->close();
?>
