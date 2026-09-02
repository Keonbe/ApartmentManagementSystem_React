<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
$logged_user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
$is_admin = verify_admin($conn, $admin_id);

$user_id = $_GET['userId'] ?? null;
$email = $_GET['email'] ?? null;

if (!empty($user_id)) {
    if (!$is_admin && $logged_user_id && (int)$user_id !== (int)$logged_user_id) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Forbidden: Access denied to other user's contract"]);
        exit;
    }

    $stmt = $conn->prepare("SELECT lc.*, ra.first_name, ra.last_name, ra.contact_no, ra.room_name, ra.monthly_rent, ra.email, rm.type, ra.created_at as app_created_at 
                            FROM rent_applications ra 
                            LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id 
                            LEFT JOIN rooms rm ON ra.room_name = rm.id
                            WHERE ra.user_id = ? AND ra.status = 'Approved' 
                            ORDER BY ra.created_at DESC LIMIT 1");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $res = $stmt->get_result();
    $contract = $res && $res->num_rows > 0 ? $res->fetch_assoc() : null;
    $stmt->close();
    echo json_encode(["success" => !empty($contract), "contract" => $contract, "contracts" => $contract ? [$contract] : []]);
} else if (!empty($email)) {
    $stmt = $conn->prepare("SELECT lc.*, ra.first_name, ra.last_name, ra.contact_no, ra.room_name, ra.monthly_rent, ra.email, rm.type, ra.created_at as app_created_at 
                            FROM rent_applications ra 
                            LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id 
                            LEFT JOIN rooms rm ON ra.room_name = rm.id
                            WHERE ra.email = ? AND ra.status = 'Approved' 
                            ORDER BY ra.created_at DESC LIMIT 1");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $res = $stmt->get_result();
    $contract = $res && $res->num_rows > 0 ? $res->fetch_assoc() : null;
    $stmt->close();
    echo json_encode(["success" => !empty($contract), "contract" => $contract, "contracts" => $contract ? [$contract] : []]);
} else {
    // Admin-only global contract list
    if (!$is_admin) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Forbidden: Admin access required"]);
        exit;
    }

    $query = "SELECT c.*, r.first_name, r.last_name, r.email, r.room_name, r.monthly_rent, rm.type 
              FROM lease_contracts c 
              LEFT JOIN rent_applications r ON c.rent_application_id = r.id
              LEFT JOIN rooms rm ON r.room_name = rm.id
              ORDER BY c.generated_at DESC";
    $result = $conn->query($query);
    $contracts = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $contracts[] = $row;
        }
    }
    echo json_encode(["success" => true, "contracts" => $contracts]);
}
$conn->close();
?>
