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
$is_asap = !empty($_POST['isAsap']) && $_POST['isAsap'] === '1';
$preferred_move_in_date = (!$is_asap && !empty($_POST['preferredMoveInDate']) && $_POST['preferredMoveInDate'] !== 'Any time')
    ? $_POST['preferredMoveInDate']
    : null;
$room_name = $_POST['roomName'] ?? '';
$monthly_rent = $_POST['monthlyRent'] ?? '';
// The applicant is the session user. This read X-User-Id directly, so a caller
// could submit — or, with appId, overwrite — an application as another user, and
// the profile sync below would then write onto that user's account.
$auth = require_user($conn);
if ($auth['role'] !== 'user') {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Rent applications are submitted from a tenant account."]);
    exit;
}
$user_id = $auth['id'];
$app_id = $_POST['appId'] ?? null;

// Occupants: the applicant plus their household, up to the configured maximum.
$max_occupants = max_occupants_per_unit($conn);
if (!ctype_digit((string)$occupants) || (int)$occupants < 1 || (int)$occupants > $max_occupants) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Occupants must be between 1 and $max_occupants."]);
    exit;
}
$agree_terms = filter_var($_POST['agreeTerms'] ?? false, FILTER_VALIDATE_BOOLEAN);

if (empty($app_id) && !empty($user_id)) {
    $dup_stmt = $conn->prepare("SELECT status FROM rent_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1");
    $dup_stmt->bind_param("i", $user_id);
    $dup_stmt->execute();
    $dup_res = $dup_stmt->get_result();
    if ($dup_res->num_rows > 0) {
        $dup_row = $dup_res->fetch_assoc();
        $st = strtolower($dup_row['status']);
        if ($st === 'pending review' || $st === 'approved' || $st === 'active' || $st === 'pending-move-out') {
            echo json_encode(["success" => false, "message" => "You already have an active or pending lease application. You cannot submit another one unless it is rejected."]);
            exit;
        }
    }
    $dup_stmt->close();
}

$existing_front = null;
$existing_back = null;
$existing_nbi = null;

if (!empty($app_id) && !empty($user_id)) {
    $check_stmt = $conn->prepare("SELECT valid_id_front_path, valid_id_back_path, nbi_clearance_path, status FROM rent_applications WHERE id = ? AND user_id = ?");
    $check_stmt->bind_param("ii", $app_id, $user_id);
    $check_stmt->execute();
    $res = $check_stmt->get_result();
    if ($res->num_rows > 0) {
        $row = $res->fetch_assoc();
        $existing_front = $row['valid_id_front_path'];
        $existing_back = $row['valid_id_back_path'];
        $existing_nbi = $row['nbi_clearance_path'];
        // Resubmission is only for an application the admin sent back. Any other
        // status (Pending Review, Approved, active, pending-move-out, moved-out) has
        // a live tenancy or an in-flight review riding on it — resetting it to
        // Pending Review here would silently drop that tenancy out of every
        // tenancy-aware query while the room stays occupied (H4).
        $app_status = strtolower($row['status']);
        if (!in_array($app_status, ['rejected', 'declined'], true)) {
            $check_stmt->close();
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "This application can no longer be resubmitted."]);
            exit;
        }
    } else {
        // An appId that isn't the caller's own is refused. Before, it fell through
        // to the INSERT branch — skipping the one-open-application check above.
        $check_stmt->close();
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "This application does not belong to your account."]);
        exit;
    }
    $check_stmt->close();
}

if (empty($first_name) || empty($last_name) || empty($contact_no) || empty($email) || empty($gender) || empty($occupants) || empty($months_of_rent)) {
    echo json_encode(["success" => false, "message" => "Please fill in all required personal details."]);
    exit;
}

// Stored normalized as +639XXXXXXXXX (the form has a fixed +63 prefix).
$contact_no = normalize_ph_mobile($contact_no);
if ($contact_no === null) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Contact number must be a Philippine mobile number (+63 9XX XXX XXXX)."]);
    exit;
}

if (!$agree_terms) {
    echo json_encode(["success" => false, "message" => "You must agree to the Terms & Conditions before submitting your application."]);
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
    
    // Check MIME type using server-side finfo_file (B-4)
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file_tmp);
    finfo_close($finfo);

    if (!in_array($mime, $allowed_mime_types)) {
        echo json_encode(["success" => false, "message" => "Invalid file format for '" . htmlspecialchars($file_name) . "'. Only JPEG, PNG, and PDF are allowed."]);
        exit;
    }
}

$upload_dir = "../uploads/applications/";
if (!is_dir($upload_dir)) {
    mkdir($upload_dir, 0755, true);
}
// Update the uploadFile function definition
function uploadFile($fileInputName, $upload_dir, $user_name_prefix) {
    if (isset($_FILES[$fileInputName]) && $_FILES[$fileInputName]['error'] === UPLOAD_ERR_OK) {
        $file_name = basename($_FILES[$fileInputName]['name']);
        $file_tmp = $_FILES[$fileInputName]['tmp_name'];
        $extension = pathinfo($file_name, PATHINFO_EXTENSION);

        // Random, non-guessable name — the filename used to embed the
        // applicant's name and a time-seeded uniqid(), which brute-forced
        // gov-ID/NBI files (H2/B-8).
        $unique_file_name = bin2hex(random_bytes(16)) . "." . $extension;
        $destination = $upload_dir . $unique_file_name;
        
        if (move_uploaded_file($file_tmp, $destination)) {
            return $destination;
        }
    }
    return null;
}

// Prepare the name string
$user_name_prefix = $first_name . "_" . $last_name;

$valid_id_front_path = uploadFile('validIdFrontFile', $upload_dir, $user_name_prefix);
$valid_id_back_path = uploadFile('validIdBackFile', $upload_dir, $user_name_prefix);
$nbi_clearance_path = uploadFile('nbiFile', $upload_dir, $user_name_prefix);

if (!$valid_id_front_path || !$valid_id_back_path || !$nbi_clearance_path) {
    echo json_encode(["success" => false, "message" => "Valid ID (Front & Back) and NBI Clearance documents are all required."]);
    exit;
}

// The client-supplied rent is a display value only; take the figure that
// actually governs billing from the room itself (H4).
$room_rent_stmt = $conn->prepare("SELECT monthly_rent FROM rooms WHERE id = ?");
$room_rent_stmt->bind_param("s", $room_name);
$room_rent_stmt->execute();
$room_rent_row = $room_rent_stmt->get_result()->fetch_assoc();
$room_rent_stmt->close();
if ($room_rent_row) {
    $monthly_rent = $room_rent_row['monthly_rent'];
}

$conn->begin_transaction();
try {
    if (!empty($app_id) && $existing_front) {
        // Update existing application and set status to 'Pending Review' and clear
        // rejection_reason. Restricted to Rejected/Declined applications above and
        // again here so a concurrent status change can't slip through (H4).
        $stmt = $conn->prepare("UPDATE rent_applications SET first_name = ?, middle_name = ?, last_name = ?, suffix = ?, contact_no = ?, email = ?, gender = ?, occupants = ?, months_of_rent = ?, preferred_move_in_date = ?, room_name = ?, monthly_rent = ?, valid_id_front_path = ?, valid_id_back_path = ?, nbi_clearance_path = ?, status = 'Pending Review', rejection_reason = NULL, terms_agreed_at = NOW() WHERE id = ? AND user_id = ? AND status IN ('Rejected', 'Declined')");
        $stmt->bind_param("sssssssiissssssii", $first_name, $middle_name, $last_name, $suffix, $contact_no, $email, $gender, $occupants, $months_of_rent, $preferred_move_in_date, $room_name, $monthly_rent, $valid_id_front_path, $valid_id_back_path, $nbi_clearance_path, $app_id, $user_id);
        $stmt->execute();
        if ($stmt->affected_rows === 0) {
            $stmt->close();
            $conn->rollback();
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "This application can no longer be resubmitted."]);
            $conn->close();
            exit;
        }
        $stmt->close();
    } else {
        // Insert new application
        $stmt = $conn->prepare("INSERT INTO rent_applications (user_id, first_name, middle_name, last_name, suffix, contact_no, email, gender, occupants, months_of_rent, preferred_move_in_date, room_name, monthly_rent, valid_id_front_path, valid_id_back_path, nbi_clearance_path, terms_agreed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
        $stmt->bind_param("isssssssiissssss", $user_id, $first_name, $middle_name, $last_name, $suffix, $contact_no, $email, $gender, $occupants, $months_of_rent, $preferred_move_in_date, $room_name, $monthly_rent, $valid_id_front_path, $valid_id_back_path, $nbi_clearance_path);
        $stmt->execute();
        $new_app_id = $stmt->insert_id;
        $stmt->close();
    }

    // 2. Sync profile details to the users table
    if ($user_id > 0) {
        $user_stmt = $conn->prepare("UPDATE users SET middle_name = ?, suffix = ?, contact_no = ?, gender = ? WHERE id = ?");
        $user_stmt->bind_param("ssssi", $middle_name, $suffix, $contact_no, $gender, $user_id);
        $user_stmt->execute();
        $user_stmt->close();
    }

    // 3. Notify Admin — one open queue row per application, so a resubmission
    // does not stack a second "review" item.
    $is_update = !empty($app_id) && $existing_front;
    $queue_app_id = $is_update ? (int)$app_id : (int)($new_app_id ?? 0);
    if ($queue_app_id) {
        resolve_admin_queue($conn, 'rent_application', $queue_app_id);
        notify_admins_queue($conn, 'rent_application', $queue_app_id,
            $is_update ? "Updated Rent Application" : "New Rent Application",
            "$first_name $last_name " . ($is_update ? "updated their" : "submitted a") . " rent application for Unit $room_name.");
    }

    $conn->commit();
    log_activity($conn, $user_id, 'tenant', $is_update ? "Resubmitted Rental Application" : "Submitted Rental Application",
        "Application ID: $queue_app_id, Unit: $room_name");
    echo json_encode(["success" => true, "message" => "Application submitted successfully"]);
} catch (Exception $e) {
    $conn->rollback();
    server_error_response($e, "Failed to submit application.");
}

$conn->close();
?>