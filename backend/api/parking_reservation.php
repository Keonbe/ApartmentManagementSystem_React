<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

$vehicle_type = $_POST['vehicleType'] ?? '';
$vehicle_model = $_POST['vehicleModel'] ?? '';
$plate_number = $_POST['plateNumber'] ?? '';
$transmission = $_POST['transmission'] ?? '';
$duration_months = $_POST['durationMonths'] ?? '';
$user_id = $_POST['userId'] ?? null;

if (empty($vehicle_type) || empty($vehicle_model) || empty($plate_number) || empty($transmission) || empty($duration_months) || empty($user_id)) {
    echo json_encode(["success" => false, "message" => "All fields are required."]);
    exit;
}

$base_price = 300;
$total_cost = intval($duration_months) * $base_price;

$document_path = null;
if (isset($_FILES['uploadedFile']) && $_FILES['uploadedFile']['error'] === UPLOAD_ERR_OK) {

    // Set your upload directory. Make sure this folder exists and has write permissions!
    $upload_dir = "../uploads/documents/";

    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }

    $file_name = basename($_FILES['uploadedFile']['name']);
    $file_tmp = $_FILES['uploadedFile']['tmp_name'];

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

$stmt = $conn->prepare("INSERT INTO parking_reservations (user_id, vehicle_type, vehicle_model, plate_number, transmission, duration_months, total_cost, document_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

$stmt->bind_param("issssids", $user_id, $vehicle_type, $vehicle_model, $plate_number, $transmission, $duration_months, $total_cost, $document_path);

if ($stmt->execute()) {
    echo json_encode(["success" => true, "message" => "Reservation created successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to create reservation", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
