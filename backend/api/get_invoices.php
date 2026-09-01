<?php
// Define CORS headers immediately before any processing occurs
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $user_id_param = $_GET['userId'] ?? null;
        if ($user_id_param) {
            $stmt = $conn->prepare("SELECT 
                        i.*, 
                        u.first_name, 
                        u.last_name, 
                        ra.room_name 
                      FROM invoices i
                      LEFT JOIN users u ON i.user_id = u.id
                      LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
                      WHERE i.user_id = ?
                      ORDER BY i.id DESC");
            $stmt->bind_param("i", $user_id_param);
            $stmt->execute();
            $result = $stmt->get_result();
        } else {
            $query = "SELECT 
                        i.*, 
                        u.first_name, 
                        u.last_name, 
                        ra.room_name 
                      FROM invoices i
                      LEFT JOIN users u ON i.user_id = u.id
                      LEFT JOIN rent_applications ra ON i.rent_application_id = ra.id
                      ORDER BY i.id DESC";
            $result = $conn->query($query);
        }

        if (!$result) {
            throw new Exception("Database query failed: " . $conn->error);
        }

        $invoices = [];
        while ($row = $result->fetch_assoc()) {
            $invoices[] = [
                'id' => $row['id'],
                // FIX FOR DUPLICATE PREFIX: Pass raw ID/Number or strip duplicate prefix
                'invoice_number' => $row['invoice_number'] ?? $row['id'], 
                'user_id' => $row['user_id'],
                'first_name' => $row['first_name'] ?? '',
                'last_name' => $row['last_name'] ?? '',
                'room_name' => $row['room_name'] ?? 'Unassigned',
                'base_rent' => $row['base_rent'],
                'water' => $row['water'] ?? 0,
                'electricity' => $row['electricity'] ?? 0,
                'parking' => $row['parking'] ?? 0,
                'security_deposit' => $row['security_deposit'] ?? 0,
                'late_fee' => ($row['status'] === 'pending' && !empty($row['due_date']) && strtotime($row['due_date']) < strtotime(date('Y-m-d'))) ? 500.00 : 0.00,
                'total_amount' => ($row['base_rent'] ?? 0) + ($row['water'] ?? 0) + ($row['electricity'] ?? 0) + ($row['parking'] ?? 0) + ($row['security_deposit'] ?? 0) + (($row['status'] === 'pending' && !empty($row['due_date']) && strtotime($row['due_date']) < strtotime(date('Y-m-d'))) ? 500.00 : 0.00),
                'status' => $row['status'],
                
                // FIX FOR INVALID DATE: Send created_at or issue_date timestamp
                'created_at' => $row['created_at'] ?? $row['issue_date'] ?? date('Y-m-d H:i:s'), 
                'due_date' => $row['due_date'] ?? '',
                'paid_at' => $row['paid_at'] ?? null,
                'payment_method' => !empty($row['payment_method']) ? $row['payment_method'] : (!empty($row['payment_gateway']) && strpos($row['payment_gateway'], 'paymongo') !== false ? 'PayMongo (Sandbox)' : null),
                'sender_name' => $row['sender_name'] ?? null,
                'payment_reference' => $row['payment_reference'] ?? null,
                'proof_of_payment_path' => $row['proof_of_payment_path'] ?? null,
                'billing_period' => $row['billing_period'] ?? null,
                'scheduled_date' => $row['scheduled_date'] ?? null,
                'scheduled_time_slot' => $row['scheduled_time_slot'] ?? null,
                'payment_gateway' => $row['payment_gateway'] ?? null
            ];
        }

        echo json_encode(["success" => true, "invoices" => $invoices]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            "success" => false, 
            "message" => "Server Error: " . $e->getMessage()
        ]);
    } finally {
        if (isset($conn)) {
            $conn->close();
        }
    }
    exit;
}

echo json_encode(["success" => false, "message" => "Invalid request method"]);
?>