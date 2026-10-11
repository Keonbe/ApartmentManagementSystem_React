<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../cors.php';
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Id, X-Admin-Id");

require_once "../config.php";

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// The owner comparison below is against the session user. It used to compare
// against the X-User-Id header, so a tenant could upload — or remove — another
// tenant's signed or notarized lease by sending that tenant's id.
$auth = require_user($conn);
$is_admin = $auth['role'] === 'admin';
$user_id = $auth['id'];
$admin_id = $is_admin ? $auth['id'] : null;

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

// A contract is only generated once the application is approved
// (update_tenant_status.php) — this used to auto-create a blank ₱0,
// dateless lease_contracts row for ANY rent_application_id the caller
// owned, even a still-Pending one. When the application was later approved,
// update_tenant_status.php saw a contract already existed and skipped
// creating the real one, so the tenant ended up stuck with the blank row.
if (empty($contract_id) && !empty($rent_app_id)) {
    $stmt = $conn->prepare("SELECT lc.id FROM lease_contracts lc
                            JOIN rent_applications ra ON ra.id = lc.rent_application_id
                            WHERE lc.rent_application_id = ? AND ra.status IN ('Approved', 'active', 'pending-move-out')
                            LIMIT 1");
    $stmt->bind_param("i", $rent_app_id);
    $stmt->execute();
    $res = $stmt->get_result();
    if ($res && $res->num_rows > 0) {
        $contract_id = $res->fetch_assoc()['id'];
    }
    $stmt->close();

    if (empty($contract_id)) {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "Your contract is generated once your application is approved."]);
        exit;
    }
}

if (empty($contract_id) || empty($doc_type)) {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Contract ID or Rent Application ID and docType are required."]);
    exit;
}

if ($doc_type !== 'signedLease' && $doc_type !== 'notarizedLease') {
    http_response_code(422);
    echo json_encode(["success" => false, "message" => "Invalid docType."]);
    exit;
}

$column_name = $doc_type === 'signedLease' ? 'signed_lease_path' : 'notarized_lease_path';

if ($action === 'remove') {
    // A tenant may only remove a document while the contract is still a
    // draft under their own review — once activated, removing a signed or
    // notarized lease is an admin action.
    if (!$is_admin) {
        $status_stmt = $conn->prepare("SELECT status FROM lease_contracts WHERE id = ?");
        $status_stmt->bind_param("s", $contract_id);
        $status_stmt->execute();
        $status_row = $status_stmt->get_result()->fetch_assoc();
        $status_stmt->close();
        if (!$status_row || $status_row['status'] !== 'draft') {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "This document can no longer be removed — contact management."]);
            exit;
        }
    }

    $stmt = $conn->prepare("UPDATE lease_contracts SET $column_name = NULL WHERE id = ?");
    $stmt->bind_param("s", $contract_id);
    if ($stmt->execute()) {
        log_activity($conn, $admin_id ?: $user_id, 'contract', "Removed Rent Document", "Document: $doc_type from Contract: $contract_id");
        echo json_encode(["success" => true, "message" => "Document removed successfully"]);
    } else {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Failed to remove document"]);
    }
    $stmt->close();
    exit;
}

// Uploading overwrites the stored document, so a tenant gets the same limit as
// removing (audit M1): only while the contract is still a draft, and never the
// notarized copy, which management uploads.
if (!$is_admin) {
    if ($doc_type === 'notarizedLease') {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "The notarized copy is uploaded by management."]);
        exit;
    }
    $status_stmt = $conn->prepare("SELECT status FROM lease_contracts WHERE id = ?");
    $status_stmt->bind_param("s", $contract_id);
    $status_stmt->execute();
    $status_row = $status_stmt->get_result()->fetch_assoc();
    $status_stmt->close();
    if (!$status_row || $status_row['status'] !== 'draft') {
        http_response_code(409);
        echo json_encode(["success" => false, "message" => "This contract is no longer a draft, so its documents can't be replaced — contact management."]);
        exit;
    }
}

if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $file_name = basename($_FILES['file']['name']);
    $file_tmp = $_FILES['file']['tmp_name'];
    $file_ext = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));

    if ($_FILES['file']['size'] > 10 * 1024 * 1024) {
        http_response_code(422);
        echo json_encode(["success" => false, "message" => "File must be 10MB or smaller."]);
        exit;
    }

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
        mkdir($upload_dir, 0755, true);
    }

    $doc_extension = pathinfo($file_name, PATHINFO_EXTENSION);
    $unique_file_name = bin2hex(random_bytes(16)) . "." . $doc_extension;
    $destination = $upload_dir . $unique_file_name;

    if (move_uploaded_file($file_tmp, $destination)) {
        $stmt = $conn->prepare("UPDATE lease_contracts SET $column_name = ? WHERE id = ?");
        $stmt->bind_param("ss", $destination, $contract_id);
        
        if ($stmt->execute()) {
            log_activity($conn, $admin_id ?: $user_id, 'contract', "Uploaded Rent Document", "Document: $doc_type to Contract: $contract_id");
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
