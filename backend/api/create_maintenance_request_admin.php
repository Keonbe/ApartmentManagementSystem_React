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

$admin_id = $_SERVER['HTTP_X_ADMIN_ID'] ?? null;
if (!verify_admin($conn, $admin_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden"]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

$title = $_POST['title'] ?? '';
$issue_category = $_POST['issueType'] ?? '';
$priority = $_POST['priority'] ?? 'Medium';
$unit = $_POST['unit'] ?? '';
$tenant = $_POST['tenant'] ?? '';
$description = $_POST['description'] ?? '';

if (empty($title) || empty($issue_category)) {
    echo json_encode(["success" => false, "message" => "Title and Issue Type are required."]);
    exit;
}

// Optional: find user_id based on unit or tenant name if available
$user_id = null;
if (!empty($unit)) {
    $u_stmt = $conn->prepare("
        SELECT ra.user_id 
        FROM rent_applications ra 
        WHERE ra.room_name = ? AND ra.status = 'Approved' 
        LIMIT 1
    ");
    $u_stmt->bind_param("s", $unit);
    $u_stmt->execute();
    $u_res = $u_stmt->get_result();
    if ($row = $u_res->fetch_assoc()) {
        $user_id = (int)$row['user_id'];
    }
    $u_stmt->close();
}

$preferred_date = date('Y-m-d');
$preferred_time = 'morning';
$full_desc = trim(($title ? "[$title] " : "") . $description);
$attachment_path = null;

// Handle file upload
if (isset($_FILES['photo']) && $_FILES['photo']['error'] !== UPLOAD_ERR_NO_FILE) {
    if ($_FILES['photo']['error'] === UPLOAD_ERR_OK) {
        $file_name = basename($_FILES['photo']['name']);
        $file_tmp = $_FILES['photo']['tmp_name'];
        $file_ext = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));

        $allowed_extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov'];
        if (in_array($file_ext, $allowed_extensions)) {
            $upload_dir = "../uploads/maintenance/";
            if (!is_dir($upload_dir)) {
                mkdir($upload_dir, 0777, true);
            }
            $safe_file_name = preg_replace("/[^a-zA-Z0-9.]/", "_", $file_name);
            $unique_file_name = time() . "_" . uniqid() . "_" . $safe_file_name;
            $destination = $upload_dir . $unique_file_name;

            if (move_uploaded_file($file_tmp, $destination)) {
                $attachment_path = "uploads/maintenance/" . $unique_file_name;
            }
        }
    }
}

$stmt = $conn->prepare("
    INSERT INTO maintenance_requests 
    (user_id, issue_category, urgency, preferred_date, preferred_time, description, permission_to_enter, attachment_path, status) 
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'Pending')
");
$stmt->bind_param("issssss", $user_id, $issue_category, $priority, $preferred_date, $preferred_time, $full_desc, $attachment_path);

if ($stmt->execute()) {
    $inserted_id = $conn->insert_id;
    log_activity($conn, $admin_id, 'maintenance', "Created Maintenance Ticket #$inserted_id", "Issue: $issue_category, Unit: $unit");
    echo json_encode([
        "success" => true,
        "message" => "Maintenance request created successfully",
        "id" => $inserted_id,
        "attachment_path" => $attachment_path
    ]);
} else {
    echo json_encode(["success" => false, "message" => "Failed to create request", "error" => $stmt->error]);
}

$stmt->close();
$conn->close();
?>
