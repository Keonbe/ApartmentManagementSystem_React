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

// ─── 1. FETCH PROFILE RECORDS (GET) ───
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $email = $_GET['email'] ?? '';

    if (empty($email)) {
        echo json_encode(["success" => false, "message" => "Email is required"]);
        exit;
    }

    $stmt = $conn->prepare("SELECT first_name, middle_name, last_name, suffix, contact_no, gender, avatar_url FROM users WHERE email_address = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows > 0) {
        $user_data = $result->fetch_assoc();
        echo json_encode(["success" => true, "data" => $user_data]);
    } else {
        echo json_encode(["success" => false, "message" => "User not found"]);
    }

    $stmt->close();
    $conn->close();
    exit;
}

// ─── 2. AVATAR MULTIPART FILE UPLOAD (POST with $_FILES) ───
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['avatar'])) {
    $old_email = $_POST['oldEmail'] ?? '';
    
    if (empty($old_email)) {
        echo json_encode(["success" => false, "message" => "Email identifier required for file routing"]);
        exit;
    }
    
    $base_path = dirname(__DIR__); 
    $upload_dir = $base_path . "/uploads/avatars/";
    
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }
    
    $file_extension = strtolower(pathinfo($_FILES['avatar']['name'], PATHINFO_EXTENSION));
    
    $allowed_extensions = ['jpg', 'jpeg', 'png', 'gif'];
    if (!in_array($file_extension, $allowed_extensions)) {
        echo json_encode(["success" => false, "message" => "Invalid extension. Image formats allowed: JPG, PNG, GIF"]);
        exit;
    }

    $file_name = time() . "_" . uniqid() . "." . $file_extension;
    $server_path = $upload_dir . $file_name;
    
    $relative_path = "uploads/avatars/" . $file_name;
    
    if (move_uploaded_file($_FILES['avatar']['tmp_name'], $server_path)) {
        $stmt = $conn->prepare("UPDATE users SET avatar_url = ? WHERE email_address = ?");
        $stmt->bind_param("ss", $relative_path, $old_email);
        
        if ($stmt->execute()) {
            echo json_encode([
                "success" => true, 
                "message" => "Avatar updated successfully", 
                "avatar_url" => $relative_path
            ]);
        } else {
            echo json_encode(["success" => false, "message" => "Failed to update avatar file registry entry"]);
        }
        $stmt->close();
    } else {
        echo json_encode(["success" => false, "message" => "Failed to move file to backend asset directories"]);
    }
    
    $conn->close();
    exit;
}

// ─── 3. TEXT UPDATES & AVATAR CLEARING (POST with JSON Payload) ───
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);
    
    // Normalize data inputs from either JSON payloads or raw fallback Form data
    $old_email = $input['oldEmail'] ?? $_POST['oldEmail'] ?? '';
    $clear_avatar = $input['clearAvatar'] ?? false;

    // INTERCEPT LOGIC: Handle the delete avatar signal before updating other details
    if ($clear_avatar && !empty($old_email)) {
        $stmt = $conn->prepare("UPDATE users SET avatar_url = '' WHERE email_address = ?");
        $stmt->bind_param("s", $old_email);
        
        if ($stmt->execute()) {
            echo json_encode(["success" => true, "message" => "Avatar path removed successfully"]);
        } else {
            echo json_encode(["success" => false, "message" => "Failed to clear avatar from database layout row"]);
        }
        $stmt->close();
        $conn->close();
        exit;
    }

    // Standard profile text updates processing context
    $new_email = $input['email'] ?? $_POST['email'] ?? '';
    $first_name = $input['firstName'] ?? $_POST['firstName'] ?? '';
    $middle_name = $input['middleName'] ?? $_POST['middleName'] ?? '';
    $last_name = $input['lastName'] ?? $_POST['lastName'] ?? '';
    $suffix = $input['suffix'] ?? $_POST['suffix'] ?? '';
    $contact_no = $input['contactNo'] ?? $_POST['contactNo'] ?? '';
    $gender = $input['gender'] ?? $_POST['gender'] ?? '';

    if (empty($old_email) || empty($new_email) || empty($first_name) || empty($last_name)) {
        echo json_encode(["success" => false, "message" => "Required profile detail text inputs are missing"]);
        exit;
    }

    $conn->begin_transaction();
    try {
        $stmt1 = $conn->prepare("UPDATE users SET first_name = ?, middle_name = ?, last_name = ?, suffix = ?, contact_no = ?, gender = ?, email_address = ? WHERE email_address = ?");
        $stmt1->bind_param("ssssssss", $first_name, $middle_name, $last_name, $suffix, $contact_no, $gender, $new_email, $old_email);
        $stmt1->execute();
        $stmt1->close();

        $stmt2 = $conn->prepare("UPDATE rent_applications SET first_name = ?, last_name = ?, suffix = ?, contact_no = ?, email = ? WHERE email = ?");
        $stmt2->bind_param("ssssss", $first_name, $last_name, $suffix, $contact_no, $new_email, $old_email);
        $stmt2->execute();
        $stmt2->close();

        $conn->commit();
        echo json_encode(["success" => true, "message" => "Profile text values stored successfully"]);
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => "Database processing failure during sync", "error" => $e->getMessage()]);
    }

    $conn->close();
    exit;
}

echo json_encode(["success" => false, "message" => "Invalid processing routing protocol requested"]);
?>