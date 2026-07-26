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

$user_id = $_GET['userId'] ?? $_SERVER['HTTP_X_USER_ID'] ?? null;
$email = $_GET['email'] ?? null;

if (empty($user_id) && empty($email)) {
    echo json_encode(["success" => false, "message" => "User ID or email is required."]);
    exit;
}

if (!empty($user_id)) {
    $stmt = $conn->prepare("SELECT lc.*, ra.first_name, ra.last_name, ra.contact_no, ra.room_name, ra.monthly_rent, ra.created_at as app_created_at FROM rent_applications ra LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id WHERE ra.user_id = ? AND ra.status = 'Approved' ORDER BY ra.created_at DESC LIMIT 1");
    $stmt->bind_param("i", $user_id);
} else {
    $stmt = $conn->prepare("SELECT lc.*, ra.first_name, ra.last_name, ra.contact_no, ra.room_name, ra.monthly_rent, ra.created_at as app_created_at FROM rent_applications ra LEFT JOIN lease_contracts lc ON lc.rent_application_id = ra.id WHERE ra.email = ? AND ra.status = 'Approved' ORDER BY ra.created_at DESC LIMIT 1");
    $stmt->bind_param("s", $email);
}

$stmt->execute();
$res = $stmt->get_result();

if ($res && $res->num_rows > 0) {
    $row = $res->fetch_assoc();
    echo json_encode(["success" => true, "contract" => $row]);
} else {
    echo json_encode(["success" => false, "message" => "No approved contract found."]);
}

$stmt->close();
$conn->close();
?>
