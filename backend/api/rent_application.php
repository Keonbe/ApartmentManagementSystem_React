<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
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
$first_name = $_POST['firstName'] ?? '';
$middle_name = $_POST['middleName'] ?? '';
$last_name = $_POST['lastName'] ?? '';
$suffix = $_POST['suffix'] ?? '';
$contact_no = $_POST['contactNo'] ?? '';
$email = $_POST['email'] ?? '';
$gender = $_POST['gender'] ?? '';
$occupants = $_POST['occupants'] ?? '';
$months_of_rent = $_POST['monthsOfRent'] ?? '';
$room_name = $_POST['roomName'] ?? '';
$monthly_rent = $_POST['monthlyRent'] ?? '';
$user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;

if (empty($first_name) || empty($last_name) || empty($contact_no) || empty($email) || empty($gender) || empty($occupants) || empty($months_of_rent)) {
    echo json_encode(["success" => false, "message" => "Please fill in all required personal details."]);
    exit;
}

// Backend File Validation
$required_files = ['validIdFrontFile', 'validIdBackFile', 'nbiFile'];
$allowed_extensions = ['jpg', 'jpeg', 'png', 'pdf'];
$allowed_mime_types = ['image/jpeg', 'image/png', 'application/pdf'];
$max_size = 10 * 1024 * 1024; // 10MB

foreach ($required_files as $fileKey) {
    if (!isset($_FILES[$fileKey]) || $_FILES[$fileKey]['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(["success" => false, "message" => "Missing or failed upload for required file: " . $fileKey]);
        exit;
    }
    
    $file_size = $_FILES[$fileKey]['size'];
    $file_name = $_FILES[$fileKey]['name'];
    $file_tmp = $_FILES[$fileKey]['tmp_name'];
    
    // Check size limit
    if ($file_size > $max_size) {
        echo json_encode(["success" => false, "message" => "File '" . htmlspecialchars($file_name) . "' exceeds the 10MB size limit."]);
        exit;
    }
    
    // Check extension
    $ext = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed_extensions)) {
        echo json_encode(["success" => false, "message" => "Invalid extension for file '" . htmlspecialchars($file_name) . "'. Only JPEG, PNG, and PDF are allowed."]);
        exit;
    }
    
    // Check MIME type
    $mime = $_FILES[$fileKey]['type'];
    if (function_exists('mime_content_type')) {
        $mime = mime_content_type($file_tmp);
    }
    if (!in_array($mime, $allowed_mime_types)) {
        echo json_encode(["success" => false, "message" => "Invalid file format for '" . htmlspecialchars($file_name) . "'. Only JPEG, PNG, and PDF are allowed."]);
        exit;
    }
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

$valid_id_front_path = uploadFile('validIdFrontFile', $upload_dir);
$valid_id_back_path = uploadFile('validIdBackFile', $upload_dir);
$nbi_clearance_path = uploadFile('nbiFile', $upload_dir);

if (!$valid_id_front_path || !$valid_id_back_path || !$nbi_clearance_path) {
    echo json_encode(["success" => false, "message" => "Valid ID (Front & Back) and NBI Clearance documents are all required."]);
    exit;
}

$conn->begin_transaction();
try {
    // 1. Insert rent application
    $stmt = $conn->prepare("INSERT INTO rent_applications (user_id, first_name, middle_name, last_name, suffix, contact_no, email, gender, occupants, months_of_rent, room_name, monthly_rent, valid_id_front_path, valid_id_back_path, nbi_clearance_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("isssssssiisssss", $user_id, $first_name, $middle_name, $last_name, $suffix, $contact_no, $email, $gender, $occupants, $months_of_rent, $room_name, $monthly_rent, $valid_id_front_path, $valid_id_back_path, $nbi_clearance_path);
    $stmt->execute();
    $stmt->close();

    // 2. Sync profile details to the users table
    if ($user_id > 0) {
        $user_stmt = $conn->prepare("UPDATE users SET middle_name = ?, suffix = ?, contact_no = ?, gender = ? WHERE id = ?");
        $user_stmt->bind_param("ssssi", $middle_name, $suffix, $contact_no, $gender, $user_id);
        $user_stmt->execute();
        $user_stmt->close();
    }

    $conn->commit();
    echo json_encode(["success" => true, "message" => "Application submitted successfully"]);
} catch (Exception $e) {
    $conn->rollback();
    echo json_encode(["success" => false, "message" => "Failed to submit application", "error" => $e->getMessage()]);
}

$conn->close();
?>