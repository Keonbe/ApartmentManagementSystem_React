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
$user_id = $_SERVER['HTTP_X_USER_ID'] ?? null;

$is_admin = verify_admin($conn, $admin_id);
if (!$is_admin && empty($user_id)) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Forbidden: Authentication required"]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

$contract_id = $_POST['contractId'] ?? '';
$rent_app_id = $_POST['rentApplicationId'] ?? '';
$doc_type = $_POST['docType'] ?? 'signedLease'; // 'signedLease' or 'notarizedLease'
$action = $_POST['action'] ?? 'upload'; // 'upload' or 'remove'

// Ownership check: a non-admin caller may only touch a contract/rent
// application that belongs to them. Resolve the owning tenant from whichever
// identifier was supplied and compare it against X-User-Id before any lookup,
// auto-create, upload, or removal happens below.
if (!$is_admin) {
    if (!empty($contract_id)) {
        $owner_id = get_contract_owner($conn, $contract_id);
    } elseif (!empty($rent_app_id)) {
        $owner_id = get_rent_application_owner($conn, $rent_app_id);
    } else {
        $owner_id = null;
    }

    if ($owner_id === null || $owner_id !== (int)$user_id) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "Forbidden: You do not own this contract."]);
        exit;
    }
}

if (empty($contract_id) && !empty($rent_app_id)) {
    // Lookup or auto-create lease contract for this rent application
    $stmt = $conn->prepare("SELECT id FROM lease_contracts WHERE rent_application_id = ? LIMIT 1");
    $stmt->bind_param("i", $rent_app_id);
    $stmt->execute();
    $res = $stmt->get_result();
    if ($res && $res->num_rows > 0) {
        $contract_id = $res->fetch_assoc()['id'];
    } else {
        $contract_id = 'LC-' . uniqid();
        $ins = $conn->prepare("INSERT INTO lease_contracts (id, rent_application_id, deposit_amount) VALUES (?, ?, 0.00)");
        $ins->bind_param("si", $contract_id, $rent_app_id);
        $ins->execute();
        $ins->close();
    }
    $stmt->close();
}

if (empty($contract_id) || empty($doc_type)) {
    echo json_encode(["success" => false, "message" => "Contract ID or Rent Application ID and docType are required."]);
    exit;
}

if ($doc_type !== 'signedLease' && $doc_type !== 'notarizedLease') {
    echo json_encode(["success" => false, "message" => "Invalid docType."]);
    exit;
}

$column_name = $doc_type === 'signedLease' ? 'signed_lease_path' : 'notarized_lease_path';

if ($action === 'remove') {
    $stmt = $conn->prepare("UPDATE lease_contracts SET $column_name = NULL WHERE id = ?");
    $stmt->bind_param("s", $contract_id);
    if ($stmt->execute()) {
        log_activity($conn, $admin_id ?: $user_id, 'tenant', "Removed Lease Document", "Document: $doc_type from Contract: $contract_id");
        echo json_encode(["success" => true, "message" => "Document removed successfully"]);
    } else {
        echo json_encode(["success" => false, "message" => "Failed to remove document"]);
    }
    $stmt->close();
    exit;
}

if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $file_name = basename($_FILES['file']['name']);
    $file_tmp = $_FILES['file']['tmp_name'];
    $file_ext = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));

    $allowed_extensions = ['pdf', 'jpg', 'jpeg', 'png'];
    if (!in_array($file_ext, $allowed_extensions)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "Invalid file extension. Allowed formats: PDF, JPG, PNG."]);
        exit;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file_tmp);
    finfo_close($finfo);

    $allowed_mimes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!in_array($mime, $allowed_mimes)) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "File content does not match allowed PDF or Image format."]);
        exit;
    }

    $upload_dir = "../uploads/documents/";
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }

    $unique_file_name = time() . "_" . uniqid() . "_" . preg_replace("/[^a-zA-Z0-9.]/", "_", $file_name);
    $destination = $upload_dir . $unique_file_name;

    if (move_uploaded_file($file_tmp, $destination)) {
        $stmt = $conn->prepare("UPDATE lease_contracts SET $column_name = ? WHERE id = ?");
        $stmt->bind_param("ss", $destination, $contract_id);
        
        if ($stmt->execute()) {
            log_activity($conn, $admin_id ?: $user_id, 'tenant', "Uploaded Lease Document", "Document: $doc_type to Contract: $contract_id");
            echo json_encode(["success" => true, "message" => "Document uploaded successfully", "filePath" => $destination, "contractId" => $contract_id]);
        } else {
            echo json_encode(["success" => false, "message" => "Database update failed"]);
        }
        $stmt->close();
    } else {
        echo json_encode(["success" => false, "message" => "Failed to save the uploaded document."]);
    }
} else {
    echo json_encode(["success" => false, "message" => "No file uploaded or upload error."]);
}

$conn->close();
?>
