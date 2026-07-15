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

$issue_category = $_POST['issueType'] ?? '';
$urgency = $_POST['urgency'] ?? '';
$preferred_date = $_POST['preferredDate'] ?? '';
$preferred_time = $_POST['preferredTime'] ?? '';
$description = $_POST['description'] ?? '';
$user_id = $_POST['userId'] ?? null;
// Convert the string "1" or "0" back to an integer for the database
$permission_to_enter = isset($_POST['permissionToEnter']) ? (int)$_POST['permissionToEnter'] : 0;

if (empty($issue_category) || empty($urgency) || empty($preferred_date) || empty($preferred_time) || empty($description) || empty($user_id)) {
    echo json_encode(["success" => false, "message" => "Please fill in all required fields."]);
    exit;
}

$attachment_path = null;
if (isset($_FILES['uploadedFile']) && $_FILES['uploadedFile']['error'] === UPLOAD_ERR_OK) {
    
    $upload_dir = "../uploads/maintenance/"; 
    
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }

    $file_name = basename($_FILES['uploadedFile']['name']);
    $file_tmp = $_FILES['uploadedFile']['tmp_name'];
    
    $unique_file_name = time() . "_" . uniqid() . "_" . preg_replace("/[^a-zA-Z0-9.]/", "_", $file_name);
    $destination = $upload_dir . $unique_file_name;

    if (move_uploaded_file($file_tmp, $destination)) {
        $attachment_path = $destination;
    } else {
        echo json_encode(["success" => false, "message" => "Failed to save the attached file."]);
        exit;
    }
}

$stmt = $conn->prepare("INSERT INTO maintenance_requests (user_id, issue_category, urgency, preferred_date, preferred_time, description, permission_to_enter, attachment_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

$stmt->bind_param("isssssis", $user_id, $issue_category, $urgency, $preferred_date, $preferred_time, $description, $permission_to_enter, $attachment_path);

if ($stmt->execute()) {
    echo json_encode(["success" => true, "message" => "Maintenance request submitted successfully"]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to submit request", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>