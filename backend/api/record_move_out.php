<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");
require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method Not Allowed"]);
    exit;
}

$user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;
$input = json_decode(file_get_contents("php://input"), true);
if (empty($user_id)) {
    $user_id = $input['userId'] ?? null;
}
if (empty($user_id) && !empty($input['email'])) {
    $u_stmt = $conn->prepare("SELECT id FROM users WHERE email_address = ? LIMIT 1");
    $u_stmt->bind_param("s", $input['email']);
    $u_stmt->execute();
    $u_res = $u_stmt->get_result();
    if ($u_row = $u_res->fetch_assoc()) {
        $user_id = $u_row['id'];
    }
    $u_stmt->close();
}

if (empty($user_id)) {
    http_response_code(401);
    echo json_encode(["success" => false, "message" => "Authentication required."]);
    exit;
}

// Find the latest approved/active rent application for this user
$stmt = $conn->prepare("SELECT id, room_name FROM rent_applications WHERE user_id = ? AND status IN ('Approved', 'active', 'pending-move-out') ORDER BY created_at DESC LIMIT 1");
$stmt->bind_param("i", $user_id);
$stmt->execute();
$res = $stmt->get_result();

if ($res->num_rows === 0) {
    echo json_encode(["success" => false, "message" => "No active approved room application found."]);
    $stmt->close();
    $conn->close();
    exit;
}

$app = $res->fetch_assoc();
$app_id = $app['id'];
$room_name = $app['room_name'];
$stmt->close();

// Read and validate move-out date
$move_out_date = $input['move_out_date'] ?? null;
if (empty($move_out_date)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Move-out date is required."]);
    $conn->close();
    exit;
}

try {
    $today = new DateTime(date('Y-m-d'));
    $selected_date = new DateTime($move_out_date);
    $interval = $today->diff($selected_date);
    $days_diff = (int)$interval->format('%r%a');

    if ($days_diff < 15) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Prior notice of at least 15 days is required before your actual move-out."]);
        $conn->close();
        exit;
    }
    if ($days_diff > 30) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Move-out notice cannot exceed 30 days in advance."]);
        $conn->close();
        exit;
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Invalid date format."]);
    $conn->close();
    exit;
}

// Update status to 'pending-move-out' and record move-out date
$update_stmt = $conn->prepare("UPDATE rent_applications SET status = 'pending-move-out', requested_move_out_date = ? WHERE id = ?");
$update_stmt->bind_param("si", $move_out_date, $app_id);

if ($update_stmt->execute()) {
    log_activity($conn, null, 'tenant', "Requested Move Out", "Application ID: $app_id, Room: $room_name, Scheduled: $move_out_date, Requested by User ID: $user_id");
    echo json_encode(["success" => true, "message" => "Move-out request recorded successfully."]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to submit move-out request."]);
}


$update_stmt->close();
$conn->close();
?>
