<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";
require_once __DIR__ . '/../contract_template.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

$input = $_POST;
if (empty($input)) $input = read_json_input(['deductions']);
$id = (int)($input['id'] ?? 0);
$status = $input['status'] ?? '';
// Why the suggested notice deduction from the deposit was lowered: text only.
$input['waive_forfeiture_reason'] = is_string($input['waive_forfeiture_reason'] ?? null) ? mb_substr(trim($input['waive_forfeiture_reason']), 0, 200) : '';
$rejection_reason = $input['rejection_reason'] ?? null;

// A multipart form can carry arrays (status[]=x); none of these fields is a list,
// and (string)/trim() on one is a warning or a TypeError (SPRINT 178).
foreach (['id', 'status', 'rejection_reason', 'clearance_notes', 'requested_move_out_date', 'damage_deduction', 'utility_deduction', 'deposit_interest', 'notice_deduction'] as $scalar_field) {
    if (isset($input[$scalar_field]) && !is_scalar($input[$scalar_field])) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Field '$scalar_field' must be a single value.", "field" => $scalar_field]);
        exit;
    }
}
$text_errors = [];
if ($rejection_reason !== null && ($e = v_str($rejection_reason, 'Reason', 0, 255, false))) $text_errors['rejection_reason'] = $e;
if (isset($input['clearance_notes']) && ($e = v_str($input['clearance_notes'], 'Clearance notes', 0, 2000, false))) $text_errors['clearance_notes'] = $e;
if ($text_errors) validation_fail($text_errors);

if (in_array($status, ['Rejected', 'Declined'], true) && trim((string)$rejection_reason) === '') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "A rejection reason is required."]);
    exit;
}

$attachment_path = null;
if (isset($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK) {
    $file = $_FILES['attachment'];
    if ($file['size'] > 10 * 1024 * 1024) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Attachment must be 10MB or less.']);
        exit;
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);
    $allowed_mimes = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'application/pdf' => 'pdf'
    ];
    if (!isset($allowed_mimes[$mime])) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Invalid file type. Only JPG, PNG, WEBP, and PDF files are allowed.']);
        exit;
    }
    $dir = __DIR__ . '/../uploads/applications/';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $filename = 'reject_' . bin2hex(random_bytes(16)) . '.' . $allowed_mimes[$mime];
    if (!move_uploaded_file($file['tmp_name'], $dir . $filename)) {
        throw new Exception('Could not save rejection attachment.');
    }
    $attachment_path = 'uploads/applications/' . $filename;
}

// Every status this endpoint actually knows how to handle below. Anything
// else used to be written to rent_applications.status verbatim with no
// validation, which could silently park a tenant in a value no filter
// anywhere in the app matches.
$allowed_statuses = ['Approved', 'Rejected', 'Declined', 'Cancelled', 'active', 'pending-move-out', 'moved-out', 'Action Required'];
if (!empty($status) && !in_array($status, $allowed_statuses, true)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Invalid status: $status"]);
    exit;
}

// Itemized move-out deductions: [{category, reason, amount}], checked before
// anything is written. damage_deduction = damage + other; utility_deduction =
// electricity + water + unpaid rent. Without `deductions` the older two-field
// payload (damage_deduction / utility_deduction) is used as before.
const DEPOSIT_DEDUCTION_CATEGORIES = ['damage', 'electricity', 'water', 'unpaid_rent', 'other'];
$deduction_lines = null;
if ($status === 'moved-out' && array_key_exists('deductions', $input)) {
    $raw_lines = $input['deductions'];
    if (is_string($raw_lines)) $raw_lines = json_decode($raw_lines, true); // multipart form posts it as JSON text
    $refuse_line = function ($message) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => $message]);
        exit;
    };
    if (!is_array($raw_lines) || ($raw_lines && array_keys($raw_lines) !== range(0, count($raw_lines) - 1))) $refuse_line("Deductions must be a list.");
    if (count($raw_lines) > 20) $refuse_line("A clearance can have at most 20 deductions.");
    $deduction_lines = [];
    foreach ($raw_lines as $n => $line) {
        $label = "Deduction " . ($n + 1);
        if (!is_array($line)) $refuse_line("$label is not valid.");
        $category = $line['category'] ?? '';
        if (!is_string($category) || !in_array($category, DEPOSIT_DEDUCTION_CATEGORIES, true)) $refuse_line("$label: choose a category from the list.");
        $reason = is_string($line['reason'] ?? null) ? trim($line['reason']) : '';
        if ($reason === '') $refuse_line("$label: a reason is required.");
        if (mb_strlen($reason) > 255) $refuse_line("$label: the reason can be up to 255 characters.");
        $amount = $line['amount'] ?? null;
        if (is_bool($amount) || !is_numeric($amount) || !is_finite((float)$amount)) $refuse_line("$label: the amount must be a number.");
        $amount = round((float)$amount, 2);
        if ($amount <= 0) $refuse_line("$label: the amount must be more than ₱0.");
        if ($amount > 1000000) $refuse_line("$label: the amount can be at most ₱1,000,000.");
        $deduction_lines[] = ['category' => $category, 'reason' => $reason, 'amount' => $amount];
    }
}
// The older two-field payload and the deposit interest / notice-day amounts: a
// number from 0 to 1,000,000 (a negative damage amount would have added money
// back to the deposit). Checked here, before anything is written.
if ($status === 'moved-out') {
    $amount_errors = [];
    foreach (['damage_deduction' => 'Damage deduction', 'utility_deduction' => 'Utility deduction', 'deposit_interest' => 'Deposit interest', 'notice_deduction' => 'Notice deduction'] as $field => $label) {
        if (isset($input[$field]) && $input[$field] !== '' && ($e = v_amount($input[$field], $label, 0, 1000000))) $amount_errors[$field] = $e;
    }
    // The day the tenant actually left (optional): a real date, not in the
    // future. Checked against the move-in day once the tenancy is read below.
    $move_out_input = $input['move_out_date'] ?? null;
    if ($move_out_input !== null && $move_out_input !== '') {
        $mo = is_string($move_out_input) ? DateTime::createFromFormat('!Y-m-d', $move_out_input) : false;
        if (!$mo || $mo->format('Y-m-d') !== $move_out_input) $amount_errors['move_out_date'] = 'Enter the move-out date as a valid date.';
        elseif ($move_out_input > date('Y-m-d')) $amount_errors['move_out_date'] = 'The move-out date cannot be in the future.';
    }
    if ($amount_errors) validation_fail($amount_errors);
}

if ($id > 0 && !empty($status)) {
    $auto_rejected_applications = [];
    // Start transaction to ensure data integrity
    $conn->begin_transaction();
    try {
        // Approvals for the same unit must take the room lock before locking
        // their application row. This gives competing approvals a consistent
        // lock order before one of them rejects the pending queue.
        $approval_prelock_room = null;
        if ($status === 'Approved') {
            $room_lookup = $conn->prepare("SELECT room_name FROM rent_applications WHERE id = ?");
            $room_lookup->bind_param("i", $id);
            $room_lookup->execute();
            $approval_prelock_room = $room_lookup->get_result()->fetch_assoc()['room_name'] ?? null;
            $room_lookup->close();
            if (!empty($approval_prelock_room)) {
                $room_prelock = $conn->prepare("SELECT id FROM rooms WHERE id = ? FOR UPDATE");
                $room_prelock->bind_param("s", $approval_prelock_room);
                $room_prelock->execute();
                $room_prelock->get_result()->fetch_assoc();
                $room_prelock->close();
            }
        }
        // APPLICATION_TRANSITIONS (H5): read the current status inside the
        // transaction and refuse a move it doesn't allow — e.g. a Pending
        // Review application can't be pushed straight to moved-out, and an
        // application that's already Rejected can't be moved again from here.
        $cur_stmt = $conn->prepare("SELECT status, user_id, room_name FROM rent_applications WHERE id = ? FOR UPDATE");
        $cur_stmt->bind_param("i", $id);
        $cur_stmt->execute();
        $cur_row = $cur_stmt->get_result()->fetch_assoc();
        $cur_stmt->close();
        if (!$cur_row) {
            throw new Exception("Application not found.");
        }
        $current_status = $cur_row['status'];
        if ($status === 'Approved' && !empty($approval_prelock_room) && (string)$cur_row['room_name'] !== (string)$approval_prelock_room) {
            throw new Exception("This application's unit changed while you were approving it. Refresh and try again.");
        }
        if (!application_transition_allowed($current_status, $status)) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "Cannot move this application from \"$current_status\" to \"$status\"."]);
            $conn->rollback();
            $conn->close();
            exit;
        }

        // An itemized clearance settles a move-out notice; nothing else.
        if ($deduction_lines !== null && $current_status !== 'pending-move-out') {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "Only a tenant with a move-out notice can be cleared."]);
            $conn->rollback();
            $conn->close();
            exit;
        }

        // A payment still under review would be charged to the deposit and then
        // cancelled by end_tenancy(); the admin settles it first.
        // The same goes for rejecting or cancelling an approved application: a proof
        // under review is not yet money the refund path can see (amount_paid is 0),
        // and release_application_holds() would cancel that bill and lose it.
        $ends_approved = $current_status === 'Approved' && in_array($status, ['Rejected', 'Declined', 'Cancelled'], true);
        if (($status === 'moved-out' || $ends_approved) && ($in_review = tenancy_payment_in_review($conn, (int)$id))) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => $in_review]);
            $conn->rollback();
            $conn->close();
            exit;
        }

        // Money paid on an approved application that management rejects or cancels goes
        // back through Refunds. A rejection is refunded in full. A cancellation opens the
        // same cancellation refund request as the tenant's own (request_application_cancellation.php),
        // by open_cancellation_refund(); with at_tenant_request the cancellation fee
        // (Settings > Rental) is kept out of it, without the flag it is a full refund.
        $refund_on_cancel = $current_status === 'Approved' && in_array($status, ['Rejected', 'Declined', 'Cancelled'], true);
        $cancelled_after_approval = $current_status === 'Approved' && $status === 'Cancelled';
        $at_tenant_request = in_array($input['at_tenant_request'] ?? false, [true, 1, '1', 'true', 'on'], true);
        if ($at_tenant_request && !$cancelled_after_approval) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "The cancellation fee only applies when an approved application is cancelled at the tenant's request."]);
            $conn->rollback();
            $conn->close();
            exit;
        }
        $cancellation_fee_kept = 0.0;
        if ($refund_on_cancel && trim((string)$rejection_reason) === '') {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "A reason is required to reject or cancel an approved application.", "errors" => ["rejection_reason" => "A reason is required."]]);
            $conn->rollback();
            $conn->close();
            exit;
        }
        $refunds_raised = [];
        $deposit_refund_raised = null;
        $advance_refund_raised = null;
        $rent_credit_refund = null; // rent for days after a mid-period move-out, when no deposit was settled
        $prorated = null;
        $balance_invoice = ['id' => null, 'amount' => 0.0];
        $settled = null;

        $requested_move_out_date = null;
        if ($status === 'pending-move-out') {
            $requested_move_out_date = $input['requested_move_out_date'] ?? null;
            if (empty($requested_move_out_date)) {
                throw new Exception("Move-out date is required.");
            }
            $today = new DateTime(date('Y-m-d'));
            if (real_date($requested_move_out_date) === null) {
                throw new Exception("Move-out date must be a valid date (YYYY-MM-DD).");
            }
            $selected_date = new DateTime($requested_move_out_date);
            $days_diff = (int)$today->diff($selected_date)->format('%r%a');

            // The notice window is the admin setting (Settings → Rental), the same
            // one the tenant's own move-out request uses.
            $notice = move_out_notice_days($conn);
            if ($days_diff < $notice['min']) {
                throw new Exception("Prior notice of at least {$notice['min']} days is required before actual move-out.");
            }
            if ($days_diff > $notice['max']) {
                throw new Exception("Move-out notice cannot exceed {$notice['max']} days in advance.");
            }
        }

        $moved = transition_application($conn, $id, $status, [
            'reason' => $rejection_reason, 'attachment' => $attachment_path, 'move_out_date' => $requested_move_out_date,
        ]);
        if (!$moved['ok']) {
            throw new Exception("This application was changed by someone else. Refresh and try again.");
        }

        if ($status === 'Rejected' || $status === 'Declined' || $status === 'Cancelled' || $status === 'Action Required') {
            // Admin changed mind or cancelled: undo move-in invoices, contract,
            // advance credits, reminders and free the room. An Approved
            // application held the room, so it is vacated outright; before that
            // the unit may belong to someone else and is only released if unclaimed.
            // The refunds below are opened first: release_application_holds()
            // cancels the open invoices, and a part-paid one that is already
            // cancelled no longer reaches open_cancellation_refund() (no fee).
            // Money paid on an approved application rejected by management goes
            // back through one admin-origin refund request per paid invoice.
            if ($refund_on_cancel && !empty($cur_row['user_id'])) {
                $refund_reason = trim((string)$rejection_reason);
                if ($cancelled_after_approval) {
                    // The move-in payment gets the cancellation refund request (with the fee
                    // only when asked); anything else paid on the application is refunded in full.
                    $cr = open_cancellation_refund($conn, $id, (int)$cur_row['user_id'], (int)$admin_id, 'admin', $refund_reason, null, $at_tenant_request);
                    $skip_invoices = [];
                    if ($cr['state'] === 'opened') {
                        $refunds_raised[] = ['id' => $cr['id'], 'amount' => $cr['refund']];
                        $cancellation_fee_kept = $cr['fee'];
                    } elseif ($cr['state'] === 'fee_takes_all') {
                        $cancellation_fee_kept = $cr['fee'];
                        $skip_invoices[] = $cr['invoice'];
                    }
                    foreach (raise_rejection_refunds($conn, $cur_row['user_id'], $id, $refund_reason, $admin_id, ADMIN_CANCELLATION_REASON_PREFIX . ': ', $skip_invoices) as $rf) {
                        $refunds_raised[] = $rf;
                    }
                } else {
                    $refunds_raised = raise_rejection_refunds($conn, $cur_row['user_id'], $id, $refund_reason, $admin_id);
                }
            }

            release_application_holds($conn, $id, $cur_row['user_id'] ?? null, "Application $status before move-in", [
                'room_name' => $cur_row['room_name'], 'vacate_held_room' => $current_status === 'Approved',
            ]);
        }

        if ($status === 'Approved') {
            // Get application details to update the room and generate invoice
            $missing_docs_sql = application_missing_required_docs_sql('ra');
            $app_stmt = $conn->prepare("SELECT ra.first_name, ra.last_name, ra.suffix, ra.room_name, ra.months_of_rent, ra.user_id, ra.monthly_rent, ra.occupants, ra.terms_agreed_at, $missing_docs_sql AS missing_documents FROM rent_applications ra WHERE ra.id = ?");
            $app_stmt->bind_param("i", $id);
            $app_stmt->execute();
            $app_res = $app_stmt->get_result();
            if ($app_res->num_rows > 0) {
                $app = $app_res->fetch_assoc();

                // Acceptance-criteria enforcement (checklist 1.7): an application
                // cannot be approved without a file for every active, required
                // application requirement (Settings → Application Requirements)
                // and a recorded Terms & Conditions agreement from the applicant.
                if ((int)$app['missing_documents'] === 1) {
                    throw new Exception("Cannot approve: this application is missing a required document.");
                }
                if (empty($app['terms_agreed_at'])) {
                    throw new Exception("Cannot approve: the applicant has not agreed to the Terms & Conditions.");
                }

                $tenant_name = person_name($app);
                $room_name = $app['room_name'];
                $months = (int)$app['months_of_rent'];
                $user_id = $app['user_id'];
                $monthly_rent = (double)$app['monthly_rent'];
                $occupants = (int)$app['occupants'];
                
                // Enforce the per-person charge above the included occupants (Settings -> Rental, occupant_surcharge()).
                // The base rate is read live from rooms.monthly_rent (the admin-configurable
                // rate set via update_room.php) rather than a hardcoded per-letter table, so
                // this floor always tracks whatever the admin has actually priced the unit at.
                $room_id_clean = trim(str_replace('Room', '', $room_name));
                $room_rate_stmt = $conn->prepare("SELECT monthly_rent FROM rooms WHERE id = ?");
                $room_rate_stmt->bind_param("s", $room_id_clean);
                $room_rate_stmt->execute();
                $room_rate_row = $room_rate_stmt->get_result()->fetch_assoc();
                $room_rate_stmt->close();
                $base_room_rent = $room_rate_row ? (float)$room_rate_row['monthly_rent'] : 4000.00;
                $expected_rent = $base_room_rent + occupant_surcharge($conn, $occupants);
                if ($monthly_rent < $expected_rent) {
                    $monthly_rent = $expected_rent;
                }
                
                $lease_start = date('Y-m-d');
                $lease_end = date('Y-m-d', strtotime("+$months months"));
                // Approval holds the unit but does not make the applicant a
                // tenant. Occupancy begins only after the move-in is confirmed.
                $room_status = 'reserved';
                
                // Guard against a race between two pending applications for the same
                // room: only claim it if it's still vacant/reserved. If a concurrent
                // approval already took it, affected_rows is 0 and this approval fails
                // instead of silently overwriting the other tenant's occupancy.
                // 'reserved' is also what another approved applicant or a hold for
                // someone else leaves behind, so the status alone cannot tell
                // whether this approval may take the unit. Lock the room row,
                // then refuse when another application already holds it or an
                // Active hold names a different person.
                $lock_stmt = $conn->prepare("SELECT status FROM rooms WHERE id = ? FOR UPDATE");
                $lock_stmt->bind_param("s", $room_name);
                $lock_stmt->execute();
                $room_now = $lock_stmt->get_result()->fetch_assoc();
                $lock_stmt->close();
                // An occupied unit gets its own message ("still has a tenant") below.
                $other_stmt =$conn->prepare("SELECT id FROM rent_applications WHERE room_name = ? AND id <> ? AND status IN ('Approved', 'active', 'pending-move-out') LIMIT 1");
                $other_stmt->bind_param("si", $room_name, $id);
                $other_stmt->execute();
                $other_app = $other_stmt->get_result()->fetch_assoc();
                $other_stmt->close();
                if ($other_app && ($room_now['status'] ?? '') !== 'occupied') {
                    throw new Exception("Room $room_name is already held by another approved application (#{$other_app['id']}). Cancel or reject that one first.");
                }
                $hold_stmt = $conn->prepare("SELECT id FROM unit_reservations WHERE room_name = ? AND status = 'Active' AND NOT (user_id <=> ? OR LOWER(TRIM(reserved_for_name)) = LOWER(TRIM(?))) LIMIT 1");
                $hold_stmt->bind_param("sis", $room_name, $user_id, $tenant_name);
                $hold_stmt->execute();
                $foreign_hold = $hold_stmt->get_result()->fetch_assoc();
                $hold_stmt->close();
                if ($foreign_hold) {
                    throw new Exception("Room $room_name is on hold for someone else (reservation #{$foreign_hold['id']}). Cancel the hold first.");
                }

                $room_stmt = $conn->prepare("UPDATE rooms SET status = ?, tenant_name = ?, lease_start = ?, lease_end = ?, occupants = ? WHERE id = ? AND status IN ('vacant', 'reserved')");
                $room_stmt->bind_param("ssssis", $room_status, $tenant_name, $lease_start, $lease_end, $app['occupants'], $room_name);
                $room_stmt->execute();
                $room_claimed = $room_stmt->affected_rows > 0;
                $room_stmt->close();

                if (!$room_claimed) {
                    // An application for an upcoming unit (Preview's "Coming Soon")
                    // waits until the current tenant has moved out.
                    $state_stmt = $conn->prepare("SELECT status FROM rooms WHERE id = ?");
                    $state_stmt->bind_param("s", $room_name);
                    $state_stmt->execute();
                    $state = $state_stmt->get_result()->fetch_assoc()['status'] ?? '';
                    $state_stmt->close();
                    if ($state === 'occupied') {
                        throw new Exception("Room $room_name still has a tenant. Approve this application after they move out and the room is vacant.");
                    }
                    throw new Exception("Room $room_name is no longer available — it may have just been assigned to another tenant.");
                }

                // Close out any active hold on this unit — the applicant has
                // moved in, so the reservation has served its purpose.
                // Only this applicant's own hold (the check above left no other).
                $res_stmt = $conn->prepare("UPDATE unit_reservations SET status = 'Converted', released_at = NOW(), released_reason = 'Application approved' WHERE room_name = ? AND status = 'Active' AND (user_id <=> ? OR LOWER(TRIM(reserved_for_name)) = LOWER(TRIM(?)))");
                if ($res_stmt) {
                    $res_stmt->bind_param("sis", $room_name, $user_id, $tenant_name);
                    $res_stmt->execute();
                    $res_stmt->close();
                }

                // Move-in invoice (advance + deposit) and draft contract.
                issue_move_in_billing($conn, $id, $user_id, $monthly_rent, $lease_start, $lease_end);
            }
            $app_stmt->close();
        }

        if ($status === 'active' && $current_status === 'pending-move-out') {
            // Cancelling a move-out notice: the tenancy simply carries on. The
            // lease dates, contract and invoices are left as they were.
            resolve_admin_queue($conn, 'move_out_request', $id);
        } elseif ($status === 'active') {
            $move_in_q = $conn->prepare("SELECT first_name, last_name, suffix, user_id, room_name, months_of_rent, occupants, move_in_date FROM rent_applications WHERE id = ? AND status = 'active'");
            $move_in_q->bind_param("i", $id);
            $move_in_q->execute();
            $move_in_app = $move_in_q->get_result()->fetch_assoc();
            $move_in_q->close();
            if (!$move_in_app || empty($move_in_app['move_in_date'])) {
                throw new Exception("Set and notify a move-in date before confirming move-in.");
            }
            if (!move_in_paid($conn, $id)) throw new Exception("Initial payment must be confirmed before move-in.");

            $lease_start = $move_in_app['move_in_date'];
            $lease_end = date('Y-m-d', strtotime("+" . (int)$move_in_app['months_of_rent'] . " months", strtotime($lease_start)));
            $tenant_name = person_name($move_in_app);
            $room_stmt = $conn->prepare("UPDATE rooms SET status = 'occupied', tenant_name = ?, lease_start = ?, lease_end = ?, occupants = ? WHERE id = ? AND (status IN ('reserved', 'vacant') OR tenant_name = ?)");
            $room_stmt->bind_param("sssiss", $tenant_name, $lease_start, $lease_end, $move_in_app['occupants'], $move_in_app['room_name'], $tenant_name);
            $room_stmt->execute();
            if ($room_stmt->affected_rows === 0) {
                $room_stmt->close();
                throw new Exception("Unit {$move_in_app['room_name']} is no longer available for move-in.");
            }
            $room_stmt->close();
            $contract_stmt = $conn->prepare("UPDATE lease_contracts SET status = 'active', lease_start = ?, lease_end = ? WHERE rent_application_id = ? AND status = 'draft'");
            $contract_stmt->bind_param("ssi", $lease_start, $lease_end, $id);
            $contract_stmt->execute();
            $contract_stmt->close();
            // The advance payment belongs to the tenancy month that actually
            // begins on the confirmed move-in date, not to its payment date.
            $period_label = billing_period_label(new DateTime($lease_start));
            $invoice_stmt = $conn->prepare("UPDATE IGNORE invoices SET rent_period_start = ?, billing_period = ? WHERE rent_application_id = ? AND security_deposit > 0 AND status = 'paid'");
            $invoice_stmt->bind_param("ssi", $lease_start, $period_label, $id);
            $invoice_stmt->execute();
            $invoice_stmt->close();

            // Physical occupancy is the point that permanently resolves the
            // competing queue. Approval alone only reserves the unit and must
            // leave other applicants pending until move-in is confirmed.
            if ($current_status === 'Approved' && !empty($move_in_app['user_id']) && !empty($move_in_app['room_name'])) {
                $winner_user_id = (int)$move_in_app['user_id'];
                $room_name = (string)$move_in_app['room_name'];
                $competitors = $conn->prepare("SELECT id, user_id, first_name, last_name, suffix, room_name FROM rent_applications WHERE room_name = ? AND id <> ? AND user_id <> ? AND status IN ('Pending Review', 'Pending Deposit', 'Action Required') ORDER BY id FOR UPDATE");
                $competitors->bind_param("sii", $room_name, $id, $winner_user_id);
                $competitors->execute();
                $competing_apps = $competitors->get_result()->fetch_all(MYSQLI_ASSOC);
                $competitors->close();
                $message_template = trim((string)get_setting($conn, 'application_unit_rejection_message', 'Thank you for your interest in Unit {{unit}}. The unit has been assigned to another applicant, so we are unable to proceed with your application. We appreciate your understanding.'));
                if ($message_template === '') $message_template = 'Thank you for your interest in Unit {{unit}}. The unit has been assigned to another applicant.';
                foreach ($competing_apps as $competing_app) {
                    $competing_id = (int)$competing_app['id'];
                    $competing_user_id = (int)$competing_app['user_id'];
                    if ($payment_in_review = tenancy_payment_in_review($conn, $competing_id)) {
                        throw new Exception("Cannot confirm Unit $room_name move-in yet: competing application #$competing_id $payment_in_review");
                    }
                    $competing_name = trim(person_name($competing_app));
                    $auto_message = strtr($message_template, ['{{unit}}' => $room_name, '{{name}}' => $competing_name]);
                    $auto_reason = 'Unit assigned to another applicant.';
                    $rejected = transition_application($conn, $competing_id, 'Rejected', ['reason' => $auto_reason]);
                    if (!$rejected['ok']) continue;
                    foreach (raise_rejection_refunds($conn, $competing_user_id, $competing_id, $auto_reason, $admin_id) as $refund) {
                        $refunds_raised[] = $refund;
                    }
                    release_application_holds($conn, $competing_id, $competing_user_id, 'Unit assigned to another applicant', ['room_name' => $room_name]);
                    create_notification($conn, $competing_user_id, 'application_update', 'Application Rejected', $auto_message);
                    log_activity($conn, $admin_id, 'tenant', 'Automatically Rejected Competing Application', "Application ID: $competing_id, Unit: $room_name, moved-in application: $id");
                    $auto_rejected_applications[] = [
                        'id' => $competing_id,
                        'user_id' => $competing_user_id,
                        'room_name' => $room_name,
                        'message' => $auto_message,
                    ];
                }
            }
        }

        if ($status === 'moved-out') {
            $clearance_notes = $input['clearance_notes'] ?? '';
            if ($deduction_lines !== null) {
                $damage_deduction = 0.0;
                $utility_deduction = 0.0;
                foreach ($deduction_lines as $line) {
                    if (in_array($line['category'], ['damage', 'other'], true)) $damage_deduction += $line['amount'];
                    else $utility_deduction += $line['amount'];
                }
                $damage_deduction = round($damage_deduction, 2);
                $utility_deduction = round($utility_deduction, 2);
                $has_damage_line = (bool)array_filter($deduction_lines, fn($l) => $l['category'] === 'damage');
            } else {
                $damage_deduction = isset($input['damage_deduction']) ? (float)$input['damage_deduction'] : 0.0;
                $utility_deduction = isset($input['utility_deduction']) ? (float)$input['utility_deduction'] : 0.0;
                $has_damage_line = $damage_deduction > 0;
            }
            $room_condition = $has_damage_line ? 'Needs Repair' : 'Good';

            // The deposit is settled by settle_deposit() (config.php), the same
            // routine as a contract termination: unpaid invoices, itemized
            // deductions and (with no move-out notice) rent for the notice days
            // come off it, and what is left, with any bank interest, is returned
            // through a 'deposit' refund request (RA 9653 Sec. 7).
            // The contract is 'active', 'expired' (lease end passed before the
            // clearance) or 'eviction-pending'; a draft or terminated contract, or
            // one already settled, is not settled twice. Read before end_tenancy()
            // touches any invoice.
            $deposit_pre = $conn->prepare("SELECT ra.requested_move_out_date, ra.user_id,
                    (SELECT lc.lease_start FROM lease_contracts lc WHERE lc.rent_application_id = ra.id ORDER BY lc.id DESC LIMIT 1) AS lease_start
                FROM rent_applications ra WHERE ra.id = ?");
            $deposit_pre->bind_param("i", $id);
            $deposit_pre->execute();
            $deposit_app = $deposit_pre->get_result()->fetch_assoc() ?: [];
            $deposit_pre->close();

            // The day the tenant left: as entered, else the date on their notice
            // (when it has passed), else today. Kept on the application, and used
            // to prorate the last rent period when Settings asks for it.
            $today = date('Y-m-d');
            $requested_out = $deposit_app['requested_move_out_date'] ?? null;
            $move_out_date = ($move_out_input ?? '') !== '' ? $move_out_input
                : ($requested_out && $requested_out <= $today ? $requested_out : $today);
            if (!empty($deposit_app['lease_start']) && $move_out_date < $deposit_app['lease_start']) {
                http_response_code(422);
                echo json_encode(["success" => false, "message" => "The move-out date cannot be before the move-in day (" . date('M j, Y', strtotime($deposit_app['lease_start'])) . ").",
                    "errors" => ["move_out_date" => "On or after " . $deposit_app['lease_start'] . "."]]);
                $conn->rollback();
                $conn->close();
                exit;
            }
            $mo_stmt = $conn->prepare("UPDATE rent_applications SET moved_out_date = ? WHERE id = ?");
            $mo_stmt->bind_param("si", $move_out_date, $id);
            $mo_stmt->execute();
            $mo_stmt->close();
            $prorated = prorate_final_rent_period($conn, $id, $move_out_date, $admin_id);

            $settled = settle_deposit($conn, $id, null, [
                'rent_credit' => $prorated['credit'] ?? 0,
                'damage' => $damage_deduction, 'utility' => $utility_deduction, 'deductions' => $deduction_lines, 'kind' => 'move_out',
                'prior_status' => $current_status,
                'notice_deduction' => $input['notice_deduction'] ?? null, 'interest' => $input['deposit_interest'] ?? 0,
                'set_expired' => true, 'waive_reason' => $input['waive_forfeiture_reason'] ?? '',
                'admin_id' => $admin_id, 'user_id' => $deposit_app['user_id'] ?? 0,
            ]);
            $settled_contract_id = $settled ? $settled['contract_id'] : null;
            if ($settled) {
                $balance = $settled['balance'];
                $balance_invoice = ['id' => $settled['balance_invoice_id'], 'amount' => $settled['balance_invoice_amount']];
            } else {
                // No deposit to settle (never paid, or settled before): everything owed stays
                // owed, and the deductions are billed on a move-out balance invoice.
                $open_q = $conn->prepare("SELECT COALESCE(SUM(" . invoice_balance_sql('i') . "), 0) AS open_total FROM invoices i WHERE i.rent_application_id = ? AND " . invoice_owed_where_sql('i'));
                $open_q->bind_param("i", $id);
                $open_q->execute();
                $balance = round((float)$open_q->get_result()->fetch_assoc()['open_total'] + $damage_deduction + $utility_deduction, 2);
                $open_q->close();
                $unsettled = apply_deposit_to_invoices($conn, $id, 0, move_out_deductions_by_category($deduction_lines, $damage_deduction, $utility_deduction), $admin_id);
                $balance_invoice = ['id' => $unsettled['balance_invoice_id'], 'amount' => $unsettled['balance_invoice_amount']];
            }
            if ($settled && $settled['refund_id']) $deposit_refund_raised = ['id' => $settled['refund_id'], 'amount' => $settled['refund_amount']];
            // No deposit was settled here, so the rent paid for days after the
            // move-out is returned on its own request.
            if (!$settled && ($prorated['credit'] ?? 0) > 0 && !empty($deposit_app['user_id'])) {
                $credit_refund_id = insert_refund_request($conn, (int)$deposit_app['user_id'], $id, 'overpayment', null, $prorated['credit'],
                    "Rent paid for days after the move-out on " . date('M j, Y', strtotime($move_out_date)) . " (prorated final rent period).", (int)$admin_id, 'admin');
                $rent_credit_refund = ['id' => $credit_refund_id, 'amount' => $prorated['credit']];
            }

            // One row per deduction, in this same transaction (a failure rolls the clearance back).
            $deduction_summary = [];
            if ($deduction_lines) {
                $dd_stmt = $conn->prepare("INSERT INTO deposit_deductions (rent_application_id, contract_id, category, reason, amount, recorded_by) VALUES (?, ?, ?, ?, ?, ?)");
                foreach ($deduction_lines as $line) {
                    $line_amount = money_str($line['amount']);
                    $dd_stmt->bind_param("issssi", $id, $settled_contract_id, $line['category'], $line['reason'], $line_amount, $admin_id);
                    if (!$dd_stmt->execute()) throw new Exception("Could not save the deposit deductions.");
                    $deduction_summary[] = deposit_deduction_label($line['category']) . " – " . $line['reason'] . ": ₱" . number_format($line['amount'], 2);
                }
                $dd_stmt->close();
            }

            if (!empty($clearance_notes)) {
                $notes_stmt = $conn->prepare("UPDATE rent_applications SET archive_notes = ? WHERE id = ?");
                $notes_stmt->bind_param("si", $clearance_notes, $id);
                $notes_stmt->execute();
                $notes_stmt->close();
            }

            // The deposit already paid the invoices it covers (settle_deposit() →
            // apply_deposit_to_invoices()); whatever is still open is owed, so
            // end_tenancy() cancels only an unpaid advance-rent invoice.
            $vacated = end_tenancy($conn, $id, 'Moved Out', $room_condition, ['keep_owed' => true, 'actor_id' => $admin_id]);
            if ($vacated === null) {
                // end_tenancy() leaves the unit alone when it is not in this tenant's
                // name. A unit already vacant (cleared by hand) is fine, but one held
                // under another name would be left occupied while the tenant is marked
                // moved out and the deposit settled: roll the whole clearance back.
                $held_stmt = $conn->prepare("SELECT status, tenant_name FROM rooms WHERE id = ?");
                $held_stmt->bind_param("s", $cur_row['room_name']);
                $held_stmt->execute();
                $held = $held_stmt->get_result()->fetch_assoc();
                $held_stmt->close();
                if ($held && !empty($held['tenant_name']) && in_array($held['status'], ['occupied', 'reserved'], true)) {
                    throw new Exception("Cannot clear this tenant: the unit is recorded under another name. Check the unit in Units, then try again.");
                }
            }
            if ($vacated && $vacated['advance_refund_id']) {
                $advance_refund_raised = ['id' => $vacated['advance_refund_id'], 'amount' => $vacated['advance_refund_amount']];
            }

            if ($vacated && $vacated['user_id']) {
                create_notification($conn, $vacated['user_id'], 'move_out_update', 'Move-Out Completed',
                    "Your move-out has been completed and your clearance recorded. Thank you for staying with us."
                    . ($prorated ? " Your last rent period was charged only for the days up to your move-out on " . date('M j, Y', strtotime($move_out_date)) . "." : "")
                    . ($rent_credit_refund ? " A refund request of ₱" . number_format($rent_credit_refund['amount'], 2) . " was opened for rent you paid for days after your move-out. Follow it under My Refunds." : "")
                    . ($deduction_summary ? " Deductions from your deposit: " . implode("; ", $deduction_summary) . "." : "")
                    . ($settled && $settled['notice_deduction'] > 0 ? " ₱" . number_format($settled['notice_deduction'], 2) . " was deducted as rent for {$settled['notice_days']} day(s) of move-out notice not given." : "")
                    . ($settled && $settled['refund_amount'] > 0 ? " ₱" . number_format($settled['refund_amount'], 2) . " of your deposit" . ($settled['interest'] > 0 ? " (with ₱" . number_format($settled['interest'], 2) . " interest)" : "") . " will be returned within " . deposit_refund_days($conn) . " days. Follow it under My Refunds." : "")
                    . ($settled && $settled['paid_invoices'] ? " Your deposit paid " . count($settled['paid_invoices']) . " unpaid bill(s); see Payment History." : "")
                    . ($advance_refund_raised ? " A refund request of ₱" . number_format($advance_refund_raised['amount'], 2) . " was opened for the advance rent you did not use. Follow it under My Refunds." : "")
                    . ($balance > 0 ? " An outstanding balance of ₱" . number_format($balance, 2) . " remains after your deposit." : "")
                    . ($balance_invoice['id'] ? " ₱" . number_format($balance_invoice['amount'], 2) . " of it is billed as {$balance_invoice['id']} (" . MOVE_OUT_BALANCE_PERIOD . "). Please settle it at the management office." : ""),
                    'Resolved', $balance_invoice['id'] ? "invoice:{$balance_invoice['id']}" : null);
            }

            log_activity($conn, $admin_id, 'tenant', "Completed Move Out & Clearance",
                "Application ID: $id, $clearance_notes" . ($deduction_summary ? "; deductions: " . implode("; ", $deduction_summary) : "") . ($vacated && $vacated['parking_released'] ? "; parking released" : "")
                . ($settled ? "; deposit " . $settled['status'] . ($settled['refund_amount'] > 0 ? " (refund ₱" . number_format($settled['refund_amount'], 2) . ")" : "")
                    . ($settled['notice_deduction'] > 0 ? " (notice deduction ₱" . number_format($settled['notice_deduction'], 2) . ")" : "")
                    . ($settled['interest'] > 0 ? " (interest ₱" . number_format($settled['interest'], 2) . ")" : "") : "")
                . (trim((string)($input['waive_forfeiture_reason'] ?? '')) !== '' ? "; notice deduction lowered: " . trim((string)$input['waive_forfeiture_reason']) : "")
                . ($settled && $settled['deposit_applied'] > 0 ? "; ₱" . number_format($settled['deposit_applied'], 2) . " of the deposit paid " . count($settled['paid_invoices']) . " invoice(s) in full" : "")
                . ($balance > 0 ? "; balance due after deposit: ₱" . number_format($balance, 2) : "; deposit covered the balance in full")
                . ($balance_invoice['id'] ? "; move-out balance invoice {$balance_invoice['id']} ₱" . number_format($balance_invoice['amount'], 2) : ""));
        } else {
            log_activity($conn, $admin_id, 'tenant', "Updated Tenant Status", "Application ID: $id, New Status: $status");
        }

        if (in_array($status, ['Approved', 'Rejected', 'Declined', 'Cancelled', 'Action Required', 'active'])) {
            $u_stmt = $conn->prepare("SELECT user_id, room_name FROM rent_applications WHERE id = ?");
            $u_stmt->bind_param("i", $id);
            $u_stmt->execute();
            $u_res = $u_stmt->get_result()->fetch_assoc();
            $u_stmt->close();
            
            if ($u_res) {
                $tenant_id = $u_res['user_id'];
                $room = $u_res['room_name'];
                
                $notif_title = $status === 'active' ? 'Move-In Confirmed' : "Application " . ($status === 'Declined' ? 'Rejected' : $status);
                if ($status === 'active' && $current_status === 'pending-move-out') {
                    $notif_title = 'Move-Out Cancelled';
                    $notif_msg = "Your move-out notice for Unit $room has been cancelled. Your rent continues as before.";
                } elseif ($status === 'active') {
                    $notif_msg = "Your move-in to Unit $room has been confirmed.";
                } elseif ($status === 'Action Required') {
                    $notif_msg = "Your rent application for Unit $room needs more information from you.";
                } elseif ($status === 'Approved') {
                    $notif_msg = "Your rent application for Unit $room has been approved. Your rent contract is ready: open Track Application, read and sign it, upload the signed copy, then pay the move-in invoice.";
                } else {
                    $notif_msg = "Your rent application for Unit $room has been " . strtolower($status === 'Declined' ? 'Rejected' : $status) . ".";
                }
                if (!empty($rejection_reason)) {
                    $notif_msg .= " Reason: $rejection_reason";
                }
                if (!empty($refunds_raised)) {
                    $refund_total = array_sum(array_column($refunds_raised, 'amount'));
                    $notif_msg .= " A refund request of ₱" . number_format($refund_total, 2) . " was opened for the payments you made. You can follow it under My Refunds.";
                }
                
                if ($cancellation_fee_kept > 0) {
                    $notif_msg .= " A cancellation fee of ₱" . number_format($cancellation_fee_kept, 2) . " was kept.";
                }

                $notif_id = create_notification($conn, $tenant_id, 'application_update', $notif_title, $notif_msg);
                if ($notif_id && $attachment_path) {
                    $upd_notif = $conn->prepare("UPDATE notifications SET attachment_path = ? WHERE id = ?");
                    if ($upd_notif) {
                        $upd_notif->bind_param("si", $attachment_path, $notif_id);
                        $upd_notif->execute();
                        $upd_notif->close();
                    }
                }
            }
            resolve_admin_queue($conn, 'rent_application', $id);
        }

        $conn->commit();
        // Everything from here is notice and log work on a change that is saved.
        // A failure in it is logged, never reported as the clearance failing.
        try {
        $outcome = $status === 'Cancelled' ? 'cancelled' : 'rejected';
        foreach ($refunds_raised as $rf) {
            notify_refund_raised($conn, $rf['id'], $rf['amount'], "a payment on a $outcome application");
            log_activity($conn, $admin_id, 'billing', 'Refund Requested', "Refund #{$rf['id']}: ₱" . number_format($rf['amount'], 2) . " ($outcome application #$id)" . ($cancellation_fee_kept > 0 ? " after a cancellation fee of ₱" . number_format($cancellation_fee_kept, 2) : ''));
        }
        if (empty($refunds_raised) && $cancellation_fee_kept > 0) {
            log_activity($conn, $admin_id, 'billing', 'Cancellation Fee Kept', "Application #$id: ₱" . number_format($cancellation_fee_kept, 2) . " (nothing left to refund)");
        }
        if ($deposit_refund_raised) {
            notify_refund_raised($conn, $deposit_refund_raised['id'], $deposit_refund_raised['amount'], 'a returned security deposit');
            log_activity($conn, $admin_id, 'billing', 'Refund Requested', "Refund #{$deposit_refund_raised['id']}: ₱" . number_format($deposit_refund_raised['amount'], 2) . " (security deposit, application #$id)");
        }
        if ($rent_credit_refund) {
            notify_refund_raised($conn, $rent_credit_refund['id'], $rent_credit_refund['amount'], 'rent paid for days after the move-out');
            log_activity($conn, $admin_id, 'billing', 'Refund Requested', "Refund #{$rent_credit_refund['id']}: ₱" . number_format($rent_credit_refund['amount'], 2) . " (prorated final rent period, application #$id)");
        }
        if ($advance_refund_raised) {
            notify_refund_raised($conn, $advance_refund_raised['id'], $advance_refund_raised['amount'], 'advance rent not used at move-out');
            log_activity($conn, $admin_id, 'billing', 'Refund Requested', "Refund #{$advance_refund_raised['id']}: ₱" . number_format($advance_refund_raised['amount'], 2) . " (advance rent, application #$id)");
        }
        // Queue the approval email only after the transaction commits. Notification
        // failures must never roll back a completed application approval.
        if (in_array($status, ['Approved', 'Rejected', 'Declined', 'Cancelled'], true) && !empty($tenant_id)) {
            try {
                require_once __DIR__ . '/services/send_notification.php';
                $tenant_name = notify_recipient_name($conn, $tenant_id);
                $email_html = $status === 'Approved'
                    ? email_application_decision_template($tenant_name, $room ?? '', 'Approved')
                    : email_application_decision_template($tenant_name, $room ?? '', $status === 'Declined' ? 'Rejected' : $status, (string)$rejection_reason);
                dispatch_admin_action_notification(
                    $conn,
                    $tenant_id,
                    'application_update',
                    'Rental Application ' . ($status === 'Declined' ? 'Rejected' : $status),
                    null,
                    $email_html
                );
            } catch (Throwable $notification_error) {
                error_log('Could not dispatch application decision email: ' . $notification_error->getMessage());
            }
        }
        foreach ($auto_rejected_applications as $auto_rejected) {
            try {
                require_once __DIR__ . '/services/send_notification.php';
                $auto_tenant_name = notify_recipient_name($conn, $auto_rejected['user_id']);
                $auto_email = email_application_decision_template($auto_tenant_name, $auto_rejected['room_name'], 'Rejected', $auto_rejected['message']);
                dispatch_admin_action_notification($conn, $auto_rejected['user_id'], 'application_update', 'Rental Application Rejected', null, $auto_email);
            } catch (Throwable $notification_error) {
                error_log('Could not dispatch competing application rejection email: ' . $notification_error->getMessage());
            }
        }
        } catch (Throwable $after_commit) {
            error_log('[AMS] update_tenant_status: saved, follow-up failed: ' . $after_commit->getMessage());
        }
        $response = ["success" => true];
        if ($auto_rejected_applications) $response['auto_rejected_applications'] = count($auto_rejected_applications);
        if (!empty($refunds_raised)) $response["refunds_raised"] = count($refunds_raised);
        if ($cancellation_fee_kept > 0) $response["cancellation_fee_kept"] = round($cancellation_fee_kept, 2);
        if ($status === 'moved-out') {
            $response["balance_due"] = $balance > 0 ? round($balance, 2) : 0;
            if ($balance_invoice['id']) $response["balance_invoice"] = $balance_invoice;
            if ($settled) $response["invoices_paid_from_deposit"] = count($settled['paid_invoices']);
            if ($advance_refund_raised) $response["advance_refund"] = $advance_refund_raised;
            $response["move_out_date"] = $move_out_date;
            if ($prorated) $response["prorated"] = ['lines' => $prorated['lines'], 'credit' => $prorated['credit']];
            if ($rent_credit_refund) $response["rent_credit_refund"] = $rent_credit_refund;
            if ($settled) {
                $response["deposit"] = ['status' => $settled['status'], 'refund_amount' => $settled['refund_amount'],
                    'notice_deduction' => $settled['notice_deduction'], 'notice_days' => $settled['notice_days'], 'interest' => $settled['interest']];
            }
        }
        echo json_encode($response);

    } catch (Throwable $e) {
        // An Error (TypeError and the like) used to skip this block and leave the
        // transaction open with no JSON. Rolled back here; the message stays
        // generic for anything that is not a plain Exception.
        $conn->rollback();
        if (!$e instanceof Exception) error_log('[AMS] update_tenant_status: ' . $e->getMessage());
        echo json_encode(["success" => false, "message" => $e instanceof Exception ? public_error_message($e) : "Server error. Please try again."]);
    }
}
$conn->close();
?>
