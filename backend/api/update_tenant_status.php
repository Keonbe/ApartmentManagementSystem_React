<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = require_admin($conn);

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['id'] ?? 0;
$status = $input['status'] ?? '';
$rejection_reason = $input['rejection_reason'] ?? null;

// Every status this endpoint actually knows how to handle below. Anything
// else used to be written to rent_applications.status verbatim with no
// validation, which could silently park a tenant in a value no filter
// anywhere in the app matches.
$allowed_statuses = ['Approved', 'Rejected', 'Declined', 'pending-move-out', 'moved-out'];
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
        $cur_stmt = $conn->prepare("SELECT status FROM rent_applications WHERE id = ?");
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

        if ($status === 'Rejected' || $status === 'Declined') {
            $stmt = $conn->prepare("UPDATE rent_applications SET status = ?, rejection_reason = ? WHERE id = ? AND status = ?");
            $stmt->bind_param("ssis", $status, $rejection_reason, $id, $current_status);
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

            $stmt = $conn->prepare("UPDATE rent_applications SET status = ?, requested_move_out_date = ?, rejection_reason = NULL WHERE id = ? AND status = ?");
            $stmt->bind_param("ssis", $status, $requested_move_out_date, $id, $current_status);
        } else {
            $stmt = $conn->prepare("UPDATE rent_applications SET status = ?, rejection_reason = NULL WHERE id = ? AND status = ?");
            $stmt->bind_param("sis", $status, $id, $current_status);
        }
        $stmt->execute();
        if ($stmt->affected_rows === 0) {
            $stmt->close();
            throw new Exception("This application was changed by someone else. Refresh and try again.");
        }
        $stmt->close();

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
                $room_status = 'occupied';
                
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

                // Check if invoice already exists for this application
                $check_inv = $conn->prepare("SELECT id FROM invoices WHERE rent_application_id = ?");
                $check_inv->bind_param("i", $id);
                $check_inv->execute();
                $check_res = $check_inv->get_result();
                if ($check_res->num_rows === 0) {
                    $invoice_id = 'INV-' . uniqid();
                    $billing_period = date('Y-m'); // Must be YYYY-MM to fit VARCHAR(7)
                    $due_date = date('Y-m-d', strtotime('+7 days'));
                    $total_amount = $monthly_rent * 2; // 1st month + 1 month deposit
                    
                    $inv_stmt = $conn->prepare("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, security_deposit, total_amount, billing_period, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)");
                    $inv_stmt->bind_param("siidddss", $invoice_id, $user_id, $id, $monthly_rent, $monthly_rent, $total_amount, $billing_period, $due_date);
                    if (!$inv_stmt->execute()) {
                        throw new Exception("Failed to create move-in invoice: " . $inv_stmt->error);
                    }
                    $inv_stmt->close();
                }
                $check_inv->close();

                // Check if contract already exists for this application
                $check_ctr = $conn->prepare("SELECT id FROM lease_contracts WHERE rent_application_id = ?");
                $check_ctr->bind_param("i", $id);
                $check_ctr->execute();
                $ctr_res = $check_ctr->get_result();
                if ($ctr_res->num_rows === 0) {
                    $contract_id = 'CTR-' . uniqid();
                    // Security deposit is one month's rent — matches invoices.security_deposit above.
                    $security_deposit = $monthly_rent;
                    $ctr_stmt = $conn->prepare("INSERT INTO lease_contracts (id, rent_application_id, deposit_amount, lease_start, lease_end, status) VALUES (?, ?, ?, ?, ?, 'draft')");
                    $ctr_stmt->bind_param("sidss", $contract_id, $id, $security_deposit, $lease_start, $lease_end);
                    if (!$ctr_stmt->execute()) {
                        throw new Exception("Failed to create lease contract: " . $ctr_stmt->error);
                    }
                    $ctr_stmt->close();
                }
                $check_ctr->close();
            }
            $app_stmt->close();
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

        if (in_array($status, ['Approved', 'Rejected', 'Declined'])) {
            $u_stmt = $conn->prepare("SELECT user_id, room_name FROM rent_applications WHERE id = ?");
            $u_stmt->bind_param("i", $id);
            $u_stmt->execute();
            $u_res = $u_stmt->get_result()->fetch_assoc();
            $u_stmt->close();
            
            if ($u_res) {
                $tenant_id = $u_res['user_id'];
                $room = $u_res['room_name'];
                
                $notif_title = "Application " . ($status === 'Declined' ? 'Rejected' : $status);
                $notif_msg = "Your rent application for Unit $room has been " . strtolower($notif_title) . ".";
                if (!empty($rejection_reason)) {
                    $notif_msg .= " Reason: $rejection_reason";
                }
                
                create_notification($conn, $tenant_id, 'application_update', $notif_title, $notif_msg);
            }
            resolve_admin_queue($conn, 'rent_application', $id);
        }

        $conn->commit();
        // Queue the approval email only after the transaction commits. Notification
        // failures must never roll back a completed application approval.
        if ($status === 'Approved' && !empty($tenant_id)) {
            try {
                require_once __DIR__ . '/services/send_notification.php';
                $due_date = date('Y-m-d', strtotime('+7 days'));
                $email_html = email_application_approved_template(
                    notify_recipient_name($conn, $tenant_id),
                    $room ?? '',
                    $monthly_rent ?? 0,
                    $due_date
                );
                dispatch_external_notification(
                    $conn,
                    $tenant_id,
                    'application_update',
                    'Your Rental Application Is Approved',
                    null,
                    $email_html,
                    'sync'
                );
            } catch (Throwable $notification_error) {
                error_log('Could not dispatch application approval email: ' . $notification_error->getMessage());
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