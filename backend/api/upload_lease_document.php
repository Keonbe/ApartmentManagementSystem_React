<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
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

$contract_id = $_POST['contractId'] ?? '';
$doc_type = $_POST['docType'] ?? ''; // 'signedLease' or 'notarizedLease'
$action = $_POST['action'] ?? 'upload'; // 'upload' or 'remove'

if (empty($contract_id) || empty($doc_type)) {
    echo json_encode(["success" => false, "message" => "Contract ID and docType are required."]);
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
        echo json_encode(["success" => true, "message" => "Document removed successfully"]);
    } else {
        echo json_encode(["success" => false, "message" => "Failed to remove document"]);
    }
    $stmt->close();
    exit;
}

if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $upload_dir = "../uploads/documents/";
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }

    $file_name = basename($_FILES['file']['name']);
    $file_tmp = $_FILES['file']['tmp_name'];
    $unique_file_name = time() . "_" . uniqid() . "_" . preg_replace("/[^a-zA-Z0-9.]/", "_", $file_name);
    $destination = $upload_dir . $unique_file_name;

    if (move_uploaded_file($file_tmp, $destination)) {
        $stmt = $conn->prepare("UPDATE lease_contracts SET $column_name = ? WHERE id = ?");
        $stmt->bind_param("ss", $destination, $contract_id);
        
        if ($stmt->execute()) {
            echo json_encode(["success" => true, "message" => "Document uploaded successfully", "filePath" => $destination]);
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
