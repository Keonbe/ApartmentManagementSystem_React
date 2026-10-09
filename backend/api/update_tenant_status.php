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

if ($id > 0 && !empty($status)) {
    // Start transaction to ensure data integrity
    $conn->begin_transaction();
    try {
        // APPLICATION_TRANSITIONS (H5): read the current status inside the
        // transaction and refuse a move it doesn't allow — e.g. a Pending
        // Review application can't be pushed straight to moved-out, and an
        // application that's already Rejected can't be moved again from here.
        $cur_stmt = $conn->prepare("SELECT status, user_id FROM rent_applications WHERE id = ?");
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

        if ($status === 'Rejected' || $status === 'Declined' || $status === 'Cancelled' || $status === 'Action Required') {
            $stmt = $conn->prepare("UPDATE rent_applications SET status = ?, rejection_reason = ?, rejection_attachment_path = ? WHERE id = ? AND status = ?");
            if (!$stmt) {
                $stmt = $conn->prepare("UPDATE rent_applications SET status = ?, rejection_reason = ? WHERE id = ? AND status = ?");
                $stmt->bind_param("ssis", $status, $rejection_reason, $id, $current_status);
            } else {
                $stmt->bind_param("sssss", $status, $rejection_reason, $attachment_path, $id, $current_status);
            }
        } else if ($status === 'pending-move-out') {
            $requested_move_out_date = $input['requested_move_out_date'] ?? null;
            if (empty($requested_move_out_date)) {
                throw new Exception("Move-out date is required.");
            }
            $today = new DateTime(date('Y-m-d'));
            $selected_date = new DateTime($requested_move_out_date);
            $interval = $today->diff($selected_date);
            $days_diff = (int)$interval->format('%r%a');

            if ($days_diff < 15) {
                throw new Exception("Prior notice of at least 15 days is required before actual move-out.");
            }
            if ($days_diff > 30) {
                throw new Exception("Move-out notice cannot exceed 30 days in advance.");
            }

            $stmt = $conn->prepare("UPDATE rent_applications SET status = ?, requested_move_out_date = ?, rejection_reason = NULL, rejection_attachment_path = NULL WHERE id = ? AND status = ?");
            if (!$stmt) {
                $stmt = $conn->prepare("UPDATE rent_applications SET status = ?, requested_move_out_date = ?, rejection_reason = NULL WHERE id = ? AND status = ?");
                $stmt->bind_param("ssis", $status, $requested_move_out_date, $id, $current_status);
            } else {
                $stmt->bind_param("ssis", $status, $requested_move_out_date, $id, $current_status);
            }
        } else {
            $stmt = $conn->prepare("UPDATE rent_applications SET status = ?, rejection_reason = NULL, rejection_attachment_path = NULL WHERE id = ? AND status = ?");
            if (!$stmt) {
                $stmt = $conn->prepare("UPDATE rent_applications SET status = ?, rejection_reason = NULL WHERE id = ? AND status = ?");
                $stmt->bind_param("sis", $status, $id, $current_status);
            } else {
                $stmt->bind_param("sis", $status, $id, $current_status);
            }
        }
        $stmt->execute();
        if ($stmt->affected_rows === 0) {
            $stmt->close();
            throw new Exception("This application was changed by someone else. Refresh and try again.");
        }
        $stmt->close();

        if ($status === 'Rejected' || $status === 'Declined' || $status === 'Cancelled' || $status === 'Action Required') {
            // Admin changed mind or cancelled: undo move-in invoices and contracts
            // 1. Cancel all open move-in invoices
            $open_statuses = billing_open_status_sql();
            $cancel_inv = $conn->prepare("UPDATE invoices SET status = 'cancelled', cancel_reason = ? WHERE rent_application_id = ? AND status IN $open_statuses");
            $c_reason = "Application $status before move-in";
            $cancel_inv->bind_param("si", $c_reason, $id);
            $cancel_inv->execute();
            $cancel_inv->close();

            // 2. Delete draft lease contract
            $del_ctr = $conn->prepare("DELETE FROM lease_contracts WHERE rent_application_id = ? AND status = 'draft'");
            $del_ctr->bind_param("i", $id);
            $del_ctr->execute();
            $del_ctr->close();

            // 3. Cancel open advance credits
            $conn->query("UPDATE advance_credits SET status = 'cancelled' WHERE rent_application_id = " . (int)$id . " AND status IN ('reserved', 'available')");

            // 4. Resolve payment notifications for the applicant
            if (!empty($cur_row['user_id'])) {
                $conn->query("UPDATE notifications SET status = 'Resolved', is_read = 1 WHERE user_id = " . (int)$cur_row['user_id'] . " AND type IN ('billing', 'rent_due', 'overdue') AND status = 'Pending'");
            }

            // 5. Free the room
            $app_q = $conn->prepare("SELECT room_name FROM rent_applications WHERE id = ?");
            $app_q->bind_param("i", $id);
            $app_q->execute();
            $room_row = $app_q->get_result()->fetch_assoc();
            $app_q->close();
            if ($room_row) {
                $room_name = $room_row['room_name'];

                if ($current_status === 'Approved') {
                    // An approved application holds the room ('reserved' for it).
                    $room_id_clean = trim(str_replace('Room', '', $room_name));
                    $free_room = $conn->prepare("UPDATE rooms SET status = 'vacant', tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0 WHERE id = ?");
                    $free_room->bind_param("s", $room_id_clean);
                    $free_room->execute();
                    $free_room->close();

                    $free_room2 = $conn->prepare("UPDATE rooms SET status = 'vacant', tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0 WHERE id = ?");
                    $free_room2->bind_param("s", $room_name);
                    $free_room2->execute();
                    $free_room2->close();
                } else {
                    // Not yet approved: the room may belong to someone else (an
                    // approved applicant or a tenant), so never vacate it outright.
                    // It may still be 'reserved' from the Converted hold this
                    // application came from (audit M5) — release it only if no
                    // other application or hold claims it.
                    release_room_if_unclaimed($conn, $room_name);
                }
            }
        }

        if ($status === 'Approved') {
            // Get application details to update the room and generate invoice
            $app_stmt = $conn->prepare("SELECT first_name, last_name, room_name, months_of_rent, user_id, monthly_rent, occupants, valid_id_front_path, valid_id_back_path, nbi_clearance_path, terms_agreed_at FROM rent_applications WHERE id = ?");
            $app_stmt->bind_param("i", $id);
            $app_stmt->execute();
            $app_res = $app_stmt->get_result();
            if ($app_res->num_rows > 0) {
                $app = $app_res->fetch_assoc();

                // Acceptance-criteria enforcement (checklist 1.7): an application
                // cannot be approved without real ID/NBI documents on file and a
                // recorded Terms & Conditions agreement from the applicant.
                $doc_fields = [$app['valid_id_front_path'], $app['valid_id_back_path'], $app['nbi_clearance_path']];
                foreach ($doc_fields as $doc_path) {
                    if (empty($doc_path) || $doc_path === 'placeholder') {
                        throw new Exception("Cannot approve: this application is missing a required verification document (Valid ID or NBI Clearance).");
                    }
                }
                if (empty($app['terms_agreed_at'])) {
                    throw new Exception("Cannot approve: the applicant has not agreed to the Terms & Conditions.");
                }

                $tenant_name = $app['first_name'] . ' ' . $app['last_name'];
                $room_name = $app['room_name'];
                $months = (int)$app['months_of_rent'];
                $user_id = $app['user_id'];
                $monthly_rent = (double)$app['monthly_rent'];
                $occupants = (int)$app['occupants'];
                
                // Enforce the occupant capacity surcharge of ₱1,000/person exceeding 4 occupants.
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
                $occupant_surcharge_setting = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'occupant_surcharge_per_person'")->fetch_assoc();
                $occupant_surcharge = $occupant_surcharge_setting ? (float)$occupant_surcharge_setting['setting_value'] : 1000.00;
                $expected_rent = $base_room_rent + ($occupants > 4 ? ($occupants - 4) * $occupant_surcharge : 0);
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

        if ($status === 'active') {
            $move_in_q = $conn->prepare("SELECT first_name, last_name, room_name, months_of_rent, occupants, move_in_date FROM rent_applications WHERE id = ? AND status = 'active'");
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
            $tenant_name = $move_in_app['first_name'] . ' ' . $move_in_app['last_name'];
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
            $damage_deduction = isset($input['damage_deduction']) ? (float)$input['damage_deduction'] : 0.0;
            $utility_deduction = isset($input['utility_deduction']) ? (float)$input['utility_deduction'] : 0.0;
            $room_condition = ($damage_deduction > 0) ? 'Needs Repair' : 'Good';

            // M4: what's left owed after the deposit — every still-open invoice
            // (whatever its status) plus the damage/utility deductions, less the
            // deposit itself. Read before end_tenancy() touches any invoice.
            $deposit_stmt = $conn->prepare("SELECT deposit_amount FROM lease_contracts WHERE rent_application_id = ? AND status = 'active'");
            $deposit_stmt->bind_param("i", $id);
            $deposit_stmt->execute();
            $deposit_row = $deposit_stmt->get_result()->fetch_assoc();
            $deposit_stmt->close();
            $deposit_amount = $deposit_row ? (float)$deposit_row['deposit_amount'] : 0.0;

            $open_stmt = $conn->prepare("SELECT COALESCE(SUM(total_amount), 0) AS open_total FROM invoices WHERE rent_application_id = ? AND status IN " . billing_open_status_sql());
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
            $ctr_stmt = $conn->prepare("
                UPDATE lease_contracts
                SET status = 'expired',
                    deposit_status = ?,
                    damage_deduction = ?,
                    utility_deduction = ?,
                    refund_amount = 0.00,
                    refund_date = CURDATE()
                WHERE rent_application_id = ? AND status = 'active'
            ");
            $ctr_stmt->bind_param("sddi", $deposit_status, $damage_deduction, $utility_deduction, $id);
            $ctr_stmt->execute();
            $ctr_stmt->close();

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
                    . ($balance > 0 ? " An outstanding balance of ₱" . number_format($balance, 2) . " remains after your deposit." : ""));
            }

            log_activity($conn, $admin_id, 'tenant', "Completed Move Out & Clearance",
                "Application ID: $id, $clearance_notes" . ($vacated && $vacated['parking_released'] ? "; parking released" : "")
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
                if ($status === 'active') {
                    $notif_msg = "Your move-in to Unit $room has been confirmed.";
                } elseif ($status === 'Action Required') {
                    $notif_msg = "Your rent application for Unit $room needs more information from you.";
                } else {
                    $notif_msg = "Your rent application for Unit $room has been " . strtolower($status === 'Declined' ? 'Rejected' : $status) . ".";
                }
                if (!empty($rejection_reason)) {
                    $notif_msg .= " Reason: $rejection_reason";
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
        if ($status === 'moved-out') {
            $response["balance_due"] = $balance > 0 ? round($balance, 2) : 0;
        }
        echo json_encode($response);

    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
}
$conn->close();
?>
