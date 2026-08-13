<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
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

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['id'] ?? 0;
$status = $input['status'] ?? '';
$rejection_reason = $input['rejection_reason'] ?? null;

if ($id > 0 && !empty($status)) {
    // Start transaction to ensure data integrity
    $conn->begin_transaction();
    try {
        if ($status === 'Rejected' || $status === 'Declined') {
            $stmt = $conn->prepare("UPDATE rent_applications SET status = ?, rejection_reason = ? WHERE id = ?");
            $stmt->bind_param("ssi", $status, $rejection_reason, $id);
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

            $stmt = $conn->prepare("UPDATE rent_applications SET status = ?, requested_move_out_date = ?, rejection_reason = NULL WHERE id = ?");
            $stmt->bind_param("ssi", $status, $requested_move_out_date, $id);
        } else {
            $stmt = $conn->prepare("UPDATE rent_applications SET status = ?, rejection_reason = NULL WHERE id = ?");
            $stmt->bind_param("si", $status, $id);
        }
        $stmt->execute();
        $stmt->close();
        
        if ($status === 'Approved') {
            // Get application details to update the room and generate invoice
            $app_stmt = $conn->prepare("SELECT first_name, last_name, room_name, months_of_rent, user_id, monthly_rent, occupants FROM rent_applications WHERE id = ?");
            $app_stmt->bind_param("i", $id);
            $app_stmt->execute();
            $app_res = $app_stmt->get_result();
            if ($app_res->num_rows > 0) {
                $app = $app_res->fetch_assoc();
                $tenant_name = $app['first_name'] . ' ' . $app['last_name'];
                $room_name = $app['room_name'];
                $months = (int)$app['months_of_rent'];
                $user_id = $app['user_id'];
                $monthly_rent = (double)$app['monthly_rent'];
                $occupants = (int)$app['occupants'];
                
                // Enforce the occupant capacity surcharge of ₱1,000/person exceeding 4 occupants
                $room_id_clean = trim(str_replace('Room', '', $room_name));
                $base_room_rent = in_array(strtoupper($room_id_clean), ['K', 'L', 'M', 'N']) ? 3500.00 : 4000.00;
                $expected_rent = $base_room_rent + ($occupants > 4 ? ($occupants - 4) * 1000 : 0);
                if ($monthly_rent < $expected_rent) {
                    $monthly_rent = $expected_rent;
                }
                
                $lease_start = date('Y-m-d');
                $lease_end = date('Y-m-d', strtotime("+$months months"));
                $room_status = 'occupied';
                
                $room_stmt = $conn->prepare("UPDATE rooms SET status = ?, tenant_name = ?, lease_start = ?, lease_end = ?, occupants = ? WHERE id = ?");
                $room_stmt->bind_param("ssssis", $room_status, $tenant_name, $lease_start, $lease_end, $app['occupants'], $room_name);
                $room_stmt->execute();
                $room_stmt->close();

                // Check if invoice already exists for this application
                $check_inv = $conn->prepare("SELECT id FROM invoices WHERE rent_application_id = ?");
                $check_inv->bind_param("i", $id);
                $check_inv->execute();
                $check_res = $check_inv->get_result();
                if ($check_res->num_rows === 0) {
                    $invoice_id = 'INV-' . uniqid();
                    $billing_period = date('F Y');
                    $due_date = date('Y-m-d', strtotime('+7 days'));
                    $total_amount = $monthly_rent * 2;
                    
                    $inv_stmt = $conn->prepare("INSERT INTO invoices (id, user_id, rent_application_id, base_rent, security_deposit, total_amount, billing_period, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)");
                    $inv_stmt->bind_param("siidddss", $invoice_id, $user_id, $id, $monthly_rent, $monthly_rent, $total_amount, $billing_period, $due_date);
                    $inv_stmt->execute();
                    $inv_stmt->close();
                }
                $check_inv->close();
            }
            $app_stmt->close();
        }

        if ($status === 'moved-out') {
            $clearance_notes = $input['clearance_notes'] ?? '';

            // Get application details to vacate the room
            $app_stmt = $conn->prepare("SELECT first_name, last_name, room_name FROM rent_applications WHERE id = ?");
            $app_stmt->bind_param("i", $id);
            $app_stmt->execute();
            $app_res = $app_stmt->get_result();
            if ($app_res->num_rows > 0) {
                $app = $app_res->fetch_assoc();
                $full_name = $app['first_name'] . ' ' . $app['last_name'];
                $room_name = $app['room_name'];
                
                $room_stmt = $conn->prepare("UPDATE rooms SET status = 'vacant', last_tenant = ?, tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0 WHERE id = ?");
                $room_stmt->bind_param("ss", $full_name, $room_name);
                $room_stmt->execute();
                $room_stmt->close();
            }
            $app_stmt->close();

            if (!empty($clearance_notes)) {
                $notes_stmt = $conn->prepare("UPDATE rent_applications SET archive_notes = ? WHERE id = ?");
                $notes_stmt->bind_param("si", $clearance_notes, $id);
                $notes_stmt->execute();
                $notes_stmt->close();
            }

            // Cancel any remaining pending invoices associated with this past move-out application
            $cancel_inv = $conn->prepare("UPDATE invoices SET status = 'cancelled' WHERE rent_application_id = ? AND status = 'pending'");
            $cancel_inv->bind_param("i", $id);
            $cancel_inv->execute();
            $cancel_inv->close();

            log_activity($conn, $admin_id, 'tenant', "Completed Move Out & Clearance", "Application ID: $id, $clearance_notes");
        } else {
            log_activity($conn, $admin_id, 'tenant', "Updated Tenant Status", "Application ID: $id, New Status: $status");
        }

        $conn->commit();
        echo json_encode(["success" => true]);
        
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => $e->getMessage()]);
    }
}
$conn->close();
?>