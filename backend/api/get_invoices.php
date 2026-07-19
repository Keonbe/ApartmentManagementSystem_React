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
        // Double check your table aliases! If rent_applications column is actually called 'unit', change ra.room_name to ra.unit
        $query = "SELECT 
                    i.*, 
                    u.first_name, 
                    u.last_name, 
                    ra.room_name 
                  FROM invoices i
                  LEFT JOIN users u ON i.user_id = u.id
                  LEFT JOIN rent_applications ra ON u.id = ra.user_id
                  ORDER BY i.id DESC";

        $result = $conn->query($query);

        if (!$result) {
            // Force SQL errors to stay within the catch block instead of crashing PHP flat out
            throw new Exception("Database query failed: " . $conn->error);
        }

        $invoices = [];
        while ($row = $result->fetch_assoc()) {
            $invoices[] = [
                'id' => $row['id'],
                'user_id' => $row['user_id'],
                'first_name' => $row['first_name'] ?? '',
                'last_name' => $row['last_name'] ?? '',
                'room_name' => $row['room_name'] ?? 'Unassigned',
                'base_rent' => $row['base_rent'],
                'water' => $row['water'],
                'electricity' => $row['electricity'],
                'parking' => $row['parking'],
                'total_amount' => $row['base_rent'] + $row['water'] + $row['electricity'] + $row['parking'],
                'status' => $row['status'],
                'due_date' => $row['due_date'] ?? '',
                'paid_at' => $row['paid_at'] ?? null,
                'payment_method' => $row['payment_method'] ?? null,
                'sender_name' => $row['sender_name'] ?? null,
                'payment_reference' => $row['payment_reference'] ?? null,
                'proof_of_payment_path' => $row['proof_of_payment_path'] ?? null
            ];
        }

        echo json_encode(["success" => true, "invoices" => $invoices]);

    } catch (Exception $e) {
        // Keeping headers alive during a failure so your frontend can read the message safely
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