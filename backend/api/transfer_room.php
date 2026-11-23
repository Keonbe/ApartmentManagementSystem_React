<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Room transfer (Tenants -> Change unit): a tenant who has moved in moves to
// another vacant unit without moving out. The tenancy is kept as it is: the same
// rent application, contract, rent anniversary, household, parking and payment
// history. What changes:
//   - the unit: the old one becomes vacant (its waitlist is told), the new one occupied;
//   - the rent: the new unit's rate plus the occupant charge, from the next rent
//     period (an unpaid bill already issued for a period not yet started is
//     re-priced, with an adjustment record);
//   - the deposit: matched to one month of the new rent, by a "Deposit top-up"
//     bill or a refund request for the excess;
//   - a room_transfers row records all of it.
// GET ?applicationId= lists a tenancy's transfers. POST {applicationId, toRoom,
// reason, preview} moves the tenant; preview: true runs the same checks and
// returns the amounts without saving anything.
$admin_id = require_admin($conn);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $app_id = (int)($_GET['applicationId'] ?? 0);
    if ($app_id <= 0) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "applicationId is required."]);
        exit;
    }
    echo json_encode(["success" => true, "transfers" => room_transfers_for($conn, [$app_id])[$app_id] ?? []]);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Use POST."]);
    exit;
}

$input = read_json_input();
$app_id = is_numeric($input['applicationId'] ?? null) ? (int)$input['applicationId'] : 0;
$to_room = is_string($input['toRoom'] ?? null) ? trim($input['toRoom']) : '';
$reason = is_string($input['reason'] ?? null) ? trim($input['reason']) : '';
$preview = filter_var($input['preview'] ?? false, FILTER_VALIDATE_BOOLEAN);

$errors = [];
if ($app_id <= 0) $errors['applicationId'] = 'Choose the tenant to move.';
if ($to_room === '' || mb_strlen($to_room) > 50) $errors['toRoom'] = 'Choose the unit to move to.';
if (!$preview && (mb_strlen($reason) < 5 || mb_strlen($reason) > 255)) $errors['reason'] = 'Give a reason of 5 to 255 characters.';
if ($errors) validation_fail($errors);

$refuse = function ($code, $message) use ($conn) {
    $conn->rollback();
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit;
};

$conn->begin_transaction();
try {
    $a = $conn->prepare("SELECT ra.id, ra.user_id, ra.status, ra.room_name, ra.monthly_rent, ra.occupants, ra.first_name, ra.last_name, ra.suffix
                         FROM rent_applications ra WHERE ra.id = ? FOR UPDATE");
    $a->bind_param("i", $app_id);
    $a->execute();
    $app = $a->get_result()->fetch_assoc();
    $a->close();
    if (!$app) $refuse(404, "Tenancy not found.");
    if ($app['status'] !== 'active') {
        $refuse(409, $app['status'] === 'pending-move-out'
            ? "This tenant has a move-out notice. Cancel the notice first, or clear the move-out."
            : "Only a tenant who has moved in can change unit.");
    }
    $from_room = (string)$app['room_name'];
    if (strcasecmp($from_room, $to_room) === 0) $refuse(422, "The tenant already lives in Unit $from_room.");
    $tenant_name = person_name($app);
    $user_id = $app['user_id'] ? (int)$app['user_id'] : null;

    // Both units, locked in id order so two transfers cannot deadlock.
    $pair = [$from_room, $to_room];
    sort($pair, SORT_STRING);
    $r = $conn->prepare("SELECT id, floor, status, monthly_rent, tenant_name, lease_start, lease_end FROM rooms WHERE id IN (?, ?) ORDER BY id FOR UPDATE");
    $r->bind_param("ss", $pair[0], $pair[1]);
    $r->execute();
    $rooms = [];
    foreach ($r->get_result()->fetch_all(MYSQLI_ASSOC) as $row) $rooms[strtoupper($row['id'])] = $row;
    $r->close();
    $old = $rooms[strtoupper($from_room)] ?? null;
    $new = $rooms[strtoupper($to_room)] ?? null;
    if (!$new) $refuse(404, "Unit $to_room does not exist.");
    $to_room = $new['id'];
    if ($new['status'] !== 'vacant') {
        $refuse(409, "Unit $to_room is not vacant (" . $new['status'] . "). Choose a vacant unit.");
    }

    // Nobody else may be waiting on the unit: another approved application, or a hold for someone else.
    $o = $conn->prepare("SELECT id FROM rent_applications WHERE room_name = ? AND id <> ? AND status IN ('Approved', 'active', 'pending-move-out') LIMIT 1");
    $o->bind_param("si", $to_room, $app_id);
    $o->execute();
    $other = $o->get_result()->fetch_assoc();
    $o->close();
    if ($other) $refuse(409, "Unit $to_room is held by application #{$other['id']}.");
    $h = $conn->prepare("SELECT id FROM unit_reservations WHERE room_name = ? AND status = 'Active' AND NOT (user_id <=> ? OR LOWER(TRIM(reserved_for_name)) = LOWER(TRIM(?))) LIMIT 1");
    $h->bind_param("sis", $to_room, $user_id, $tenant_name);
    $h->execute();
    $hold = $h->get_result()->fetch_assoc();
    $h->close();
    if ($hold) $refuse(409, "Unit $to_room is on hold for someone else (reservation #{$hold['id']}). Cancel the hold first.");

    // A payment being verified would be settled against the old terms.
    if ($in_review = tenancy_payment_in_review($conn, $app_id)) $refuse(409, $in_review);

    // Prepaid months were bought at the old rent: refund or use them first.
    $c = $conn->prepare("SELECT COUNT(*) AS n FROM advance_credits WHERE rent_application_id = ? AND status IN ('reserved', 'available')");
    $c->bind_param("i", $app_id);
    $c->execute();
    $credits = (int)$c->get_result()->fetch_assoc()['n'];
    $c->close();
    if ($credits > 0) $refuse(409, "This tenant has $credits prepaid month(s) at the current rent. Refund or use them before changing unit.");

    // The per-floor child rule (Settings -> Minors & Pets) for the household.
    $rule = child_floor_restriction($conn);
    if ($rule['below_age'] > 0 && in_array((string)$new['floor'], $rule['floors'], true)) {
        $k = $conn->prepare("SELECT COUNT(*) AS n FROM household_members WHERE rent_application_id = ? AND status = 'Active' AND age IS NOT NULL AND age < ?");
        $k->bind_param("ii", $app_id, $rule['below_age']);
        $k->execute();
        $young = (int)$k->get_result()->fetch_assoc()['n'];
        $k->close();
        if ($young > 0) {
            $refuse(422, "Children under {$rule['below_age']} cannot live on the " . floor_display_name((string)$new['floor']) . " because of the stairs.");
        }
    }

    // The new rent: the unit's rate plus the occupant charge, as at approval.
    $old_rent = round((float)$app['monthly_rent'], 2);
    $new_rent = round((float)$new['monthly_rent'] + occupant_surcharge($conn, (int)$app['occupants']), 2);

    $ct = $conn->prepare("SELECT id, deposit_amount, deposit_status, lease_start, lease_end FROM lease_contracts
                          WHERE rent_application_id = ? AND status IN ('active', 'expired', 'eviction-pending') ORDER BY generated_at DESC LIMIT 1 FOR UPDATE");
    $ct->bind_param("i", $app_id);
    $ct->execute();
    $contract = $ct->get_result()->fetch_assoc();
    $ct->close();
    if (!$contract) $refuse(409, "This tenancy has no running contract.");
    $old_deposit = round((float)$contract['deposit_amount'], 2);
    $deposit_held = $contract['deposit_status'] === 'Held';
    $new_deposit = $deposit_held ? $new_rent : $old_deposit;
    $deposit_diff = round($new_deposit - $old_deposit, 2);

    // The new rent starts with the first rent period that has not begun.
    $today = date('Y-m-d');
    $effective = null;
    for ($k = 0; $k < 1200; $k++) {
        $start = rent_period_start($contract['lease_start'], $k);
        if ($start > $today) { $effective = $start; break; }
    }
    // Unpaid rent bills already issued for periods not yet started.
    $f = $conn->prepare("SELECT id, base_rent, total_amount, status FROM invoices
                         WHERE rent_application_id = ? AND rent_period_start IS NOT NULL AND rent_period_start > ?
                           AND advance_months IS NULL AND amount_paid = 0 AND status IN ('pending', 'unpaid', 'overdue', 'payment-failed')
                         FOR UPDATE");
    $f->bind_param("is", $app_id, $today);
    $f->execute();
    $future_bills = $f->get_result()->fetch_all(MYSQLI_ASSOC);
    $f->close();

    $summary = [
        'fromRoom' => $from_room, 'toRoom' => $to_room,
        'oldRent' => $old_rent, 'newRent' => $new_rent,
        'oldDeposit' => $old_deposit, 'newDeposit' => $new_deposit, 'depositDifference' => $deposit_diff,
        'depositHeld' => $deposit_held,
        'effectivePeriodStart' => $effective,
        'repricedBills' => count($future_bills),
    ];
    if ($preview) {
        $conn->rollback();
        echo json_encode(["success" => true, "preview" => true] + $summary);
        exit;
    }

    // Old unit vacant (only if it is still in this tenant's name), new one occupied.
    $v = $conn->prepare("UPDATE rooms SET status = 'vacant', last_tenant = ?, tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0
                         WHERE id = ? AND tenant_name = ?");
    $v->bind_param("sss", $tenant_name, $from_room, $tenant_name);
    $v->execute();
    $v->close();
    $occupants = (int)$app['occupants'];
    $lease_start = $old['lease_start'] ?? $contract['lease_start'];
    $lease_end = $old['lease_end'] ?? $contract['lease_end'];
    $n = $conn->prepare("UPDATE rooms SET status = 'occupied', tenant_name = ?, lease_start = ?, lease_end = ?, occupants = ? WHERE id = ? AND status = 'vacant'");
    $n->bind_param("sssis", $tenant_name, $lease_start, $lease_end, $occupants, $to_room);
    $n->execute();
    if ($n->affected_rows < 1) $refuse(409, "Unit $to_room was just taken. Choose another unit.");
    $n->close();

    $u = $conn->prepare("UPDATE rent_applications SET room_name = ?, monthly_rent = ? WHERE id = ? AND status = 'active'");
    $u->bind_param("sdi", $to_room, $new_rent, $app_id);
    $u->execute();
    if ($u->affected_rows < 1 && strcasecmp($from_room, $to_room) !== 0) $refuse(409, "The tenancy changed while this was being saved. Reload and try again.");
    $u->close();

    // Bills already issued for periods not yet started: priced at the new rent.
    if ($future_bills && abs($new_rent - $old_rent) >= 0.005) {
        $why = "Rent of Unit $to_room after the move from Unit $from_room";
        $up = $conn->prepare("UPDATE invoices SET base_rent = ?, total_amount = ? WHERE id = ? AND amount_paid = 0 AND total_amount = ?");
        $hist = $conn->prepare("INSERT INTO invoice_adjustments (invoice_id, admin_id, reason, old_total, new_total, changes) VALUES (?, ?, ?, ?, ?, ?)");
        foreach ($future_bills as $b) {
            $old_total = round((float)$b['total_amount'], 2);
            $new_total = round($old_total - (float)$b['base_rent'] + $new_rent, 2);
            $up->bind_param("ddsd", $new_rent, $new_total, $b['id'], $old_total);
            $up->execute();
            if ($up->affected_rows < 1) $refuse(409, "Invoice {$b['id']} changed while this was being saved. Reload and try again.");
            $changes = json_encode(['base_rent' => ['from' => round((float)$b['base_rent'], 2), 'to' => $new_rent]]);
            $hist->bind_param("sisdds", $b['id'], $admin_id, $why, $old_total, $new_total, $changes);
            $hist->execute();
        }
        $up->close();
        $hist->close();
    }

    // The deposit follows the new rent: a top-up bill, or the excess refunded.
    $deposit_invoice_id = null;
    $refund_id = null;
    if ($deposit_held && abs($deposit_diff) >= 0.005) {
        $d = $conn->prepare("UPDATE lease_contracts SET deposit_amount = ? WHERE id = ?");
        $d->bind_param("ds", $new_deposit, $contract['id']);
        $d->execute();
        $d->close();
        if ($deposit_diff > 0) {
            $deposit_invoice_id = 'INV-' . date('Ym') . '-' . strtoupper(bin2hex(random_bytes(4)));
            $period = DEPOSIT_TOPUP_PERIOD;
            $due = date('Y-m-d', strtotime('+' . payment_window_days($conn) . ' days'));
            $ins = $conn->prepare("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, security_deposit, total_amount, billing_period, status, due_date)
                                   VALUES (?, ?, ?, 0, ?, ?, ?, 'pending', ?)");
            $ins->bind_param("siiddss", $deposit_invoice_id, $user_id, $app_id, $deposit_diff, $deposit_diff, $period, $due);
            if (!$ins->execute()) throw new Exception("Could not create the deposit top-up bill.");
            $ins->close();
        } elseif ($user_id) {
            $excess = round(-$deposit_diff, 2);
            $refund_id = insert_refund_request($conn, $user_id, $app_id, 'deposit', null, $excess,
                "Security deposit above one month's rent after moving from Unit $from_room to Unit $to_room (₱" . number_format($old_deposit, 2) . " held, ₱" . number_format($new_deposit, 2) . " needed).",
                (int)$admin_id, 'admin');
        }
    }

    // Visitor pre-registrations name the old unit: the tenant registers them again.
    if ($user_id) cancel_user_visitor_registrations($conn, $user_id, "Cancelled: the tenant moved from Unit $from_room to Unit $to_room.");

    $t = $conn->prepare("INSERT INTO room_transfers (rent_application_id, user_id, from_room, to_room, old_rent, new_rent, old_deposit, new_deposit, effective_period_start, deposit_invoice_id, refund_request_id, reason, transferred_by)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $t->bind_param("iissddddssisi", $app_id, $user_id, $from_room, $to_room, $old_rent, $new_rent, $old_deposit, $new_deposit, $effective, $deposit_invoice_id, $refund_id, $reason, $admin_id);
    if (!$t->execute()) throw new Exception("Could not record the transfer.");
    $transfer_id = (int)$conn->insert_id;
    $t->close();

    notify_unit_waitlist($conn, $from_room);
    if ($user_id) {
        create_notification($conn, $user_id, 'move_out_update', 'Unit Changed',
            "You have moved from Unit $from_room to Unit $to_room. Your rent contract, payment history and rent due day stay the same."
            . (abs($new_rent - $old_rent) >= 0.005 ? " Your monthly rent is now ₱" . number_format($new_rent, 2) . ($effective ? ", from the period starting " . date('M j, Y', strtotime($effective)) : "") . "." : "")
            . ($deposit_invoice_id ? " Your security deposit is now ₱" . number_format($new_deposit, 2) . "; the difference of ₱" . number_format($deposit_diff, 2) . " is billed as $deposit_invoice_id." : "")
            . ($refund_id ? " Your security deposit is now ₱" . number_format($new_deposit, 2) . "; a refund request of ₱" . number_format(-$deposit_diff, 2) . " was opened for the difference. Follow it under My Refunds." : ""),
            'Resolved', $deposit_invoice_id ? "invoice:$deposit_invoice_id" : null);
    }
    log_activity($conn, $admin_id, 'tenant', 'Transfer Room',
        "Application #$app_id ($tenant_name): Unit $from_room → Unit $to_room; rent ₱" . number_format($old_rent, 2) . " → ₱" . number_format($new_rent, 2)
        . ($effective ? " from $effective" : "") . "; deposit ₱" . number_format($old_deposit, 2) . " → ₱" . number_format($new_deposit, 2)
        . ($deposit_invoice_id ? " (top-up $deposit_invoice_id)" : "") . ($refund_id ? " (refund #$refund_id)" : "")
        . (count($future_bills) ? "; " . count($future_bills) . " bill(s) re-priced" : "") . "; reason: $reason");

    $conn->commit();
    // Saved. Anything below only tells people about it.
    try {
        if ($refund_id) notify_refund_raised($conn, $refund_id, -$deposit_diff, 'a security deposit above the new rent');
    } catch (Throwable $after) {
        error_log('[AMS] transfer_room: saved, follow-up failed: ' . $after->getMessage());
    }
    echo json_encode(["success" => true, "transferId" => $transfer_id, "depositInvoiceId" => $deposit_invoice_id, "refundRequestId" => $refund_id] + $summary);
} catch (Throwable $e) {
    $conn->rollback();
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e instanceof Exception ? public_error_message($e) : "Server error. Please try again."]);
    if (!$e instanceof Exception) error_log('[AMS] transfer_room: ' . $e->getMessage());
}
$conn->close();
