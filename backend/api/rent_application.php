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

function application_fail($code, $message, $field = null) {
    http_response_code($code);
    $body = ["success" => false, "message" => $message];
    if ($field) $body['field'] = $field;
    echo json_encode($body);
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
$previous_address = trim((string)($_POST['previousAddress'] ?? ''));
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
if ($app_id !== null && $app_id !== '' && !ctype_digit((string)$app_id)) {
    application_fail(422, "Invalid application id.");
}
$app_id = empty($app_id) ? null : (int)$app_id;

// Occupants: the applicant plus their household, up to the configured maximum.
$max_occupants = max_occupants_per_unit($conn);
if (!ctype_digit((string)$occupants) || (int)$occupants < 1 || (int)$occupants > $max_occupants) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Occupants must be between 1 and $max_occupants."]);
    exit;
}
$agree_terms = filter_var($_POST['agreeTerms'] ?? false, FILTER_VALIDATE_BOOLEAN);

if ($app_id === null && !empty($user_id)) {
    $dup_stmt = $conn->prepare("SELECT status FROM rent_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1");
    $dup_stmt->bind_param("i", $user_id);
    $dup_stmt->execute();
    $dup_res = $dup_stmt->get_result();
    if ($dup_res->num_rows > 0) {
        $dup_row = $dup_res->fetch_assoc();
        $st = strtolower($dup_row['status']);
        if ($st === 'pending review' || $st === 'approved' || $st === 'active' || $st === 'pending-move-out') {
            echo json_encode(["success" => false, "message" => "You already have an active or pending rent application. You cannot submit another one unless it is rejected."]);
            exit;
        }
    }
    $dup_stmt->close();
}

if ($app_id !== null) {
    $check_stmt = $conn->prepare("SELECT status FROM rent_applications WHERE id = ? AND user_id = ?");
    $check_stmt->bind_param("ii", $app_id, $user_id);
    $check_stmt->execute();
    $res = $check_stmt->get_result();
    if ($res->num_rows > 0) {
        $row = $res->fetch_assoc();
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
$is_update = $app_id !== null;

if (empty($first_name) || empty($last_name) || empty($contact_no) || empty($email) || empty($gender) || empty($occupants) || empty($months_of_rent)) {
    echo json_encode(["success" => false, "message" => "Please fill in all required personal details."]);
    exit;
}

// The rent term follows the admin's Minimum Rent Duration setting; 24 matches
// the form's MAX_MONTHS.
$min_months = max(1, (int)get_setting($conn, 'min_lease_duration', 3));
if (!ctype_digit((string)$months_of_rent) || (int)$months_of_rent < $min_months || (int)$months_of_rent > 24) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Months of rent must be between $min_months and 24."]);
    exit;
}
$months_of_rent = (int)$months_of_rent;

// The unit must be vacant, or occupied but freeing up (Preview's "Coming
// Soon"). This was only checked in the browser. A resubmission keeps its unit
// as before; it still may not move in before the unit is free.
[$available_from, $room_error] = room_open_for_application($conn, (string)$room_name);
if ($room_error !== null && !$is_update) application_fail(409, $room_error, 'roomName');

// For a unit that is still occupied, "ASAP" means the day it is free.
if ($available_from !== null && $preferred_move_in_date === null) $preferred_move_in_date = $available_from;

// "ASAP" sends no date; a chosen one must be today or later (and not years out),
// and not before an occupied unit is free.
if ($preferred_move_in_date !== null && ($date_error = move_in_date_error($conn, $preferred_move_in_date, $available_from)) !== '') {
    application_fail(422, $date_error, 'preferredMoveInDate');
}

// Stored normalized as +639XXXXXXXXX (the form has a fixed +63 prefix).
$contact_no = normalize_ph_mobile($contact_no);
if ($contact_no === null) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Contact number must be a Philippine mobile number (+63 9XX XXX XXXX)."]);
    exit;
}

// Where the applicant lived before (asked at the manager interview, Q5).
$address_len = mb_strlen($previous_address);
if ($address_len < 5 || $address_len > 255) {
    application_fail(422, $address_len === 0 ? "Please enter your previous address." : "Previous address must be 5 to 255 characters.", 'previousAddress');
}
if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]|<\s*script/i', $previous_address)) {
    application_fail(422, "Previous address contains characters that are not allowed.", 'previousAddress');
}

if (!$agree_terms) {
    echo json_encode(["success" => false, "message" => "You must agree to the Terms & Conditions before submitting your application."]);
    exit;
}

// Documents: one upload per active requirement (Settings → Application
// Requirements), sent as doc_<requirement id>. Keys for unknown or inactive
// requirements are ignored, never stored. On a resubmission a requirement
// already on file keeps its file unless a new one is sent.
$requirements = application_requirements_list($conn);
$on_file = [];
if ($is_update) {
    foreach (application_documents_by_app($conn, [$app_id])[$app_id] ?? [] as $doc) {
        if ($doc['requirement_id'] !== null && !in_array($doc['file_path'], ['', 'placeholder'], true)) $on_file[$doc['requirement_id']] = $doc;
    }
}

$allowed_extensions = ['jpg', 'jpeg', 'png', 'pdf'];
$allowed_mime_types = ['image/jpeg', 'image/png', 'application/pdf'];
$max_size = 10 * 1024 * 1024; // 10MB

$uploads = []; // requirement id => ['tmp' =>, 'ext' =>, 'label' =>]
foreach ($requirements as $req) {
    $key = 'doc_' . $req['id'];
    $label = $req['label'];
    $file = $_FILES[$key] ?? null;
    if ($file !== null && is_array($file['name'])) {
        application_fail(422, "Upload one file for \"$label\".", $key);
    }
    if ($file === null || $file['error'] === UPLOAD_ERR_NO_FILE) {
        if ($req['is_required'] && !isset($on_file[$req['id']])) {
            application_fail(422, "Please upload your $label.", $key);
        }
        continue;
    }
    if ($file['error'] !== UPLOAD_ERR_OK) {
        application_fail(422, in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
            ? "\"$label\" exceeds the 10MB size limit." : "The upload of \"$label\" failed. Please try again.", $key);
    }
    if ($file['size'] > $max_size) {
        application_fail(422, "\"$label\" exceeds the 10MB size limit.", $key);
    }
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed_extensions, true)) {
        application_fail(422, "\"$label\" must be a JPEG, PNG or PDF file.", $key);
    }
    // Server-side content check, not the browser's claimed type (B-4).
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    if (!in_array($mime, $allowed_mime_types, true)) {
        application_fail(422, "\"$label\" must be a JPEG, PNG or PDF file.", $key);
    }
    $uploads[$req['id']] = ['tmp' => $file['tmp_name'], 'ext' => $ext, 'label' => $label];
}

// The client-supplied rent is a display value only; take the figure that
// actually governs billing from the room itself (H4).
$room_rent_stmt = $conn->prepare("SELECT monthly_rent FROM rooms WHERE id = ? AND archived_at IS NULL");
$room_rent_stmt->bind_param("s", $room_name);
$room_rent_stmt->execute();
$room_rent_row = $room_rent_stmt->get_result()->fetch_assoc();
$room_rent_stmt->close();
if ($room_rent_row) {
    $monthly_rent = $room_rent_row['monthly_rent'];
} else {
    http_response_code(409);
    echo json_encode(["success" => false, "message" => "This unit is no longer available for applications."]);
    exit;
}

$upload_dir = "../uploads/applications/";
if (!is_dir($upload_dir)) {
    mkdir($upload_dir, 0755, true);
}

// Files are moved before the database write; if that write fails they are
// removed again so nothing is left on disk without a row pointing at it.
$moved = []; // requirement id => stored path
$discard_moved = function () use (&$moved) {
    foreach ($moved as $path) if (is_file($path)) @unlink($path);
    $moved = [];
};
foreach ($uploads as $req_id => $u) {
    // Random, non-guessable name — the filename used to embed the
    // applicant's name and a time-seeded uniqid(), which brute-forced
    // gov-ID files (H2/B-8).
    $destination = $upload_dir . bin2hex(random_bytes(16)) . "." . $u['ext'];
    if (!move_uploaded_file($u['tmp'], $destination)) {
        $discard_moved();
        application_fail(500, "Could not save \"{$u['label']}\". Please try again.");
    }
    $moved[$req_id] = $destination;
}

$replaced_files = []; // files of a resubmission that new uploads replace
$conn->begin_transaction();
try {
    if ($is_update) {
        // Update existing application and set status to 'Pending Review' and clear
        // rejection_reason. Restricted to Rejected/Declined applications above and
        // again here so a concurrent status change can't slip through (H4).
        $stmt = $conn->prepare("UPDATE rent_applications SET first_name = ?, middle_name = ?, last_name = ?, suffix = ?, contact_no = ?, email = ?, gender = ?, previous_address = ?, occupants = ?, months_of_rent = ?, preferred_move_in_date = ?, room_name = ?, monthly_rent = ?, status = 'Pending Review', rejection_reason = NULL, terms_agreed_at = NOW() WHERE id = ? AND user_id = ? AND status IN ('Rejected', 'Declined')");
        $stmt->bind_param("ssssssssiisssii", $first_name, $middle_name, $last_name, $suffix, $contact_no, $email, $gender, $previous_address, $occupants, $months_of_rent, $preferred_move_in_date, $room_name, $monthly_rent, $app_id, $user_id);
        if (!$stmt->execute()) throw new Exception("Application update failed: " . $stmt->error);
        if ($stmt->affected_rows === 0) {
            $stmt->close();
            $conn->rollback();
            $discard_moved();
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "This application can no longer be resubmitted."]);
            $conn->close();
            exit;
        }
        $stmt->close();
        $doc_app_id = $app_id;
    } else {
        // Insert new application. The legacy valid_id_*/nbi columns stay NULL;
        // the files go to application_documents below.
        $stmt = $conn->prepare("INSERT INTO rent_applications (user_id, first_name, middle_name, last_name, suffix, contact_no, email, gender, previous_address, occupants, months_of_rent, preferred_move_in_date, room_name, monthly_rent, terms_agreed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
        $stmt->bind_param("issssssssiisss", $user_id, $first_name, $middle_name, $last_name, $suffix, $contact_no, $email, $gender, $previous_address, $occupants, $months_of_rent, $preferred_move_in_date, $room_name, $monthly_rent);
        if (!$stmt->execute()) throw new Exception("Application insert failed: " . $stmt->error);
        $new_app_id = $stmt->insert_id;
        $stmt->close();
        $doc_app_id = (int)$new_app_id;
    }

    // One row per application and requirement; a resubmitted file replaces the
    // earlier one, a requirement with no new file keeps what is on file.
    if ($moved) {
        $doc_stmt = $conn->prepare("INSERT INTO application_documents (rent_application_id, requirement_id, label_snapshot, file_path) VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE label_snapshot = VALUES(label_snapshot), file_path = VALUES(file_path), uploaded_at = CURRENT_TIMESTAMP");
        foreach ($moved as $req_id => $path) {
            $label = $uploads[$req_id]['label'];
            $doc_stmt->bind_param("iiss", $doc_app_id, $req_id, $label, $path);
            if (!$doc_stmt->execute()) throw new Exception("Document insert failed: " . $doc_stmt->error);
            if (isset($on_file[$req_id])) $replaced_files[] = $on_file[$req_id]['file_path'];
        }
        $doc_stmt->close();
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
    $queue_app_id = (int)$doc_app_id;
    if ($queue_app_id) {
        resolve_admin_queue($conn, 'rent_application', $queue_app_id);
        notify_admins_queue($conn, 'rent_application', $queue_app_id,
            $is_update ? "Updated Rent Application" : "New Rent Application",
            "$first_name $last_name " . ($is_update ? "updated their" : "submitted a") . " rent application for Unit $room_name.");
    }

    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    $discard_moved();
    server_error_response($e, "Failed to submit application.");
    $conn->close();
    exit;
}

// After the commit: best effort only, nothing here may report a failure for
// an application that is already saved.
foreach ($replaced_files as $old) {
    if ($old !== '' && !in_array($old, $moved, true) && is_file($old)) @unlink($old);
}
log_activity($conn, $user_id, 'tenant', $is_update ? "Resubmitted Rental Application" : "Submitted Rental Application",
    "Application ID: $queue_app_id, Unit: $room_name");
try {
    require_once __DIR__ . '/services/send_notification.php';
    $subject = $is_update ? 'Updated Rental Application Received' : 'Rental Application Received';
    $html = email_application_submitted_template(
        trim($first_name . ' ' . $last_name), 'APP-' . $queue_app_id, $room_name
    );
    dispatch_admin_action_notification($conn, $user_id, 'application_update', $subject, null, $html);
} catch (Throwable $notification_error) {
    error_log('Could not dispatch application submission email: ' . $notification_error->getMessage());
}
echo json_encode(["success" => true, "message" => "Application submitted successfully"]);

$conn->close();
?>
