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

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $email = $_GET['email'] ?? '';

    if (empty($email)) {
        echo json_encode(["success" => false, "message" => "Email is required"]);
        exit;
    }

    $stmt = $conn->prepare("SELECT first_name, middle_name, last_name, suffix, contact_no, gender FROM users WHERE email_address = ?");
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

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);

    $old_email = $input['oldEmail'] ?? '';
    $new_email = $input['email'] ?? '';
    $first_name = $input['firstName'] ?? '';
    $middle_name = $input['middleName'] ?? '';
    $last_name = $input['lastName'] ?? '';
    $suffix = $input['suffix'] ?? '';
    $contact_no = $input['contactNo'] ?? '';
    $gender = $input['gender'] ?? '';

    if (empty($old_email) || empty($new_email) || empty($first_name) || empty($last_name)) {
        echo json_encode(["success" => false, "message" => "Required fields missing"]);
        exit;
    }

    $conn->begin_transaction();

    try {
        $stmt1 = $conn->prepare("UPDATE users SET first_name = ?, middle_name = ?, last_name = ?, suffix = ?, contact_no = ?, gender = ?, email_address = ? WHERE email_address = ?");
        $stmt1->bind_param("ssssssss", $first_name, $middle_name, $last_name, $suffix, $contact_no, $gender, $new_email, $old_email);
        $stmt1->execute();

        $stmt2 = $conn->prepare("UPDATE rent_applications SET first_name = ?, last_name = ?, suffix = ?, contact_no = ?, email = ? WHERE email = ?");
        $stmt2->bind_param("ssssss", $first_name, $last_name, $suffix, $contact_no, $new_email, $old_email);
        $stmt2->execute();

        $conn->commit();
        echo json_encode(["success" => true, "message" => "Profile updated successfully"]);
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(["success" => false, "message" => "Failed to update profile", "error" => $e->getMessage()]);
    }

    $conn->close();
    exit;
}

echo json_encode(["success" => false, "message" => "Invalid request method"]);
?>