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
if (empty($input)) $input = json_decode(file_get_contents("php://input"), true) ?: [];
$id = (int)($input['id'] ?? 0);
$status = $input['status'] ?? '';
$rejection_reason = $input['rejection_reason'] ?? null;

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

if ($id > 0 && !empty($status)) {
    // Start transaction to ensure data integrity
    $conn->begin_transaction();
    try {
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

        // Cancelling an approved application can mean money goes back: a reason is required.
        $refund_on_cancel = $current_status === 'Approved' && in_array($status, ['Rejected', 'Declined', 'Cancelled'], true);
        if ($refund_on_cancel && trim((string)$rejection_reason) === '') {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "A reason is required to reject or cancel an approved application.", "errors" => ["rejection_reason" => "A reason is required."]]);
            $conn->rollback();
            $conn->close();
            exit;
        }
        $refunds_raised = [];

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
            release_application_holds($conn, $id, $cur_row['user_id'] ?? null, "Application $status before move-in", [
                'room_name' => $cur_row['room_name'], 'vacate_held_room' => $current_status === 'Approved',
            ]);

            // Money already paid on an approved application goes back through
            // a refund request per paid invoice (the admin decides at /admin-refunds).
            if ($refund_on_cancel && !empty($cur_row['user_id'])) {
                $refunds_raised = raise_rejection_refunds($conn, $cur_row['user_id'], $id, trim((string)$rejection_reason), $admin_id);
            }
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
                $res_stmt = $conn->prepare("UPDATE unit_reservations SET status = 'Converted', released_at = NOW(), released_reason = 'Application approved' WHERE room_name = ? AND status = 'Active'");
                if ($res_stmt) {
                    $res_stmt->bind_param("s", $room_name);
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
            $move_in_q = $conn->prepare("SELECT first_name, last_name, suffix, room_name, months_of_rent, occupants, move_in_date FROM rent_applications WHERE id = ? AND status = 'active'");
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

            // M4: what's left owed after the deposit — every still-open invoice
            // (whatever its status) plus the damage/utility deductions, less the
            // deposit itself. Read before end_tenancy() touches any invoice.
            // The tenancy's contract is 'active', or 'expired' when the lease end
            // passed before the admin cleared the move-out (expire_lapsed_contracts()),
            // or 'eviction-pending'. Matching only 'active' used to skip an expired
            // contract: its deposit stayed "Held", the deductions never reached the
            // contract (so not the Security Deposit Ledger) and the deposit was
            // left out of the balance below. A draft or terminated contract is not
            // settled here, and one already settled (deposit_status Applied…) is not
            // settled twice.
            $deposit_stmt = $conn->prepare("SELECT id, deposit_amount, deposit_status FROM lease_contracts
                                            WHERE rent_application_id = ? AND status IN ('active', 'expired', 'eviction-pending') AND deposit_status IN ('Held', 'Pending')
                                            ORDER BY generated_at DESC LIMIT 1 FOR UPDATE");
            $deposit_stmt->bind_param("i", $id);
            $deposit_stmt->execute();
            $deposit_row = $deposit_stmt->get_result()->fetch_assoc();
            $deposit_stmt->close();
            // Only a deposit that was actually paid ('Held') can cover the balance.
            $deposit_amount = ($deposit_row && $deposit_row['deposit_status'] === 'Held') ? (float)$deposit_row['deposit_amount'] : 0.0;
            $settled_contract_id = $deposit_row ? $deposit_row['id'] : null;

            $open_stmt = $conn->prepare("SELECT COALESCE(SUM(" . invoice_balance_sql('i') . "), 0) AS open_total FROM invoices i WHERE i.rent_application_id = ? AND " . invoice_owed_where_sql('i'));
            $open_stmt->bind_param("i", $id);
            $open_stmt->execute();
            $open_total = (float)$open_stmt->get_result()->fetch_assoc()['open_total'];
            $open_stmt->close();

            $balance = round($open_total + $damage_deduction + $utility_deduction - $deposit_amount, 2);

            // Update lease contract to store the security deposit allocation
            // (non-refundable: refund_amount is always 0.00). Only settles an
            // 'active' contract — end_tenancy() below handles the
            // room/invoices/parking/visitors every move-out shares, whatever
            // state the contract itself is in (also used by contract
            // termination, which ends the tenancy the same way).
            $deposit_status = 'Applied to Rent';
            if ($damage_deduction > 0 || $utility_deduction > 0) {
                $deposit_status = 'Applied to Bills/Damages';
            }
            // Updated by id (the row read above): a paid deposit takes the
            // disposition, one never paid is recorded as not collected.
            if ($settled_contract_id !== null) {
                $ctr_stmt = $conn->prepare("
                    UPDATE lease_contracts
                    SET status = 'expired',
                        deposit_status = CASE WHEN deposit_status = 'Held' THEN ? ELSE 'Not Collected' END,
                        damage_deduction = ?,
                        utility_deduction = ?,
                        refund_amount = 0.00,
                        refund_date = CURDATE()
                    WHERE id = ? AND deposit_status IN ('Held', 'Pending')
                ");
                $ctr_stmt->bind_param("sdds", $deposit_status, $damage_deduction, $utility_deduction, $settled_contract_id);
                $ctr_stmt->execute();
                $ctr_stmt->close();
            }

            // One row per deduction, in this same transaction (a failure rolls the clearance back).
            $deduction_summary = [];
            if ($deduction_lines) {
                $dd_stmt = $conn->prepare("INSERT INTO deposit_deductions (rent_application_id, contract_id, category, reason, amount, recorded_by) VALUES (?, ?, ?, ?, ?, ?)");
                foreach ($deduction_lines as $line) {
                    $dd_stmt->bind_param("isssdi", $id, $settled_contract_id, $line['category'], $line['reason'], $line['amount'], $admin_id);
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

            $vacated = end_tenancy($conn, $id, 'Moved Out', $room_condition);

            // The deposit covers the balance in full: clear whatever end_tenancy()
            // left open (overdue/processing/payment-failed) instead of leaving a
            // debt the tenant already paid off through the deposit. Otherwise the
            // remainder stays due and is reported back to the admin at clearance.
            if ($balance <= 0) {
                $clear_stmt = $conn->prepare("UPDATE invoices SET status = 'cancelled', cancel_reason = 'Settled from deposit' WHERE rent_application_id = ? AND status IN " . billing_open_status_sql());
                $clear_stmt->bind_param("i", $id);
                $clear_stmt->execute();
                $clear_stmt->close();
            }

            if ($vacated && $vacated['user_id']) {
                create_notification($conn, $vacated['user_id'], 'move_out_update', 'Move-Out Completed',
                    "Your move-out has been completed and your clearance recorded. Thank you for staying with us."
                    . ($deduction_summary ? " Deductions from your deposit: " . implode("; ", $deduction_summary) . "." : "")
                    . ($balance > 0 ? " An outstanding balance of ₱" . number_format($balance, 2) . " remains after your deposit." : ""));
            }

            log_activity($conn, $admin_id, 'tenant', "Completed Move Out & Clearance",
                "Application ID: $id, $clearance_notes" . ($deduction_summary ? "; deductions: " . implode("; ", $deduction_summary) : "") . ($vacated && $vacated['parking_released'] ? "; parking released" : "")
                . ($balance > 0 ? "; balance due after deposit: ₱" . number_format($balance, 2) : "; deposit covered the balance in full"));
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
        foreach ($refunds_raised as $rf) {
            notify_refund_raised($conn, $rf['id'], $rf['amount'], 'a payment on a rejected application');
            log_activity($conn, $admin_id, 'billing', 'Refund Requested', "Refund #{$rf['id']}: ₱" . number_format($rf['amount'], 2) . " (rejected application #$id)");
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
        $response = ["success" => true];
        if (!empty($refunds_raised)) $response["refunds_raised"] = count($refunds_raised);
        if ($status === 'moved-out') {
            $response["balance_due"] = $balance > 0 ? round($balance, 2) : 0;
        }
        echo json_encode($response);

    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => public_error_message($e)]);
    }
}
$conn->close();
?>
