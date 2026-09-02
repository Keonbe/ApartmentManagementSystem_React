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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

$vehicle_type = trim($_POST['vehicleType'] ?? '');
$vehicle_model = trim($_POST['vehicleModel'] ?? '');
$plate_number = strtoupper(trim($_POST['plateNumber'] ?? ''));
$transmission = trim($_POST['transmission'] ?? '');
$duration_months = trim($_POST['durationMonths'] ?? '');
$user_id = $_POST['userId'] ?? $_SERVER['HTTP_X_USER_ID'] ?? null;

if (empty($vehicle_type) || empty($vehicle_model) || empty($plate_number) || empty($transmission) || empty($duration_months) || empty($user_id)) {
    echo json_encode(["success" => false, "message" => "All fields are required."]);
    exit;
}

// ── Plate Number Validation (F-2) ──
if (!preg_match('/^[A-Z0-9\s\-]{3,10}$/', $plate_number)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Invalid plate number. Must be 3-10 alphanumeric characters (e.g. ABC 1234)."]);
    exit;
}

$base_price = 300;
$total_cost = intval($duration_months) * $base_price;

$document_path = null;
if (isset($_FILES['uploadedFile']) && $_FILES['uploadedFile']['error'] === UPLOAD_ERR_OK) {
    $file_name = basename($_FILES['uploadedFile']['name']);
    $file_tmp = $_FILES['uploadedFile']['tmp_name'];
    $file_ext = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));

    $allowed_extensions = ['jpg', 'jpeg', 'png', 'pdf'];
    if (!in_array($file_ext, $allowed_extensions)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Invalid document format. Allowed formats: JPG, PNG, PDF."]);
        exit;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file_tmp);
    finfo_close($finfo);

    $allowed_mimes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!in_array($mime, $allowed_mimes)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "File content does not match allowed Image or PDF format."]);
        exit;
    }

    $upload_dir = "../uploads/documents/";
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }

    $unique_file_name = time() . "_" . uniqid() . "_" . preg_replace("/[^a-zA-Z0-9.]/", "_", $file_name);
    $destination = $upload_dir . $unique_file_name;

    if (move_uploaded_file($file_tmp, $destination)) {
        $document_path = $destination;
    } else {
        echo json_encode(["success" => false, "message" => "Failed to save the uploaded document."]);
        exit;
    }
} else {
    echo json_encode(["success" => false, "message" => "Vehicle registration document is required."]);
    exit;
}

$status = 'Pending';
$stmt = $conn->prepare("INSERT INTO parking_reservations (user_id, vehicle_type, vehicle_model, plate_number, status, transmission, duration_months, total_cost, document_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");

$stmt->bind_param("isssssids", $user_id, $vehicle_type, $vehicle_model, $plate_number, $status, $transmission, $duration_months, $total_cost, $document_path);

if ($stmt->execute()) {
    // Notify Admin
    $notif_title = "New Parking Reservation";
    $notif_msg = "A new parking reservation request for plate $plate_number has been submitted.";
    $notif_stmt = $conn->prepare("INSERT INTO notifications (user_id, type, title, message, status, is_read) VALUES (?, 'parking_reservation', ?, ?, 'Pending', 0)");
    $notif_stmt->bind_param("iss", $user_id, $notif_title, $notif_msg);
    $notif_stmt->execute();
    $notif_stmt->close();

    echo json_encode(["success" => true, "message" => "Reservation created successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to create reservation", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
