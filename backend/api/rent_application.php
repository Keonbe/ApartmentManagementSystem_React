<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
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
$first_name = $_POST['firstName'] ?? '';
$last_name = $_POST['lastName'] ?? '';
$suffix = $_POST['suffix'] ?? '';
$contact_no = $_POST['contactNo'] ?? '';
$email = $_POST['email'] ?? '';
$gender = $_POST['gender'] ?? '';
$occupants = $_POST['occupants'] ?? '';
$months_of_rent = $_POST['monthsOfRent'] ?? '';
$room_name = $_POST['roomName'] ?? '';
$monthly_rent = $_POST['monthlyRent'] ?? '';

if (empty($first_name) || empty($last_name) || empty($contact_no) || empty($email) || empty($gender) || empty($occupants) || empty($months_of_rent)) {
    echo json_encode(["success" => false, "message" => "Please fill in all required personal details."]);
    exit;
}

$upload_dir = "../uploads/applications/"; 
if (!is_dir($upload_dir)) {
    mkdir($upload_dir, 0777, true);
}
function uploadFile($fileInputName, $upload_dir) {
    if (isset($_FILES[$fileInputName]) && $_FILES[$fileInputName]['error'] === UPLOAD_ERR_OK) {
        $file_name = basename($_FILES[$fileInputName]['name']);
        $file_tmp = $_FILES[$fileInputName]['tmp_name'];
        $unique_file_name = time() . "_" . uniqid() . "_" . preg_replace("/[^a-zA-Z0-9.]/", "_", $file_name);
        $destination = $upload_dir . $unique_file_name;
        
        if (move_uploaded_file($file_tmp, $destination)) {
            return $destination;
        }
    }
    return null;
}

$valid_id_path = uploadFile('validIdFile', $upload_dir);
$nbi_clearance_path = uploadFile('nbiFile', $upload_dir);

if (!$valid_id_path || !$nbi_clearance_path) {
    echo json_encode(["success" => false, "message" => "Both Valid ID and NBI Clearance documents are required."]);
    exit;
}

$stmt = $conn->prepare("INSERT INTO rent_applications (first_name, last_name, suffix, contact_no, email, gender, occupants, months_of_rent, room_name, monthly_rent, valid_id_path, nbi_clearance_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

$stmt->bind_param("ssssssiissss", $first_name, $last_name, $suffix, $contact_no, $email, $gender, $occupants, $months_of_rent, $room_name, $monthly_rent, $valid_id_path, $nbi_clearance_path);

if ($stmt->execute()) {
    echo json_encode(["success" => true, "message" => "Application submitted successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to submit application", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>