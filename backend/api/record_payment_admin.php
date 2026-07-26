<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Id, x-user-id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $input = json_decode(file_get_contents("php://input"), true);
        
        // 1. Default to an empty string instead of 0
        $invoice_id = $input['invoiceId'] ?? ''; 
        $payment_method = $input['paymentMethod'] ?? 'Cash';
        
        $admin_id = isset($_SERVER['HTTP_X_ADMIN_ID']) ? (int)$_SERVER['HTTP_X_ADMIN_ID'] : 0;

        if (!empty($invoice_id)) { 
            $stmt = $conn->prepare("UPDATE invoices SET status = 'paid', payment_method = ?, paid_at = NOW() WHERE id = ?");
            
            $stmt->bind_param("ss", $payment_method, $invoice_id);

            if ($stmt->execute()) {
                // Safely log activity
                try {
                    log_activity($conn, $admin_id, 'payment', "Approved Verification Pipeline", "Invoice ID: $invoice_id settled via $payment_method");
                } catch (Exception $logErr) {
                }
                
                echo json_encode(["success" => true, "message" => "Payment successfully finalized and saved."]);
            } else {
                echo json_encode(["success" => false, "message" => "Failed to update record fields: " . $conn->error]);
            }
            $stmt->close();
        } else {
            echo json_encode(["success" => false, "message" => "Invalid target tracking index parameters."]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Server Error: " . $e->getMessage()]);
    }
    
    $conn->close();
    exit;
}

echo json_encode(["success" => false, "message" => "Invalid request method."]);
?>