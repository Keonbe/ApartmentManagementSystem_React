<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ─── 1. FETCH PROFILE RECORDS (GET) ───
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // A profile is always fetched for the caller's own verified session —
    // an ?email= query string is no longer trusted as identity.
    $auth = require_user($conn);

    $stmt = $conn->prepare("SELECT first_name, middle_name, last_name, suffix, contact_no, gender, avatar_url FROM users WHERE id = ?");
    $stmt->bind_param("i", $auth['id']);
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
    // The uploaded avatar always belongs to the caller's own verified
    // session — the old "oldEmail" body field is no longer trusted for
    // routing, since it let anyone overwrite anyone else's avatar.
    $auth = require_user($conn);

    $base_path = dirname(__DIR__);
    $upload_dir = $base_path . "/uploads/avatars/";
    
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0755, true);
    }
    
    $file_extension = strtolower(pathinfo($_FILES['avatar']['name'], PATHINFO_EXTENSION));
    
    $allowed_extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (!in_array($file_extension, $allowed_extensions)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Invalid extension. Image formats allowed: JPG, PNG, GIF, WEBP"]);
        exit;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $_FILES['avatar']['tmp_name']);
    finfo_close($finfo);

    $allowed_mimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!in_array($mime, $allowed_mimes)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Invalid image file format."]);
        exit;
    }

    $file_name = time() . "_" . bin2hex(random_bytes(16)) . "." . $file_extension;
    $server_path = $upload_dir . $file_name;
    
    $relative_path = "uploads/avatars/" . $file_name;
    
    if (move_uploaded_file($_FILES['avatar']['tmp_name'], $server_path)) {
        $stmt = $conn->prepare("UPDATE users SET avatar_url = ? WHERE id = ?");
        $stmt->bind_param("si", $relative_path, $auth['id']);
        
        if ($stmt->execute()) {
            log_activity($conn, $auth['id'], 'user', 'Updated Profile Photo', "User #{$auth['id']} uploaded a new profile photo");
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
    // Every write in this branch targets the caller's own account — this
    // used to be keyed on a client-supplied "oldEmail" with no re-auth,
    // which allowed reassigning any account's login email to an attacker's
    // address (an account-takeover primitive). The authenticated session's
    // own id is now the only thing that can ever be updated.
    $auth = require_user($conn);

    $input = json_decode(file_get_contents("php://input"), true);
    $clear_avatar = $input['clearAvatar'] ?? false;

    // INTERCEPT LOGIC: Handle the delete avatar signal before updating other details
    if ($clear_avatar) {
        $stmt = $conn->prepare("UPDATE users SET avatar_url = '' WHERE id = ?");
        $stmt->bind_param("i", $auth['id']);

        if ($stmt->execute()) {
            log_activity($conn, $auth['id'], 'user', 'Removed Profile Photo', "User #{$auth['id']} removed their profile photo");
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

    if (empty($new_email) || empty($first_name) || empty($last_name)) {
        echo json_encode(["success" => false, "message" => "Required profile detail text inputs are missing"]);
        exit;
    }

    if (!filter_var($new_email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Please enter a valid email address."]);
        exit;
    }

    // email_address is UNIQUE. Without this check a taken address made the UPDATE
    // fail silently (mysqli does not throw here), yet the response still said
    // the profile was saved.
    $dup = $conn->prepare("SELECT 1 FROM users WHERE email_address = ? AND id <> ?");
    $dup->bind_param("si", $new_email, $auth['id']);
    $dup->execute();
    $taken = (bool)$dup->get_result()->fetch_assoc();
    $dup->close();
    if ($taken) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "That email address is already used by another account."]);
        exit;
    }

    // ── Contact Number Validation (F-1) ──
    if (!empty($contact_no)) {
        $clean_contact = preg_replace('/[\s\-]/', '', $contact_no);
        if (!preg_match('/^(\+63|0)?9\d{9}$/', $clean_contact)) {
            http_response_code(422);
            echo json_encode(["success" => false, "message" => "Invalid Philippine mobile contact format (e.g. +63 912 345 6789 or 09123456789)."]);
            exit;
        }
    }

    // Which fields change, for the audit log — names only, never the values.
    $before_stmt = $conn->prepare("SELECT first_name, middle_name, last_name, suffix, contact_no, gender, email_address FROM users WHERE id = ?");
    $before_stmt->bind_param("i", $auth['id']);
    $before_stmt->execute();
    $before = $before_stmt->get_result()->fetch_assoc() ?: [];
    $before_stmt->close();
    $after = ['first_name' => $first_name, 'middle_name' => $middle_name, 'last_name' => $last_name, 'suffix' => $suffix,
              'contact_no' => $contact_no, 'gender' => $gender, 'email_address' => $new_email];
    $changed_fields = array_keys(array_filter($after, fn($v, $k) => (string)($before[$k] ?? '') !== (string)$v, ARRAY_FILTER_USE_BOTH));

    $conn->begin_transaction();
    try {
        $stmt1 = $conn->prepare("UPDATE users SET first_name = ?, middle_name = ?, last_name = ?, suffix = ?, contact_no = ?, gender = ?, email_address = ? WHERE id = ?");
        $stmt1->bind_param("sssssssi", $first_name, $middle_name, $last_name, $suffix, $contact_no, $gender, $new_email, $auth['id']);
        $stmt1->execute();
        $stmt1->close();

        $stmt2 = $conn->prepare("UPDATE rent_applications SET first_name = ?, last_name = ?, suffix = ?, contact_no = ?, email = ? WHERE user_id = ?");
        $stmt2->bind_param("sssssi", $first_name, $last_name, $suffix, $contact_no, $new_email, $auth['id']);
        $stmt2->execute();
        $stmt2->close();

        $conn->commit();
        if ($changed_fields) {
            log_activity($conn, $auth['id'], 'user', 'Updated Profile', "Changed: " . implode(', ', $changed_fields));
        }
        echo json_encode(["success" => true, "message" => "Profile text values stored successfully"]);
    } catch (Exception $e) {
        $conn->rollback();
        server_error_response($e, "Failed to save your profile.");
    }

    $conn->close();
    exit;
}

echo json_encode(["success" => false, "message" => "Invalid processing routing protocol requested"]);
?>