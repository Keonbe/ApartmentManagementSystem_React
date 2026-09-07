<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once __DIR__ . '/../config.php';

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$id = $input['id'] ?? null;
$sync_mode = $input['sync_mode'] ?? 'merge'; // 'merge', 'separate', 'paid'
$custom_due_date = $input['due_date'] ?? null;

if (!$id) {
    echo json_encode(["success" => false, "message" => "Reading ID is required"]);
    exit;
}

// Get reading details
$query = "SELECT room_name, user_id, billing_period, water_amount, water_other_fees, electric_amount, electric_other_fees, is_invoiced FROM utility_readings WHERE id = ?";
$stmt = $conn->prepare($query);
$stmt->bind_param("i", $id);
$stmt->execute();
$res = $stmt->get_result();
$reading = $res->fetch_assoc();
$stmt->close();

if (!$reading) {
    echo json_encode(["success" => false, "message" => "Utility reading not found"]);
    exit;
}

if ($reading['is_invoiced']) {
    echo json_encode(["success" => false, "message" => "This reading has already been synced to an invoice"]);
    exit;
}

if (!$reading['user_id']) {
    // Attempt fallback lookup from rent_applications
    $tenant_query = "SELECT user_id FROM rent_applications WHERE room_name = ? AND status IN ('Approved', 'pending-move-out') ORDER BY id DESC LIMIT 1";
    $stmt = $conn->prepare($tenant_query);
    $stmt->bind_param("s", $reading['room_name']);
    $stmt->execute();
    $t_res = $stmt->get_result();
    if ($t_row = $t_res->fetch_assoc()) {
        $reading['user_id'] = $t_row['user_id'];
        // Update reading record with user_id
        $up_read = $conn->prepare("UPDATE utility_readings SET user_id = ? WHERE id = ?");
        $up_read->bind_param("ii", $reading['user_id'], $id);
        $up_read->execute();
        $up_read->close();
    }
    $stmt->close();
}

if (!$reading['user_id']) {
    echo json_encode(["success" => false, "message" => "Cannot sync: No tenant assigned to unit {$reading['room_name']}."]);
    exit;
}

// Fetch rent application ID for the user
$rent_app_id = 0;
$room_q = "SELECT ra.id as rent_application_id 
           FROM rent_applications ra 
           WHERE ra.user_id = ? AND ra.status IN ('Approved', 'pending-move-out') 
           ORDER BY ra.id DESC LIMIT 1";
$stmt = $conn->prepare($room_q);
$stmt->bind_param("i", $reading['user_id']);
$stmt->execute();
$r_res = $stmt->get_result();
if ($room_data = $r_res->fetch_assoc()) {
    $rent_app_id = $room_data['rent_application_id'];
}
$stmt->close();

$water_total = $reading['water_amount'] + $reading['water_other_fees'];
$electric_total = $reading['electric_amount'] + $reading['electric_other_fees'];

if ($sync_mode === 'merge') {
    // Original merge logic
    // Find pending invoice for this user and billing period
    // `services` is carried through so a posted service charge survives this recompute
    $inv_query = "SELECT id, base_rent, parking, security_deposit, services FROM invoices WHERE user_id = ? AND billing_period = ? AND status = 'pending' LIMIT 1";
    $stmt = $conn->prepare($inv_query);
    $stmt->bind_param("is", $reading['user_id'], $reading['billing_period']);
    $stmt->execute();
    $inv_res = $stmt->get_result();
    $invoice = $inv_res->fetch_assoc();
    $stmt->close();

    if (!$invoice) {
        // Auto-generate a pending invoice for this billing period
        $room_q = "SELECT r.monthly_rent 
                   FROM rent_applications ra 
                   JOIN rooms r ON ra.room_name = r.id 
                   WHERE ra.id = ?";
        $stmt = $conn->prepare($room_q);
        $stmt->bind_param("i", $rent_app_id);
        $stmt->execute();
        $r_res = $stmt->get_result();
        $room_data = $r_res->fetch_assoc();
        $stmt->close();

        if (!$room_data) {
            echo json_encode(["success" => false, "message" => "No active approved lease found for this tenant. Cannot auto-generate invoice."]);
            exit;
        }

        $base_rent = $room_data['monthly_rent'];
        $parking = 0.00;
        $sec_dep = 0.00;
        $inv_id = "INV-" . strtoupper(uniqid());
        
        $period = $reading['billing_period'];
        $due_date = date('Y-m-d', strtotime($period . '-01 +1 month +4 days')); 

        $insert_inv = "INSERT INTO invoices (id, user_id, rent_application_id, base_rent, parking, security_deposit, total_amount, billing_period, status, due_date)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)";
        $stmt = $conn->prepare($insert_inv);
        $total = $base_rent; // Utility amounts added in the next step
        $stmt->bind_param("siidddsss", $inv_id, $reading['user_id'], $rent_app_id, $base_rent, $parking, $sec_dep, $total, $period, $due_date);
        
        if (!$stmt->execute()) {
            echo json_encode(["success" => false, "message" => "Failed to auto-generate base invoice: " . $conn->error]);
            exit;
        }
        $stmt->close();

        $invoice = [
            'id' => $inv_id,
            'base_rent' => $base_rent,
            'parking' => $parking,
            'security_deposit' => $sec_dep,
            'services' => 0.00
        ];
    }

    $new_total = $invoice['base_rent'] + $invoice['parking'] + $invoice['security_deposit'] + $invoice['services'] + $water_total + $electric_total;
    $update_inv = "UPDATE invoices SET water = ?, electricity = ?, total_amount = ? WHERE id = ?";
    $stmt = $conn->prepare($update_inv);
    $stmt->bind_param("ddds", $water_total, $electric_total, $new_total, $invoice['id']);
    
    if (!$stmt->execute()) {
        echo json_encode(["success" => false, "message" => "Failed to update invoice: " . $conn->error]);
        exit;
    }
    $stmt->close();
    $target_inv_id = $invoice['id'];
    $success_msg = "Utility amounts synced to invoice successfully";
    
} else if ($sync_mode === 'separate' || $sync_mode === 'paid') {
    // Create separate invoice
    $inv_id = "INV-" . strtoupper(uniqid());
    $period = $reading['billing_period'];
    $base_rent = 0.00;
    $parking = 0.00;
    $sec_dep = 0.00;
    
    $total_amount = $water_total + $electric_total;
    $due_date = $custom_due_date ? $custom_due_date : date('Y-m-d', strtotime($period . '-01 +1 month +4 days'));
    
    $status = ($sync_mode === 'paid') ? 'paid' : 'pending';
    $payment_method = ($sync_mode === 'paid') ? 'Cash' : null;
    $paid_at = ($sync_mode === 'paid') ? date('Y-m-d H:i:s') : null;

    $insert_inv = "INSERT INTO invoices (id, user_id, rent_application_id, base_rent, parking, security_deposit, water, electricity, total_amount, billing_period, status, due_date, payment_method, paid_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    $stmt = $conn->prepare($insert_inv);
    $stmt->bind_param("siiddddddsssss", $inv_id, $reading['user_id'], $rent_app_id, $base_rent, $parking, $sec_dep, $water_total, $electric_total, $total_amount, $period, $status, $due_date, $payment_method, $paid_at);
    
    if (!$stmt->execute()) {
        echo json_encode(["success" => false, "message" => "Failed to create separate utility invoice: " . $conn->error]);
        exit;
    }
    $stmt->close();
    $target_inv_id = $inv_id;
    $success_msg = ($sync_mode === 'paid') ? "Utility payment recorded directly" : "Separate utility invoice created successfully";
} else {
    echo json_encode(["success" => false, "message" => "Invalid sync mode"]);
    exit;
}

// Atomically mark as invoiced
$claim = $conn->prepare("UPDATE utility_readings SET is_invoiced = 1 WHERE id = ? AND is_invoiced = 0");
$claim->bind_param("i", $id);
$claim->execute();
if ($claim->affected_rows === 0) {
    $claim->close();
    echo json_encode(["success" => false, "message" => "Already synced by another session."]);
    exit;
}
$claim->close();

log_activity($conn, $admin_id, 'utilities', 'sync_invoice', "Synced utility reading #{$id} ({$sync_mode}) to invoice {$target_inv_id}");
echo json_encode(["success" => true, "message" => $success_msg]);
$conn->close();
?>
